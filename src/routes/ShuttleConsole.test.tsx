import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { SHUTTLECRAFT } from '@/data/shuttles';
import { findConsoleRole } from '@/data/roles';
import { consoleRoleRoute } from '@/lib/consoleRole';
import { recommendedRoleIds } from '@/data/rolePresets';
import type * as FirestoreModule from '@/lib/firestore';
import type * as ShuttleEvacuationServiceModule from '@/lib/shuttleEvacuationService';
import ShuttleConsole from './ShuttleConsole';

vi.mock('@/lib/sessionService', () => ({
  popShipConfetti: vi.fn(),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  selectConsoleRole: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/pressDispatchService', () => ({
  dismissPressDispatch: vi.fn(),
  publishPressDispatch: vi.fn(),
}));
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeShuttleDeparture: vi.fn((_sessionId, _shuttleId, onDeparture) => {
    onDeparture(null);
    return vi.fn();
  }),
}));
vi.mock('@/lib/shuttleControlService', () => ({
  transferShuttleControl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/shuttleDepartureService', () => ({
  beginShuttleTransit: vi.fn().mockResolvedValue(undefined),
  completeShuttleArrival: vi.fn().mockResolvedValue({
    hostShipId: 'icebreaker', arrivedAt: '2026-09-22T12:00:00.000Z',
  }),
  requestShuttleDeparture: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/shuttleCargoService', () => ({
  transferShuttleCargo: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/serviceShuttleRechargeService', () => ({
  rechargeHostConsoleFromShuttle: vi.fn().mockResolvedValue({
    immediate: true, message: 'Hydroponics: spent 1 water, generated 3 food.',
  }),
}));
vi.mock('@/lib/blacksmithRepairService', () => ({
  repairConsolesFromBlacksmith: vi.fn().mockResolvedValue({
    materialsRemaining: 4, repairRevision: 1,
  }),
}));
vi.mock('@/lib/highwallMiningService', () => ({
  runHighwallMining: vi.fn().mockResolvedValue({
    status: 'committed', cycle: 2, revision: 3,
    operation: { requestId: 'mine-3', resource: 'ore', rolls: [4, 5, 6], amount: 15 },
    cargo: { ore: 25, materials: 4 },
  }),
}));
vi.mock('@/lib/shuttleEvacuationService', async (importOriginal) => ({
  ...(await importOriginal<typeof ShuttleEvacuationServiceModule>()),
  evacuateShuttleSurvivors: vi.fn().mockResolvedValue(undefined),
}));
const { dismissPressDispatch, publishPressDispatch } = await import('@/lib/pressDispatchService');
const { releaseConsoleRole, selectConsoleRole } = await import('@/lib/sessionService');
const { subscribeConnectedPlayers } = await import('@/lib/firestore');
const { subscribeShuttleDeparture } = await import('@/lib/firestore');
const { transferShuttleControl } = await import('@/lib/shuttleControlService');
const { beginShuttleTransit, completeShuttleArrival, requestShuttleDeparture } =
  await import('@/lib/shuttleDepartureService');
const { transferShuttleCargo } = await import('@/lib/shuttleCargoService');
const { rechargeHostConsoleFromShuttle } = await import('@/lib/serviceShuttleRechargeService');
const { repairConsolesFromBlacksmith } = await import('@/lib/blacksmithRepairService');
const { runHighwallMining } = await import('@/lib/highwallMiningService');
const { evacuateShuttleSurvivors } = await import('@/lib/shuttleEvacuationService');

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function reachedTransit(holderUid: string, transitRequestId = 'transit-arrived') {
  return {
    status: 'in-transit' as const,
    requestId: 'departure-1', transitRequestId,
    shuttleId: 'starlight', holderUid, fleetGroupId: 'fleet-1', originShipId: 'aegis',
    destinationShipId: 'icebreaker', cycle: 2, controlRevision: 3,
    requestedAt: '2026-01-01T00:10:00.000Z', revision: 1,
    originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
    destinationPosition: { x: 0.26, y: -0.12, z: 0.28 },
    velocity: { x: 0.004, y: -0.002, z: 0.004 },
    departedAt: '2026-01-01T00:10:01.000Z', arrivesAt: '2026-01-01T00:11:01.000Z',
  };
}

beforeEach(() => {
  vi.mocked(selectConsoleRole).mockReset();
  vi.mocked(selectConsoleRole).mockResolvedValue(undefined);
  vi.mocked(releaseConsoleRole).mockReset();
  vi.mocked(releaseConsoleRole).mockResolvedValue(undefined);
  vi.mocked(publishPressDispatch).mockReset();
  vi.mocked(publishPressDispatch).mockResolvedValue(undefined);
  vi.mocked(dismissPressDispatch).mockReset();
  vi.mocked(dismissPressDispatch).mockResolvedValue(undefined);
  vi.mocked(subscribeConnectedPlayers).mockReset();
  vi.mocked(subscribeConnectedPlayers).mockReturnValue(vi.fn());
  vi.mocked(subscribeShuttleDeparture).mockReset();
  vi.mocked(subscribeShuttleDeparture).mockImplementation((_sessionId, _shuttleId, onDeparture) => {
    onDeparture(null);
    return vi.fn();
  });
  vi.mocked(transferShuttleControl).mockReset();
  vi.mocked(transferShuttleControl).mockResolvedValue(undefined);
  vi.mocked(requestShuttleDeparture).mockReset();
  vi.mocked(requestShuttleDeparture).mockResolvedValue(undefined);
  vi.mocked(beginShuttleTransit).mockReset();
  vi.mocked(beginShuttleTransit).mockResolvedValue(undefined);
  vi.mocked(completeShuttleArrival).mockReset();
  vi.mocked(completeShuttleArrival).mockResolvedValue({
    hostShipId: 'icebreaker', arrivedAt: '2026-09-22T12:00:00.000Z',
  });
  vi.mocked(transferShuttleCargo).mockReset();
  vi.mocked(transferShuttleCargo).mockResolvedValue(undefined);
  vi.mocked(rechargeHostConsoleFromShuttle).mockReset();
  vi.mocked(rechargeHostConsoleFromShuttle).mockResolvedValue({
    immediate: true, message: 'Hydroponics: spent 1 water, generated 3 food.',
  });
  vi.mocked(repairConsolesFromBlacksmith).mockReset();
  vi.mocked(repairConsolesFromBlacksmith).mockResolvedValue({
    materialsRemaining: 4, repairRevision: 1,
  });
  vi.mocked(runHighwallMining).mockReset();
  vi.mocked(runHighwallMining).mockResolvedValue({
    status: 'committed', cycle: 2, revision: 3,
    operation: { requestId: 'mine-3', resource: 'ore', rolls: [4, 5, 6], amount: 15 },
    cargo: { ore: 25, materials: 4 },
  });
  vi.mocked(evacuateShuttleSurvivors).mockReset();
  vi.mocked(evacuateShuttleSurvivors).mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    activeRoleIds: ['press-officer'],
    shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'SESSION START' },
    ],
    shuttleVisitLog: [{
      id: 'visit-1', shuttleId: 'snn-press-shuttle', shipId: 'dione',
      action: 'docked', occurredAt: 'SESSION START',
    }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Reporter', role: 'player', seatId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setMode('console');
});

