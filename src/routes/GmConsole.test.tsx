import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import GmConsole from './GmConsole';

vi.mock('@/lib/sessionService', () => ({
  assignWolves: vi.fn(),
  kickGmInstance: vi.fn(),
  setCapybaraEnabled: vi.fn(),
  setGmControlsLocked: vi.fn(),
  setWolfRoleEnabled: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeGmInstances: vi.fn(),
  subscribeSessionEvents: vi.fn(),
}));

const { assignWolves, kickGmInstance, setCapybaraEnabled, setGmControlsLocked,
  setWolfRoleEnabled } =
  await import('@/lib/sessionService');
const { subscribeGmInstances, subscribeSessionEvents } = await import('@/lib/firestore');

const local = {
  id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
  deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
};
const other = {
  id: 'other-1', sessionId: 's1', uid: 'u2', name: 'Tablet',
  deviceLabel: 'iPad / Safari', claimedAt: '2026-01-01T00:01:00.000Z',
};

function renderConsole() {
  return render(
    <MemoryRouter initialEntries={['/gm']}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path="/gm" element={<GmConsole />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    onEvents([]);
    return vi.fn();
  });
});

afterEach(() => vi.clearAllMocks());

function streamInstances(instances: readonly typeof local[]) {
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    onInstances(instances);
    return vi.fn();
  });
}

it('redirects browsers without a local GM claim', () => {
  renderConsole();
  expect(screen.getByText('Roles route')).toBeInTheDocument();
});

it('lists every GM instance and only offers to kick other instances', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  renderConsole();

  expect(await screen.findByText('Bridge laptop')).toBeInTheDocument();
  expect(screen.getByText('Tablet')).toBeInTheDocument();
  expect(screen.getByText('iPad / Safari')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /kick/i })).toHaveLength(1);
});

it('returns to the roles screen', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await screen.findByText('Bridge laptop');
  await user.click(screen.getByRole('link', { name: /back to roles/i }));

  expect(screen.getByText('Roles route')).toBeInTheDocument();
});

it('kicks another instance and removes it from the list', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  vi.mocked(kickGmInstance).mockResolvedValue('applied');
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /kick tablet/i }));

  expect(kickGmInstance).toHaveBeenCalledWith('other-1');
  await waitFor(() => expect(screen.queryByText('Tablet')).not.toBeInTheDocument());
});

it('updates when the live GM instance stream changes', async () => {
  let publish: ((instances: readonly typeof local[]) => void) | undefined;
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    publish = onInstances;
    onInstances([local]);
    return vi.fn();
  });
  renderConsole();
  await screen.findByText('Bridge laptop');

  act(() => publish?.([local, other]));

  expect(await screen.findByText('Tablet')).toBeInTheDocument();
});

it('shows fleet DRADIS and jumps between ship perspectives', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const { container } = renderConsole();

  expect(await screen.findByRole('region', { name: /fleet dradis/i })).toBeInTheDocument();
  expect(screen.getByText(/dradis perspective.*aegis/i)).toBeInTheDocument();
  const aegisScan = container.querySelector('.gm-dradis .contact-plot__rig');

  await user.click(screen.getByRole('button', { name: /view dradis from shepherd/i }));

  expect(screen.getByText(/dradis perspective.*shepherd/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view dradis from shepherd/i }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.gm-dradis .contact-plot__rig')).not.toBe(aegisScan);
});

it('starts with a compact DRADIS and expands it on demand', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const dradis = await screen.findByRole('region', { name: /fleet dradis/i });
  expect(dradis).toHaveAttribute('data-expanded', 'false');
  await user.click(screen.getByRole('button', { name: /expand dradis display/i }));

  expect(dradis).toHaveAttribute('data-expanded', 'true');
  expect(screen.getByRole('button', { name: /collapse dradis display/i })).toBeInTheDocument();
});

