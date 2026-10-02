import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  startAwayMission: vi.fn(),
  subscribeGmMissionOpportunities: vi.fn(),
  subscribeGmMissionStartSnapshots: vi.fn(),
}));

vi.mock('@/lib/sessionService', () => ({ startAwayMission: mocks.startAwayMission }));
vi.mock('@/lib/firestore', () => ({
  subscribeGmMissionOpportunities: mocks.subscribeGmMissionOpportunities,
  subscribeGmMissionStartSnapshots: mocks.subscribeGmMissionStartSnapshots,
}));

import AwayMissionStartPanel from './AwayMissionStartPanel';

const opportunity = {
  id: 'arrival-fleet-1-A-5143', groupId: 'fleet-1', chart: 'A', coordinate: '5143',
  siteCode: 'L', sourceShipId: 'aegis', sourceTransitionId: 'jump-entry-1', sourceCycle: 2,
};
const players = [
  { uid: 'alice', displayName: 'Alice', role: 'player', connected: true,
    assignedRoleId: 'wing-commander', fleetGroupId: 'fleet-1' },
  { uid: 'bob', displayName: 'Bob', role: 'player', connected: true,
    assignedRoleId: 'icebreaker-miner', fleetGroupId: 'fleet-1' },
  { uid: 'admiral', displayName: 'Admiral', role: 'player', connected: true,
    assignedRoleId: 'admiral', fleetGroupId: 'fleet-1' },
];
const session = {
  id: 's1', phase: 'active', currentTurn: 2, turnLimit: 6, setupRevision: 4, chartId: 'A',
  chartSelectionLocked: true,
  activeRoleIds: ['wing-commander', 'icebreaker-miner', 'admiral'],
  turnPhase: {
    turn: 2, teamPhaseEndsAt: '2026-01-01T00:00:00.000Z',
    openAirspaceEndsAt: '2026-01-01T00:10:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  turnState: {
    currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3,
    startedAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-01T00:10:00.000Z',
  },
};

const gorgoneionCaptain = {
  uid: 'gorg-captain', displayName: 'Gorgoneion Captain', role: 'player', connected: true,
  assignedRoleId: null, replacementRoleId: 'gorgoneion-captain', replacementStatus: null,
  seatId: null, activeConsoleRoleId: null, fleetGroupId: 'fleet-1', escapeState: null,
};
const dockedGorgoneion = {
  id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1,
  population: 1_000, unrest: 0,
  cycle: { step: 0, revision: 0, results: {}, charges: [] },
};
const sessionWithDockedGorgoneion = {
  ...session,
  activeVesselIds: ['aegis'],
  smallShipStates: { gorgoneion: dockedGorgoneion },
  expansion: 'base',
  capybaraEnabled: true,
};

function renderMissionStartWithCaptain(
  captainOverrides: Record<string, unknown> = {},
  sessionOverrides: Record<string, unknown> = {},
  additionalPlayers: readonly Record<string, unknown>[] = [],
) {
  render(<AwayMissionStartPanel
    session={{ ...sessionWithDockedGorgoneion, ...sessionOverrides } as never}
    players={[...players, { ...gorgoneionCaptain, ...captainOverrides }, ...additionalPlayers] as never}
    instanceId="bridge"
    isGm
  />);
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.startAwayMission.mockReset();
  mocks.subscribeGmMissionOpportunities.mockReset().mockImplementation((_sessionId, onItems) => {
    onItems([opportunity]);
    return vi.fn();
  });
  mocks.subscribeGmMissionStartSnapshots.mockReset().mockImplementation((_sessionId, onItems) => {
    onItems([]);
    return vi.fn();
  });
});

afterEach(() => cleanup());

