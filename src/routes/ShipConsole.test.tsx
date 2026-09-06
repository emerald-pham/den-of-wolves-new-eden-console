import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ShipConsole from './ShipConsole';

vi.mock('@/lib/sessionService', () => ({
  adjustShipResource: vi.fn(),
  adjustShipUnrest: vi.fn(),
  popShipConfetti: vi.fn(),
  selectConsoleRole: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeShipConfetti: vi.fn(),
}));

const { popShipConfetti } = await import('@/lib/sessionService');
const { selectConsoleRole } = await import('@/lib/sessionService');
const { adjustShipResource, adjustShipUnrest } = await import('@/lib/sessionService');
const { subscribeShipConfetti } = await import('@/lib/firestore');

beforeEach(() => {
  vi.mocked(popShipConfetti).mockReset();
  vi.mocked(adjustShipResource).mockReset();
  vi.mocked(adjustShipResource).mockResolvedValue(undefined);
  vi.mocked(adjustShipUnrest).mockReset();
  vi.mocked(adjustShipUnrest).mockResolvedValue(undefined);
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
  expect(screen.getByRole('img', { name: /south american nations flag/i }))
    .toHaveAttribute('data-shared-flag-layer', 'background');
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

it.each([
  ['aegis', 'AEGIS', [0, 4, 8, 6, 1, 9]],
  ['dione', 'Dione', [0, 3, 13, 14, 0, 2]],
  ['icebreaker', 'Icebreaker', [0, 4, 11, 9, 3, 2]],
  ['shepherd', 'Shepherd', [0, 4, 10, 8, 0, 2]],
  ['quellon', 'Quellon', [0, 3, 10, 8, 0, 2]],
  ['refinery-124', 'Refinery 124', [12, 5, 9, 4, 0, 6]],
] as const)('shows %s starting resource trackers', (shipId, shipName, amounts) => {
  render(
    <MemoryRouter initialEntries={[`/ships/${shipId}`]}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const tracker = screen.getByRole('region', { name: `${shipName} resource stores` });
  const labels = ['Strytium Ore', 'Strytium Fuel', 'Food', 'Water', 'Materials', 'Security Teams'];
  labels.forEach((label, index) => {
    expect(within(tracker).getByRole('listitem', { name: `${label}: ${amounts[index]}` }))
      .toBeInTheDocument();
  });
  expect(within(tracker).queryByText('Scrap')).not.toBeInTheDocument();
});

it('adds Capybara expansion scrap to its resource trackers', () => {
  render(
    <MemoryRouter initialEntries={['/ships/capybara']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const tracker = screen.getByRole('region', { name: 'Capybara resource stores' });
  expect(within(tracker).getByRole('listitem', { name: 'Strytium Fuel: 3' })).toBeInTheDocument();
  expect(within(tracker).getByRole('listitem', { name: 'Security Teams: 2' })).toBeInTheDocument();
  expect(within(tracker).getByRole('listitem', { name: 'Scrap: 3' })).toBeInTheDocument();
});

it('renders changing shared stock as a read-only player instrument', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...session,
    shipResources: {
      capybara: { ore: 0, fuel: 1, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
    },
  });
  render(
    <MemoryRouter initialEntries={['/ships/capybara/roles/capybara-captain']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const tracker = screen.getByRole('region', { name: 'Capybara resource stores' });
  expect(within(tracker).getByRole('listitem', { name: 'Strytium Fuel: 1' })).toBeInTheDocument();
  expect(within(tracker).getByRole('img', { name: 'Strytium Fuel icon' })).toBeInTheDocument();
  expect(within(tracker).queryByRole('button')).not.toBeInTheDocument();
  expect(adjustShipResource).not.toHaveBeenCalled();
});

it('tracks civil unrest read-only under census with the resource visual language', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, shipUnrest: { capybara: 4 } });
  render(
    <MemoryRouter initialEntries={['/ships/capybara/roles/capybara-captain']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const tracker = screen.getByRole('region', { name: 'Capybara census' });
  expect(within(tracker).getByRole('img', { name: 'Civil Unrest icon' })).toBeInTheDocument();
  expect(within(tracker).getByText('4 / 7')).toBeInTheDocument();
  expect(within(tracker).queryByRole('button')).not.toBeInTheDocument();
  expect(adjustShipUnrest).not.toHaveBeenCalled();
});

it('breaks the unrest dial when the authoritative value is above seven', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, shipUnrest: { capybara: 8 } });
  const { container } = render(
    <MemoryRouter initialEntries={['/ships/capybara']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('region', { name: 'Capybara census' })).toHaveTextContent(
    /unrest telemetry failure.*exceeds rated maximum.*console functions nominal/i,
  );
  expect(container.querySelector('.ship-console')).toHaveAttribute('data-unrest-critical', 'true');
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
  const vesselType = screen.getByText('Battleship / carrier');
  const description = screen.getByText(/main protector of the survivor fleet/i);
  const roleLabel = screen.getByText('Role assignment');
  const renderedRole = screen.getByText(roleName);
  expect(roleLabel.tagName).toBe('DT');
  expect(renderedRole.tagName).toBe('DD');
  expect(vesselType.compareDocumentPosition(description))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(description.compareDocumentPosition(renderedRole))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

  expect(screen.getByText('Role assignment')).toBeInTheDocument();
  expect(screen.getByText('Observer').tagName).toBe('DD');
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

it('returns to the fleet roster when Dione is disabled', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, dioneEnabled: false });

  render(
    <MemoryRouter initialEntries={['/ships/dione']}>
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
  let signal: ((sourceShipId: string, actorRoleName: string, actorName: string) => void) | undefined;
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
  act(() => signal?.('snn-press-shuttle', 'Press Officer', 'Scoop McGee'));

  expect(container.querySelectorAll('.confetti-burst__piece--newspaper')).toHaveLength(48);
  expect(screen.queryByText(/scoop mcgee/i)).not.toBeInTheDocument();
});

it('marks who fired ship confetti on every receiving console', async () => {
  let signal: ((sourceShipId: string, actorRoleName: string, actorName: string) => void) | undefined;
  vi.mocked(subscribeShipConfetti).mockImplementation((_sessionId, _shipId, onPop) => {
    signal = onPop;
    return vi.fn();
  });
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/wing-commander']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await waitFor(() => expect(signal).toBeDefined());
  act(() => signal?.('aegis', 'Admiral', 'Alice'));

  expect(screen.getByRole('status')).toHaveTextContent(/discharged by.*admiral.*alice/i);
});

it('gives the Admiral a pageable AEGIS ship-systems console', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const workspace = screen.getByRole('region', { name: 'AEGIS Admiral console' });
  expect(workspace).toHaveTextContent(/galactic coordinates.*0000/i);
  expect(workspace).toHaveTextContent(/reactor capacity.*5 consoles/i);
  for (const consoleName of [
    'Armoured Hull I', 'Armoured Hull II', 'Storage', 'Reactor',
    'Shuttle Bay Zeta', 'Shuttle Bay Omega', 'Jump Drive', 'Construction Bay',
  ]) {
    expect(within(workspace).getByRole('heading', { name: consoleName })).toBeInTheDocument();
  }
  expect(within(workspace).getAllByText(/short.*2.*medium.*3.*long.*6/i)).toHaveLength(2);

  await user.click(within(workspace).getByRole('button', { name: 'Maintenance cycle' }));
  expect(within(workspace).getByRole('list', { name: 'AEGIS maintenance sequence' }))
    .toHaveTextContent(/1.*Storage.*2.*Rations.*3.*Unrest check.*4.*Riot check.*5.*Reactor.*6.*Shuttle Bay Zeta.*7.*Shuttle Bay Omega/i);
  expect(within(workspace).getByRole('table', { name: 'AEGIS ration schedule' }))
    .toHaveTextContent(/Food.*0.*3.*5.*8.*Water.*0.*2.*3.*6/i);
});

it('gives the Wing Commander Starlight and fighter-wing operations without XO systems', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/wing-commander']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const workspace = screen.getByRole('region', { name: 'AEGIS Wing Commander console' });
  expect(within(workspace).getByRole('heading', { name: 'I.C.S.S. Starlight' })).toBeInTheDocument();
  expect(within(workspace).getByText(/within 2 jumps/i)).toBeInTheDocument();
  expect(within(workspace).getByText(/explore.*\+3.*salvage.*\+1/i)).toBeInTheDocument();
  expect(within(workspace).getByRole('heading', { name: 'Fighter Wing Alpha' })).toBeInTheDocument();
  expect(within(workspace).getByRole('heading', { name: 'Fighter Wing Bravo' })).toBeInTheDocument();
  for (const fighterName of ['Fighter Wing Alpha', 'Fighter Wing Bravo']) {
    expect(within(workspace).getByRole('heading', { name: fighterName }).closest('article'))
      .toHaveTextContent(/capacity.*4 fighters.*6 upgraded/i);
  }

  await user.click(within(workspace).getByRole('button', { name: 'Combat doctrine' }));
  expect(within(workspace).getByText(/medium range/i)).toBeInTheDocument();
  expect(within(workspace).getByText(/damage on 5\+/i)).toBeInTheDocument();
  expect(within(workspace).getByText(/short range/i)).toBeInTheDocument();
  expect(within(workspace).getByText(/damage on 3\+.*fighter is destroyed.*1 or 2/i)).toBeInTheDocument();
  expect(within(workspace).queryByText(/command and control|missile launchers|point defence|pallas/i))
    .not.toBeInTheDocument();
});

