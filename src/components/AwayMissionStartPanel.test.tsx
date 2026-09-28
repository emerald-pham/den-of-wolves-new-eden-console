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
        participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] }],
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
