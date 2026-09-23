import { expect, it } from 'vitest';
import {
  parseShuttleMovementConflict,
  shuttleMovementConflictError,
  ShuttleMovementConflictError,
} from './shuttleMovementConflict';

const docking = { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' };
const departure = {
  status: 'requested', requestId: 'departure-1', shuttleId: 'starlight', holderUid: 'holder',
  fleetGroupId: 'fleet-1', originShipId: 'aegis', destinationShipId: 'icebreaker', cycle: 2,
  controlRevision: 4, requestedAt: '2026-09-21T05:59:00.000Z',
};
const details = (current: unknown) => ({
  code: 'functions/failed-precondition',
  details: {
    commandError: 'conflict',
    movementConflict: {
      type: 'shuttle-movement-conflict', sessionId: 's1', shuttleId: 'starlight', current,
    },
  },
});

it('parses authoritative host plus pending departure from a structured conflict', () => {
  const cause = details({ status: 'requested', docking, departure });
  expect(parseShuttleMovementConflict(cause, 's1', 'starlight')).toEqual({
    type: 'shuttle-movement-conflict', sessionId: 's1', shuttleId: 'starlight',
    current: { status: 'requested', docking, departure },
  });
  expect(shuttleMovementConflictError(cause, 's1', 'starlight')).toBeInstanceOf(ShuttleMovementConflictError);
});

it('reads the Firebase nested server-response detail envelope', () => {
  const direct = details({ status: 'docked', docking });
  const cause = {
    code: 'functions/failed-precondition',
    customData: { serverResponse: { details: direct.details } },
  };
  expect(parseShuttleMovementConflict(cause, 's1', 'starlight')?.current.status).toBe('docked');
});

it.each([
  ['another session', details({ status: 'docked', docking }), 's2', 'starlight'],
  ['another shuttle', details({ status: 'docked', docking }), 's1', 'highwall'],
  ['a non-conflict error', { details: { commandError: 'unauthorized', movementConflict: {} } }, 's1', 'starlight'],
  ['unknown reply fields', details({ status: 'docked', docking, holderUid: 'holder' }), 's1', 'starlight'],
  ['a host inconsistent with its departure', details({
    status: 'requested', docking, departure: { ...departure, originShipId: 'dione' },
  }), 's1', 'starlight'],
] as const)('fails closed on %s', (_label, cause, sessionId, shuttleId) => {
  expect(parseShuttleMovementConflict(cause, sessionId, shuttleId)).toBeNull();
  expect(shuttleMovementConflictError(cause, sessionId, shuttleId)).toBeNull();
});

it('parses current public transit without accepting private route history', () => {
  const transit = {
    status: 'in-transit', requestId: 'begin-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: 'holder', fleetGroupId: 'fleet-1',
    destinationShipId: 'icebreaker', cycle: 2, controlRevision: 4,
    requestedAt: '2026-09-21T05:59:00.000Z', revision: 1,
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 0.26, y: -0.12, z: 0.28 },
    velocity: { x: 0.004333, y: -0.002, z: 0.004666 },
    departedAt: '2026-09-21T06:00:00.000Z', arrivesAt: '2026-09-21T06:01:00.000Z',
  };
  const result = parseShuttleMovementConflict(details({ status: 'in-transit', transit }), 's1', 'starlight');
  expect(result?.current.status).toBe('in-transit');
  expect(parseShuttleMovementConflict(details({
    status: 'in-transit', transit: { ...transit, routeLegs: [] },
  }), 's1', 'starlight')).toBeNull();
});
