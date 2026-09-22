import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ShipConsole from './ShipConsole';
import type { Player } from '@/types/game';

vi.mock('@/lib/sessionService', () => ({
  refreshCommissarPurgeAuthority: vi.fn(async () => null),
  adjustShipResource: vi.fn(),
  adjustShipUnrest: vi.fn(),
  buildFighter: vi.fn(),
  getDioneMaliadesLaunch: vi.fn(),
  launchDioneMaliades: vi.fn(),
  popShipConfetti: vi.fn(),
  selectConsoleRole: vi.fn(),
  setGmShipConsoleWriteGrant: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeShipConfetti: vi.fn(),
  subscribeDamageDraws: vi.fn(),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeVipCards: vi.fn(),
}));

vi.mock('@/lib/fleetAlertService', () => ({ setFleetRedAlert: vi.fn() }));
vi.mock('@/lib/vipCardService', () => ({ drawVipCard: vi.fn(), transferVipCard: vi.fn() }));

const { popShipConfetti } = await import('@/lib/sessionService');
const { selectConsoleRole } = await import('@/lib/sessionService');
const { setGmShipConsoleWriteGrant } = await import('@/lib/sessionService');
const { adjustShipResource, adjustShipUnrest } = await import('@/lib/sessionService');
const { buildFighter } = await import('@/lib/sessionService');
const { getDioneMaliadesLaunch, launchDioneMaliades } = await import('@/lib/sessionService');
const { subscribeShipConfetti } = await import('@/lib/firestore');
const { subscribeDamageDraws } = await import('@/lib/firestore');
const { subscribeVipCards } = await import('@/lib/firestore');
const { drawVipCard, transferVipCard } = await import('@/lib/vipCardService');

beforeEach(() => {
  vi.mocked(popShipConfetti).mockReset();
  vi.mocked(adjustShipResource).mockReset();
  vi.mocked(adjustShipResource).mockResolvedValue(undefined);
  vi.mocked(adjustShipUnrest).mockReset();
  vi.mocked(adjustShipUnrest).mockResolvedValue(undefined);
  vi.mocked(buildFighter).mockReset();
  vi.mocked(buildFighter).mockResolvedValue(null);
  vi.mocked(getDioneMaliadesLaunch).mockReset();
  vi.mocked(getDioneMaliadesLaunch).mockResolvedValue({
    type: 'dione-maliades-launch-view', sessionId: 's1', turn: 1, revision: 0,
    launched: false, eligible: false, reason: 'waiting',
  });
  vi.mocked(launchDioneMaliades).mockReset();
  vi.mocked(selectConsoleRole).mockReset();
  vi.mocked(selectConsoleRole).mockImplementation(async (roleId) => {
    const current = useSessionStore.getState().me;
    if (current) useSessionStore.getState().setMe({
      ...current,
      activeConsoleRoleId: roleId,
    });
  });
  vi.mocked(setGmShipConsoleWriteGrant).mockReset();
  vi.mocked(setGmShipConsoleWriteGrant).mockImplementation(async (_shipId, enabled) => enabled);
  vi.mocked(subscribeShipConfetti).mockReset();
  vi.mocked(subscribeShipConfetti).mockReturnValue(vi.fn());
  vi.mocked(subscribeDamageDraws).mockReset();
  vi.mocked(subscribeDamageDraws).mockReturnValue(vi.fn());
  vi.mocked(subscribeVipCards).mockReset();
  vi.mocked(subscribeVipCards).mockImplementation((_sessionId, _uid, onCards) => {
    onCards({ sessionId: 's1', ownerUid: 'u1', revision: 0, cards: [] });
    return vi.fn();
  });
  vi.mocked(transferVipCard).mockReset();
  vi.mocked(transferVipCard).mockResolvedValue(undefined);
  vi.mocked(drawVipCard).mockReset();
  vi.mocked(drawVipCard).mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
      fleetGroupId: 'fleet-1',
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
  const dockings = within(instruments).getByRole('list', { name: 'Shuttle docking history' });
  expect(dockings).toHaveTextContent('S.A.N.S. Macaw');
  expect(dockings).toHaveTextContent('S.A.N.S. Boa');
});

it('places the pursuit tracker beneath shipboard DRADIS and uses this ship position', () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 4,
    shipGalacticCoordinates: { capybara: '8378', aegis: '0000', dione: '5143' },
    playerDiscovery: {
      groupId: 'fleet-1', shipId: 'capybara', currentCoordinate: '8378',
      knownCoordinates: ['0000', '8378'],
      knownSystems: { 'system-01': '0000', 'system-17': '8378' },
      pursuitDistance: 6, pursuitValue: 2, navigationLogs: [], revision: 1,
    },
    fleetRedAlert: { active: true, revision: 1 },
  });

  render(
    <MemoryRouter initialEntries={['/ships/capybara']}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  const tracker = screen.getByRole('region', { name: 'Pursuit tracker' });
  const instruments = screen.getByRole('complementary', { name: /capybara instruments/i });
  expect(tracker.parentElement).toBe(instruments);
  expect(instruments.firstElementChild).toBe(tracker);
  expect(tracker).not.toHaveTextContent('Relative to Capybara // 8378');
  expect(tracker).toHaveTextContent('Current track // 2 / 10');
  expect(tracker).toHaveTextContent('Distance from Home Systems // -6 pursuit distance');
  expect(tracker).not.toHaveTextContent('Map depth is shared; position is ship-local.');
  expect(tracker).not.toHaveTextContent('Dione');
  expect(tracker).toHaveAttribute('data-red-alert', 'true');
  expect(tracker).toHaveTextContent('RED ALERT ACTIVE');
});

it.each([
  ['aegis', 'Old Nations of Earth // Interstellar Council Service Navy // ICN'],
  ['shepherd', 'New Nations of the Colonies // Rosal // ROSAL'],
] as const)('shows the %s ship nation within its fleet origin', (shipId, nationLine) => {
  render(
    <MemoryRouter initialEntries={[`/ships/${shipId}`]}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText(nationLine)).toBeInTheDocument();
});

it('replaces the AEGIS confetti launcher with the Admiral red-alert command instrument', () => {
  const session = useSessionStore.getState().session!;
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setSession({ ...session, phase: 'active' });
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'admiral' });
  useSessionStore.getState().setConnection('live');
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const instruments = screen.getByRole('complementary', { name: 'AEGIS instruments' });
  expect(within(instruments).getByRole('region', { name: 'FLEETWIDE RED ALERT' }))
    .toBeInTheDocument();
  expect(within(instruments).getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }))
    .toHaveTextContent('COMMAND LOCK');
  expect(within(instruments).queryByRole('region', {
    name: /emergency bridge confetti dispenser/i,
  })).not.toBeInTheDocument();
});