it('keeps a rejected Press claim locked and provides a keyboard return to Independent Stations', async () => {
  const user = userEvent.setup();
  vi.mocked(selectConsoleRole).mockRejectedValueOnce(new Error('Role already held.'));

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Independent Stations</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  const cover = screen.getByRole('button', { name: /open newspaper confetti cover/i });
  expect(cover).toBeDisabled();
  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('press-officer'));
  expect(cover).toBeDisabled();
  const back = screen.getByRole('link', { name: /back to independent stations/i });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Independent Stations')).toBeInTheDocument();
  expect(releaseConsoleRole).not.toHaveBeenCalled();
});

it('does not claim the Press role while another console is held', async () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'admiral' });

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/ships/aegis/roles/admiral" element={<p>Admiral console</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Admiral console')).toBeInTheDocument();
  await act(async () => { await Promise.resolve(); });
  expect(selectConsoleRole).not.toHaveBeenCalled();
});

it('returns a Union engineer from Wobbly to the paired engineering console', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: recommendedRoleIds(14),
  });
  state.setMe({
    ...state.me!,
    activeConsoleRoleId: 'joint-engineering-quellon-refinery',
  });

  render(
    <MemoryRouter initialEntries={['/shuttles/wobbly']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/union/roles/:roleId" element={<p>Joint Engineering console</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: /u\.s\. wobbly/i })).toBeInTheDocument();
  expect(screen.getByText(/security teams, strytium ore, fuel, food, water, and materials/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Recharge' })).toBeInTheDocument();
  expect(screen.getByText(/when fuelled, charge one console each coordination phase/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  const back = screen.getByRole('link', { name: /back to joint engineering union/i });
  expect(back).toHaveAttribute('href', '/union/roles/joint-engineering-quellon-refinery');
  back.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Joint Engineering console')).toBeInTheDocument();
});

it('opens Ally with its Shepherd / Icebreaker Union envelope and returns by keyboard', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['joint-engineering-shepherd-icebreaker'],
    shuttleDockings: [],
    shuttleFuelled: { ally: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'joint-engineering-shepherd-icebreaker' });

  render(
    <MemoryRouter initialEntries={['/shuttles/ally']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/union/roles/:roleId" element={<p>Joint Engineering console</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'U.S. Ally' })).toBeInTheDocument();
  expect(screen.getByText('Shepherd / Icebreaker Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(/in transit/i);
  expect(screen.getByText('Fuelled this cycle')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Repair' })).toBeInTheDocument();
  expect(screen.getByText(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled repair' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*repair consoles on a second ship/i)).toBeInTheDocument();
  expect(screen.queryByText(/fuelled.*repair or scrap/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to joint engineering union/i });
  expect(back).toHaveAttribute('href', '/union/roles/joint-engineering-shepherd-icebreaker');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Joint Engineering console')).toBeInTheDocument();
});

it('gives the Press Officer a dispatch desk that publishes to the fleet ticker', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'press-officer' });
  useSessionStore.getState().setConnection('live');
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  const desk = screen.getByRole('region', { name: 'Press dispatch desk' });
  const publish = screen.getByRole('button', { name: 'Publish dispatch' });
  expect(publish).toBeDisabled();
  await user.type(screen.getByRole('textbox', { name: 'Dispatch' }), 'Convoy arrival confirmed');
  await user.click(publish);
  expect(publishPressDispatch).toHaveBeenCalledWith('Convoy arrival confirmed');
  expect(desk).toHaveTextContent('Dispatch transmitted');
});

it('keeps the claimed Press Officer dispatch desk actionable during Turn 0', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, activeConsoleRoleId: 'press-officer' });
  state.setSession({ ...state.session!, currentTurn: 0 });
  state.setConnection('live');
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  const desk = screen.getByRole('region', { name: 'Press dispatch desk' });
  const textbox = screen.getByRole('textbox', { name: 'Dispatch' });
  const publish = screen.getByRole('button', { name: 'Publish dispatch' });
  expect(textbox).toBeEnabled();
  await user.type(textbox, 'Turn Zero press check');
  await user.click(publish);
  expect(publishPressDispatch).toHaveBeenCalledWith('Turn Zero press check');
  expect(desk).toHaveTextContent('Dispatch transmitted');
  expect(screen.queryByText('Turn 0 // Awaiting Iris Authentication')).not.toBeInTheDocument();
});

it('shows every current dispatch and dismisses only the selected dispatch', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, activeConsoleRoleId: 'press-officer' });
  state.setSession({
    ...state.session!,
    pressDispatch: {
      dispatches: [
        { id: 'dispatch-1', text: 'SNN // Convoy arrival confirmed' },
        { id: 'dispatch-2', text: 'SNN // Water rationing lifted' },
      ],
      revision: 2,
    },
  });
  state.setConnection('live');
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  const desk = screen.getByRole('region', { name: 'Press dispatch desk' });
  expect(desk).toHaveTextContent('Current dispatches');
  expect(desk).toHaveTextContent('SNN // Convoy arrival confirmed');
  expect(desk).toHaveTextContent('SNN // Water rationing lifted');
  await user.click(screen.getByRole('button', {
    name: 'Dismiss dispatch: SNN // Convoy arrival confirmed',
  }));

  expect(dismissPressDispatch).toHaveBeenCalledWith('dispatch-1');
  expect(desk).toHaveTextContent('Dispatch dismissed');
  expect(desk).toHaveTextContent('SNN // Convoy arrival confirmed');
  expect(desk).toHaveTextContent('SNN // Water rationing lifted');
});

it('uses the shared full-screen shuttlecraft console template for SNN', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  expect(container.querySelector('.ship-console.shuttle-console')).toHaveAttribute(
    'data-console-kind', 'shuttlecraft',
  );
  expect(screen.getByRole('heading', { name: /snn.*system news network/i })).toBeInTheDocument();
  const description = screen.getByText(/carries the system news network/i);
  const assignment = screen.getByText('Role assignment');
  const captain = screen.getByText('Press Officer // Captain');
  expect(assignment.tagName).toBe('DT');
  expect(captain.tagName).toBe('DD');
  expect(description.compareDocumentPosition(captain))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByRole('region', { name: /shuttle systems/i })).toHaveTextContent(
    /docked.*dione/i,
  );
  expect(screen.queryByText(/travel log/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: /shuttle travel log/i })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: /newspaper confetti dispenser/i })).toBeInTheDocument();
});

