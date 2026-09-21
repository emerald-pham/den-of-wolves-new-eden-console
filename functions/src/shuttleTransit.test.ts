import { expect, it } from 'vitest';
import { enterShuttleTransit, parseShuttleTransit, SHUTTLE_TRANSIT_DURATION_MS } from './shuttleTransit';

const now = Date.parse('2026-09-21T06:00:00.000Z');
const departure = {
  status: 'requested' as const, requestId: 'departure-1', shuttleId: 'starlight',
  holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
  destinationShipId: 'icebreaker', cycle: 2, controlRevision: 4,
  requestedAt: '2026-09-21T05:59:00.000Z',
};
const base = {
  transitRequestId: 'transit-1', actorUid: 'holder', expectedDepartureRequestId: 'departure-1',
  expectedControlRevision: 4, expectedCycle: 2, departure,
  control: {
    shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
    holderUid: 'holder', revision: 4,
  },
  dockings: [
    { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'start' },
    { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'start' },
  ],
  group: { id: 'fleet-1', vesselIds: ['aegis', 'icebreaker'], memberUids: ['holder'] },
  phase: {
    turn: 2, teamPhaseEndsAt: '2026-09-21T05:55:00.000Z',
    openAirspaceEndsAt: '2026-09-21T06:10:00.000Z',
    airspace: { state: 'lifted' as const, tickerActive: true, pressAccess: true },
  },
  now,
} as const;

it('enters a sixty-second authoritative leg and removes only the departing docking', () => {
  const result = enterShuttleTransit(base);
  expect(result.dockings).toEqual([base.dockings[1]]);
  expect(result.transit).toMatchObject({
    status: 'in-transit', originShipId: 'aegis', destinationShipId: 'icebreaker',
    originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
    destinationPosition: { x: 0.26, y: -0.12, z: 0.28 }, revision: 1,
  });
  expect(Date.parse(result.transit.arrivesAt) - Date.parse(result.transit.departedAt))
    .toBe(SHUTTLE_TRANSIT_DURATION_MS);
  expect(parseShuttleTransit(result.transit, 'starlight')).toEqual(result.transit);
});

it.each([
  ['foreign actor', { actorUid: 'other' }],
  ['stale departure', { expectedDepartureRequestId: 'old' }],
  ['stale custody', { expectedControlRevision: 3 }],
  ['cycle changed', { expectedCycle: 3 }],
  ['closed airspace', { phase: { ...base.phase, airspace: { ...base.phase.airspace, state: 'restricted' as const } } }],
  ['paused clock', { phase: { ...base.phase, timerPause: { window: 'open' as const, remainingMs: 1, pausedAt: '2026-09-21T06:00:00.000Z' } } }],
  ['expired clock', { now: Date.parse(base.phase.openAirspaceEndsAt) }],
  ['moved origin', { dockings: [{ shuttleId: 'starlight', shipId: 'icebreaker', dockedAt: 'later' }] }],
  ['changed group', { group: { ...base.group, vesselIds: ['aegis'] } }],
] as const)('rejects %s before transit', (_label, patch) => {
  expect(() => enterShuttleTransit({ ...base, ...patch })).toThrow();
});

it('rejects malformed stored transit state', () => {
  const transit = enterShuttleTransit(base).transit;
  expect(parseShuttleTransit({ ...transit, arrivesAt: transit.departedAt }, 'starlight')).toBeNull();
  expect(parseShuttleTransit({ ...transit, forged: true }, 'starlight')).toBeNull();
});