it('keeps the Admiral red-alert instrument on the base AEGIS return route', () => {
  const session = useSessionStore.getState().session!;
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setSession({ ...session, phase: 'active' });
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'admiral' });
  useSessionStore.getState().setConnection('live');

  render(
    <MemoryRouter initialEntries={['/ships/aegis']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const instruments = screen.getByRole('complementary', { name: 'AEGIS instruments' });
  expect(within(instruments).getByRole('region', { name: 'FLEETWIDE RED ALERT' })).toBeVisible();
  expect(within(instruments).getByRole('button', { name: 'OPEN RED ALERT COMMAND COVER' }))
    .toHaveTextContent('COMMAND LOCK');
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

it('shows Dione docking history with the SNN shuttle and its shuttleport', () => {
  render(
    <MemoryRouter initialEntries={['/ships/dione']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const manifest = screen.getByRole('list', { name: /shuttle docking history/i });
  expect(screen.getByRole('heading', { name: 'Shuttle docking history' })).toBeInTheDocument();
  expect(manifest).toHaveTextContent(/SNN Independent Press Shuttle.*Civilian access hatch/i);
  expect(screen.queryByText(/currently docked/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/mechanical dock occupancy/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/linked mechanical bays/i)).not.toBeInTheDocument();
});

it.each([
  ['admiral', 'Admiral'],
  ['executive-officer', 'Executive Officer'],
  ['wing-commander', 'Wing Commander'],
])('uses the same synced AEGIS console for the %s', async (roleId, roleName) => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, assignedRoleId: roleId, seatId: roleId });
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
  expect(screen.queryByText(/wolf agent assigned/i)).not.toBeInTheDocument();
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

it('lets a player browse consoles without releasing their command role', () => {
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

  expect(screen.getByRole('link', { name: /view ship consoles/i })).toHaveAttribute('href', '/ships/dione/roles');
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
  expect(screen.getByText(/Console access \/\/ Read only/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Begin Maintenance/ })).toBeDisabled();
});

it('keeps the President record form read only for short-staff Dione cover', async () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected test session state.');
  useSessionStore.getState().setSession({
    ...session,
    phase: 'active',
    currentTurn: 2,
    activeRoleIds: ['dione-president', 'dione-captain', 'dione-engineer'],
    activeVesselIds: ['dione'],
  });
  useSessionStore.getState().setMe({
    ...me,
    assignedRoleId: 'dione-captain',
    seatId: 'dione-captain',
    activeConsoleRoleId: 'dione-captain',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  const { subscribeConnectedPlayers } = await import('@/lib/firestore');
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([{ ...useSessionStore.getState().me!, connected: true }]);
    return vi.fn();
  });

  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-president']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByLabelText('Decision record')).toBeDisabled();
  expect(screen.getByText(/Recording unavailable.*active President authority/i)).toBeInTheDocument();
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

it('gives a GM quiet read-only ship view and requires confirmed write access', async () => {
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

  expect(screen.queryByText('Observer')).not.toBeInTheDocument();
  expect(screen.queryByText('Role assignment')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: /GM ship console access/i })).toBeInTheDocument();
  const writeMode = screen.getByRole('button', { name: 'GM ship console read write access' });
  expect(writeMode).toHaveAttribute('aria-pressed', 'false');
  expect(container.querySelector('.ship-console')).toHaveAttribute('data-observer-mode', 'read');
  expect(screen.getByText(/GM ship console access.*read only/i)).toBeInTheDocument();

  await user.click(writeMode);
  expect(screen.getByRole('alertdialog', { name: 'Are you sure?' })).toBeInTheDocument();
  expect(setGmShipConsoleWriteGrant).not.toHaveBeenCalled();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog', { name: 'Are you sure?' })).not.toBeInTheDocument();
  expect(document.activeElement).toBe(writeMode);
  expect(writeMode).toHaveAttribute('aria-pressed', 'false');
  expect(setGmShipConsoleWriteGrant).not.toHaveBeenCalled();

  await user.click(writeMode);
  await user.click(screen.getByRole('button', { name: /are you sure/i }));
  expect(setGmShipConsoleWriteGrant).toHaveBeenCalledWith(
    'aegis',
    true,
    expect.objectContaining({
      sessionId: 's1', uid: 'u1', instanceId: 'gm-1',
      claimedAt: '2026-01-01T00:00:00.000Z', shipId: 'aegis',
    }),
  );
  expect(writeMode).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.ship-console')).toHaveAttribute('data-observer-mode', 'write');
  expect(screen.getByText(/GM ship console access.*read \/ write/i)).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: /change role/i }));
  await user.click(screen.getByRole('link', { name: /return to observer/i }));
  expect(screen.getByRole('button', { name: 'GM ship console read write access' }))
    .toHaveAttribute('aria-pressed', 'false');
  expect(container.querySelector('.ship-console')).toHaveAttribute('data-observer-mode', 'read');
});

it('drops a pending write confirmation when the GM instance changes', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  const bridge = {
    id: 'bridge', sessionId: 's1', uid: 'u1', name: 'Bridge', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  };
  useSessionStore.getState().setGmInstance(bridge);
  render(
    <MemoryRouter initialEntries={['/ships/aegis/observer']}>
      <Routes><Route path="/ships/:shipId/observer" element={<ShipConsole observer />} /></Routes>
    </MemoryRouter>,
  );

  const trigger = screen.getByRole('button', { name: 'GM ship console read write access' });
  await user.click(trigger);
  expect(screen.getByRole('alertdialog', { name: 'Are you sure?' })).toBeInTheDocument();
  act(() => useSessionStore.getState().setGmInstance({ ...bridge, id: 'tablet' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Are you sure?' })).not.toBeInTheDocument());
  expect(setGmShipConsoleWriteGrant).not.toHaveBeenCalledWith('aegis', true, expect.anything());
  expect(document.activeElement).toBe(trigger);
});

it('waits for a pending write grant before revoking the captured lease', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
  const events: string[] = [];
  let resolveGrant: ((value: boolean) => void) | undefined;
  vi.mocked(setGmShipConsoleWriteGrant).mockImplementation(async (_shipId, enabled) => {
    if (enabled) {
      events.push('grant');
      return await new Promise<boolean>((resolve) => { resolveGrant = (value) => { events.push('grant-resolved'); resolve(value); }; });
    }
    events.push('revoke');
    return false;
  });
  render(
    <MemoryRouter initialEntries={['/ships/aegis/observer']}>
      <Routes>
        <Route path="/ships/:shipId/observer" element={<ShipConsole observer />} />
        <Route path="/ships/:shipId/roles" element={<Link to="/ships/aegis/observer">Return to observer</Link>} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: 'GM ship console read write access' }));
  await user.click(screen.getByRole('button', { name: /are you sure/i }));
  await waitFor(() => expect(events).toEqual(['grant']));
  await user.click(screen.getByRole('link', { name: /change role/i }));
  expect(events).toEqual(['grant']);
  act(() => resolveGrant?.(true));
  await waitFor(() => expect(events).toEqual(['grant', 'grant-resolved', 'revoke']));
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

it('opens a digital cover before activating a non-AEGIS one-shot Emergency Bridge Confetti Dispenser', async () => {
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
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({
    ...me, assignedRoleId: 'dione-captain', seatId: 'dione-captain',
  });
  const { container } = render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-captain']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: /open confetti activation cover/i }));
  await user.click(screen.getByRole('button', {
    name: /activate emergency bridge confetti dispenser/i,
  }));
  act(() => signal?.('aegis'));

  expect(popShipConfetti).toHaveBeenCalledWith('dione', 'dione-captain');
  expect(screen.getByRole('button', { name: /emergency bridge confetti dispenser spent/i }))
    .toBeDisabled();
  expect(screen.getByText(/one use.*empty/i)).toBeInTheDocument();
  expect(container.querySelectorAll('.confetti-burst__piece')).toHaveLength(48);
});

it('does not apply a global Iris lock to an otherwise active player ship console', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected test session state.');
  useSessionStore.getState().setSession({ ...session, currentTurn: 0 });
  useSessionStore.getState().setMe({
    ...me,
    assignedRoleId: 'dione-captain',
    seatId: 'dione-captain',
    activeConsoleRoleId: 'dione-captain',
  });
  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-captain']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('button', { name: /open confetti activation cover/i })).toBeEnabled();
  expect(screen.queryByText('ONE USE // TURN 0 // AWAITING IRIS AUTHENTICATION')).not.toBeInTheDocument();
});