it('lets a GM return from the shuttle console to role selection', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /leave shuttle/i }));
  expect(screen.getByText('Role selection')).toBeInTheDocument();
  expect(selectConsoleRole).not.toHaveBeenCalled();
});

it('lets a non-GM Press holder release authority through a keyboard return', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'press-officer' });

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Independent Stations</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  const back = screen.getByRole('button', { name: /back to independent stations/i });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(releaseConsoleRole).toHaveBeenCalledOnce();
  expect(await screen.findByText('Independent Stations')).toBeInTheDocument();
});

it('returns a Press holder to role selection when the GM disables Press', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected test session state.');
  useSessionStore.getState().setSession({ ...session, activeRoleIds: [], pressEnabled: false });
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'press-officer' });

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Role selection')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /snn.*system news network/i })).not.toBeInTheDocument();
});

it('opens a printed shipboard shuttle for its owning role and returns by keyboard', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['quellon-explorer'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-explorer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/hummingbird']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/quellon/roles/quellon-explorer" element={<p>Quellon Explorer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'P.S. Hummingbird' })).toBeInTheDocument();
  expect(screen.getByText('Explorer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*quellon/i,
  );
  expect(screen.getByRole('heading', { name: 'Scout system' })).toBeInTheDocument();
  expect(screen.getByText('Food and water only')).toBeInTheDocument();
  expect(screen.getByText(/one system within 3 jumps of Quellon/i)).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*roll 2d6.*food.*water/i)).toBeInTheDocument();
  expect(screen.getByText(/\+3 to exploration and \+1 to mining checks/i)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Newspaper confetti dispenser' })).not.toBeInTheDocument();
  const back = screen.getByRole('link', { name: /back to quellon explorer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/quellon/roles/quellon-explorer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Quellon Explorer parent')).toBeInTheDocument();
});

it('lets the current Highwall holder run its fuelled third mining operation', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['icebreaker-miner'], activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2026-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'now' }],
    shuttleFuelled: { highwall: true },
    shuttleControl: { highwall: {
      shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: 'u1',
      holderUid: 'u1', revision: 4,
    } },
    highwallMining: {
      cycle: 2, revision: 2,
      operations: [
        { requestId: 'one', resource: 'materials', rolls: [4], amount: 4 },
        { requestId: 'two', resource: 'ore', rolls: [2, 3, 5], amount: 10 },
      ],
    },
  });
  state.setMe({ ...state.me!, assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner' });
  state.setConnection('live');

  render(<MemoryRouter initialEntries={['/shuttles/highwall']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  const panel = screen.getByRole('region', { name: 'Highwall mining operations' });
  expect(within(panel).getByText(/operations remaining.*1 of 3/i)).toBeVisible();
  expect(within(panel).getByRole('list', { name: 'Highwall mining results' })).toHaveTextContent(
    /operation 2.*2 \+ 3 \+ 5 = 10 ore/i,
  );
  await user.click(within(panel).getByRole('button', { name: 'Roll 3d6 strytium ore' }));
  expect(runHighwallMining).toHaveBeenCalledWith('ore', 2, 4, 2);
  expect(within(panel).getByRole('status')).toHaveTextContent(/4 \+ 5 \+ 6 = 15 strytium ore/i);
  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnPhase: {
      ...useSessionStore.getState().session!.turnPhase!,
      timerPause: {
        window: 'open', remainingMs: 60_000,
        pausedAt: '2099-09-21T12:01:00.000Z',
      },
    },
  }));
  expect(within(panel).getByRole('button', { name: 'Roll 1d6 materials' })).toBeDisabled();
  expect(within(panel).getByText(/requires the Coordination Phase/i)).toBeVisible();
  const unpausedPhase = { ...useSessionStore.getState().session!.turnPhase! };
  delete unpausedPhase.timerPause;
  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnPhase: {
      ...unpausedPhase,
      openAirspaceEndsAt: '2020-09-21T12:15:00.000Z',
    },
  }));
  expect(within(panel).getByRole('button', { name: 'Roll 3d6 strytium ore' })).toBeDisabled();
});

it('lets the current holder transfer only Hummingbird printed cargo while docked', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shipResources: { quellon: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 } },
    shuttleCargo: { hummingbird: { food: 1, water: 2 } },
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'u1',
      holderUid: 'u1', revision: 3,
    } },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1' });
  render(<MemoryRouter initialEntries={['/shuttles/hummingbird']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  const cargo = screen.getByRole('region', { name: 'Shuttle cargo transfer' });
  expect(cargo).toHaveTextContent('Docked at Quellon');
  expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Water' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Strytium Ore' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Resource'), 'food');
  expect(cargo).toHaveTextContent('Host // 10 // Shuttle // 1');
  await user.clear(screen.getByLabelText('Amount'));
  await user.type(screen.getByLabelText('Amount'), '2');
  await user.click(screen.getByRole('button', { name: 'Load shuttle' }));
  expect(transferShuttleCargo).toHaveBeenCalledWith('hummingbird', 'food', 'load', 2, 3);
  expect(screen.getByText('Loaded 2 Food.')).toHaveAttribute('role', 'status');
});

