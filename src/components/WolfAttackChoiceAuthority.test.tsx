import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  GameSession,
  GmInstance,
  Player,
  WolfAttackMemberView,
  WolfBoardingDefenceChoiceView,
  WolfBoardingSpecialChoiceReadResult,
  WolfForceFieldChoiceView,
  WolfRangeActionChoiceView,
  WolfRangeSupportActionChoiceView,
} from '@/types/game';
import WolfBoardingDefencePanel, { WolfBoardingDefencePanelView } from './WolfBoardingDefencePanel';
import WolfBoardingSpecialChoicePanel from './WolfBoardingSpecialChoicePanel';
import WolfForceFieldChoicePanel, { WolfForceFieldChoicePanelView } from './WolfForceFieldChoicePanel';
import WolfRangeActionPanel, { WolfRangeActionPanelView } from './WolfRangeActionPanel';
import WolfRangeSupportActionPanel from './WolfRangeSupportActionPanel';

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  getForceField: vi.fn(),
  commitForceField: vi.fn(),
  getRange: vi.fn(),
  commitRange: vi.fn(),
  assignRange: vi.fn(),
  getBoarding: vi.fn(),
  commitBoarding: vi.fn(),
  getBoardingSpecial: vi.fn(),
  commitBoardingSpecial: vi.fn(),
  getSupport: vi.fn(),
  commitSupport: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: mocks.subscribe }));
vi.mock('@/lib/sessionService', () => ({
  getWolfForceFieldChoice: mocks.getForceField,
  commitWolfForceFieldChoice: mocks.commitForceField,
  getWolfRangeActionChoice: mocks.getRange,
  commitWolfRangeActionChoice: mocks.commitRange,
  assignWolfRangeTargets: mocks.assignRange,
  getWolfBoardingDefenceChoice: mocks.getBoarding,
  commitWolfBoardingDefenceChoice: mocks.commitBoarding,
  getWolfBoardingSpecialChoice: mocks.getBoardingSpecial,
  commitWolfBoardingSpecialChoice: mocks.commitBoardingSpecial,
  getWolfRangeSupportActionChoice: mocks.getSupport,
  commitWolfRangeSupportActionChoice: mocks.commitSupport,
}));

const deadlineAt = '2026-10-03T12:10:00.000Z';
const forceFieldView: WolfForceFieldChoiceView = {
  type: 'wolf-force-field-choice-view', sessionId: 's1', turn: 1, revision: 3,
  attackId: 'attack-1', hostShipId: 'aegis', dockingRevision: 2, fleetGroupId: 'fleet-1',
  choiceStatus: 'pending', targetShipIds: ['aegis', 'dione'], deadlineAt,
};
const rangeView: WolfRangeActionChoiceView = {
  type: 'wolf-range-action-choice-view', sessionId: 's1', turn: 1, revision: 4,
  currentStep: 'medium-range', range: 'medium-range', choiceStatus: 'pending', deadlineAt,
  eligibleActions: [
    { actionId: 'aegis-missile-launchers-medium', sourceId: 'aegis-missile-launchers', range: 'medium-range' },
  ], hitSlots: [], contacts: [{ contactId: 'contact-1', targetShipId: 'aegis', available: true }],
};
const boardingView: WolfBoardingDefenceChoiceView = {
  type: 'wolf-boarding-defence-choice-view', sessionId: 's1', turn: 1, revision: 7,
  targetShipId: 'aegis', boardingParties: 2, availableSecurityTeams: 3,
  choiceStatus: 'pending', deadlineAt,
};

