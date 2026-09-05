import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ShipConsole from './ShipConsole';

vi.mock('@/lib/sessionService', () => ({
  popShipConfetti: vi.fn(),
  selectConsoleRole: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeShipConfetti: vi.fn(),
}));

const { popShipConfetti } = await import('@/lib/sessionService');
const { selectConsoleRole } = await import('@/lib/sessionService');
const { subscribeShipConfetti } = await import('@/lib/firestore');

beforeEach(() => {
  vi.mocked(popShipConfetti).mockReset();
  vi.mocked(selectConsoleRole).mockReset();
  vi.mocked(selectConsoleRole).mockResolvedValue(undefined);
  vi.mocked(subscribeShipConfetti).mockReset();
  vi.mocked(subscribeShipConfetti).mockReturnValue(vi.fn());
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setMode('console');
});

afterEach(() => vi.useRealTimers());

it('shows only the joined ship identity, nation marking, and fleet role', () => {
  render(
    <MemoryRouter initialEntries={['/ships/capybara']}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'Capybara' })).toBeInTheDocument();
  expect(screen.getByText(/south american nations/i)).toBeInTheDocument();
  expect(screen.getByText(/supplies the fleet with essential food, water, and materials/i)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /south american nations flag/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /leave ship/i })).toHaveAttribute('href', '/console');
  expect(screen.getByRole('button', { name: /open confetti activation cover/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /activate emergency bridge confetti dispenser/i })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(/select a command role.*operate the cannon/i);
  expect(screen.queryByText(/engineer|recycler/i)).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: /shuttlebay/i })).toBeInTheDocument();
  const instruments = screen.getByRole('complementary', { name: /capybara instruments/i });
  expect(within(instruments).getByRole('region', { name: /shuttlebay/i })).toBeInTheDocument();
  expect(within(instruments).getByRole('region', {
    name: /emergency bridge confetti dispenser/i,
  })).toBeInTheDocument();
  expect(screen.getByText(/no shuttle docked/i)).toBeInTheDocument();
  expect(screen.getByText(/no recorded shuttle visits/i)).toBeInTheDocument();
});

it('shows the SNN shuttle docked at AEGIS and records its initial visit', () => {
  render(
    <MemoryRouter initialEntries={['/ships/aegis']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('SNN Independent Press Shuttle')).toBeInTheDocument();
  expect(screen.getByText(/currently docked/i)).toBeInTheDocument();
  expect(screen.getByRole('list', { name: /shuttle visit log/i })).toHaveTextContent(
    /SNN.*docked/i,
  );
});

it.each([
  ['admiral', 'Admiral'],
  ['executive-officer', 'Executive Officer'],
  ['wing-commander', 'Wing Commander'],
])('uses the same synced AEGIS console for the %s', async (roleId, roleName) => {
  render(
    <MemoryRouter initialEntries={[`/ships/aegis/roles/${roleId}`]}>
      <Routes>
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'AEGIS' })).toBeInTheDocument();
  expect(screen.getByText(roleName)).toBeInTheDocument();
  expect(selectConsoleRole).toHaveBeenCalledWith(roleId);
  await waitFor(() => expect(subscribeShipConfetti).toHaveBeenCalledWith(
      's1', 'aegis', expect.any(Function), expect.any(Function),
    ));
  expect(screen.queryByText(/wolf/i)).not.toBeInTheDocument();
});

it('lets a GM return every staffed ship console to its own role picker', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-president']}>
      <Routes>
        <Route path="/ships/:shipId/roles" element={<p>Dione roles</p>} />
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /change role/i }));
  expect(screen.getByText('Dione roles')).toBeInTheDocument();
});

it('does not let a player leave or change an active command role from the console', () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'dione-president' });

  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-president']}>
      <Routes>
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /change role|leave ship/i })).not.toBeInTheDocument();
});

it('keeps a player at a held command role if the GM disables it', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected test session state.');
  useSessionStore.getState().setSession({ ...session, activeRoleIds: [] });
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'dione-president' });

  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-president']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'Dione' })).toBeInTheDocument();
  expect(screen.queryByText('Fleet roster')).not.toBeInTheDocument();
});

it('keeps ship and role navigation available to the GM', () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({
    ...me,
    role: 'gm',
    activeConsoleRoleId: 'dione-president',
  });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });

  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-president']}>
      <Routes>
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /change role/i })).toBeInTheDocument();
});

it('gives a GM observer read-only access by default and resets it after leaving', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });

  const { container } = render(
    <MemoryRouter initialEntries={['/ships/aegis/observer']}>
      <Routes>
        <Route path="/ships/:shipId/observer" element={<ShipConsole observer />} />
        <Route path="/ships/:shipId/roles" element={(
          <Link to="/ships/aegis/observer">Return to observer</Link>
        )} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Observer')).toBeInTheDocument();
  const writeMode = screen.getByRole('button', { name: /observer write mode/i });
  expect(writeMode).toHaveAttribute('aria-pressed', 'false');
  expect(container.querySelector('.ship-console')).toHaveAttribute('data-observer-mode', 'read');
  expect(screen.getByText(/observer access.*read only/i)).toBeInTheDocument();

  await user.click(writeMode);
  expect(writeMode).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.ship-console')).toHaveAttribute('data-observer-mode', 'write');
  expect(screen.getByText(/observer access.*write mode/i)).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: /change role/i }));
  await user.click(screen.getByRole('link', { name: /return to observer/i }));
  expect(screen.getByRole('button', { name: /observer write mode/i }))
    .toHaveAttribute('aria-pressed', 'false');
  expect(container.querySelector('.ship-console')).toHaveAttribute('data-observer-mode', 'read');
});

