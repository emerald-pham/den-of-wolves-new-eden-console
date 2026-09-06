import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import RoleSelect from './RoleSelect';

vi.mock('@/lib/sessionService', () => ({
  claimGmInstance: vi.fn(),
  setGmControlsLocked: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeGmInstances: vi.fn(),
}));

const { claimGmInstance, setGmControlsLocked } = await import('@/lib/sessionService');
const { subscribeGmInstances } = await import('@/lib/firestore');

const session: GameSession = {
  id: 's1',
  name: 'Table one',
  joinCode: '4821',
  phase: 'lobby',
  ownerUid: 'gm1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const gm: Player = {
  uid: 'gm1',
  sessionId: 's1',
  displayName: 'GM',
  role: 'gm',
  seatId: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/roles']}>
      <Routes>
        <Route path="/" element={<p>Landing route</p>} />
        <Route path="/roles" element={<RoleSelect />} />
        <Route path="/gm" element={<p>GM route</p>} />
        <Route path="/console" element={<p>Console route</p>} />
        <Route path="/press" element={<p>Press route</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleSelect', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
      onInstances([]);
      return vi.fn();
    });
  });

  afterEach(() => {
    vi.mocked(claimGmInstance).mockReset();
    vi.mocked(setGmControlsLocked).mockReset();
  });

  it('returns to the landing page when no session is loaded', () => {
    renderRoute();
    expect(screen.getByText('Landing route')).toBeInTheDocument();
  });

  it('offers the intermediate controls and a Select a role destination', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    renderRoute();

    expect(screen.getByRole('heading', { name: /connect this device/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^join as gm/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gm console/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^setup/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select a role/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /press.*snn/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/observer/i)).not.toBeInTheDocument();
  });

  it('opens the role selection screen from the intermediate screen', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    renderRoute();

    await user.click(screen.getByRole('button', { name: /select a role/i }));

    expect(screen.getByText('Console route')).toBeInTheDocument();
    expect(useSessionStore.getState().mode).toBe('console');
  });

  it('does not open a GM manifest stream while registration is unlocked', async () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });

    renderRoute();
    await Promise.resolve();

    expect(subscribeGmInstances).not.toHaveBeenCalled();
  });

  it('requires an instance name before claiming GM and persists the claim', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    vi.mocked(claimGmInstance).mockImplementation(async (name) => {
      useSessionStore.getState().setGmInstance({
        id: 'instance-1', sessionId: 's1', uid: 'gm1', name,
        deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
      });
      useSessionStore.getState().setMe(gm);
      return 'applied';
    });
    renderRoute();

    const claim = screen.getByRole('button', { name: /^join as gm/i });
    expect(claim).toBeDisabled();
    const nameInput = screen.getByRole('textbox', { name: /^input gm name$/i });
    await user.type(nameInput, 'Bridge laptop');

    expect(nameInput).toHaveAccessibleName('Input GM Name');
    await user.click(claim);

    expect(claimGmInstance).toHaveBeenCalledWith('Bridge laptop');
    expect(screen.getByRole('button', { name: /gm joined/i })).toBeDisabled();
    expect(nameInput).toHaveAccessibleName('Name entered');
    expect(useSessionStore.getState().gmInstance?.name).toBe('Bridge laptop');
  });


  it('keeps the GM console out of the device connection panel', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    renderRoute();

    expect(screen.queryByRole('button', { name: /gm console/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /select a role/i }));

    expect(screen.getByText('Console route')).toBeInTheDocument();
    expect(useSessionStore.getState().mode).toBe('console');
  });

  it('keeps the role picker available after this browser claims GM', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'gm1', name: 'Bridge laptop',
      deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRoute();

    await user.click(screen.getByRole('button', { name: /select a role/i }));
    expect(screen.getByText('Console route')).toBeInTheDocument();
  });

  it('shows a greyed lock control to non-GMs and blocks claims when a GM is present', async () => {
    useSessionStore.getState().setSession({ ...session, gmControlsLocked: true });
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
      onInstances([{
        id: 'active-gm', sessionId: 's1', uid: 'gm2', name: 'GM station',
        deviceLabel: 'Tablet', claimedAt: '2026-01-01T00:00:00.000Z',
      }]);
      return vi.fn();
    });
    renderRoute();

    expect(await screen.findByRole('button', {
      name: /unlock lock out more gms being added/i,
    })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^join as gm/i })).toBeDisabled();
  });

  it('keeps the locked-session GM registration failsafe available when no GM remains', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession({ ...session, gmControlsLocked: true });
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    vi.mocked(claimGmInstance).mockResolvedValue('applied');
    renderRoute();

    expect(await screen.findByText(/failsafe.*no active gm/i)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /^input gm name$/i }), 'Recovery');
    const claim = await screen.findByRole('button', { name: /^join as gm/i });
    await waitFor(() => expect(claim).toBeEnabled());
    await user.click(claim);

    expect(claimGmInstance).toHaveBeenCalledWith('Recovery');
  });

  it('lets this GM toggle the lock from the registration and Setup controls', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'gm1', name: 'Bridge laptop',
      deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(setGmControlsLocked).mockImplementation(async (locked) => {
      useSessionStore.getState().setSession({ ...session, gmControlsLocked: locked });
      return 'applied';
    });
    renderRoute();

    await user.click(screen.getByRole('button', {
      name: /lock lock out more gms being added/i,
    }));

    expect(setGmControlsLocked).toHaveBeenCalledWith(true);
  });
});
