import { expect, it } from 'vitest';
import { evacuateShuttleSurvivors, parseShuttleEvacuations } from './shuttleEvacuation';

const base = {
  actorUid: 'holder', shuttleId: 'hummingbird', destinationShipId: 'capybara', amount: 2_000,
  cycle: 3, expectedCycle: 3, expectedControlRevision: 4, expectedEvacuationRevision: 0,
  control: { shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'owner', holderUid: 'holder', revision: 4 },
  dockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'now' }],
  groupVesselIds: ['quellon', 'capybara'], activeVesselIds: ['quellon', 'capybara'],
  shipSurvivors: { quellon: 30_000, capybara: 13_000 }, evacuationLedger: {},
};

it('moves survivors between printed tracks and accounts against the craft cycle limit', () => {
  expect(evacuateShuttleSurvivors(base)).toEqual({
    shuttleId: 'hummingbird', sourceShipId: 'quellon', destinationShipId: 'capybara', amount: 2_000,
    sourcePopulation: 28_000, destinationPopulation: 15_000,
    ledger: { cycle: 3, moved: 2_000, revision: 1 },
  });
});

it('accumulates no more than 5,000 per shuttle and resets only on a later cycle', () => {
  const ledger = { hummingbird: { cycle: 3, moved: 4_000, revision: 2 } };
  expect(() => evacuateShuttleSurvivors({ ...base, amount: 2_000, expectedEvacuationRevision: 2, evacuationLedger: ledger }))
    .toThrow(/5,000-survivor limit/i);
  expect(evacuateShuttleSurvivors({
    ...base, cycle: 4, expectedCycle: 4, expectedEvacuationRevision: 2, evacuationLedger: ledger,
  }).ledger).toEqual({ cycle: 4, moved: 2_000, revision: 3 });
});

it.each([
  ['foreign holder', { actorUid: 'other' }],
  ['stale control', { expectedControlRevision: 3 }],
  ['stale cycle', { expectedCycle: 2 }],
  ['stale evacuation revision', { expectedEvacuationRevision: 1 }],
  ['undocked craft', { dockings: [] }],
  ['duplicate dock', { dockings: [...base.dockings, ...base.dockings] }],
  ['cross-group destination', { groupVesselIds: ['quellon'] }],
  ['inactive destination', { activeVesselIds: ['quellon'] }],
  ['off-track result', { amount: 1_999 }],
  ['non-cargo craft', { shuttleId: 'press-shuttle', control: { ...base.control, shuttleId: 'press-shuttle' }, dockings: [{ shuttleId: 'press-shuttle', shipId: 'quellon', dockedAt: 'now' }] }],
] as const)('rejects %s without producing state', (_label, patch) => {
  expect(() => evacuateShuttleSurvivors({ ...base, ...patch } as typeof base)).toThrow();
});

it('rejects destination overflow and malformed ledgers', () => {
  expect(() => evacuateShuttleSurvivors({
    ...base, destinationShipId: 'aegis', amount: 500,
    groupVesselIds: ['quellon', 'aegis'], activeVesselIds: ['quellon', 'aegis'],
    shipSurvivors: { quellon: 30_000, aegis: 2_500 },
  })).toThrow(/starting maximum/i);
  expect(parseShuttleEvacuations({ hummingbird: { cycle: 2, moved: 5_001, revision: 1 } })).toBeNull();
});