it('keeps Capybara convoy setup under a GM Console Setup subsection', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const setup = await screen.findByRole('button', { name: /^setup$/i });
  expect(setup).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: /turn capybara off/i })).not.toBeInTheDocument();

  await user.click(setup);

  expect(setup).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: /turn capybara off/i })).toBeInTheDocument();
});

it('configures wolf eligibility and randomly assigns from enabled roles', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setWolfRoleEnabled).mockImplementation(async (_roleId, enabled) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) useSessionStore.getState().setSession({
      ...activeSession,
      wolfEligibleRoleIds: enabled ? ['press-officer'] : [],
    });
    return 'applied';
  });
  vi.mocked(assignWolves).mockResolvedValue(['press-officer']);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const eligibility = screen.getByRole('switch', { name: /press officer.*wolf/i });
  expect(eligibility).toBeChecked();
  expect(screen.getAllByRole('switch', { name: /wolf/i })).toHaveLength(21);
  expect(screen.getByRole('option', { name: /2 wolves/i })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: /randomly assign wolves/i }));
  expect(assignWolves).toHaveBeenCalledWith(1);
  expect(await screen.findByText(/assigned.*press officer/i)).toBeInTheDocument();

  await user.click(eligibility);
  expect(setWolfRoleEnabled).toHaveBeenCalledWith('press-officer', false);
});

it('toggles Capybara off for the session and removes its perspective', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setCapybaraEnabled).mockImplementation(async (enabled) => {
    const session = useSessionStore.getState().session;
    if (session) useSessionStore.getState().setSession({ ...session, capybaraEnabled: enabled });
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  expect(screen.getByRole('button', { name: /turn capybara off/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view dradis from capybara/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /turn capybara off/i }));

  expect(setCapybaraEnabled).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog', { name: /change convoy manifest/i }))
    .toHaveTextContent(/remove capybara/i);
  await user.click(screen.getByRole('button', { name: /confirm remove capybara/i }));

  expect(setCapybaraEnabled).toHaveBeenCalledWith(false);
  expect(await screen.findByRole('button', { name: /turn capybara on/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /view dradis from capybara/i }))
    .not.toBeInTheDocument();
});

it('can cancel adding Capybara back to the convoy', async () => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, capybaraEnabled: false });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /turn capybara on/i }));
  expect(screen.getByRole('alertdialog', { name: /change convoy manifest/i }))
    .toHaveTextContent(/add capybara/i);
  await user.click(screen.getByRole('button', { name: /cancel convoy change/i }));

  expect(setCapybaraEnabled).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /turn capybara on/i })).toBeInTheDocument();
});

it('locks and unlocks subsequent GM registration and Setup', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setGmControlsLocked).mockImplementation(async (locked) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) {
      useSessionStore.getState().setSession({ ...activeSession, gmControlsLocked: locked });
    }
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', {
    name: /lock gm registration and setup/i,
  }));

  expect(setGmControlsLocked).toHaveBeenCalledWith(true);
  expect(await screen.findByRole('button', {
    name: /unlock gm registration and setup/i,
  })).toHaveAttribute('aria-pressed', 'true');
});

it('shows Emergency Bridge Confetti Dispenser activations in the console log', async () => {
  let publish: ((events: readonly [{
    id: string; sessionId: string; type: 'ship-confetti'; shipId: string;
    shipName: string; actorName: string; createdAt: string;
  }]) => void) | undefined;
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    publish = onEvents;
    onEvents([]);
    return vi.fn();
  });
  renderConsole();
  await waitFor(() => expect(publish).toBeDefined());

  act(() => publish?.([{
      id: 'event-1', sessionId: 's1', type: 'ship-confetti', shipId: 'quellon',
      shipName: 'Quellon', actorName: 'Player', createdAt: '2026-01-01T00:02:00.000Z',
  }]));

  await screen.findByText(/quellon.*emergency bridge confetti dispenser.*player/i);
  expect(screen.getByRole('list', { name: /gm event log/i })).toHaveTextContent(
    /quellon.*emergency bridge confetti dispenser.*player/i,
  );
});