function session(): GameSession {
  return {
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 1,
    smallShipStates: { gorgoneion: {
      id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2, population: 10, unrest: 0,
      cycle: { turn: 1, step: 0, revision: 1, results: {}, charges: [], refuelled: [] },
    } },
    playerDiscovery: {
      groupId: 'fleet-1', shipId: 'aegis', fleetGroupVesselIds: ['aegis', 'dione'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
  } as unknown as GameSession;
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    uid: 'u1' as Player['uid'], sessionId: 's1' as Player['sessionId'], displayName: 'Captain',
    role: 'player', seatId: null, assignedRoleId: 'gorgoneion-captain',
    replacementRoleId: 'gorgoneion-captain', replacementStatus: null, activeConsoleRoleId: null,
    fleetGroupId: 'fleet-1' as NonNullable<Player['fleetGroupId']>, connectionGeneration: 1, joinedAt: 'now' as never,
    ...overrides,
  };
}

function connectFacilitator(): void {
  const currentSession = session();
  const currentGm = player({ role: 'gm' });
  useSessionStore.getState().setIdentity(currentSession, currentGm);
  useSessionStore.getState().setGmInstance({ id: 'gm-1' as GmInstance['id'], sessionId: 's1',
    uid: currentGm.uid, name: 'GM', deviceLabel: 'test', claimedAt: 'now' as never });
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
}

const callbacks: Array<(view: WolfAttackMemberView | null) => void> = [];
const targeting: WolfAttackMemberView = {
  type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'attack-1',
  turn: 1, revision: 3, status: 'declared', phase: 'active', currentStep: 'targeting', range: null,
  deadlineAt, serverTime: deadlineAt, visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'], results: [],
};
const mediumRange: WolfAttackMemberView = { ...targeting, revision: 4, currentStep: 'medium-range', range: 'medium' };
const boarding: WolfAttackMemberView = { ...targeting, revision: 7, currentStep: 'boarding' };

function connectPlayer(overrides: Partial<Player> = {}) {
  const currentSession = session();
  const currentPlayer = player(overrides);
  useSessionStore.getState().setIdentity(currentSession, currentPlayer);
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
}

function publish(view: WolfAttackMemberView | null): void {
  act(() => callbacks.at(-1)?.(view));
}

it.each([
  { name: 'Captain', panel: WolfForceFieldChoicePanel, view: targeting, button: /pass force field/i,
    actor: { replacementRoleId: 'gorgoneion-captain' } },
  { name: 'AEGIS range', panel: WolfRangeActionPanel, view: mediumRange, button: /pass this range/i,
    actor: { assignedRoleId: 'executive-officer', replacementRoleId: null, activeConsoleRoleId: 'executive-officer' } },
  { name: 'boarding', panel: WolfBoardingDefencePanel, view: boarding, button: /commit.*defence/i,
    actor: { assignedRoleId: 'admiral', replacementRoleId: null, activeConsoleRoleId: 'admiral' } },
])('withdraws $name controls on server disconnect even if a late callback reports live freshness', async scenario => {
  connectPlayer({ ...scenario.actor, connected: true });
  const Panel = scenario.panel;
  render(<Panel />);
  publish(scenario.view);
  await screen.findByRole('button', { name: scenario.button });
  act(() => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, connected: false }));
  act(() => useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' }));
  publish(scenario.view);
  expect(screen.queryByRole('button', { name: scenario.button })).not.toBeInTheDocument();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  callbacks.length = 0;
  useSessionStore.getState().reset();
  mocks.subscribe.mockReset().mockImplementation((_sessionId: string, callback: (view: WolfAttackMemberView | null) => void) => {
    callbacks.push(callback);
    return vi.fn();
  });
  mocks.getForceField.mockReset().mockResolvedValue(forceFieldView);
  mocks.commitForceField.mockReset().mockResolvedValue(undefined);
  mocks.getRange.mockReset().mockResolvedValue(rangeView);
  mocks.commitRange.mockReset().mockResolvedValue(undefined);
  mocks.assignRange.mockReset().mockResolvedValue(undefined);
  mocks.getBoarding.mockReset().mockResolvedValue(boardingView);
  mocks.commitBoarding.mockReset().mockResolvedValue(undefined);
  mocks.getBoardingSpecial.mockReset();
  mocks.commitBoardingSpecial.mockReset().mockResolvedValue(undefined);
  mocks.getSupport.mockReset();
  mocks.commitSupport.mockReset();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

it('mounts the admitted replacement Captain range choice without adding extra ships or roles to the core roster', async () => {
  connectPlayer();
  const currentSession = useSessionStore.getState().session!;
  useSessionStore.setState({ session: { ...currentSession,
    activeRoleIds: ['executive-officer'], activeVesselIds: ['aegis', 'dione'],
  } });
  const view: WolfRangeSupportActionChoiceView = {
    type: 'wolf-range-support-action-choice-view', sessionId: 's1', attackId: 'attack-1',
    turn: 1, revision: 4, range: 'medium-range', sourceId: 'gorgoneion-missile-array',
    actorRoleId: 'gorgoneion-captain', choiceStatus: 'pending', eligible: true,
    actionAvailable: true, deadlineAt, contacts: [],
  };
  mocks.getSupport.mockResolvedValue(view);
  render(<WolfRangeSupportActionPanel sourceId="gorgoneion-missile-array" range="medium-range" />);
  publish(mediumRange);
  await screen.findByRole('button', { name: /use Gorgoneion Missile Array/i });
  expect(mocks.getSupport).toHaveBeenCalledWith('medium-range', 'gorgoneion-missile-array');
  act(() => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementRoleId: null }));
  expect(screen.queryByRole('button', { name: /use Gorgoneion Missile Array/i })).not.toBeInTheDocument();
});

