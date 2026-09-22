import { expect, it } from 'vitest';
import {
  enterShuttleTransit,
  fleetWorldPositionForShip,
  parseShuttleTransit,
  retargetShuttleTransit,
  SHUTTLE_TRANSIT_DURATION_MS,
  shuttlePositionAt,
} from './shuttleTransit';

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

it('enters restricted-airspace transit only for the AEGIS-authorized SNN shuttle', () => {
  const pressDeparture = {
    ...departure,
    shuttleId: 'snn-press-shuttle',
  };
  const restricted = {
    ...base.phase,
    airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: true },
  };
  const press = {
    ...base,
    departure: pressDeparture,
    control: { ...base.control, shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer' },
    dockings: [{ shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'start' }],
    phase: restricted,
  };

  expect(enterShuttleTransit(press).transit).toMatchObject({
    shuttleId: 'snn-press-shuttle', status: 'in-transit',
  });
  expect(() => enterShuttleTransit({ ...press, phase: {
    ...restricted, airspace: { ...restricted.airspace, pressAccess: false },
  } })).toThrow(/airspace is open/i);
  expect(() => enterShuttleTransit({ ...base, phase: restricted })).toThrow(/airspace is open/i);
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

it('derives the physical position from immutable route time and clamps at both endpoints', () => {
  const transit = enterShuttleTransit(base).transit;
  expect(shuttlePositionAt(transit, now - 1)).toEqual(transit.originPosition);
  expect(shuttlePositionAt(transit, now + SHUTTLE_TRANSIT_DURATION_MS / 2)).toEqual({
    x: 0.13, y: -0.06, z: 0.14,
  });
  expect(shuttlePositionAt(transit, now + SHUTTLE_TRANSIT_DURATION_MS + 1))
    .toEqual(transit.destinationPosition);
});

it('retargets from the server-resolved mid-flight position and increments the leg revision', () => {
  const transit = enterShuttleTransit(base).transit;
  const retargeted = retargetShuttleTransit({
    actorUid: 'holder', expectedTransitRequestId: 'transit-1', expectedControlRevision: 4,
    expectedCycle: 2, destinationShipId: 'dione', transit, control: base.control,
    group: { ...base.group, vesselIds: ['aegis', 'icebreaker', 'dione'] },
    activeVesselIds: ['aegis', 'icebreaker', 'dione'], phase: base.phase,
    now: now + 30_000,
  });
  expect(retargeted).toMatchObject({
    transitRequestId: 'transit-1', revision: 2, originShipId: 'aegis',
    destinationShipId: 'dione', currentPosition: { x: 0.13, y: -0.06, z: 0.14 },
  });
  expect(retargeted.originPosition).toEqual(transit.originPosition);
  expect(shuttlePositionAt(retargeted, now + 30_000)).toEqual(retargeted.currentPosition);
  expect(Date.parse(retargeted.arrivesAt) - Date.parse(retargeted.departedAt))
    .toBe(SHUTTLE_TRANSIT_DURATION_MS);
});

it.each([
  ['stale transit identity', { expectedTransitRequestId: 'old' }],
  ['stale control revision', { expectedControlRevision: 3 }],
  ['stale cycle', { expectedCycle: 3 }],
  ['closed airspace', { phase: { ...base.phase, airspace: { ...base.phase.airspace, state: 'restricted' as const } } }],
  ['future departure', { now: now - 1_000 }],
  ['expired leg', { now: now + SHUTTLE_TRANSIT_DURATION_MS }],
  ['origin destination', { destinationShipId: 'aegis' }],
  ['foreign destination group', { destinationShipId: 'dione' }],
] as const)('rejects %s without producing a course change', (_label, patch) => {
  const transit = enterShuttleTransit(base).transit;
  expect(() => retargetShuttleTransit({
    actorUid: 'holder', expectedTransitRequestId: 'transit-1', expectedControlRevision: 4,
    expectedCycle: 2, destinationShipId: 'dione', transit, control: base.control,
    group: base.group, activeVesselIds: ['aegis', 'icebreaker'], phase: base.phase,
    now: now + 30_000, ...patch,
  })).toThrow();
});

it('returns defensive copies of canonical fleet positions', () => {
  const aegis = fleetWorldPositionForShip('aegis');
  expect(aegis).toEqual({ x: 0, y: 0, z: 0 });
  expect(fleetWorldPositionForShip('not-a-ship')).toBeUndefined();
  expect(Reflect.set(aegis!, 'x', 99)).toBe(false);
  expect(fleetWorldPositionForShip('aegis')).toEqual({ x: 0, y: 0, z: 0 });
});