it('renders prepared review data and submits through the injected local command boundary', async () => {
  const user = userEvent.setup();
  const submitMissionStart = vi.fn().mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'prepared-request',
    opportunityId: opportunity.id, snapshotId: opportunity.id,
    missionId: `mission-${opportunity.id}`, groupId: 'fleet-1', coordinate: '5143',
    sourceCycle: 2, participantCount: 1, missionLeaderUid: 'alice',
    expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
  });
  const preparedReceipt = {
    type: 'away-mission-start-snapshot', sessionId: 's1',
    opportunityId: 'arrival-fleet-1-A-4000', missionId: 'mission-arrival-fleet-1-A-4000',
    groupId: 'fleet-1', chart: 'A', coordinate: '4000', siteCode: 'L',
    sourceShipId: 'starlight', sourceTransitionId: 'jump-entry-prior', sourceCycle: 1,
    missionLeader: { uid: 'alice', roleId: 'wing-commander' },
    actorUid: 'gm1', instanceId: 'bridge', requestId: 'prepared-request',
    source: {
      assumptionId: 'PC04-A1', playerGuide: 'Player’s Guide v1.1',
      facilitatorGuide: 'Facilitator’s Guide v1.1', a4CardPack: 'A4 card pack v1.1',
      ruleId: 'new-location-mission-with-team-selected-leader',
    },
    inputs: {
      expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
      availableCarrierCraftIds: ['starlight'],
      participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander' }],
      missionLeaderUid: 'alice',
    },
    modifiers: [], outcome: 'started',
    stateDelta: { missionSnapshotCreated: true },
    revisions: { setup: 4 }, replay: { status: 'committed' },
    recovery: { next: 'Refresh live mission and participant hand panels.' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  render(<AwayMissionStartPanel
    session={session as never}
    players={players as never}
    instanceId="bridge"
    isGm
    preparedOpportunities={[{ ...opportunity, type: 'mission-opportunity', status: 'available', sessionId: 's1' }] as never}
    preparedReceipts={[preparedReceipt] as never}
    submitMissionStart={submitMissionStart}
  />);

  expect(mocks.subscribeGmMissionOpportunities).not.toHaveBeenCalled();
  expect(mocks.subscribeGmMissionStartSnapshots).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: /mission start receipts/i })).toHaveTextContent('Available carriers');
  await user.click(screen.getByRole('checkbox', { name: /alice/i }));
  await user.selectOptions(screen.getByLabelText(/mission leader/i), 'alice');
  await user.click(screen.getByRole('button', { name: /start mission/i }));

  expect(submitMissionStart).toHaveBeenCalledWith(expect.objectContaining({
    opportunityId: opportunity.id, participantUids: ['alice'], missionLeaderUid: 'alice',
  }));
  expect(mocks.startAwayMission).not.toHaveBeenCalled();
  expect(screen.getByRole('status', { name: 'Mission start result' })).toHaveTextContent(/mission started/i);
});

it('records the selected roster and in-roster Mission Leader against the exact opportunity', async () => {
  const user = userEvent.setup();
  mocks.startAwayMission.mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'request-1',
    opportunityId: opportunity.id, missionId: 'mission-arrival-fleet-1-A-5143',
    groupId: 'fleet-1', coordinate: '5143',
    participantCount: 1, expectedSetupRevision: 4, expectedPhaseRevision: 3,
  });

  render(<AwayMissionStartPanel
    session={session as never}
    players={players as never}
    instanceId="bridge"
    isGm
  />);

  expect(screen.getByRole('region', { name: /new-location mission start/i }))
    .toHaveTextContent('fleet-1');
  expect(screen.getByText(/5143/)).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: /alice/i }));
  await user.selectOptions(screen.getByLabelText(/mission leader/i), 'alice');
  await user.click(screen.getByRole('button', { name: /start mission/i }));

  expect(mocks.startAwayMission).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', instanceId: 'bridge', expectedSetupRevision: 4,
    expectedPhaseRevision: 3, expectedCycle: 2,
    opportunityId: opportunity.id, groupId: 'fleet-1', chart: 'A',
    coordinate: '5143', sourceCycle: 2,
    participantUids: ['alice'], missionLeaderUid: 'alice',
  }));
  expect(screen.getByRole('status', { name: 'Mission start result' })).toHaveTextContent(/mission started/i);
  expect(screen.queryByText(/A♥/)).not.toBeInTheDocument();
});