it('offers only printed-track survivor transfers within the shuttle cycle allowance', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 3,
    activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon', 'capybara'],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2026-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2026-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['quellon', 'capybara'], shipId: 'quellon',
      currentCoordinate: '0000', knownCoordinates: ['0000'], knownSystems: { 'system-01': '0000' },
      pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    shipSurvivors: { quellon: 30_000, capybara: 13_000 },
    shuttleEvacuations: { hummingbird: { cycle: 3, moved: 2_000, revision: 4 } },
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'u1',
      holderUid: 'u1', revision: 3,
    } },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1' });
  render(<MemoryRouter initialEntries={['/shuttles/hummingbird']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  const evacuation = screen.getByRole('region', { name: 'Survivor evacuation' });
  expect(evacuation).toHaveTextContent('3,000 of 5,000 survivors remain available for this shuttle this cycle.');
  await user.selectOptions(screen.getByLabelText('Receiving ship'), 'capybara');
  expect(screen.getByRole('option', { name: '2,000' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '5,000' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Survivors'), '2000');
  await user.click(screen.getByRole('button', { name: 'Move survivors' }));
  expect(evacuateShuttleSurvivors).toHaveBeenCalledWith('hummingbird', 'capybara', 2_000, 3, 4);
  expect(screen.getByText('Moved 2,000 survivors to Capybara.')).toHaveAttribute('role', 'status');
});

it('keeps survivor destinations inside the projected fleet group and closes invalid transfer windows', async () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 3,
    activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon', 'capybara', 'dione'],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2026-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2026-09-21T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['quellon', 'capybara'], shipId: 'quellon',
      currentCoordinate: '0000', knownCoordinates: ['0000'], knownSystems: { 'system-01': '0000' },
      pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
    shipSurvivors: { quellon: 30_000, capybara: 13_000, dione: 12_000 },
    populationAlerts: { quellon: {
      shipId: 'quellon', shipName: 'Quellon', population: 30_000,
      targetGmInstanceIds: ['gm-1'], createdAt: '2026-09-21T12:00:00.000Z',
    } },
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'u1',
      holderUid: 'u1', revision: 3,
    } },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1' });
  render(<MemoryRouter initialEntries={['/shuttles/hummingbird']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  const evacuation = screen.getByRole('region', { name: 'Survivor evacuation' });
  expect(within(evacuation).queryByRole('option', { name: 'Dione' })).not.toBeInTheDocument();
  expect(within(evacuation).getByRole('option', { name: 'Capybara' })).toBeInTheDocument();
  expect(screen.getByLabelText('Receiving ship')).toBeDisabled();
  expect(screen.getByText('Survivor transfers open during Coordination Phase.')).toBeVisible();
  expect(screen.getByText("Resolve this ship's survivor alert before another transfer.")).toBeVisible();
  expect(evacuateShuttleSurvivors).not.toHaveBeenCalled();
});

it('opens Endeavour for the Shepherd Scientist with every printed registration fact', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['shepherd-scientist'],
    shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'shepherd-scientist' });

  render(
    <MemoryRouter initialEntries={['/shuttles/endeavour']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/shepherd/roles/shepherd-scientist" element={<p>Shepherd Scientist parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'R.S.S. Endeavour' })).toBeInTheDocument();
  expect(screen.getByText('Scientist // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*shepherd/i,
  );
  expect(screen.getByText(/one system each cycle.*regardless of range/i)).toBeInTheDocument();
  expect(screen.getByText(/up to 2 consoles per cycle.*target ship.*material cost.*fuelled.*2 additional/i)).toBeInTheDocument();
  expect(screen.getByText(/\+3 to science checks/i)).toBeInTheDocument();
  expect(screen.queryByText(/cargo transfer/i)).not.toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to shepherd scientist console/i });
  expect(back).toHaveAttribute('href', '/ships/shepherd/roles/shepherd-scientist');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Shepherd Scientist parent')).toBeInTheDocument();
});

it('opens Condor on the Quellon Engineer route with its recharge and cargo envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['quellon-engineer'],
    shuttleDockings: [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/condor']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/quellon/roles/quellon-engineer" element={<p>Quellon Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'P.S. Condor' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(/docked.*quellon/i);
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Recharge' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*charge one console.*immediate maintenance effect resolves immediately/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  expect(screen.getByText(/docked ship.*security teams.*repel boarders/i)).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to quellon engineer console/i });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Quellon Engineer parent')).toBeInTheDocument();
});