it('tells a lone non-captain that a second person must fire the cannon', async () => {
  const user = userEvent.setup();
  vi.mocked(popShipConfetti).mockResolvedValue('awaiting-officer');
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({
    ...me, assignedRoleId: 'dione-engineer', seatId: 'dione-engineer',
  });
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

it('marks who fired ship confetti on receiving non-AEGIS consoles', async () => {
  let signal: ((sourceShipId: string, actorRoleName: string, actorName: string) => void) | undefined;
  vi.mocked(subscribeShipConfetti).mockImplementation((_sessionId, _shipId, onPop) => {
    signal = onPop;
    return vi.fn();
  });
  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-captain']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await waitFor(() => expect(signal).toBeDefined());
  act(() => signal?.('aegis', 'Admiral', 'Alice'));

  expect(screen.getByText(/discharged by.*admiral.*alice/i)).toHaveAttribute('role', 'status');
});

it('shows Admiral ship systems alongside the maintenance cycle', () => {
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
  const jump = within(within(workspace).getByRole('article', { name: 'Jump Drive system // operational' }));
  const baseline = jump.getByText(/short \/\/ 2 fuel/i, { selector: 'p' });
  const normalFailure = jump.getByText('A jump fails on a roll of 1–2.', { selector: 'p' });
  const condition = jump.getByText('Condition', { selector: 'dt' });
  expect(jump.queryByText('Normal', { selector: 'dt' })).not.toBeInTheDocument();
  expect(baseline.compareDocumentPosition(normalFailure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(normalFailure.compareDocumentPosition(condition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  expect(within(workspace).getByRole('heading', { name: 'Maintenance cycle' })).toBeVisible();
  expect(within(workspace).getByRole('list', { name: 'AEGIS maintenance sequence' }))
    .toHaveTextContent(/1.*Storage.*2.*Rations.*3.*Unrest check.*4.*Riot check.*5.*Reactor.*6.*Shuttle Bay Zeta.*7.*Shuttle Bay Omega/i);
  expect(within(workspace).getByRole('table', { name: 'AEGIS ration schedule' }))
    .toHaveTextContent(/Food.*0.*3.*5.*8.*Water.*0.*2.*3.*6/i);
});

it('freezes ship gameplay controls while showing the final-turn evaluation state', async () => {
  const activeSession = useSessionStore.getState().session;
  const activePlayer = useSessionStore.getState().me;
  if (!activeSession || !activePlayer) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'debrief',
    currentTurn: 6,
    turnLimit: 6,
  });
  useSessionStore.getState().setMe({ ...activePlayer, activeConsoleRoleId: 'admiral' });
  useSessionStore.getState().setConnection('live');

  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText(
    /final cycle complete.*endgame evaluation in progress.*gameplay controls are frozen/i,
  )).toHaveAttribute('role', 'status');
  expect(screen.getByRole('button', { name: /engage icn console lock/i })).toBeDisabled();
});

it('keeps the retained craft path explicit after total fleet loss', () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'failure',
    currentTurn: 2,
    gameOutcome: {
      type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss', cycle: 2,
      occurredAt: '2026-09-20T14:30:00.000Z',
    },
  });

  render(
    <MemoryRouter initialEntries={['/ships/aegis']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText(
    /all full fleet ships lost in cycle 2.*survivors, escape pods, and small craft remain available/i,
  )).toHaveAttribute('role', 'status');
});

it('keeps ship controls read-only until the requested role is confirmed', async () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, phase: 'active' });
  useSessionStore.getState().setConnection('live');
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, assignedRoleId: 'admiral', seatId: 'admiral' });
  vi.mocked(selectConsoleRole).mockRejectedValueOnce(
    new Error('That console role is already taken.'),
  );

  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const begin = screen.getByRole('button', { name: /begin maintenance cycle/i });
  expect(begin).toBeDisabled();
  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('admiral'));
  expect(begin).toBeDisabled();
});

it('does not activate a console selected through another role route', async () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({
    ...me,
    assignedRoleId: 'dione-captain',
    seatId: 'dione-captain',
    activeConsoleRoleId: null,
  });

  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'AEGIS' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /begin maintenance cycle/i })).toBeDisabled();
  await act(async () => { await Promise.resolve(); });
  expect(selectConsoleRole).not.toHaveBeenCalled();
});

it('does not claim a role from a malformed cross-ship console route', async () => {
  vi.mocked(selectConsoleRole).mockRejectedValueOnce(new Error('Role route is invalid.'));

  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/admiral']}>
      <Routes>
        <Route path="/console" element={<p>Fleet roster</p>} />
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
  await act(async () => { await Promise.resolve(); });
  expect(selectConsoleRole).not.toHaveBeenCalled();
});

it('shows authoritative AEGIS damage and its drawn card without exposing a damage control', async () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...session,
    shipDamage: {
      aegis: { damagedSystemIds: ['reactor'], destroyed: false },
    },
  });
  vi.mocked(subscribeDamageDraws).mockImplementation((_sessionId, onDraws) => {
    onDraws([{
      id: 'draw-1', sessionId: 's1', type: 'ship-damage', shipId: 'aegis', card: '10♥',
      systemId: 'reactor', systemName: 'Reactor', recycled: false,
      createdAt: '2026-01-01T00:02:00.000Z',
    }, {
      id: 'draw-2', sessionId: 's1', type: 'ship-damage', shipId: 'aegis', card: '6♥',
      systemId: 'armoured-hull-i', systemName: 'Armoured Hull I', recycled: true,
      createdAt: '2026-01-01T00:03:00.000Z',
    }, {
      id: 'draw-3', sessionId: 's1', type: 'ship-destroyed', shipId: 'aegis',
      createdAt: '2026-01-01T00:04:00.000Z',
    }]);
    return vi.fn();
  });

  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('article', { name: 'Reactor system // damaged' }))
    .toHaveTextContent(/condition.*damaged.*if upgraded \(by shepherd\).*charge 6 consoles.*if damaged.*charge 2 consoles/i);
  expect(screen.getByRole('article', { name: 'Storage system // operational' }))
    .toHaveTextContent(/condition.*operational/i);
  expect(screen.queryByRole('button', { name: /damage/i })).not.toBeInTheDocument();
  const damageCards = await screen.findByRole('region', { name: /aegis ship systems/i });
  expect(damageCards).toHaveTextContent(/reactor.*damaged.*10♥/i);
  expect(damageCards).toHaveTextContent(/armoured hull i.*damage absorbed.*card recycled.*6♥/i);
  expect(damageCards).toHaveTextContent(/ship destroyed.*no damage card remained/i);
});