it('offers every connected same-group teammate as a participant and leader carried by an eligible shuttle', async () => {
  const user = userEvent.setup();
  mocks.startAwayMission.mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'request-carried',
    opportunityId: opportunity.id, snapshotId: opportunity.id,
    missionId: `mission-${opportunity.id}`, groupId: 'fleet-1', coordinate: '5143',
    sourceCycle: 2, participantCount: 2, missionLeaderUid: 'admiral',
    expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
  });
  render(<AwayMissionStartPanel session={session as never} players={players as never} instanceId="bridge" isGm />);

  await user.click(screen.getByRole('checkbox', { name: /alice/i }));
  await user.click(screen.getByRole('checkbox', { name: /admiral/i }));
  await user.selectOptions(screen.getByLabelText(/mission leader/i), 'admiral');
  await user.click(screen.getByRole('button', { name: /start mission/i }));

  expect(mocks.startAwayMission).toHaveBeenCalledWith(expect.objectContaining({
    participantUids: ['alice', 'admiral'], missionLeaderUid: 'admiral',
  }));
});

it('includes a source-available extra-ship Captain in the mission request and preserves its exact retry after role change', async () => {
  const user = userEvent.setup();
  mocks.startAwayMission
    .mockRejectedValueOnce(new Error('Connection lost after submission.'))
    .mockResolvedValueOnce({
      status: 'committed', sessionId: 's1', requestId: 'request-replayed',
      opportunityId: opportunity.id, missionId: `mission-${opportunity.id}`,
      groupId: 'fleet-1', coordinate: '5143', participantCount: 1,
    });

  const first = render(<AwayMissionStartPanel
    session={sessionWithDockedGorgoneion as never}
    players={[...players, gorgoneionCaptain] as never}
    instanceId="bridge"
    isGm
  />);

  await user.click(screen.getByRole('checkbox', { name: /gorgoneion captain.*gorgoneion-captain/i }));
  await user.selectOptions(screen.getByLabelText('Mission Leader'), 'gorg-captain');
  await user.click(screen.getByRole('button', { name: 'Start mission' }));

  const firstCommand = mocks.startAwayMission.mock.calls[0]![0];
  expect(firstCommand).toMatchObject({
    opportunityId: opportunity.id,
    groupId: 'fleet-1',
    participantUids: ['gorg-captain'],
    missionLeaderUid: 'gorg-captain',
  });
  const savedAttempt = JSON.parse(sessionStorage.getItem('pc04:mission-start:s1:bridge') ?? 'null');
  expect(savedAttempt.command).toEqual(firstCommand);
  expect(savedAttempt.fingerprint).toContain('"participantUids":["gorg-captain"]');
  expect(screen.getByRole('status', { name: 'Mission start result' }))
    .toHaveTextContent('Connection lost after submission.');
  first.unmount();

  render(<AwayMissionStartPanel
    session={sessionWithDockedGorgoneion as never}
    players={[...players, {
      ...gorgoneionCaptain, replacementRoleId: null, replacementStatus: 'awaiting-re-role',
    }] as never}
    instanceId="bridge"
    isGm
  />);
  expect(screen.queryByRole('checkbox', { name: /gorgoneion captain/i })).not.toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: 'Retry exact mission start' }));

  expect(mocks.startAwayMission).toHaveBeenCalledTimes(2);
  expect(mocks.startAwayMission.mock.calls[1]![0]).toEqual({ ...firstCommand, allowReplay: true });
  expect(mocks.startAwayMission.mock.calls[1]![0].requestId).toBe(firstCommand.requestId);
});