it('opens Maliades on its Dione Engineer route and returns by keyboard', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['dione-engineer'],
    shuttleDockings: [{ shuttleId: 'maliades', shipId: 'dione', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'dione-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/maliades']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/dione/roles/dione-engineer" element={<p>Dione Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'F.S.F. Maliades' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*dione/i,
  );
  expect(screen.getByRole('heading', { name: 'Damage capacity' })).toBeInTheDocument();
  expect(screen.getByText(/up to 3 damage.*destroyed.*fuelled.*1 material per damage/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Medium range' })).toBeInTheDocument();
  expect(screen.getByText(/1s and 6s wrap.*up to 1 die.*4\+/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Short range' })).toBeInTheDocument();
  expect(screen.getByText(/up to 2 dice.*2\+.*different targets/i)).toBeInTheDocument();
  expect(screen.queryByText(/cargo transfer/i)).not.toBeInTheDocument();
  const back = screen.getByRole('link', { name: /back to dione engineer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/dione/roles/dione-engineer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Dione Engineer parent')).toBeInTheDocument();
});

it('opens Blacksmith on its Icebreaker Engineer route with its repair and cargo envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['icebreaker-engineer'],
    shuttleDockings: [{ shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'SESSION START' }],
    shuttleFuelled: { blacksmith: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'icebreaker-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/blacksmith']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/icebreaker/roles/icebreaker-engineer" element={<p>Icebreaker Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'C.S.S. Blacksmith' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*icebreaker/i,
  );
  expect(screen.getByText('Fuelled this cycle')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Repair' })).toBeInTheDocument();
  expect(screen.getByText(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled repair' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*repair consoles on a second ship/i)).toBeInTheDocument();
  expect(screen.queryByText(/fuelled.*repair or scrap/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to icebreaker engineer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/icebreaker/roles/icebreaker-engineer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Icebreaker Engineer parent')).toBeInTheDocument();
});

it('repairs selected Icebreaker consoles through the live Blacksmith control', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 3,
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    activeRoleIds: ['icebreaker-engineer'], activeVesselIds: ['icebreaker'],
    shuttleDockings: [{ shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'now' }],
    shuttleFuelled: { blacksmith: true },
    shuttleControl: { blacksmith: {
      shuttleId: 'blacksmith', ownerRoleId: 'icebreaker-engineer', ownerUid: 'u1',
      holderUid: 'u1', revision: 2,
    } },
    shipDamage: { icebreaker: { damagedSystemIds: ['reactor', 'storage'], destroyed: false } },
    shipResources: { icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 12, securityTeams: 2 } },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'icebreaker-engineer' });

  render(<MemoryRouter initialEntries={['/shuttles/blacksmith']}>
    <Routes><Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} /></Routes>
  </MemoryRouter>);

  const repair = screen.getByRole('region', { name: 'Blacksmith console repair' });
  expect(repair).toHaveTextContent(/materials.*12.*remaining.*2/i);
  await user.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  await user.click(within(repair).getByRole('checkbox', { name: 'Storage' }));
  await user.click(within(repair).getByRole('button', { name: 'Repair selected consoles' }));
  await waitFor(() => expect(repairConsolesFromBlacksmith).toHaveBeenCalledWith(
    ['reactor', 'storage'], 2, 0, 3, 'icebreaker',
  ));
  expect(await screen.findByText(/repaired 2 consoles.*4 materials remain/i)).toHaveAttribute('role', 'status');

  await user.click(within(repair).getByRole('checkbox', { name: 'Reactor' }));
  const liveSession = useSessionStore.getState().session!;
  act(() => {
    state.setSession({
      ...liveSession,
      turnPhase: {
        ...liveSession.turnPhase!,
        timerPause: {
          window: 'open', remainingMs: 60_000, pausedAt: '2099-09-21T12:01:00.000Z',
        },
      },
    });
  });
  await waitFor(() => expect(within(repair).getByRole('button', {
    name: 'Repair selected consoles',
  })).toBeDisabled());
});

it('opens Black Sheep on its Shepherd Engineer route with the owned recharge envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['shepherd-engineer'],
    shuttleDockings: [{ shuttleId: 'black-sheep', shipId: 'shepherd', dockedAt: 'SESSION START' }],
    shuttleFuelled: { 'black-sheep': true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'shepherd-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/black-sheep']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/shepherd/roles/shepherd-engineer" element={<p>Shepherd Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'R.S.S. Black Sheep' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*shepherd/i,
  );
  expect(screen.getByText('Fuelled this cycle')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Recharge' })).toBeInTheDocument();
  expect(screen.getByText(/when fuelled.*charge one console.*immediate maintenance effect.*resolves immediately/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to shepherd engineer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/shepherd/roles/shepherd-engineer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Shepherd Engineer parent')).toBeInTheDocument();
});

it('opens Chacau on its Refinery 124 Engineer route with its repair and cargo envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['refinery-124-engineer'],
    shuttleDockings: [{ shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'SESSION START' }],
    shuttleFuelled: { chacau: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'refinery-124-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/chacau']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/refinery-124/roles/refinery-124-engineer" element={<p>Refinery 124 Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'G.S. Chacau' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(/docked.*refinery 124/i);
  expect(screen.getByText('Fuelled this cycle')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Repair' })).toBeInTheDocument();
  expect(screen.getByText(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled repair' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*repair consoles on a second ship/i)).toBeInTheDocument();
  expect(screen.queryByText(/fuelled.*repair or scrap/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to refinery 124 engineer console/i });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Refinery 124 Engineer parent')).toBeInTheDocument();
});

it('opens Starlight on its Wing Commander route with its routed operation envelope', () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['wing-commander'],
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'wing-commander' });

  render(
    <MemoryRouter initialEntries={['/shuttles/starlight']}>
      <Routes><Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'I.C.S.S. Starlight' })).toBeInTheDocument();
  expect(screen.getByText('Wing Commander // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*aegis/i,
  );
  expect(screen.getByRole('heading', { name: 'Scouting' })).toBeInTheDocument();
  expect(screen.getByText(/within 2 jumps.*fuelled.*second system/i)).toBeInTheDocument();
  expect(screen.getByText(/\+3.*exploration.*\+1.*salvage/i)).toBeInTheDocument();
  expect(screen.queryByText(/cargo transfer/i)).not.toBeInTheDocument();
});

it('opens Philia on its Dione Engineer route with its repair and cargo envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['dione-engineer'],
    shuttleDockings: [{ shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' }],
    shuttleFuelled: { philia: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'dione-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/philia']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/dione/roles/dione-engineer" element={<p>Dione Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'F.S. Philia' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*dione/i,
  );
  expect(screen.getByText('Fuelled this cycle')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Repair' })).toBeInTheDocument();
  expect(screen.getByText(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled repair' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*repair consoles on a second ship/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
  const back = screen.getByRole('link', { name: /back to dione engineer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/dione/roles/dione-engineer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Dione Engineer parent')).toBeInTheDocument();
});

it('opens Pallas on its Executive Officer route with its security and boarding envelope', () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['executive-officer'],
    shuttleDockings: [{ shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' }],
    shuttleFuelled: { pallas: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'executive-officer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/pallas']}>
      <Routes><Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'I.C.S.S. Pallas' })).toBeInTheDocument();
  expect(screen.getByText('Executive Officer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*aegis/i,
  );
  expect(screen.getByText('Fuelled this cycle')).toBeInTheDocument();
  expect(screen.getByText('Security teams only')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Cargo transfer' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  expect(screen.getByText(/security teams.*defend.*reroll up to 3 boarding dice/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled redeployment' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*chosen ship.*start of the Boarding Action step/i)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
});

it('opens Chepu on its PDF Colonel route with its security and boarding envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['refinery-124-pdf-colonel'],
    shuttleDockings: [{ shuttleId: 'chepu', shipId: 'refinery-124', dockedAt: 'SESSION START' }],
    shuttleFuelled: { chepu: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'refinery-124-pdf-colonel' });

  render(
    <MemoryRouter initialEntries={['/shuttles/chepu']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/refinery-124/roles/refinery-124-pdf-colonel" element={<p>PDF Colonel parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'P.D.S. Chepu' })).toBeInTheDocument();
  expect(screen.getByText('P.D.F. Colonel // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*refinery 124/i,
  );
  expect(screen.getByText('Fuelled this cycle')).toBeInTheDocument();
  expect(screen.getByText('Security teams only')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Cargo transfer' })).toBeInTheDocument();
  expect(screen.getByText(/security teams.*to and from ships.*Chepu.*docked/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  expect(screen.getByText(/docked ship.*security teams.*repel boarders/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled redeployment' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*chosen ship.*start of the Boarding Action step/i)).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to refinery 124 p.d.f. colonel console/i });
  expect(back).toHaveAttribute('href', '/ships/refinery-124/roles/refinery-124-pdf-colonel');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('PDF Colonel parent')).toBeInTheDocument();
});

it('keeps a GM-controlled Union shuttle out of the default roster', () => {
  render(
    <MemoryRouter initialEntries={['/shuttles/wobbly']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Role selection')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'U.S. Wobbly' })).not.toBeInTheDocument();
});


function ShuttleHistoryControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button></>;
}

it('preserves owner authority and queued work through return, history and docking reconnect updates', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({ ...state.session!, activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon', 'aegis'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'aegis', dockedAt: 'TURN 2' }], shuttleFuelled: { hummingbird: true } });
  state.setMe({ ...state.me!, seatId: 'held-seat', activeConsoleRoleId: 'quellon-explorer' });
  state.enqueueCommand({ id: 'pending-1', kind: 'popShipConfetti', payload: { sessionId: 's1', shipId: 'quellon', roleId: 'quellon-explorer' }, createdAt: '2026-01-01T00:00:00.000Z' });
  const identity = useSessionStore.getState().me;
  const pending = useSessionStore.getState().pendingCommands;
  render(<MemoryRouter initialEntries={['/shuttles/hummingbird']}><ShuttleHistoryControls /><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
    <Route path="/ships/quellon/roles/quellon-explorer" element={<p>Quellon owner console</p>} />
    <Route path="/console" element={<p>Role selection parent</p>} />
  </Routes></MemoryRouter>);
  const backName = 'Back to Quellon Explorer console';
  expect(screen.getByRole('link', { name: backName })).toHaveAttribute('href', '/ships/quellon/roles/quellon-explorer');
  await user.click(screen.getByRole('link', { name: backName }));
  expect(screen.getByText('Quellon owner console')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'History back' }));
  expect(screen.getByRole('link', { name: backName })).toBeVisible();
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, shuttleDockings: [] }));
  expect(screen.getByRole('link', { name: backName })).toHaveAttribute('href', '/ships/quellon/roles/quellon-explorer');
  await user.click(screen.getByRole('button', { name: 'History forward' }));
  expect(screen.getByText('Quellon owner console')).toBeInTheDocument();
  expect(useSessionStore.getState().me).toEqual(identity);
  expect(useSessionStore.getState().pendingCommands).toEqual(pending);
  expect(useSessionStore.getState().session?.shuttleFuelled).toEqual({ hummingbird: true });
  expect(releaseConsoleRole).not.toHaveBeenCalled();
});

it('offers the safe role-selection parent when an ordinary shuttle owner ship becomes unavailable', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({ ...state.session!, activeRoleIds: ['dione-engineer'], activeVesselIds: ['aegis', 'dione'], dioneEnabled: true });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'dione-engineer' });
  render(<MemoryRouter initialEntries={['/shuttles/maliades']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
    <Route path="/console" element={<p>Role selection parent</p>} />
  </Routes></MemoryRouter>);
  expect(screen.getByRole('link', { name: /Back to Dione Engineer console/ })).toBeVisible();
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, activeVesselIds: ['aegis'], dioneEnabled: false }));
  const back = screen.getByRole('link', { name: 'Back to role selection' });
  expect(back).toHaveAttribute('href', '/console');
  await user.click(back);
  expect(screen.getByText('Role selection parent')).toBeInTheDocument();
  expect(useSessionStore.getState().me?.activeConsoleRoleId).toBe('dione-engineer');
  expect(releaseConsoleRole).not.toHaveBeenCalled();
});


it.each(SHUTTLECRAFT.filter(shuttle => {
  const role = findConsoleRole(shuttle.captainRoleId);
  return role && role.shipId !== 'press' && role.shipId !== 'joint-engineering-union';
}))('offers one canonical owning-console return for ordinary shuttle $id', (shuttle) => {
  const role = findConsoleRole(shuttle.captainRoleId)!;
  const state = useSessionStore.getState();
  state.setSession({ ...state.session!, activeRoleIds: [role.id], activeVesselIds: [role.shipId], dioneEnabled: true, capybaraEnabled: true, shuttleDockings: [] });
  state.setMe({ ...state.me!, activeConsoleRoleId: role.id });
  render(<MemoryRouter initialEntries={[`/shuttles/${shuttle.id}`]}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);
  const returns = screen.getAllByRole('link', { name: /^Back to / });
  expect(returns).toHaveLength(1);
  expect(returns[0]).toHaveAttribute('href', consoleRoleRoute(role.id));
  expect(returns[0]).toHaveAttribute('aria-label', returns[0]!.textContent);
  expect(releaseConsoleRole).not.toHaveBeenCalled();
});

it('replaces an unentitled deep link with the held console without claiming the requested shuttle', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({ ...state.session!, activeRoleIds: ['quellon-explorer', 'dione-engineer'] });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-explorer' });
  render(<MemoryRouter initialEntries={['/console', '/shuttles/maliades']} initialIndex={1}><ShuttleHistoryControls /><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
    <Route path="/ships/quellon/roles/quellon-explorer" element={<p>Held console</p>} />
    <Route path="/console" element={<p>Role selection parent</p>} />
  </Routes></MemoryRouter>);
  expect(await screen.findByText('Held console')).toBeVisible();
  expect(selectConsoleRole).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'History back' }));
  expect(screen.getByText('Role selection parent')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'History forward' }));
  expect(screen.getByText('Held console')).toBeVisible();
  expect(selectConsoleRole).not.toHaveBeenCalled();
});

