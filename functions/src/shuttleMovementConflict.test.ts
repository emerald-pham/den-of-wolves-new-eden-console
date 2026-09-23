import { expect, it } from 'vitest';
import { enterShuttleTransit, toPublicShuttleTransit, toShuttleTransitChain } from './shuttleTransit';
import {
  shuttleMovementConflictDetails,
  shuttleMovementConflictForCurrentState,
  shuttleMovementConflictResult,
} from './shuttleMovementConflict';

const docking = { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' };
const departure = {
  status: 'requested', requestId: 'departure-1', shuttleId: 'starlight', holderUid: 'holder',
  fleetGroupId: 'fleet-1', originShipId: 'aegis', destinationShipId: 'icebreaker', cycle: 2,
  controlRevision: 4, requestedAt: '2026-09-21T05:59:00.000Z',
};
const transit = enterShuttleTransit({
  transitRequestId: 'transit-1', actorUid: 'holder', expectedDepartureRequestId: 'departure-1',
  expectedControlRevision: 4, expectedCycle: 2, departure,
  control: { shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner', holderUid: 'holder', revision: 4 },
  dockings: [docking, { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: docking.dockedAt }],
  group: { id: 'fleet-1', vesselIds: ['aegis', 'icebreaker'], memberUids: ['holder'] },
  phase: {
    turn: 2, teamPhaseEndsAt: '2026-09-21T05:55:00.000Z', openAirspaceEndsAt: '2026-09-21T06:10:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  now: Date.parse('2026-09-21T06:00:00.000Z'),
}).transit;

it('projects the current host and pending departure from the member-readable movement shapes', () => {
  expect(shuttleMovementConflictResult({ sessionId: 's1', shuttleId: 'starlight', docking, departure }))
    .toEqual({
      type: 'shuttle-movement-conflict', sessionId: 's1', shuttleId: 'starlight',
      current: { status: 'requested', docking, departure },
    });
});

it('projects only the public transit leg and excludes private route authority', () => {
  const result = shuttleMovementConflictResult({
    sessionId: 's1', shuttleId: 'starlight', transit: toPublicShuttleTransit(transit),
  });
  expect(result?.current.status).toBe('in-transit');
  if (result?.current.status !== 'in-transit') throw new Error('Expected transit projection.');
  expect(result.current.transit).not.toHaveProperty('originShipId');
  expect(result.current.transit).not.toHaveProperty('routeLegs');
  expect(result.current.transit).not.toHaveProperty('originPosition');
});

it('projects current transit only for its fleet audience and a matching server chain', () => {
  const input = {
    sessionId: 's1', shuttleId: 'starlight', actorFleetGroupId: 'fleet-1',
    dockings: [], movement: toPublicShuttleTransit(transit), transitChain: toShuttleTransitChain(transit),
  };
  const result = shuttleMovementConflictForCurrentState(input);
  expect(result?.current.status).toBe('in-transit');
  if (result?.current.status !== 'in-transit') throw new Error('Expected a current transit projection.');
  expect(result.current.transit).not.toHaveProperty('routeLegs');
  expect(result.current.transit).not.toHaveProperty('originShipId');
  expect(shuttleMovementConflictForCurrentState({ ...input, actorFleetGroupId: 'other-fleet' })).toBeNull();
  expect(shuttleMovementConflictForCurrentState({
    ...input, transitChain: { ...input.transitChain, revision: input.transitChain.revision + 1 },
  })).toBeNull();
});

it('projects pending requests only to the same fleet audience', () => {
  const input = {
    sessionId: 's1', shuttleId: 'starlight', actorFleetGroupId: 'fleet-1',
    dockings: [docking], movement: departure,
  };
  expect(shuttleMovementConflictForCurrentState(input)?.current).toMatchObject({
    status: 'requested', docking, departure,
  });
  expect(shuttleMovementConflictForCurrentState({ ...input, actorFleetGroupId: 'other-fleet' })).toBeNull();
});

it.each([
  ['an invalid session id', { sessionId: 'bad/session' }],
  ['an unknown docking field', { docking: { ...docking, holderUid: 'holder' } }],
  ['a malformed pending movement', { departure: { ...departure, requestId: '' } }],
  ['overlapping host and transit states', { transit, docking: undefined, departure }],
] as const)('fails closed on %s', (_label, patch) => {
  expect(shuttleMovementConflictResult({ sessionId: 's1', shuttleId: 'starlight', docking, ...patch })).toBeNull();
});

it('labels the structured reply as a conflict without including server prose', () => {
  const result = shuttleMovementConflictResult({ sessionId: 's1', shuttleId: 'starlight', docking });
  expect(result).not.toBeNull();
  expect(shuttleMovementConflictDetails(result!)).toEqual({
    commandError: 'conflict', movementConflict: result,
  });
});