const excludedCaptainCases: readonly {
  readonly label: string;
  readonly captain?: Record<string, unknown>;
  readonly session?: Record<string, unknown>;
  readonly additionalPlayers?: readonly Record<string, unknown>[];
}[] = [
  { label: 'disconnected player', captain: { connected: false } },
  { label: 'different fleet group', captain: { fleetGroupId: 'fleet-2' } },
  { label: 'pending re-role even with a formerly active core assignment',
    captain: { assignedRoleId: 'wing-commander', replacementStatus: 'awaiting-re-role' } },
  { label: 'held core seat', captain: { assignedRoleId: 'wing-commander', seatId: 'wing-commander' } },
  { label: 'held core console', captain: { assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander' } },
  { label: 'active escape state', captain: { escapeState: { status: 'pending' } } },
  { label: 'malformed replacement-role field with a formerly active core assignment',
    captain: { assignedRoleId: 'wing-commander', replacementRoleId: { roleId: 'gorgoneion-captain' } } },
  { label: 'unknown replacement role even with an active historical role',
    captain: { assignedRoleId: 'wing-commander', replacementRoleId: 'unknown-captain' } },
  { label: 'ordinary replacement role',
    captain: { assignedRoleId: 'wing-commander', replacementRoleId: 'doctor' } },
  { label: 'unavailable source ship', session: { smallShipStates: {} } },
  { label: 'inactive source host', session: { smallShipStates: {
    gorgoneion: { ...dockedGorgoneion, hostShipId: 'dione' },
  } } },
  { label: 'duplicate replacement-role holder', additionalPlayers: [{
    ...gorgoneionCaptain, uid: 'duplicate-gorg-captain', displayName: 'Disconnected duplicate', connected: false,
  }] },
];

it.each(excludedCaptainCases)('does not offer an extra-ship Captain with $label', ({ captain, session: sessionOverrides, additionalPlayers }) => {
  renderMissionStartWithCaptain(captain, sessionOverrides, additionalPlayers);
  expect(screen.queryByRole('checkbox', { name: /gorgoneion captain/i })).not.toBeInTheDocument();
});

it('does not offer the base small-ship Capybara Captain when the full Capybara expansion is active', () => {
  render(<AwayMissionStartPanel
    session={{
      ...sessionWithDockedGorgoneion,
      expansion: 'capybara',
      smallShipStates: {
        'capybara-small': {
          id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1,
          population: 2_000, unrest: 0,
          cycle: { step: 0, revision: 0, results: {}, charges: [] },
        },
      },
    } as never}
    players={[...players, {
      ...gorgoneionCaptain, displayName: 'Base Capybara Captain',
      replacementRoleId: 'capybara-small-captain',
    }] as never}
    instanceId="bridge"
    isGm
  />);

  expect(screen.queryByRole('checkbox', { name: /base capybara captain/i })).not.toBeInTheDocument();
});

it('offers the base small-ship Capybara Captain only when the base variant is available', () => {
  render(<AwayMissionStartPanel
    session={{
      ...sessionWithDockedGorgoneion,
      smallShipStates: {
        'capybara-small': {
          id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1,
          population: 2_000, unrest: 0,
          cycle: { step: 0, revision: 0, results: {}, charges: [] },
        },
      },
    } as never}
    players={[...players, {
      ...gorgoneionCaptain, uid: 'base-capy-captain', displayName: 'Base Capybara Captain',
      replacementRoleId: 'capybara-small-captain',
    }] as never}
    instanceId="bridge"
    isGm
  />);

  expect(screen.getByRole('checkbox', { name: /base capybara captain.*capybara-small-captain/i }))
    .toBeInTheDocument();
});

it('shows the complete server-owned mission-start receipt to the facilitator without private cards', () => {
  mocks.subscribeGmMissionStartSnapshots.mockImplementation((_sessionId, onItems) => {
    onItems([{
      type: 'away-mission-start-snapshot', sessionId: 's1',
      opportunityId: opportunity.id, missionId: `mission-${opportunity.id}`,
      groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L',
      sourceShipId: 'aegis', sourceTransitionId: 'jump-entry-1', sourceCycle: 2,
      missionLeader: { uid: 'alice', roleId: 'wing-commander' },
      actorUid: 'gm1', instanceId: 'bridge', requestId: 'request-1',
      source: {
        assumptionId: 'PC04-A1',
        playerGuide: 'Player’s Guide v1.1, printed pp. 14–15',
        facilitatorGuide: 'Facilitator’s Guide v1.1, printed pp. 13–17',
        ruleId: 'new-location-mission-with-team-selected-leader',
      },
      inputs: {
        expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
        availableCarrierCraftIds: ['starlight'],
        participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander' }],
        missionLeaderUid: 'alice',
      },
      modifiers: [], outcome: 'started',
      stateDelta: { missionSnapshotCreated: true, participantHandCount: 1, participantPointerCount: 1 },
      revisions: { setup: 4, phase: { cycle: 2, phase: 'coordination', revision: 3 } },
      replay: { status: 'committed', requestId: 'request-1' },
      recovery: { next: 'Refresh live mission and participant hand panels.' },
      createdAt: '2026-01-01T00:00:00.000Z',
    } as never]);
    return vi.fn();
  });

  render(<AwayMissionStartPanel
    session={session as never}
    players={players as never}
    instanceId="bridge"
    isGm
  />);

  const receipt = screen.getByRole('region', { name: /mission start receipts/i });
  expect(receipt).toHaveTextContent('PC04-A1');
  expect(receipt).toHaveTextContent(/Player’s Guide v1\.1/);
  expect(receipt).toHaveTextContent('alice');
  expect(receipt).toHaveTextContent('missionSnapshotCreated');
  expect(receipt).toHaveTextContent(/committed/);
  expect(receipt).toHaveTextContent(/Refresh live mission/);
  expect(receipt).toHaveTextContent('Available carriers');
  expect(receipt).toHaveTextContent('starlight');
  const inputDetails = receipt.querySelectorAll('dd')[1];
  expect(inputDetails).toHaveTextContent(/alice \(wing-commander\)/);
  expect(inputDetails).not.toHaveTextContent('starlight');
  expect(receipt).not.toHaveTextContent(/A♥|card value/i);
});

it('does not treat a replayed stale revision receipt as a committed mission', async () => {
  const user = userEvent.setup();
  mocks.startAwayMission.mockResolvedValue({
    status: 'replayed', sessionId: 's1', requestId: 'request-1',
    opportunityId: opportunity.id, snapshotId: opportunity.id,
    missionId: `mission-${opportunity.id}`, groupId: 'fleet-1', coordinate: '5143',
    sourceCycle: 2, participantCount: 1, missionLeaderUid: 'alice',
    expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
    currentSetupRevision: 5, currentPhaseRevision: 3, currentCycle: 2,
  });
  render(<AwayMissionStartPanel
    session={session as never}
    players={players as never}
    instanceId="bridge"
    isGm
  />);
  await user.click(screen.getByRole('checkbox', { name: /alice/i }));
  await user.selectOptions(screen.getByLabelText(/mission leader/i), 'alice');
  await user.click(screen.getByRole('button', { name: /start mission/i }));

  expect(screen.getByRole('status', { name: 'Mission start result' }))
    .toHaveTextContent(/phase changed/i);
  expect(screen.getByText(/newly reached L location/i)).toBeInTheDocument();
  expect(screen.queryByText(/no second deal was made/i)).not.toBeInTheDocument();
});

it('recovers an uncertain exact start after remount and replays it with original revisions after phase advance', async () => {
  const user = userEvent.setup();
  mocks.startAwayMission
    .mockRejectedValueOnce(new Error('Connection lost after submission.'))
    .mockResolvedValueOnce({
      status: 'replayed', sessionId: 's1', requestId: 'request-1',
      opportunityId: opportunity.id, snapshotId: opportunity.id,
      missionId: `mission-${opportunity.id}`, groupId: 'fleet-1', coordinate: '5143',
      sourceCycle: 2, participantCount: 1, missionLeaderUid: 'alice',
      expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
    });

  const first = render(<AwayMissionStartPanel session={session as never} players={players as never} instanceId="bridge" isGm />);
  await user.click(screen.getByRole('checkbox', { name: /alice/i }));
  await user.selectOptions(screen.getByLabelText(/mission leader/i), 'alice');
  await user.click(screen.getByRole('button', { name: /start mission/i }));
  const originalCall = mocks.startAwayMission.mock.calls[0]![0];
  first.unmount();

  const advancedSession = {
    ...session, currentTurn: 3,
    turnPhase: { ...session.turnPhase, turn: 3 },
    turnState: { ...session.turnState, currentTurn: 3, phaseRevision: 4 },
  };
  render(<AwayMissionStartPanel session={advancedSession as never} players={players as never} instanceId="bridge" isGm />);
  await user.click(await screen.findByRole('button', { name: /retry exact mission start/i }));

  expect(mocks.startAwayMission).toHaveBeenCalledTimes(2);
  expect(mocks.startAwayMission.mock.calls[1]![0]).toEqual({
    ...originalCall,
    requestId: expect.any(String),
    allowReplay: true,
  });
  expect(mocks.startAwayMission.mock.calls[1]![0].requestId).toBe(originalCall.requestId);
  expect(mocks.startAwayMission.mock.calls[1]![0]).toMatchObject({
    expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
    participantUids: ['alice'], missionLeaderUid: 'alice',
  });
  expect(screen.getByRole('status', { name: 'Mission start result' })).toHaveTextContent(/already recorded/i);
});

it('replays a committed saved request after remount in debrief without making a second deal', async () => {
  const user = userEvent.setup();
  mocks.startAwayMission
    .mockRejectedValueOnce(new Error('Connection lost after submission.'))
    .mockResolvedValueOnce({
      status: 'replayed', sessionId: 's1', requestId: 'request-1',
      opportunityId: opportunity.id, snapshotId: opportunity.id,
      missionId: `mission-${opportunity.id}`, groupId: 'fleet-1', coordinate: '5143',
      sourceCycle: 2, participantCount: 1, missionLeaderUid: 'alice',
      expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
    });

  const first = render(<AwayMissionStartPanel session={session as never} players={players as never} instanceId="bridge" isGm />);
  await user.click(screen.getByRole('checkbox', { name: /alice/i }));
  await user.selectOptions(screen.getByLabelText(/mission leader/i), 'alice');
  await user.click(screen.getByRole('button', { name: /start mission/i }));
  const originalCall = mocks.startAwayMission.mock.calls[0]![0];
  first.unmount();

  const terminalSession = { ...session, phase: 'debrief', currentTurn: 6 };
  delete (terminalSession as Partial<typeof terminalSession>).turnPhase;
  delete (terminalSession as Partial<typeof terminalSession>).turnState;
  render(<AwayMissionStartPanel session={terminalSession as never} players={players as never} instanceId="bridge" isGm />);
  await user.click(await screen.findByRole('button', { name: /retry exact mission start/i }));

  expect(mocks.startAwayMission).toHaveBeenCalledTimes(2);
  expect(mocks.startAwayMission.mock.calls[1]![0]).toEqual({ ...originalCall, allowReplay: true });
  expect(mocks.startAwayMission.mock.calls[1]![0].requestId).toBe(originalCall.requestId);
  expect(screen.getByRole('status', { name: 'Mission start result' }))
    .toHaveTextContent(/already recorded.*no second deal/i);
});

it('replays the saved exact request after remount in debrief and reports a server stale marker without claiming success', async () => {
  const user = userEvent.setup();
  mocks.startAwayMission
    .mockRejectedValueOnce(new Error('Connection lost after submission.'))
    .mockResolvedValueOnce({
      status: 'replayed', sessionId: 's1', requestId: 'request-1',
      opportunityId: opportunity.id, snapshotId: opportunity.id,
      missionId: `mission-${opportunity.id}`, groupId: 'fleet-1', coordinate: '5143',
      sourceCycle: 2, participantCount: 1, missionLeaderUid: 'alice',
      expectedSetupRevision: 4, expectedPhaseRevision: 3, expectedCycle: 2,
      currentSetupRevision: 4, currentPhaseRevision: 4, currentCycle: 3,
    });

  const first = render(<AwayMissionStartPanel session={session as never} players={players as never} instanceId="bridge" isGm />);
  await user.click(screen.getByRole('checkbox', { name: /alice/i }));
  await user.selectOptions(screen.getByLabelText(/mission leader/i), 'alice');
  await user.click(screen.getByRole('button', { name: /start mission/i }));
  const originalCall = mocks.startAwayMission.mock.calls[0]![0];
  first.unmount();

  const terminalSession = { ...session, phase: 'debrief', currentTurn: 6 };
  delete (terminalSession as Partial<typeof terminalSession>).turnPhase;
  delete (terminalSession as Partial<typeof terminalSession>).turnState;
  render(<AwayMissionStartPanel session={terminalSession as never} players={players as never} instanceId="bridge" isGm />);
  await user.click(await screen.findByRole('button', { name: /retry exact mission start/i }));

  expect(mocks.startAwayMission).toHaveBeenCalledTimes(2);
  expect(mocks.startAwayMission.mock.calls[1]![0]).toEqual({ ...originalCall, allowReplay: true });
  expect(mocks.startAwayMission.mock.calls[1]![0].requestId).toBe(originalCall.requestId);
  expect(screen.getByRole('status', { name: 'Mission start result' }))
    .toHaveTextContent(/saved revisions are stale/i);
  expect(screen.queryByText(/already recorded/i)).not.toBeInTheDocument();
});