it('lets the printed owner hand shuttle control to a connected fleet-group player', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1',
        holderUid: 'u1', revision: 0,
      },
    },
  });
  state.setMe({ ...state.me!, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1' });
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([
      state.me!,
      { ...state.me!, uid: 'u2', displayName: 'Miner', assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner' },
    ]);
    return vi.fn();
  });
  render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  await user.selectOptions(screen.getByLabelText('Hand off to'), 'u2');
  await user.click(screen.getByRole('button', { name: 'Hand off control' }));
  expect(transferShuttleControl).toHaveBeenCalledWith('starlight', 'handoff', 0, 'u2');
  expect(screen.getByRole('status')).toHaveTextContent('Shuttle control handed off.');
});

it('lets a fuelled service-shuttle holder add one host charge during Coordination', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['quellon-engineer'], activeVesselIds: ['quellon'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2026-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2026-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: 'now' }],
    shuttleFuelled: { condor: true },
    shuttleControl: { condor: {
      shuttleId: 'condor', ownerRoleId: 'quellon-engineer', ownerUid: 'u1',
      holderUid: 'u1', revision: 4,
    } },
    maintenanceCycles: { quellon: {
      step: 0, revision: 9, turn: 2, results: { '7': 'Maintenance cycle complete.' },
      charges: ['jump-drive'], refuelled: ['condor'], completedAt: '2026-09-21T12:00:00.000Z',
    } },
    shipDamage: { quellon: { damagedSystemIds: ['water-production'], destroyed: false } },
    shipResources: { quellon: {
      ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2,
    } },
    serviceShuttleRecharges: {},
  });
  state.setMe({
    ...state.me!, assignedRoleId: 'quellon-engineer',
    activeConsoleRoleId: 'quellon-engineer', fleetGroupId: 'fleet-1',
  });

  render(<MemoryRouter initialEntries={['/shuttles/condor']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  const panel = screen.getByRole('region', { name: 'Service shuttle recharge' });
  expect(within(panel).queryByRole('option', { name: 'Jump Drive' })).not.toBeInTheDocument();
  expect(within(panel).queryByRole('option', { name: 'Water Production' })).not.toBeInTheDocument();
  await user.selectOptions(within(panel).getByLabelText('Host console'), 'hydroponics');
  expect(within(panel).getByText(/effect resolves immediately/i)).toBeVisible();
  await user.click(within(panel).getByRole('button', { name: 'Recharge console' }));
  expect(rechargeHostConsoleFromShuttle).toHaveBeenCalledWith(
    'condor', 'hydroponics', 4, 9, 2, undefined, undefined,
  );
  expect(screen.getByRole('status')).toHaveTextContent(/spent 1 water, generated 3 food/i);
});