it.each([
  ['/ships/aegis/roles/admiral', false],
  ['/ships/aegis/observer', true],
] as const)('shows damage cards in ship systems to a GM at %s', async (route, observer) => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(subscribeDamageDraws).mockImplementation((_sessionId, onDraws) => {
    onDraws([{
      id: 'draw-1', sessionId: 's1', type: 'ship-damage', shipId: 'aegis', card: '2♥',
      systemId: 'fighter-bay-bravo', systemName: 'Fighter Bay Bravo', recycled: false,
      createdAt: '2026-01-01T00:02:00.000Z',
    }]);
    return vi.fn();
  });

  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
        <Route path="/ships/:shipId/observer" element={<ShipConsole observer={observer} />} />
      </Routes>
    </MemoryRouter>,
  );

  const card = await screen.findByText('2♥');
  expect(card).toHaveClass('ship-damage-card');
  expect(card).not.toHaveAttribute('tabindex');
  expect(screen.getByRole('region', { name: /aegis ship systems/i })).toHaveTextContent(
    /fighter bay bravo.*2♥/i,
  );
});

it('gives the Wing Commander Starlight and fighter-wing operations without XO systems', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/wing-commander']}>
      <Routes>
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
        <Route path="/shuttles/starlight" element={<p>Starlight shuttle destination</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const workspace = screen.getByRole('region', { name: 'AEGIS Wing Commander console' });
  const starlight = within(workspace).getAllByRole('heading', { name: 'I.C.S.S. Starlight' })[0]?.closest('article');
  if (!starlight) throw new Error('Expected the Starlight flight card.');
  expect(within(starlight).getByText(/within 2 jumps/i)).toBeInTheDocument();
  expect(within(starlight).getByText(/explore.*\+3.*salvage.*\+1/i)).toBeInTheDocument();
  expect(within(workspace).getByRole('heading', { name: 'Fighter Wing Alpha' })).toBeInTheDocument();
  expect(within(workspace).getByRole('heading', { name: 'Fighter Wing Bravo' })).toBeInTheDocument();
  for (const fighterName of ['Fighter Wing Alpha', 'Fighter Wing Bravo']) {
    expect(within(workspace).getByRole('heading', { name: fighterName }).closest('article'))
      .toHaveTextContent(/effective capacity.*unavailable.*live strength.*awaiting fighter count from the server/i);
  }

  await user.click(within(workspace).getByRole('button', { name: 'Combat doctrine' }));
  expect(within(workspace).getByText(/medium range/i)).toBeInTheDocument();
  expect(within(workspace).getByText(/damage on 5\+/i)).toBeInTheDocument();
  expect(within(workspace).getByText(/short range/i)).toBeInTheDocument();
  expect(within(workspace).getByText(/damage on 3\+.*fighter is destroyed.*1 or 2/i)).toBeInTheDocument();
  expect(within(workspace).queryByText(/command and control|missile launchers|point defence|pallas/i))
    .not.toBeInTheDocument();

  await user.click(within(workspace).getByRole('button', { name: 'Flight group' }));
  const returnedStarlight = within(workspace)
    .getAllByRole('heading', { name: 'I.C.S.S. Starlight' })[0]?.closest('article');
  if (!returnedStarlight) throw new Error('Expected the returned Starlight flight card.');
  await user.click(within(returnedStarlight).getByRole('link', { name: 'Open Starlight shuttle console' }));
  expect(screen.getByText('Starlight shuttle destination')).toBeInTheDocument();
});

it('keeps every registered AEGIS combat console reference-only until attack resolvers land', () => {
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/executive-officer']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const workspace = screen.getByRole('region', { name: /AEGIS Executive Officer console/i });
  const combatSystemNames = [
    'Command and Control',
    'Fighter Bay Alpha',
    'Fighter Bay Bravo',
    'Missile Launchers',
    'Point Defence Lasers',
  ];
  const systemCards = within(workspace).getAllByRole('article')
    .filter((article) => article.getAttribute('aria-label')?.endsWith('system // operational'));
  expect(systemCards.map((article) => article.getAttribute('aria-label'))).toEqual(
    combatSystemNames.map((name) => `${name} system // operational`),
  );
  for (const name of combatSystemNames) {
    const system = within(workspace).getByRole('article', {
      name: `${name} system // operational`,
    });
    expect(system).toBeVisible();
    expect(system.querySelector('button, a, input, select, textarea')).toBeNull();
  }
});

it('shows AEGIS battle-sheet damage through the shared fleet systems workspace', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...session,
    shipDamage: {
      aegis: { damagedSystemIds: ['command-and-control'], destroyed: false },
    },
  });

  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/executive-officer']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('article', { name: 'Command and Control system // damaged' }))
    .toHaveTextContent(/condition.*damaged/i);
  expect(screen.getByRole('article', { name: 'Fighter Bay Alpha system // operational' }))
    .toHaveTextContent(/condition.*operational/i);
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
] as const)('displays the %s %s systems without activating gameplay', (
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
    name: `${shipName} ${roleName} console`,
  });
  expect(within(scaffold).getByRole('heading', { name: 'Ship systems' })).toBeInTheDocument();
  expect(within(scaffold).getByRole('heading', { name: 'Role procedures' })).toBeInTheDocument();
  expect(scaffold).toHaveTextContent(/tracked at the table/i);
});