it('withdraws a displayed Force Field choice as soon as live authority or berth changes', async () => {
  connectPlayer();
  render(<WolfForceFieldChoicePanel />);
  publish(targeting);
  await screen.findByRole('button', { name: /pass force field/i });

  act(() => useSessionStore.setState({ connection: 'offline' }));
  expect(screen.queryByRole('button', { name: /pass force field/i })).not.toBeInTheDocument();

  act(() => useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'cache' }));
  expect(screen.queryByRole('button', { name: /pass force field/i })).not.toBeInTheDocument();
  act(() => useSessionStore.setState({ sessionSnapshotFreshness: 'server' }));
  act(() => useSessionStore.getState().setMe(player({ fleetGroupId: 'fleet-2' as NonNullable<Player['fleetGroupId']> })));
  expect(screen.queryByRole('button', { name: /pass force field/i })).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setMe(player({ connectionGeneration: 2 })));
  expect(screen.queryByRole('button', { name: /pass force field/i })).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setSession({ ...session(), smallShipStates: { gorgoneion: {
    ...session().smallShipStates!.gorgoneion!, hostShipId: 'dione', dockingRevision: 3,
  } } }));
  expect(screen.queryByRole('button', { name: /pass force field/i })).not.toBeInTheDocument();
});

it('ignores a Force Field mutation reply after its Captain authority is replaced', async () => {
  connectPlayer();
  const delayedCommit = deferred<void>();
  mocks.commitForceField.mockReturnValueOnce(delayedCommit.promise);
  render(<WolfForceFieldChoicePanel />);
  publish(targeting);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('radio', { name: /aegis/i }));
  await user.click(screen.getByRole('button', { name: /protect selected ship/i }));
  await waitFor(() => expect(mocks.commitForceField).toHaveBeenCalledTimes(1));

  act(() => useSessionStore.getState().setMe(player({ uid: 'u2' as Player['uid'] })));
  publish(null);
  act(() => useSessionStore.getState().setMe(player({ connectionGeneration: 2 })));
  publish(targeting);
  await screen.findByRole('button', { name: /pass force field/i });

  await act(async () => delayedCommit.resolve(undefined));
  expect(screen.queryByText(/choice committed\. targeting/i)).not.toBeInTheDocument();
});

it('withdraws an already displayed Force Field choice when a current server refresh is denied', async () => {
  connectPlayer();
  mocks.getForceField.mockResolvedValueOnce(forceFieldView)
    .mockRejectedValueOnce(new Error('The current Captain authority expired.'));
  render(<WolfForceFieldChoicePanel />);
  publish(targeting);
  await screen.findByRole('button', { name: /pass force field/i });

  publish(targeting);
  await screen.findByText('The current Captain authority expired.');
  expect(screen.queryByRole('button', { name: /pass force field/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /refresh force field choice/i })).toBeInTheDocument();
});

