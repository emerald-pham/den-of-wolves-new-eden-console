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
];
const session = {
  id: 's1', phase: 'active', currentTurn: 2, turnLimit: 6, setupRevision: 4, chartId: 'A',
  activeRoleIds: ['wing-commander', 'icebreaker-miner'],
  turnState: {
    currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3,
    startedAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-01T00:10:00.000Z',
  },
};

beforeEach(() => {
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
  expect(screen.getByRole('status')).toHaveTextContent(/mission started/i);
  expect(screen.queryByText(/A♥/)).not.toBeInTheDocument();
});