it('routes every Icebreaker Engineer responsibility to live controls', async () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected the test identity.');
  useSessionStore.getState().setSession({
    ...session, phase: 'active', currentTurn: 2,
    activeRoleIds: ['icebreaker-engineer'], activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2026-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2026-09-21T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    maintenanceCycles: { icebreaker: {
      step: 5, revision: 4, turn: 2, results: {}, charges: [], refuelled: [],
    } },
    shipResources: { icebreaker: {
      ore: 3, fuel: 4, food: 11, water: 9, materials: 12, securityTeams: 2,
    } },
    shipDamage: { icebreaker: { damagedSystemIds: [], destroyed: false } },
    shuttleDockings: [{ shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'SESSION START' }],
  });
  useSessionStore.getState().setMe({
    ...me, assignedRoleId: 'icebreaker-engineer', seatId: 'icebreaker-engineer',
    activeConsoleRoleId: null,
  });
  useSessionStore.getState().setConnection('live');

  render(<MemoryRouter initialEntries={['/ships/icebreaker/roles/icebreaker-engineer']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);

  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('icebreaker-engineer'));
  const workspace = screen.getByRole('region', { name: 'Icebreaker Engineer console' });
  expect(within(workspace).getByRole('region', { name: 'Icebreaker maintenance cycle' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Icebreaker resource stores' })).toHaveTextContent(/materials.*12/i);
  expect(within(workspace).getByRole('button', { name: 'Power up reactor' })).toBeEnabled();
  expect(within(workspace).getByRole('link', { name: 'Open Blacksmith shuttle console' }))
    .toHaveAttribute('href', '/shuttles/blacksmith');
  expect(workspace).toHaveTextContent(/repairs fleet consoles.*full cargo load/i);
});

it('routes every Shepherd Engineer responsibility to live controls', async () => {
  const state = useSessionStore.getState();
  const session = state.session;
  const me = state.me;
  if (!session || !me) throw new Error('Expected the test identity.');
  state.setSession({
    ...session, phase: 'active', currentTurn: 2,
    activeRoleIds: ['shepherd-engineer'], activeVesselIds: ['shepherd'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    maintenanceCycles: { shepherd: {
      step: 5, revision: 4, turn: 2, results: {}, charges: [], refuelled: [],
    } },
    shipResources: { shepherd: {
      ore: 0, fuel: 4, food: 18, water: 10, materials: 7, securityTeams: 2,
    } },
    shipDamage: { shepherd: { damagedSystemIds: [], destroyed: false } },
    shuttleDockings: [{ shuttleId: 'black-sheep', shipId: 'shepherd', dockedAt: 'SESSION START' }],
  });
  state.setMe({
    ...me, assignedRoleId: 'shepherd-engineer', seatId: 'shepherd-engineer',
    activeConsoleRoleId: null,
  });
  state.setConnection('live');

  render(<MemoryRouter initialEntries={['/ships/shepherd/roles/shepherd-engineer']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);

  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('shepherd-engineer'));
  const workspace = screen.getByRole('region', { name: 'Shepherd Engineer console' });
  expect(within(workspace).getByRole('region', { name: 'Shepherd maintenance cycle' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Shepherd resource stores' }))
    .toHaveTextContent(/food.*18.*water.*10.*materials.*7/i);
  expect(within(workspace).getByRole('button', { name: 'Power up reactor' })).toBeEnabled();
  expect(within(workspace).getByRole('link', { name: 'Open Black Sheep shuttle console' }))
    .toHaveAttribute('href', '/shuttles/black-sheep');

  act(() => state.setSession({
    ...useSessionStore.getState().session!,
    maintenanceCycles: { shepherd: {
      step: 6, revision: 5, turn: 2, results: { '5': 'Reactor powered up.' },
      charges: ['water-reclamation', 'advanced-hydroponics', 'advanced-hydroponics-ii'],
      refuelled: [],
    } },
  }));

  expect(await within(workspace).findByText(/Live stores: 18 food.*10 water.*7 materials/i)).toBeVisible();
  expect(within(workspace).getByRole('button', { name: 'Run Water Reclamation' })).toBeEnabled();
  expect(within(workspace).getByRole('button', { name: 'Run Advanced Hydroponics' })).toBeEnabled();
  expect(within(workspace).getByRole('button', { name: 'Run Advanced Hydroponics II' })).toBeEnabled();
});

it('routes every Quellon Engineer responsibility to live controls', async () => {
  const state = useSessionStore.getState();
  const session = state.session;
  const me = state.me;
  if (!session || !me) throw new Error('Expected the test identity.');
  state.setSession({
    ...session, phase: 'active', currentTurn: 2,
    activeRoleIds: ['quellon-engineer'], activeVesselIds: ['quellon'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    maintenanceCycles: { quellon: {
      step: 5, revision: 4, turn: 2, results: {}, charges: [], refuelled: [],
    } },
    shipResources: { quellon: {
      ore: 0, fuel: 3, food: 10, water: 28, materials: 4, securityTeams: 2,
    } },
    shipDamage: { quellon: { damagedSystemIds: [], destroyed: false } },
    shuttleDockings: [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: 'SESSION START' }],
  });
  state.setMe({
    ...me, assignedRoleId: 'quellon-engineer', seatId: 'quellon-engineer',
    activeConsoleRoleId: null,
  });
  state.setConnection('live');

  render(<MemoryRouter initialEntries={['/ships/quellon/roles/quellon-engineer']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);

  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('quellon-engineer'));
  const workspace = screen.getByRole('region', { name: 'Quellon Engineer console' });
  expect(within(workspace).getByRole('region', { name: 'Quellon maintenance cycle' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Quellon resource stores' }))
    .toHaveTextContent(/food.*10.*water.*28.*materials.*4/i);
  expect(within(workspace).getByRole('button', { name: 'Power up reactor' })).toBeEnabled();
  expect(within(workspace).getByRole('link', { name: 'Open Condor shuttle console' }))
    .toHaveAttribute('href', '/shuttles/condor');
  expect(workspace).toHaveTextContent(/resolve upgrades and repairs at the table/i);

  act(() => state.setSession({
    ...useSessionStore.getState().session!,
    maintenanceCycles: { quellon: {
      step: 6, revision: 5, turn: 2, results: { '5': 'Reactor powered up.' },
      charges: ['hydroponics', 'water-production', 'water-production-ii'],
      refuelled: [],
    } },
  }));

  expect(await within(workspace).findByText(/Live stores: 10 food.*28 water.*4 materials/i)).toBeVisible();
  expect(within(workspace).getByRole('button', { name: 'Run Hydroponics' })).toBeEnabled();
  expect(within(workspace).getByRole('button', { name: 'Run Water Production' })).toBeEnabled();
  expect(within(workspace).getByRole('button', { name: 'Run Water Production II' })).toBeEnabled();
});

it.each([
  ['dione', 'Dione', 'dione-captain', 'Hydroponics', '100,000'],
  ['icebreaker', 'Icebreaker', 'icebreaker-captain', 'Mining Drone Control', '40,000'],
  ['shepherd', 'Shepherd', 'shepherd-captain', 'Advanced Hydroponics', '30,000'],
  ['quellon', 'Quellon', 'quellon-captain', 'Water Production', '30,000'],
  ['refinery-124', 'Refinery 124', 'refinery-124-captain', 'Fuel Refinery', '20,000'],
] as const)(
  'keeps the %s Captain policy, diplomacy, survivor, and liaison workspace on the bound player role',
  async (shipId, shipName, roleId, supplySystem, survivors) => {
    const activeSession = useSessionStore.getState().session;
    const activeMe = useSessionStore.getState().me;
    if (!activeSession || !activeMe) throw new Error('Expected active session state.');
    useSessionStore.getState().setSession({
      ...activeSession,
      phase: 'active',
      activeRoleIds: [roleId],
      activeVesselIds: [shipId],
    });
    useSessionStore.getState().setMe({
      ...activeMe,
      role: 'player',
      assignedRoleId: roleId,
      seatId: roleId,
      activeConsoleRoleId: null,
    });

    render(
      <MemoryRouter initialEntries={[`/ships/${shipId}/roles/${roleId}`]}>
        <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith(roleId));
    const workspace = screen.getByRole('region', { name: `${shipName} Captain console` });
    expect(within(workspace).getByRole('heading', { name: 'Ship policy' })).toBeVisible();
    expect(within(workspace).getByRole('heading', { name: 'Fleet diplomacy' })).toBeVisible();
    expect(workspace).toHaveTextContent(/liaise with other ships.*represent your survivors/i);
    expect(within(workspace).getByRole('heading', { name: supplySystem })).toBeVisible();
    expect(screen.getByRole('region', { name: `${shipName} census` })).toHaveTextContent(survivors);
    expect(screen.getByText('Role assignment').nextElementSibling).toHaveTextContent('Captain');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Engage ICN console lock' })).toBeEnabled());
    expect(screen.queryByLabelText('View ship console role')).not.toBeInTheDocument();
    expect(screen.queryByText(/console access.*read only/i)).not.toBeInTheDocument();
  },
);

it('labels shared system outcomes as conditional damage and Shepherd upgrades', () => {
  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-engineer']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const reactor = within(screen.getByRole('article', { name: 'Reactor system // operational' }));
  expect(reactor.getByText('If Upgraded (By Shepherd)', { selector: 'dt' })).toBeVisible();
  expect(reactor.getByText('+1 console.', { selector: 'dd' })).toBeVisible();
  expect(reactor.getByText('If Damaged', { selector: 'dt' })).toBeVisible();
  expect(reactor.getByText('−3 consoles.', { selector: 'dd' })).toBeVisible();
});

it('shows the Dione Engineer live Maliades gate and launches against its exact attack revision', async () => {
  const activeSession = useSessionStore.getState().session;
  const activeMe = useSessionStore.getState().me;
  if (!activeSession || !activeMe) throw new Error('Expected active session state.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active', currentTurn: 2,
    activeRoleIds: ['dione-engineer'], activeVesselIds: ['dione'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
      openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  useSessionStore.getState().setMe({
    ...activeMe, assignedRoleId: 'dione-engineer', seatId: 'dione-engineer',
    activeConsoleRoleId: 'dione-engineer',
  });
  useSessionStore.getState().setConnection('live');
  vi.mocked(getDioneMaliadesLaunch).mockResolvedValue({
    type: 'dione-maliades-launch-view', sessionId: 's1', turn: 2, revision: 6,
    launched: false, eligible: true,
  });
  vi.mocked(launchDioneMaliades).mockResolvedValue({
    status: 'committed', requestId: 'launch-1', type: 'dione-maliades-launch-view',
    sessionId: 's1', turn: 2, revision: 7, launched: true, eligible: false,
    reason: 'already-launched',
  });

  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-engineer']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const control = await screen.findByRole('region', { name: 'Maliades launch control' });
  expect(within(control).getByText(/10♦.*charged.*operational.*authorized/i)).toBeVisible();
  const launch = within(control).getByRole('button', { name: 'Launch Maliades' });
  expect(launch).toBeEnabled();
  await userEvent.click(launch);
  expect(launchDioneMaliades).toHaveBeenCalledWith(2, 6);
  expect(await within(control).findByText(/Maliades launched.*Cycle 2/i)).toBeVisible();
  expect(within(control).getByRole('button', { name: 'Maliades launched' })).toBeDisabled();
});

it('routes the bound Dione Engineer workspace to live maintenance, craft, production, and bay actions', async () => {
  const activeSession = useSessionStore.getState().session;
  const activeMe = useSessionStore.getState().me;
  if (!activeSession || !activeMe) throw new Error('Expected active session state.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active', currentTurn: 1,
    activeRoleIds: ['dione-engineer'], activeVesselIds: ['dione'],
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-01-01T00:10:00.000Z',
      openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shipResources: {
      ...activeSession.shipResources,
      dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 },
    },
    shipDamage: {
      ...activeSession.shipDamage,
      dione: { damagedSystemIds: [], destroyed: false },
    },
    maintenanceCycles: {
      ...activeSession.maintenanceCycles,
      dione: {
        turn: 1, step: 6, revision: 3,
        results: { '5': 'Reactor powered up. Previous unused charge lost. Charged 3/4 consoles.' },
        charges: ['hydroponics', 'water-reclamation', 'fighter-bay'], refuelled: [],
      },
    },
    shuttleDockings: [
      { shipId: 'dione', shuttleId: 'philia', dockedAt: 'SESSION START' },
      { shipId: 'dione', shuttleId: 'maliades', dockedAt: 'SESSION START' },
    ],
  });
  useSessionStore.getState().setMe({
    ...activeMe,
    role: 'player', assignedRoleId: 'dione-engineer', seatId: 'dione-engineer',
    activeConsoleRoleId: null,
  });
  useSessionStore.getState().setConnection('live');

  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-engineer']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('dione-engineer'));
  const workspace = screen.getByRole('region', { name: 'Dione Engineer console' });
  expect(within(workspace).getByRole('region', { name: 'Dione maintenance cycle' })).toBeVisible();
  expect(workspace).toHaveTextContent(/Live stores: 13 food.*14 water.*0 materials.*0 ore.*3 fuel/i);
  expect(within(workspace).getByRole('link', { name: 'Open Philia shuttle console' }))
    .toHaveAttribute('href', '/shuttles/philia');
  expect(within(workspace).getByRole('link', { name: 'Open Maliades shuttle console' }))
    .toHaveAttribute('href', '/shuttles/maliades');
  expect(within(workspace).getByRole('button', { name: 'Run Hydroponics' })).toBeEnabled();
  expect(within(workspace).getByRole('button', { name: 'Run Water Reclamation' })).toBeDisabled();
  const bay = within(workspace).getByRole('combobox', { name: 'Shuttle Bay refuelling' });
  expect(bay).toBeEnabled();
  expect(within(bay).getByRole('option', { name: 'F.S. Philia' })).toBeVisible();
  expect(within(bay).getByRole('option', { name: 'F.S.F. Maliades' })).toBeVisible();
  expect(await screen.findByRole('region', { name: 'Maliades launch control' })).toBeVisible();
  expect(screen.queryByLabelText('View ship console role')).not.toBeInTheDocument();
});

it('routes the bound Icebreaker Miner workspace to authoritative production and Highwall operations', async () => {
  const activeSession = useSessionStore.getState().session;
  const activeMe = useSessionStore.getState().me;
  if (!activeSession || !activeMe) throw new Error('Expected active session state.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active', currentTurn: 2,
    activeRoleIds: ['icebreaker-miner'], activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:10:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shipResources: {
      ...activeSession.shipResources,
      icebreaker: { ore: 7, fuel: 4, food: 11, water: 9, materials: 6, securityTeams: 2 },
    },
    shipDamage: {
      ...activeSession.shipDamage,
      icebreaker: { damagedSystemIds: [], destroyed: false },
    },
    maintenanceCycles: {
      ...activeSession.maintenanceCycles,
      icebreaker: {
        turn: 2, step: 6, revision: 5,
        results: { '5': 'Reactor powered up. Previous unused charge lost. Charged 2/4 consoles.' },
        charges: ['mining-drone-control', 'jump-drive'], refuelled: [],
      },
    },
    shuttleDockings: [
      { shipId: 'icebreaker', shuttleId: 'highwall', dockedAt: 'SESSION START' },
    ],
    shuttleControl: {
      highwall: {
        shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: activeMe.uid,
        holderUid: activeMe.uid, revision: 3,
      },
    },
  });
  useSessionStore.getState().setMe({
    ...activeMe,
    role: 'player', assignedRoleId: 'icebreaker-miner', seatId: 'icebreaker-miner',
    activeConsoleRoleId: null,
  });
  useSessionStore.getState().setConnection('live');

  render(
    <MemoryRouter initialEntries={['/ships/icebreaker/roles/icebreaker-miner']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('icebreaker-miner'));
  const workspace = screen.getByRole('region', { name: 'Icebreaker Miner console' });
  expect(within(workspace).getByRole('region', { name: 'Icebreaker maintenance cycle' })).toBeVisible();
  expect(workspace).toHaveTextContent(/Live stores: 11 food.*9 water.*6 materials.*7 ore.*4 fuel/i);
  expect(within(workspace).getByRole('button', { name: 'Run Mining Drone Control' })).toBeEnabled();
  expect(within(workspace).getByRole('link', { name: 'Open Highwall shuttle console' }))
    .toHaveAttribute('href', '/shuttles/highwall');
  expect(screen.queryByLabelText('View ship console role')).not.toBeInTheDocument();
});

it('does not expose the Maliades launch control outside the Dione Engineer console', () => {
  render(
    <MemoryRouter initialEntries={['/ships/dione/roles/dione-captain']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );
  expect(screen.queryByRole('region', { name: 'Maliades launch control' })).not.toBeInTheDocument();
  expect(getDioneMaliadesLaunch).not.toHaveBeenCalled();
});

it('applies the capital-ship identity and survivor instruments to AEGIS', () => {
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const specs = screen.getByRole('region', { name: 'AEGIS specifications' });
  expect(specs).toHaveTextContent(/Length250m.*Tonnage80,000.*Crew Capacity3,000.*Passenger Capacity100/);
  expect(within(specs).queryByRole('button', { name: /crew and passenger capacity exceeded/i }))
    .not.toBeInTheDocument();
  const track = within(screen.getByRole('region', { name: 'AEGIS census' }))
    .getByRole('list', { name: 'Survivor Population steps' });
  expect(within(track).getAllByRole('listitem')).toHaveLength(9);
  expect(within(track).getByText('2,500').closest('li')).toHaveAttribute('aria-current', 'step');
  expect(within(track).getByLabelText('0 — GM alert threshold')).toBeInTheDocument();
});

it.each([
  ['dione', 'Dione', /Length550m.*Tonnage500,000.*Crew Capacity4,000.*Passenger Capacity12,000/],
  ['icebreaker', 'Icebreaker', /Length800m.*Tonnage1,200,000.*Crew Capacity10,000.*Passenger Capacity100/],
  ['shepherd', 'Shepherd', /Length700m.*Tonnage750,000.*Crew Capacity4,000.*Passenger Capacity4,000/],
  ['quellon', 'Quellon', /Length600m.*Tonnage700,000.*Crew Capacity6,500.*Passenger Capacity10/],
  ['refinery-124', 'Refinery 124', /Length500km.*Tonnage450,000.*Crew Capacity5,000.*Passenger Capacity0/],
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
  expect(within(specs).getAllByRole('button', { name: /crew and passenger capacity exceeded/i }))
    .toHaveLength(2);
});

it('explains an exceeded crew and passenger capacity warning on hover or tap', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/ships/dione']}>
      <Routes><Route path="/ships/:shipId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>,
  );

  const warnings = screen.getAllByRole('button', { name: /crew and passenger capacity exceeded/i });
  expect(warnings).toHaveLength(2);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  await user.hover(warnings[0]!);
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Crew and passenger capacity exceeded. OVERRIDE: Within Operation New Eden parameters',
  );
  await user.unhover(warnings[0]!);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  await user.click(warnings[1]!);
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Crew and passenger capacity exceeded. OVERRIDE: Within Operation New Eden parameters',
  );
});

it('locks the trigger while the one-shot activation is in flight', async () => {
  const user = userEvent.setup();
  let finish: (() => void) | undefined;
  vi.mocked(popShipConfetti).mockImplementation(() => new Promise((resolve) => {
    finish = () => resolve('applied');
  }));
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({
    ...me, assignedRoleId: 'dione-captain', seatId: 'dione-captain',
  });
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
  expect(specs).toHaveTextContent(/Length600m.*Tonnage800,000.*Crew Capacity5,000.*Passenger Capacity500/);
  const role = screen.getByText('Capybara Captain');
  expect(screen.getByText('Role assignment').tagName).toBe('DT');
  expect(role.tagName).toBe('DD');
  expect(specs.compareDocumentPosition(role) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(specs).getAllByRole('button', { name: /crew and passenger capacity exceeded/i })).toHaveLength(2);
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
  expect(screen.getAllByRole('button', { name: /crew and passenger capacity exceeded/i })).toHaveLength(2);
  act(() => useSessionStore.getState().setSession({ ...session, shipSurvivors: { capybara: 5500 } }));
  expect(screen.queryByRole('button', { name: /crew and passenger capacity exceeded/i })).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setSession({ ...session, shipSurvivors: { capybara: 5000 } }));
  expect(screen.queryByRole('button', { name: /crew and passenger capacity exceeded/i })).not.toBeInTheDocument();
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

it('embeds AEGIS consoles in maintenance order and leaves armour and FTL outside the track', () => {
  render(<MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);
  const track = screen.getByRole('list', { name: 'AEGIS maintenance sequence' });
  const steps = Array.from(track.children);
  expect(steps).toHaveLength(7);
  expect(steps[0]).toContainElement(screen.getByRole('heading', { name: 'Storage' }));
  expect(steps[4]).toContainElement(screen.getByRole('heading', { name: 'Reactor' }));
  expect(steps[4]).toContainElement(screen.getByRole('heading', { name: 'Construction Bay' }));
  expect(steps[5]).toContainElement(screen.getByRole('heading', { name: 'Shuttle Bay Zeta' }));
  expect(steps[5]).not.toContainElement(screen.getByRole('heading', { name: 'Shuttle Bay Omega' }));
  expect(steps[6]).toContainElement(screen.getByRole('heading', { name: 'Shuttle Bay Omega' }));
  expect(track).not.toContainElement(screen.getByRole('heading', { name: 'Jump Drive' }));
  expect(track).not.toContainElement(screen.getByRole('heading', { name: 'Armoured Hull I' }));
});

it('exposes the live Construction Bay action on the Wing Commander cards', async () => {
  const session = useSessionStore.getState().session!;
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setSession({
    ...session,
    phase: 'active',
    currentTurn: 1,
    turnPhase: { turn: 1, teamPhaseEndsAt: '2026-01-01T00:10:00.000Z', openAirspaceEndsAt: '2026-01-01T00:30:00.000Z', airspace: { state: 'restricted', tickerActive: false, pressAccess: false } },
    maintenanceCycles: { aegis: { turn: 1, step: 5, revision: 3, results: {}, charges: ['construction-bay'], refuelled: [] } },
    shipUpgrades: { aegis: [] },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 2, securityTeams: 9 } },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 3, revision: 0 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    },
    vesselActionRevisions: { aegis: 0 },
  });
  useSessionStore.getState().setMe({
    ...me,
    assignedRoleId: 'wing-commander',
    seatId: 'wing-commander',
    activeConsoleRoleId: 'wing-commander',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  vi.mocked(buildFighter).mockResolvedValue({
    status: 'committed', wingId: 'fighter-wing-alpha', count: 4, fighterWingRevision: 1,
    materials: 1, capacity: 4,
  });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/ships/aegis/roles/wing-commander']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);

  const alpha = screen.getByRole('heading', { name: 'Fighter Wing Alpha' }).closest('article');
  if (!alpha) throw new Error('Expected Fighter Wing Alpha card.');
  const build = within(alpha).getByRole('button', { name: /build 1 fighter/i });
  expect(build).toBeEnabled();
  expect(build).toHaveClass('cic-action-button');
  await user.click(build);
  expect(buildFighter).toHaveBeenCalledWith('fighter-wing-alpha');
  expect(screen.getByRole('link', { name: /view ship consoles/i })).toBeVisible();
});

it('keeps Construction Bay building disabled when the server says it is damaged', () => {
  const session = useSessionStore.getState().session!;
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setSession({
    ...session,
    phase: 'active', currentTurn: 1,
    maintenanceCycles: { aegis: { turn: 1, step: 5, revision: 3, results: {}, charges: ['construction-bay'], refuelled: [] } },
    shipDamage: { aegis: { damagedSystemIds: ['construction-bay'], destroyed: false } },
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 2, securityTeams: 9 } },
    fighterWingCounts: { 'fighter-wing-alpha': { count: 3, revision: 0 }, 'fighter-wing-bravo': { count: 4, revision: 0 } },
  });
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'wing-commander' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  render(<MemoryRouter initialEntries={['/ships/aegis/roles/wing-commander']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);
  expect(screen.getAllByRole('button', { name: /build 1 fighter/i })[0]).toBeDisabled();
});

it('names the FTL maintenance group Faster Than Light', () => {
  render(<MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
    <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
  </MemoryRouter>);

  expect(screen.getByRole('heading', { name: 'Faster Than Light' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Faster Than Light Subsystem' })).not.toBeInTheDocument();
});

it.each([
  ['aegis', 'wing-commander', 'admiral', ['admiral', 'executive-officer', 'wing-commander']],
  ['capybara', 'capybara-captain', 'capybara-recycler', ['capybara-captain', 'capybara-recycler']],
] as const)('updates visiting console authority with the %s crew without claiming the viewed role', async (shipId, ownRole, targetRole, roles) => {
  const me = {
    ...useSessionStore.getState().me!,
    assignedRoleId: ownRole,
    seatId: ownRole,
    activeConsoleRoleId: ownRole,
  };
  useSessionStore.setState({ me, connection: 'live' });
  const { subscribeConnectedPlayers } = await import('@/lib/firestore');
  let update: (players: readonly Player[]) => void = () => undefined;
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_id, callback) => { update = callback; callback(roles.map((role, index) => ({ ...me, uid: String(index), activeConsoleRoleId: role }))); return vi.fn(); });
  render(<MemoryRouter initialEntries={[`/ships/${shipId}/roles/${targetRole}`]}><Routes>
    <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
    <Route path="/ships/:shipId/roles" element={<p>Ship consoles</p>} />
  </Routes></MemoryRouter>);
  await screen.findByText(/Console access.*Read only/i);
  expect(selectConsoleRole).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Begin Maintenance/ })).toBeDisabled();
  act(() => update([me]));
  expect(screen.getByText(/Console access.*Write.*crew incomplete/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /Begin Maintenance/ })).toBeEnabled();
  await userEvent.click(screen.getByRole('link', { name: /view ship consoles/i }));
  expect(screen.getByText('Ship consoles')).toBeVisible();
  expect(useSessionStore.getState().me?.activeConsoleRoleId).toBe(ownRole);
});
it.each(['aegis', 'capybara'])('lets a GM browse every %s console and confirm read / write without claiming roles', async shipId => {
  useSessionStore.setState({ me: { ...useSessionStore.getState().me!, role: 'gm' }, connection: 'live', gmInstance: { id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '' } });
  const { findShip } = await import('@/data/ships');
  render(<MemoryRouter initialEntries={[`/ships/${shipId}/observer`]}><Routes><Route path="/ships/:shipId/observer" element={<ShipConsole observer />} /></Routes></MemoryRouter>);
  const select = screen.getByRole('combobox', { name: 'View ship console role' });
  for (const role of findShip(shipId)!.roles) {
    await userEvent.selectOptions(select, role.id);
    expect(select).toHaveValue(role.id);
  }
  await userEvent.selectOptions(select, findShip(shipId)!.roles[0]!.id);
  expect(screen.getByRole('button', { name: /Begin Maintenance/ })).toBeDisabled();
  const toggle = screen.getByRole('button', { name: 'GM ship console read write access' });
  expect(toggle).toHaveTextContent(/Read only/);
  await userEvent.click(toggle);
  expect(screen.getByRole('alertdialog', { name: 'Are you sure?' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /are you sure/i }));
  expect(screen.getByRole('button', { name: /Begin Maintenance/ })).toBeEnabled();
  await userEvent.click(toggle);
  expect(screen.getByRole('button', { name: /Begin Maintenance/ })).toBeDisabled();
  expect(selectConsoleRole).not.toHaveBeenCalled();
});
it('enables GM ship commands only after confirmed write access', async () => {
  useSessionStore.setState({ me: { ...useSessionStore.getState().me!, role: 'gm' }, connection: 'live', gmInstance: { id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '' } });
  render(<MemoryRouter initialEntries={['/ships/capybara/observer']}><Routes><Route path="/ships/:shipId/observer" element={<ShipConsole observer />} /></Routes></MemoryRouter>);
  const cover = screen.getByRole('button', { name: /open confetti activation cover/i });
  expect(cover).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Assign damage' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'GM ship console read write access' }));
  await userEvent.click(screen.getByRole('button', { name: /are you sure/i }));
  expect(cover).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Assign damage' })).toBeEnabled();
});

it('redirects a GM away from an inactive expansion ship in a base session', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.setState({
    me: { ...useSessionStore.getState().me!, role: 'gm' },
    connection: 'live',
    gmInstance: { id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '' },
    session: {
      ...session,
      playerCount: 8,
      expansion: 'base',
      capybaraEnabled: true,
      activeRoleIds: ['admiral'],
      activeVesselIds: ['aegis'],
    },
  });

  render(
    <MemoryRouter initialEntries={['/ships/capybara/observer']}>
      <Routes>
        <Route path="/ships/:shipId/observer" element={<ShipConsole observer />} />
        <Route path="/console" element={<p>Fleet roster</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Fleet roster')).toBeInTheDocument();
});

it('lets a transferred recipient view and retransfer a private card from their active ship console', async () => {
  const { subscribeConnectedPlayers } = await import('@/lib/firestore');
  const activeSession = useSessionStore.getState().session;
  const activeMe = useSessionStore.getState().me;
  if (!activeSession || !activeMe) throw new Error('Expected active session state.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active',
    currentTurn: 1,
    activeRoleIds: ['admiral'],
    activeVesselIds: ['aegis', 'dione'],
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-13T00:00:00.000Z',
      openAirspaceEndsAt: '2026-09-14T00:00:00.000Z',
      airspace: { state: 'lifted', tickerActive: false, pressAccess: true },
    },
  });
  useSessionStore.getState().setMe({
    ...activeMe,
    assignedRoleId: 'admiral',
    seatId: 'admiral',
    activeConsoleRoleId: 'admiral',
  });
  useSessionStore.getState().setConnection('live');
  vi.mocked(subscribeVipCards).mockImplementationOnce((_sessionId, _uid, onCards) => {
    onCards({ sessionId: 's1', ownerUid: 'u1', revision: 4, cards: [{ id: 'party-deck', name: 'Party Deck', status: 'available' }] });
    return vi.fn();
  });
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([{ ...activeMe, uid: 'u2', displayName: 'New Owner', activeConsoleRoleId: 'dione-captain' }]);
    return vi.fn();
  });

  render(<MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}><Routes>
    <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
  </Routes></MemoryRouter>);

  expect(await screen.findByText('Transfer a VIP card')).toBeVisible();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'VIP card to transfer' }), 'party-deck');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'VIP card recipient' }), 'u2');
  const transfer = screen.getByRole('button', { name: 'Transfer card' });
  expect(transfer).toBeEnabled();
  await userEvent.click(transfer);
  expect(transferVipCard).toHaveBeenCalledWith('party-deck', 'u2', 4);
});

it('lets the current replacement VIP Host reach the Dione draw control without a core role', async () => {
  const activeSession = useSessionStore.getState().session;
  const activeMe = useSessionStore.getState().me;
  if (!activeSession || !activeMe) throw new Error('Expected active session state.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active',
    currentTurn: 1,
    activeRoleIds: ['dione-captain'],
    activeVesselIds: ['dione'],
    shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { dione: { turn: 1, step: 5, revision: 3, results: {}, charges: ['vip-lounge'], refuelled: [] } },
  });
  useSessionStore.getState().setMe({ ...activeMe, replacementRoleId: 'vip-host', activeConsoleRoleId: null });
  useSessionStore.getState().setConnection('live');

  render(<MemoryRouter initialEntries={['/ships/dione/roles/vip-host']}><Routes>
    <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
  </Routes></MemoryRouter>);

  const draw = await screen.findByRole('button', { name: 'Draw private VIP card' });
  expect(draw).toBeEnabled();
  await userEvent.click(draw);
  expect(drawVipCard).toHaveBeenCalledWith(3, 'vip-host');
});
