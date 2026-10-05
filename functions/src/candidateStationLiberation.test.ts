import { expect, it } from 'vitest';
import { candidateStationLiberationFromFinalization, parseCandidateStationLiberations } from './candidateStationLiberation';

const sequence = { type: 'p-station-sequence', sequenceId: 'wolf-p-station-jump-1', groupId: 'fleet-1',
  chart: 'A', coordinate: '4888', stationId: 'P', sourceTransitionId: 'jump-1', sourceCycle: 6, attackNumber: 2 };
const state = { status: 'resolved', currentStep: 'resolved', turn: 6, attackId: 'wolf-attack-station-2',
  targetGroupId: 'fleet-1', threatSiteCode: 'P', pStationSequence: sequence };
const stopped = { status: 'stopped', sequenceId: sequence.sequenceId, groupId: 'fleet-1',
  attackId: state.attackId, attackNumber: 2, turn: 6 };
it('persists a unique Station liberation marker from the committed empty-survivor finalization', () => {
  const marker = candidateStationLiberationFromFinalization('s1', state, { survivingWolfShips: [] }, stopped,
    '2026-10-05T12:00:00.000Z');
  expect(marker).toMatchObject({ type: 'candidate-station-liberation', sessionId: 's1', groupId: 'fleet-1',
    coordinate: '4888', sourceId: state.attackId, sequenceId: sequence.sequenceId });
  expect(parseCandidateStationLiberations({ 'fleet-1:4888': marker })['fleet-1:4888']).toEqual(marker);
});
it('cannot liberate from surviving Wolves, another group or an incomplete Station sequence', () => {
  expect(candidateStationLiberationFromFinalization('s1', state, { survivingWolfShips: [{ id: 'wolf' }] }, stopped,
    '2026-10-05T12:00:00.000Z')).toBeUndefined();
  expect(candidateStationLiberationFromFinalization('s1', state, { survivingWolfShips: [] }, { ...stopped, groupId: 'fleet-2' },
    '2026-10-05T12:00:00.000Z')).toBeUndefined();
  expect(candidateStationLiberationFromFinalization('s1', { ...state, pStationSequence: undefined }, { survivingWolfShips: [] }, stopped,
    '2026-10-05T12:00:00.000Z')).toBeUndefined();
});
it('rejects forged public details in the durable source marker', () => {
  const marker = candidateStationLiberationFromFinalization('s1', state, { survivingWolfShips: [] }, stopped,
    '2026-10-05T12:00:00.000Z');
  expect(() => parseCandidateStationLiberations({ 'fleet-1:4888': { ...marker, wolfRoster: [] } })).toThrow();
});
