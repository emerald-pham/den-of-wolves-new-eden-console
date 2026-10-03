import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import RoleSelect from './RoleSelect';

vi.mock('@/lib/sessionService', () => ({
  claimGmInstance: vi.fn(),
  setGmControlsLocked: vi.fn(),
  claimSeat: vi.fn(),
  releaseSeat: vi.fn(),
  disconnectFromSession: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeGmInstances: vi.fn(),
}));

const { claimGmInstance, setGmControlsLocked, releaseSeat, disconnectFromSession } = await import('@/lib/sessionService');
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

function renderRoute(gmJoinIntent = false) {
  const initialEntry = gmJoinIntent
    ? { pathname: '/roles', state: { intent: 'gm-join' } }
    : '/roles';
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<p>Landing route</p>} />
        <Route path="/roles" element={<RoleSelect />} />
        <Route path="/gm" element={<p>GM route</p>} />
        <Route path="/console" element={<p>Console route</p>} />
        <Route path="/press" element={<p>Press route</p>} />
        <Route path="/brief" element={<p>Private brief route</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleSelect', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    // Successful registration controls represent a current server session.
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
      onInstances([]);
      return vi.fn();
    });
    vi.mocked(disconnectFromSession).mockReset();
    vi.mocked(disconnectFromSession).mockResolvedValue('applied');
  });

  afterEach(() => {
    vi.mocked(claimGmInstance).mockReset();
    vi.mocked(setGmControlsLocked).mockReset();
  });

  it('returns to the landing page when no session is loaded', () => {
    renderRoute();
    expect(screen.getByText('Landing route')).toBeInTheDocument();
  });

  it('redirects an ordinary player compatibility URL to the station catalog', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });

    renderRoute();

    expect(screen.getByText('Console route')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /role select/i })).not.toBeInTheDocument();
  });

  it('reserves the Role Select title for an authenticated GM joining this session', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());

    renderRoute(true);

    expect(screen.getByRole('heading', { name: /^role select$/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /^join as gm/i })).toBeVisible();
  });

  it('redirects a password-authenticated non-GM deep link unless the user chose GM join', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());

    renderRoute();

    expect(screen.getByText('Console route')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /^role select$/i })).not.toBeInTheDocument();
  });

  it('offers the authenticated GM join flow and a separate station catalog link', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    renderRoute(true);

    expect(screen.getByRole('heading', { name: /^role select$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^join as gm/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gm console/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^setup/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open station catalog/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave session' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /press.*snn/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/observer/i)).not.toBeInTheDocument();
  });

  it('keeps session exit in shared Settings instead of the role-selection intro', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    renderRoute();

    expect(screen.queryByRole('button', { name: 'Leave session' })).not.toBeInTheDocument();
    expect(disconnectFromSession).not.toHaveBeenCalled();
    expect(useSessionStore.getState().session?.id).toBe('s1');
  });

  it('does not put a session-exit button on the authenticated GM join route or catalog', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    renderRoute(true);

    await user.click(screen.getByRole('button', { name: /open station catalog/i }));
    expect(screen.getByText('Console route')).toBeVisible();
    await user.click(screen.getByText('Console route'));
    expect(screen.queryByRole('button', { name: 'Leave session' })).not.toBeInTheDocument();
    expect(disconnectFromSession).not.toHaveBeenCalled();
  });

  it('allows an authorized GM to open the station catalog from GM join', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    renderRoute(true);

    await user.click(screen.getByRole('button', { name: /open station catalog/i }));

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
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    vi.mocked(claimGmInstance).mockImplementation(async (name) => {
      useSessionStore.getState().setGmInstance({
        id: 'instance-1', sessionId: 's1', uid: 'gm1', name,
        deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
      });
      useSessionStore.getState().setMe(gm);
      return 'applied';
    });
    renderRoute(true);

    const claim = screen.getByRole('button', { name: /^join as gm/i });
    expect(claim).toBeDisabled();
    const nameInput = screen.getByRole('textbox', { name: /^input gm name$/i });
    await user.type(nameInput, 'Bridge laptop');

    expect(nameInput).toHaveAccessibleName('Input GM Name');
    expect(claim).toBeEnabled();
    await user.click(claim);

    expect(claimGmInstance).toHaveBeenCalledWith('Bridge laptop');
    expect(screen.getByRole('button', { name: /gm joined/i })).toBeDisabled();
    expect(nameInput).toHaveAccessibleName('Name entered');
    expect(useSessionStore.getState().gmInstance?.name).toBe('Bridge laptop');
  });

  it('waits for current member authority before enabling a named GM claim after reload', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    renderRoute(true);
    await user.type(screen.getByRole('textbox', { name: /^input gm name$/i }), 'Recovered browser');
    const claim = screen.getByRole('button', { name: /^join as gm/i });
    expect(claim).toBeDisabled();
    expect(screen.getByRole('status', { name: 'GM join availability' })).toHaveTextContent('Waiting for the current session');
    await user.click(claim);
    expect(claimGmInstance).not.toHaveBeenCalled();
    act(() => useSessionStore.getState().setSessionSnapshotFreshness('server'));
    expect(claim).toBeEnabled();
    act(() => useSessionStore.getState().setConnection('offline'));
    expect(claim).toBeDisabled();
  });

  it('keeps unauthenticated ordinary players out of the GM join route', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    renderRoute();

    expect(screen.getByText('Console route')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^join as gm/i })).not.toBeInTheDocument();
  });


  it('keeps the GM console out of the device connection panel', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(gm);
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    renderRoute(true);

    expect(screen.queryByRole('button', { name: /gm console/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open station catalog/i }));

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

    await user.click(screen.getByRole('button', { name: /open station catalog/i }));
    expect(screen.getByText('Console route')).toBeInTheDocument();
  });

  it('allows an authorized additional GM when a legacy locked flag and active GM are present', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession({ ...session, gmControlsLocked: true });
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    vi.mocked(claimGmInstance).mockResolvedValue('applied');
    renderRoute(true);

    expect(subscribeGmInstances).not.toHaveBeenCalled();
    expect(screen.queryByText(/registration locked|failsafe/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lock out more gms/i })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /^input gm name$/i }), 'Second bridge');
    const claim = screen.getByRole('button', { name: /^join as gm/i });
    expect(claim).toBeEnabled();
    await user.click(claim);

    expect(claimGmInstance).toHaveBeenCalledWith('Second bridge');
  });

  it('keeps ordinary core station claims and releases in the station catalog', () => {
    useSessionStore.getState().setSession({
      ...session,
      activeRoleIds: ['admiral', 'refinery-124-pdf-colonel', 'press-officer'],
      setupRevision: 2,
    });
    useSessionStore.getState().setMe({ ...gm, role: 'player' });
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    useSessionStore.getState().setSeats([
      {
        id: 'admiral', sessionId: 's1', roleId: 'admiral', label: 'AEGIS // Admiral',
        status: 'open', holderUid: null, factionId: 'aegis', claimedAt: null,
      },
      {
        id: 'refinery-124-pdf-colonel', sessionId: 's1', roleId: 'refinery-124-pdf-colonel',
        label: 'Refinery 124 // P.D.F. Colonel', status: 'open', holderUid: null,
        factionId: 'refinery-124', claimedAt: null,
      },
      {
        id: 'press-officer', sessionId: 's1', roleId: 'press-officer',
        label: 'SNN // Press Officer', status: 'open', holderUid: null,
        factionId: 'press', claimedAt: null,
      },
    ]);
    renderRoute(true);

    expect(screen.getByRole('heading', { name: /^role select$/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /open station catalog/i })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Core station seats' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /claim station/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /release station/i })).not.toBeInTheDocument();
    expect(releaseSeat).not.toHaveBeenCalled();
  });

  it('lets an active GM release its own legacy seat when no active console role is recorded', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession({
      ...session,
      activeRoleIds: ['seat-1'],
      setupRevision: 2,
    });
    useSessionStore.getState().setMe({
      ...gm, role: 'gm', seatId: 'seat-1', activeConsoleRoleId: null,
    });
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'gm1', name: 'Bridge laptop',
      deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSeats([{
      id: 'seat-1', sessionId: 's1', roleId: 'seat-1', label: 'Seat 1',
      status: 'claimed', holderUid: 'gm1', factionId: 'aegis', claimedAt: 'legacy-claim',
    }]);
    vi.mocked(releaseSeat).mockResolvedValue('applied');
    vi.mocked(releaseSeat).mockClear();
    renderRoute();

    expect(screen.queryByRole('button', { name: /claim station/i })).not.toBeInTheDocument();
    const release = screen.getByRole('button', { name: /release station.*seat 1/i });
    expect(release).toBeVisible();
    await user.click(release);
    expect(releaseSeat).toHaveBeenCalledWith('seat-1');
  });

  it('gives an active GM an accessible reasoned intervention for a stale occupied seat', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession({
      ...session,
      activeRoleIds: ['admiral'],
      setupRevision: 2,
    });
    useSessionStore.getState().setMe(gm);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'gm1', name: 'Bridge laptop',
      deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSeats([{
      id: 'admiral', sessionId: 's1', roleId: 'admiral', label: 'AEGIS // Admiral',
      status: 'claimed', holderUid: 'ghost', factionId: 'aegis', claimedAt: 'legacy-claim',
    }]);
    vi.mocked(releaseSeat).mockResolvedValue('applied');
    vi.mocked(releaseSeat).mockClear();
    renderRoute();

    const intervene = screen.getByRole('button', { name: /clear stale holder.*aegis \/\/ admiral/i });
    expect(intervene).toHaveClass('cic-danger-button');
    await user.click(intervene);

    const reason = screen.getByRole('textbox', { name: /reason for clearing stale seat/i });
    expect(screen.getByRole('button', { name: /confirm clear stale seat/i })).toBeDisabled();
    await user.type(reason, 'Ghost browser expired');
    await user.click(screen.getByRole('button', { name: /confirm clear stale seat/i }));

    expect(releaseSeat).toHaveBeenCalledWith('admiral', 'Ghost browser expired');
  });

  it('traps stale-seat intervention focus, cancels safely, and restores the trigger', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setSession({
      ...session,
      activeRoleIds: ['admiral'],
      setupRevision: 2,
    });
    useSessionStore.getState().setMe(gm);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'gm1', name: 'Bridge laptop',
      deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSeats([{
      id: 'admiral', sessionId: 's1', roleId: 'admiral', label: 'AEGIS // Admiral',
      status: 'claimed', holderUid: 'ghost', factionId: 'aegis', claimedAt: 'legacy-claim',
    }]);
    vi.mocked(releaseSeat).mockResolvedValue('applied');
    vi.mocked(releaseSeat).mockClear();
    renderRoute();

    const intervene = screen.getByRole('button', { name: /clear stale holder.*aegis \/\/ admiral/i });
    fireEvent.click(intervene);
    const dialog = screen.getByRole('alertdialog', { name: /clear stale station holder/i });
    const reason = within(dialog).getByRole('textbox', { name: /reason for clearing stale seat/i });
    const confirm = within(dialog).getByRole('button', { name: /confirm clear stale seat/i });
    const cancel = within(dialog).getByRole('button', { name: /^cancel$/i });
    expect(reason).toHaveFocus();

    await user.type(reason, 'Do not clear during keyboard review');
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(reason).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog', { name: /clear stale station holder/i })).not.toBeInTheDocument();
    expect(intervene).toHaveFocus();
    expect(releaseSeat).not.toHaveBeenCalled();

    fireEvent.click(intervene);
    const reopened = screen.getByRole('alertdialog', { name: /clear stale station holder/i });
    const backdrop = reopened.parentElement;
    if (!backdrop) throw new Error('Expected stale-seat dialog backdrop.');
    await user.click(backdrop);
    expect(screen.queryByRole('alertdialog', { name: /clear stale station holder/i })).not.toBeInTheDocument();
    expect(releaseSeat).not.toHaveBeenCalled();
  });
});