it('rejects the observer route for a non-GM', () => {
  render(
    <MemoryRouter initialEntries={['/ships/aegis/observer']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId/observer" element={<ShipConsole observer />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
});

it('returns to the fleet roster when the ship id is unknown', () => {
  render(
    <MemoryRouter initialEntries={['/ships/not-a-ship']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
});

it('returns to the fleet roster when Capybara is disabled', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, capybaraEnabled: false });

  render(
    <MemoryRouter initialEntries={['/ships/capybara']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
});

it('leaves the ship through the visible return control', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/quellon']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /leave ship/i }));
  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
});

it('opens a digital cover before activating the one-shot Emergency Bridge Confetti Dispenser', async () => {
  const user = userEvent.setup();
  let signal: ((sourceShipId: string) => void) | undefined;
  vi.mocked(subscribeShipConfetti).mockImplementation((_sessionId, _shipId, onPop) => {
    signal = onPop;
    return vi.fn();
  });
  vi.mocked(popShipConfetti).mockImplementation(async (shipId) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) useSessionStore.getState().setSession({
      ...activeSession,
      confettiUsedShipIds: [...(activeSession.confettiUsedShipIds ?? []), shipId],
    });
    return 'applied';
  });
  const { container } = render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: /open confetti activation cover/i }));
  await user.click(screen.getByRole('button', {
    name: /activate emergency bridge confetti dispenser/i,
  }));
  act(() => signal?.('aegis'));

  expect(popShipConfetti).toHaveBeenCalledWith('aegis', 'admiral');
  expect(screen.getByRole('button', { name: /emergency bridge confetti dispenser spent/i }))
    .toBeDisabled();
  expect(screen.getByText(/one use.*empty/i)).toBeInTheDocument();
  expect(container.querySelectorAll('.confetti-burst__piece')).toHaveLength(48);
});

it('tells a lone non-captain that a second person must fire the cannon', async () => {
  const user = userEvent.setup();
  vi.mocked(popShipConfetti).mockResolvedValue('awaiting-officer');
  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-engineer']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: /open confetti activation cover/i }));
  await user.click(screen.getByRole('button', { name: /activate emergency bridge confetti dispenser/i }));

  expect(popShipConfetti).toHaveBeenCalledWith('dione', 'dione-engineer');
  expect(screen.getByRole('status')).toHaveTextContent(/second person.*fire.*cannon/i);
  expect(screen.getByRole('button', { name: /activate emergency bridge confetti dispenser/i }))
    .toBeEnabled();
});

it('fires newspapers on the bridge when the docked SNN shuttle holds the presses', async () => {
  let signal: ((sourceShipId: string) => void) | undefined;
  vi.mocked(subscribeShipConfetti).mockImplementation((_sessionId, _shipId, onPop) => {
    signal = onPop;
    return vi.fn();
  });
  const { container } = render(
    <MemoryRouter initialEntries={['/ships/aegis']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await waitFor(() => expect(signal).toBeDefined());
  act(() => signal?.('snn-press-shuttle'));

  expect(container.querySelectorAll('.confetti-burst__piece--newspaper')).toHaveLength(48);
});

it('locks the trigger while the one-shot activation is in flight', async () => {
  const user = userEvent.setup();
  let finish: (() => void) | undefined;
  vi.mocked(popShipConfetti).mockImplementation(() => new Promise((resolve) => {
    finish = () => resolve('applied');
  }));
  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-captain']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: /open confetti activation cover/i }));
  const trigger = screen.getByRole('button', {
    name: /activate emergency bridge confetti dispenser/i,
  });
  await user.click(trigger);

  expect(trigger).toBeDisabled();
  await user.click(trigger);
  expect(popShipConfetti).toHaveBeenCalledTimes(1);

  await act(async () => finish?.());
});

it('keeps an offline one-shot activation locked while it is queued', () => {
  useSessionStore.getState().enqueueCommand({
    id: 'command-1',
    kind: 'popShipConfetti',
    payload: { sessionId: 's1', shipId: 'icebreaker', roleId: 'icebreaker-captain' },
    createdAt: new Date().toISOString(),
  });
  render(
    <MemoryRouter initialEntries={['/ships/icebreaker']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('button', {
    name: /emergency bridge confetti dispenser activation queued/i,
  })).toBeDisabled();
  expect(screen.getByText(/one use.*queued/i)).toBeInTheDocument();
});

it('removes the bounded burst and ship listener when they are no longer needed', async () => {
  vi.useFakeTimers();
  let signal: ((sourceShipId: string) => void) | undefined;
  const unsubscribe = vi.fn();
  vi.mocked(subscribeShipConfetti).mockImplementation((_sessionId, _shipId, onPop) => {
    signal = onPop;
    return unsubscribe;
  });
  const { container, unmount } = render(
    <MemoryRouter initialEntries={['/ships/shepherd']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );
  await act(async () => Promise.resolve());

  act(() => signal?.('shepherd'));
  expect(container.querySelectorAll('.confetti-burst__piece')).toHaveLength(48);

  act(() => vi.advanceTimersByTime(3_500));
  expect(container.querySelectorAll('.confetti-burst__piece')).toHaveLength(0);
  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