it.each([
  ['unfinished maintenance', {
    step: 1, revision: 8, turn: 2, results: {}, charges: [], refuelled: ['condor'],
  }, { damagedSystemIds: [], destroyed: false }, /complete host maintenance/i],
  ['stale maintenance', {
    step: 0, revision: 9, turn: 1, results: {}, charges: [], refuelled: ['condor'],
    completedAt: '2026-09-21T12:00:00.000Z',
  }, { damagedSystemIds: [], destroyed: false }, /complete host maintenance/i],
  ['destroyed host', {
    step: 0, revision: 9, turn: 2, results: {}, charges: [], refuelled: ['condor'],
    completedAt: '2026-09-21T12:00:00.000Z',
  }, { damagedSystemIds: [], destroyed: true }, /destroyed host cannot receive/i],
] as const)('does not offer eligible recharge targets for %s', (_label, maintenance, damage, guidance) => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['quellon-engineer'], activeVesselIds: ['quellon'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2026-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2026-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: 'now' }],
    shuttleFuelled: { condor: true },
    shuttleControl: { condor: {
      shuttleId: 'condor', ownerRoleId: 'quellon-engineer', ownerUid: 'u1',
      holderUid: 'u1', revision: 4,
    } },
    maintenanceCycles: { quellon: maintenance },
    shipDamage: { quellon: damage }, serviceShuttleRecharges: {},
  });
  state.setMe({
    ...state.me!, assignedRoleId: 'quellon-engineer',
    activeConsoleRoleId: 'quellon-engineer', fleetGroupId: 'fleet-1',
  });
  render(<MemoryRouter initialEntries={['/shuttles/condor']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  const panel = screen.getByRole('region', { name: 'Service shuttle recharge' });
  expect(within(panel).getByText(guidance)).toBeVisible();
  expect(within(panel).getByLabelText('Host console')).toBeDisabled();
  expect(within(panel).getByRole('button', { name: 'Recharge console' })).toBeDisabled();
  expect(within(panel).queryByRole('option', { name: 'Hydroponics' })).not.toBeInTheDocument();
});

it('lets the current recipient enter without claiming the printed owner role', async () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
        holderUid: 'u1', revision: 1,
      },
    },
  });
  state.setMe({ ...state.me!, assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner', fleetGroupId: 'fleet-1' });
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([state.me!]);
    return vi.fn();
  });
  render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  expect(screen.getByRole('heading', { level: 1, name: /starlight/i })).toBeVisible();
  expect(screen.getByText(/current holder.*reporter/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Hand off control' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to assigned console' }))
    .toHaveAttribute('href', '/ships/icebreaker/roles/icebreaker-miner');
  expect(selectConsoleRole).not.toHaveBeenCalled();
});

it('lets the current holder request a local departure during open airspace without moving the shuttle', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    shuttleDockings: [
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: '2026-01-01T00:00:00.000Z' },
    ],
    shuttleVisitLog: [],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1',
        holderUid: 'u1', revision: 4,
      },
    },
  });
  state.setMe({
    ...state.me!, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
    fleetGroupId: 'fleet-1',
  });
  render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  expect(screen.getByText('Shuttle location // Docked // AEGIS')).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Destination ship'), 'icebreaker');
  await user.click(screen.getByRole('button', { name: 'Request departure' }));

  expect(requestShuttleDeparture).toHaveBeenCalledWith('starlight', 'icebreaker', 4, 2);
  expect(screen.getByRole('status')).toHaveTextContent('Departure requested to Icebreaker.');
  expect(screen.getByText('Shuttle location // Docked // AEGIS')).toBeVisible();
});

it('lets the SNN holder request departure during AEGIS-authorized restricted airspace', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2, pressEnabled: true,
    activeRoleIds: ['dione-captain'], activeVesselIds: ['dione', 'icebreaker'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2099-01-01T00:10:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: '2026-01-01T00:00:00.000Z' },
    ],
    shuttleVisitLog: [],
    shuttleControl: {
      'snn-press-shuttle': {
        shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: 'u1',
        holderUid: 'u1', revision: 4,
      },
    },
  });
  state.setMe({
    ...state.me!, activeConsoleRoleId: 'press-officer', fleetGroupId: 'fleet-1',
  });
  render(<MemoryRouter initialEntries={['/press']}><Routes>
    <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
  </Routes></MemoryRouter>);

  const departure = screen.getByRole('region', { name: 'Shuttle departure' });
  expect(within(departure).getByLabelText('Destination ship')).toBeEnabled();
  await user.selectOptions(within(departure).getByLabelText('Destination ship'), 'icebreaker');
  await user.click(within(departure).getByRole('button', { name: 'Request departure' }));

  expect(requestShuttleDeparture).toHaveBeenCalledWith(
    'snn-press-shuttle', 'icebreaker', 4, 2,
  );
});

it('shows an authorized departure as awaiting transit and hides departure controls from a non-holder', () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1',
        holderUid: 'holder', revision: 3,
      },
    },
  });
  render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  expect(screen.getByRole('heading', { level: 1, name: /starlight/i })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Shuttle departure' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request departure' })).not.toBeInTheDocument();
});

it('lets the holder enter transit from an authorized departure without a duplicate request', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1',
        holderUid: 'u1', revision: 3,
      },
    },
  });
  state.setMe({ ...state.me!, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
  vi.mocked(subscribeShuttleDeparture).mockImplementation((_sessionId, _shuttleId, onDeparture) => {
    onDeparture({
      status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
      holderUid: 'u1', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'icebreaker', cycle: 2, controlRevision: 3,
      requestedAt: '2026-01-01T00:10:00.000Z',
    });
    return vi.fn();
  });
  render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  expect(screen.getByRole('region', { name: 'Shuttle departure' }))
    .toHaveTextContent('Departure requested to Icebreaker; ready to begin transit.');
  expect(screen.queryByRole('button', { name: 'Request departure' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Begin transit' }));
  expect(beginShuttleTransit).toHaveBeenCalledWith('starlight', 'departure-1', 3, 2);
  expect(screen.getByRole('status')).toHaveTextContent('Transit begun to Icebreaker.');
});

it('shows authoritative transit without a docking or another movement action', () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'], shuttleDockings: [],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1',
        holderUid: 'u1', revision: 3,
      },
    },
  });
  state.setMe({ ...state.me!, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
  vi.mocked(subscribeShuttleDeparture).mockImplementation((_sessionId, _shuttleId, onDeparture) => {
    onDeparture({
      status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
      shuttleId: 'starlight', holderUid: 'u1', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'icebreaker', cycle: 2, controlRevision: 3,
      requestedAt: '2026-01-01T00:10:00.000Z', revision: 1,
      originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
      destinationPosition: { x: 0.26, y: -0.12, z: 0.28 },
      velocity: { x: 0.004, y: -0.002, z: 0.004 },
      departedAt: '2099-01-01T00:10:01.000Z', arrivesAt: '2099-01-01T00:11:01.000Z',
    });
    return vi.fn();
  });
  render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  expect(screen.getByText('Shuttle location // In transit')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Shuttle departure' })).toHaveTextContent('In transit to Icebreaker.');
  expect(screen.queryByRole('button', { name: /departure|transit/i })).not.toBeInTheDocument();
  expect(completeShuttleArrival).not.toHaveBeenCalled();
});

it('completes a reached transit automatically and exposes the server-confirmed destination', async () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'], shuttleDockings: [],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1',
        holderUid: 'u1', revision: 3,
      },
    },
  });
  state.setMe({ ...state.me!, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
  vi.mocked(subscribeShuttleDeparture).mockImplementation((_sessionId, _shuttleId, onDeparture) => {
    onDeparture({
      status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-arrived',
      shuttleId: 'starlight', holderUid: 'u1', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'icebreaker', cycle: 2, controlRevision: 3,
      requestedAt: '2026-01-01T00:10:00.000Z', revision: 1,
      originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
      destinationPosition: { x: 0.26, y: -0.12, z: 0.28 },
      velocity: { x: 0.004, y: -0.002, z: 0.004 },
      departedAt: '2026-01-01T00:10:01.000Z', arrivesAt: '2026-01-01T00:11:01.000Z',
    });
    return vi.fn();
  });
  render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  await waitFor(() => expect(completeShuttleArrival).toHaveBeenCalledWith('starlight', 'transit-arrived', 3));
  expect(await screen.findByRole('status')).toHaveTextContent('Shuttle arrived at Icebreaker.');
});