it('does not add an AEGIS gameplay workspace to the Executive Officer console', () => {
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/executive-officer']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('region', { name: /AEGIS Executive Officer console/i }))
    .not.toBeInTheDocument();
  expect(screen.queryByText(/command and control|missile launchers|point defence|pallas/i))
    .not.toBeInTheDocument();
});

it.each([
  ['dione', 'Dione', 'dione-captain', 'Captain'],
  ['dione', 'Dione', 'dione-engineer', 'Engineer'],
  ['dione', 'Dione', 'dione-president', 'President'],
  ['icebreaker', 'Icebreaker', 'icebreaker-captain', 'Captain'],
  ['icebreaker', 'Icebreaker', 'icebreaker-engineer', 'Engineer'],
  ['icebreaker', 'Icebreaker', 'icebreaker-miner', 'Miner'],
  ['capybara', 'Capybara', 'capybara-captain', 'Capybara Captain'],
  ['capybara', 'Capybara', 'capybara-recycler', 'Capybara Recycler'],
  ['shepherd', 'Shepherd', 'shepherd-captain', 'Captain'],
  ['shepherd', 'Shepherd', 'shepherd-engineer', 'Engineer'],
  ['shepherd', 'Shepherd', 'shepherd-scientist', 'Scientist'],
  ['quellon', 'Quellon', 'quellon-captain', 'Captain'],
  ['quellon', 'Quellon', 'quellon-engineer', 'Engineer'],
  ['quellon', 'Quellon', 'quellon-explorer', 'Explorer'],
  ['refinery-124', 'Refinery 124', 'refinery-124-captain', 'Captain'],
  ['refinery-124', 'Refinery 124', 'refinery-124-engineer', 'Engineer'],
  ['refinery-124', 'Refinery 124', 'refinery-124-pdf-colonel', 'P.D.F. Colonel'],
] as const)('scaffolds the %s %s console without activating gameplay', (
  shipId,
  shipName,
  roleId,
  roleName,
) => {
  render(
    <MemoryRouter initialEntries={[`/ships/${shipId}/roles/${roleId}`]}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const scaffold = screen.getByRole('region', {
    name: `${shipName} ${roleName} console scaffold`,
  });
  expect(within(scaffold).getByRole('heading', { name: `${roleName} console` }))
    .toBeInTheDocument();
  expect(scaffold).toHaveTextContent(/scaffold ready/i);
  expect(scaffold).toHaveTextContent(/no gameplay controls active/i);
});

it('applies the capital-ship identity and survivor instruments to AEGIS', () => {
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const specs = screen.getByRole('region', { name: 'AEGIS specifications' });
  expect(specs).toHaveTextContent(/Length250m.*Tonnage80,000.*Crew Capacity3,000.*Passengers Capacity100/);
  expect(within(specs).queryByRole('img', { name: /survivors exceed combined/i }))
    .not.toBeInTheDocument();
  const track = within(screen.getByRole('region', { name: 'AEGIS census' }))
    .getByRole('list', { name: 'Survivor Population steps' });
  expect(within(track).getAllByRole('listitem')).toHaveLength(9);
  expect(within(track).getByText('2,500').closest('li')).toHaveAttribute('aria-current', 'step');
  expect(within(track).getByLabelText('0 — GM alert threshold')).toBeInTheDocument();
});

it.each([
  ['dione', 'Dione', /Length550m.*Tonnage500,000.*Crew Capacity4,000.*Passengers Capacity12,000/],
  ['icebreaker', 'Icebreaker', /Length800m.*Tonnage1,200,000.*Crew Capacity10,000.*Passengers Capacity100/],
  ['shepherd', 'Shepherd', /Length700m.*Tonnage750,000.*Crew Capacity4,000.*Passengers Capacity4,000/],
  ['quellon', 'Quellon', /Length600m.*Tonnage700,000.*Crew Capacity6,500.*Passengers Capacity10/],
  ['refinery-124', 'Refinery 124', /Length500km.*Tonnage450,000.*Crew Capacity5,000.*Passengers Capacity0/],
] as const)('shows %s specifications and overload warnings from its survivor count', (
  shipId,
  shipName,
  expectedSpecifications,
) => {
  render(
    <MemoryRouter initialEntries={[`/ships/${shipId}`]}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const specs = screen.getByRole('region', { name: `${shipName} specifications` });
  expect(specs).toHaveTextContent(expectedSpecifications);
  expect(within(specs).getAllByRole('img', { name: /survivors exceed combined/i }))
    .toHaveLength(2);
  expect(within(specs).getAllByTitle('Vessel exceeds capacity')).toHaveLength(2);
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

it('places Capybara specifications before the role and shows a read-only survivor track', () => {
  render(<MemoryRouter initialEntries={['/ships/capybara/roles/capybara-captain']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);
  const specs = screen.getByRole('region', { name: 'Capybara specifications' });
  expect(specs).toHaveTextContent(/Length600m.*Tonnage800,000.*Crew Capacity5,000.*Passengers Capacity500/);
  const role = screen.getByText('Capybara Captain');
  expect(screen.getByText('Role assignment').tagName).toBe('DT');
  expect(role.tagName).toBe('DD');
  expect(specs.compareDocumentPosition(role) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(specs).getAllByRole('img', { name: /survivors exceed combined/i })).toHaveLength(2);
  const census = screen.getByRole('region', { name: 'Capybara census' });
  const track = within(census).getByRole('list', { name: 'Survivor Population steps' });
  expect(within(track).getAllByRole('listitem')).toHaveLength(28);
  expect(within(track).getByText('20,000').closest('li')).toHaveAttribute('aria-current', 'step');
  expect(within(census).queryByRole('button')).not.toBeInTheDocument();
});

it('clears both capacity warnings when live survivors equal or drop below combined capacity', () => {
  render(<MemoryRouter initialEntries={['/ships/capybara']}>
    <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);
  const session = useSessionStore.getState().session!;
  act(() => useSessionStore.getState().setSession({ ...session, shipSurvivors: { capybara: 6000 } }));
  expect(screen.getAllByRole('img', { name: /survivors exceed combined/i })).toHaveLength(2);
  act(() => useSessionStore.getState().setSession({ ...session, shipSurvivors: { capybara: 5500 } }));
  expect(screen.queryByRole('img', { name: /survivors exceed combined/i })).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setSession({ ...session, shipSurvivors: { capybara: 5000 } }));
  expect(screen.queryByRole('img', { name: /survivors exceed combined/i })).not.toBeInTheDocument();
});

it.each([
  ['capybara', 'var(--cic-faction-san)', 'var(--cic-ink)'],
  ['refinery-124', 'var(--cic-faction-gliese)', 'var(--cic-faction-gliese-secondary)'],
])('applies %s branding from its vessel definition through the shared base', (shipId, accent, secondary) => {
  render(<MemoryRouter initialEntries={[`/ships/${shipId}`]}>
    <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);
  expect(screen.getByRole('main').style.getPropertyValue('--ship-accent')).toBe(accent);
  expect(screen.getByRole('main').style.getPropertyValue('--ship-secondary')).toBe(secondary);
});