it('serializes range reads and ignores obsolete failed reads while applying the latest matching step', async () => {
  connectPlayer({ assignedRoleId: 'executive-officer', replacementRoleId: null, activeConsoleRoleId: 'executive-officer' });
  const firstRead = deferred<WolfRangeActionChoiceView>();
  const secondRead = deferred<WolfRangeActionChoiceView>();
  mocks.getRange.mockReset().mockReturnValueOnce(firstRead.promise).mockReturnValueOnce(secondRead.promise);
  render(<WolfRangeActionPanel />);
  expect(mocks.getRange).not.toHaveBeenCalled();
  publish({ ...targeting, currentStep: 'long-range', range: 'long', revision: 8 });
  await waitFor(() => expect(mocks.getRange).toHaveBeenCalledTimes(1));
  publish({ ...targeting, currentStep: 'medium-range', range: 'medium', revision: 9 });
  expect(mocks.getRange).toHaveBeenCalledTimes(1);

  await act(async () => firstRead.reject(new Error('The obsolete Long Range read lost authority.')));
  await waitFor(() => expect(mocks.getRange).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('button', { name: /pass this range/i })).not.toBeInTheDocument();
  await act(async () => secondRead.resolve({ ...rangeView, revision: 9 }));
  await screen.findByRole('button', { name: /pass this range/i });
  expect(screen.getByRole('heading', { name: /medium range/i })).toBeInTheDocument();
});

it('withdraws an AEGIS range choice when the active console or member freshness changes', async () => {
  connectPlayer({ assignedRoleId: 'executive-officer', replacementRoleId: null, activeConsoleRoleId: 'executive-officer' });
  render(<WolfRangeActionPanel />);
  publish(mediumRange);
  await screen.findByRole('button', { name: /pass this range/i });
  act(() => useSessionStore.getState().setMe(player({
    assignedRoleId: 'executive-officer', replacementRoleId: null, activeConsoleRoleId: null,
  })));
  expect(screen.queryByRole('button', { name: /pass this range/i })).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setMe(player({
    assignedRoleId: 'executive-officer', replacementRoleId: null, activeConsoleRoleId: 'executive-officer',
  })));
  act(() => useSessionStore.setState({ sessionSnapshotFreshness: 'cache' }));
  expect(screen.queryByRole('button', { name: /pass this range/i })).not.toBeInTheDocument();
});

it('withdraws range controls when a current fleet-group berth or connection generation changes', async () => {
  connectPlayer({ assignedRoleId: 'executive-officer', replacementRoleId: null, activeConsoleRoleId: 'executive-officer' });
  render(<WolfRangeActionPanel />);
  publish(mediumRange);
  await screen.findByRole('button', { name: /pass this range/i });

  act(() => useSessionStore.getState().setMe(player({
    assignedRoleId: 'executive-officer', replacementRoleId: null, activeConsoleRoleId: 'executive-officer',
    fleetGroupId: 'fleet-2' as NonNullable<Player['fleetGroupId']>,
  })));
  expect(screen.queryByRole('button', { name: /pass this range/i })).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setMe(player({
    assignedRoleId: 'executive-officer', replacementRoleId: null, activeConsoleRoleId: 'executive-officer',
    connectionGeneration: 2,
  })));
  expect(screen.queryByRole('button', { name: /pass this range/i })).not.toBeInTheDocument();
});

it('ignores a boarding mutation reply after the attack or current fleet berth changes', async () => {
  connectPlayer({ replacementRoleId: null, assignedRoleId: 'aegis-engineer' });
  const delayedCommit = deferred<void>();
  mocks.commitBoarding.mockReturnValueOnce(delayedCommit.promise);
  render(<WolfBoardingDefencePanel />);
  publish(boarding);
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByRole('combobox', { name: /security teams committed/i }), '1');
  await user.click(screen.getByRole('button', { name: /commit defence/i }));
  await waitFor(() => expect(mocks.commitBoarding).toHaveBeenCalledTimes(1));

  publish({ ...boarding, currentStep: 'resolved', range: null, revision: 8 });
  expect(screen.queryByRole('button', { name: /commit defence/i })).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setMe(player({
    replacementRoleId: null, assignedRoleId: 'aegis-engineer', fleetGroupId: 'fleet-2' as NonNullable<Player['fleetGroupId']>,
  })));
  await act(async () => delayedCommit.resolve(undefined));
  expect(screen.queryByText(/boarding defence committed/i)).not.toBeInTheDocument();
});