it.each(['success', 'error'] as const)(
  'ignores a deferred old-session automatic arrival %s and lets the new identity arrive', async (outcome) => {
    const oldResponse = deferred<{ hostShipId: string; arrivedAt: string }>();
    const newResponse = deferred<{ hostShipId: string; arrivedAt: string }>();
    vi.mocked(completeShuttleArrival).mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    const state = useSessionStore.getState();
    state.setSession({
      ...state.session!, phase: 'active', currentTurn: 2,
      activeRoleIds: ['wing-commander', 'icebreaker-miner'],
      activeVesselIds: ['aegis', 'icebreaker'], shuttleDockings: [],
      shuttleControl: {
        starlight: {
          shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1',
          holderUid: 'u1', revision: 3,
        },
      },
    });
    state.setMe({ ...state.me!, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
    state.setConnection('live');
    state.setSessionSnapshotFreshness('server');
    vi.mocked(subscribeShuttleDeparture).mockImplementation((sessionId, _shuttleId, onDeparture) => {
      onDeparture(reachedTransit(sessionId === 's2' ? 'u2' : 'u1'));
      return vi.fn();
    });
    const view = render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
      <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
    </Routes></MemoryRouter>);

    await waitFor(() => expect(completeShuttleArrival).toHaveBeenCalledTimes(1));
    const current = useSessionStore.getState();
    const currentControl = current.session!.shuttleControl?.starlight;
    if (!currentControl) throw new Error('Expected the active shuttle control.');
    const nextSession = {
      ...current.session!, id: 's2',
      shuttleControl: {
        ...current.session!.shuttleControl,
        starlight: { ...currentControl, holderUid: 'u2' },
      },
    };
    const nextMember = { ...current.me!, uid: 'u2', sessionId: 's2', displayName: 'Member two' };
    act(() => useSessionStore.getState().setIdentity(nextSession, nextMember));
    view.rerender(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
      <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
    </Routes></MemoryRouter>);
    await waitFor(() => expect(completeShuttleArrival).toHaveBeenCalledTimes(2));
    const arrival = screen.getByRole('region', { name: 'Shuttle departure' });
    expect(within(arrival).getByRole('button', { name: 'Retry arrival' })).toBeDisabled();

    await act(async () => {
      if (outcome === 'success') {
        oldResponse.resolve({ hostShipId: 'icebreaker', arrivedAt: '2026-09-22T12:00:00.000Z' });
      } else {
        oldResponse.reject(new Error('Old session arrival failed.'));
      }
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(within(arrival).getByRole('button', { name: 'Retry arrival' })).toBeDisabled();

    await act(async () => newResponse.resolve({
      hostShipId: 'icebreaker', arrivedAt: '2026-09-22T12:01:00.000Z',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Shuttle arrived at Icebreaker.');
  },
);

it('ignores a deferred manual retry after identity changes and preserves the new arrival pending state', async () => {
  const manualResponse = deferred<{ hostShipId: string; arrivedAt: string }>();
  const newResponse = deferred<{ hostShipId: string; arrivedAt: string }>();
  vi.mocked(completeShuttleArrival).mockRejectedValueOnce(new Error('Retry arrival.'))
    .mockReturnValueOnce(manualResponse.promise)
    .mockReturnValueOnce(newResponse.promise);
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!, phase: 'active', currentTurn: 2,
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'], shuttleDockings: [],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'u1',
        holderUid: 'u1', revision: 3,
      },
    },
  });
  state.setMe({ ...state.me!, assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
  vi.mocked(subscribeShuttleDeparture).mockImplementation((sessionId, _shuttleId, onDeparture) => {
    onDeparture(reachedTransit(sessionId === 's2' ? 'u2' : 'u1'));
    return vi.fn();
  });
  const view = render(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);

  expect(await screen.findByRole('status')).toHaveTextContent('Retry arrival.');
  const arrival = screen.getByRole('region', { name: 'Shuttle departure' });
  await userEvent.setup().click(within(arrival).getByRole('button', { name: 'Retry arrival' }));
  await waitFor(() => expect(completeShuttleArrival).toHaveBeenCalledTimes(2));
  expect(within(arrival).getByRole('button', { name: 'Retry arrival' })).toBeDisabled();

  const current = useSessionStore.getState();
  const currentControl = current.session!.shuttleControl?.starlight;
  if (!currentControl) throw new Error('Expected the active shuttle control.');
  const nextSession = {
    ...current.session!, id: 's2',
    shuttleControl: {
      ...current.session!.shuttleControl,
      starlight: { ...currentControl, holderUid: 'u2' },
    },
  };
  const nextMember = { ...current.me!, uid: 'u2', sessionId: 's2', displayName: 'Member two' };
  act(() => useSessionStore.getState().setIdentity(nextSession, nextMember));
  view.rerender(<MemoryRouter initialEntries={['/shuttles/starlight']}><Routes>
    <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
  </Routes></MemoryRouter>);
  await waitFor(() => expect(completeShuttleArrival).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Shuttle departure' }))
    .getByRole('button', { name: 'Retry arrival' })).toBeDisabled();

  await act(async () => manualResponse.resolve({
    hostShipId: 'icebreaker', arrivedAt: '2026-09-22T12:00:00.000Z',
  }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Shuttle departure' }))
    .getByRole('button', { name: 'Retry arrival' })).toBeDisabled();

  await act(async () => newResponse.resolve({
    hostShipId: 'icebreaker', arrivedAt: '2026-09-22T12:01:00.000Z',
  }));
  expect(await screen.findByRole('status')).toHaveTextContent('Shuttle arrived at Icebreaker.');
});