it('shows the Commander ruling only to the current live GM instance and sends the explicit audit text', async () => {
  connectFacilitator();
  const rulingView: WolfBoardingSpecialChoiceReadResult = {
    type: 'wolf-boarding-special-choice-view', sessionId: 's1', turn: 1, revision: 7,
    choice: { kind: 'commander-ruling', targetShipId: 'aegis',
      condition: 'All Commander-led Wolf Boarding Parties were destroyed.' },
  };
  mocks.getBoardingSpecial.mockResolvedValue(rulingView);
  render(<WolfBoardingSpecialChoicePanel facilitator />);
  publish(boarding);
  const ruling = await screen.findByRole('textbox', { name: /facilitator ruling/i });
  const user = userEvent.setup();
  await user.type(ruling, 'The surviving transport remains in the next attack.');
  await user.click(screen.getByRole('button', { name: /record facilitator ruling/i }));
  await waitFor(() => expect(mocks.commitBoardingSpecial).toHaveBeenCalledWith(1, 7, {
    kind: 'commander-ruling', targetShipId: 'aegis',
    rulingText: 'The surviving transport remains in the next attack.',
  }));
});

it('preserves choice drafts on same-revision refreshes and resets them when authority changes', async () => {
  const user = userEvent.setup();
  const forceRerender = render(<WolfForceFieldChoicePanelView view={forceFieldView} onChoose={vi.fn()} onPass={vi.fn()} />);
  await user.click(screen.getByRole('radio', { name: /aegis/i }));
  forceRerender.rerender(<WolfForceFieldChoicePanelView view={{ ...forceFieldView, deadlineAt: '2026-10-03T12:11:00.000Z' }} onChoose={vi.fn()} onPass={vi.fn()} />);
  expect(screen.getByRole('radio', { name: /aegis/i })).toBeChecked();
  forceRerender.rerender(<WolfForceFieldChoicePanelView view={{ ...forceFieldView, revision: 4 }} onChoose={vi.fn()} onPass={vi.fn()} />);
  expect(screen.getByRole('radio', { name: /aegis/i })).not.toBeChecked();
  forceRerender.unmount();

  const boardingRerender = render(<WolfBoardingDefencePanelView view={boardingView} onChoose={vi.fn()} />);
  await user.selectOptions(screen.getByRole('combobox', { name: /security teams committed/i }), '2');
  boardingRerender.rerender(<WolfBoardingDefencePanelView view={{ ...boardingView }} onChoose={vi.fn()} />);
  expect(screen.getByRole('combobox', { name: /security teams committed/i })).toHaveValue('2');
  boardingRerender.rerender(<WolfBoardingDefencePanelView view={{ ...boardingView, revision: 4 }} onChoose={vi.fn()} />);
  expect(screen.getByRole('combobox', { name: /security teams committed/i })).toHaveValue('');
  boardingRerender.unmount();

  const rangeRerender = render(<WolfRangeActionPanelView view={rangeView} onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={vi.fn()} />);
  await user.click(screen.getByRole('checkbox', { name: /missile launchers/i }));
  rangeRerender.rerender(<WolfRangeActionPanelView view={{ ...rangeView }} onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={vi.fn()} />);
  expect(screen.getByRole('checkbox', { name: /missile launchers/i })).toBeChecked();
  rangeRerender.rerender(<WolfRangeActionPanelView view={{ ...rangeView, revision: 5 }} onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={vi.fn()} />);
  expect(screen.getByRole('checkbox', { name: /missile launchers/i })).not.toBeChecked();
});
