import { expect, it } from 'vitest';
import type { FleetGroupRecord } from './fleetGroups';
import type { ShuttleControlEntry } from './shuttleControl';
import { enterShuttleTransit } from './shuttleTransit';
import {
  completeShuttleArrival,
  parseShuttleArrivalVisitLog,
  type ShuttleArrivalVisit,
} from './shuttleArrival';

const departedAt = Date.parse('2026-09-21T06:00:00.000Z');
const shuttleId = 'starlight';
const control: ShuttleControlEntry = {
  shuttleId,
  ownerRoleId: 'wing-commander',
  ownerUid: 'owner',
  holderUid: 'holder',
  revision: 4,
};
const group: FleetGroupRecord = {
  id: 'fleet-1', vesselIds: ['aegis', 'icebreaker'], memberUids: ['holder', 'owner'],
};
const dockings = [
  { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
  { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
];
const transit = enterShuttleTransit({
  transitRequestId: 'transit-1',
  actorUid: 'holder',
  expectedDepartureRequestId: 'departure-1',
  expectedControlRevision: 4,
  expectedCycle: 2,
  departure: {
    status: 'requested', requestId: 'departure-1', shuttleId,
    holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
    destinationShipId: 'icebreaker', cycle: 2, controlRevision: 4,
    requestedAt: new Date(departedAt - 60_000).toISOString(),
  },
  control,
  dockings: [
    ...dockings,
    { shuttleId, shipId: 'aegis', dockedAt: 'SESSION START' },
  ],
  group,
  phase: {
    turn: 2,
    teamPhaseEndsAt: new Date(departedAt - 300_000).toISOString(),
    openAirspaceEndsAt: new Date(departedAt + 600_000).toISOString(),
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  now: departedAt,
}).transit;

const base = {
  actorUid: 'holder',
  expectedTransitRequestId: 'transit-1',
  expectedControlRevision: 4,
  currentCycle: 2,
  transit,
  control,
  group,
  activeRoleIds: ['wing-commander', 'icebreaker-miner'],
  activeVesselIds: ['aegis', 'icebreaker'],
  dockings,
  visitLog: [
    { id: 'snn-initial-aegis-docking', shuttleId: 'snn-press-shuttle', shipId: 'aegis', action: 'docked', occurredAt: 'SESSION START' },
    { id: 'highwall-initial-icebreaker-docking', shuttleId: 'highwall', shipId: 'icebreaker', action: 'docked', occurredAt: 'SESSION START' },
  ] satisfies readonly ShuttleArrivalVisit[],
  now: Date.parse(transit.arrivesAt),
} as const;

it('docks at the server destination and appends one departure and arrival visit', () => {
  const result = completeShuttleArrival(base);
  expect(result.dockings).toEqual([
    ...dockings,
    { shuttleId, shipId: 'icebreaker', dockedAt: new Date(base.now).toISOString() },
  ]);
  expect(result.visitLog.slice(-2)).toEqual([
    {
      id: 'shuttle-arrival-transit-1-departed', shuttleId,
      shipId: 'aegis', action: 'departed', occurredAt: transit.departedAt,
    },
    {
      id: 'shuttle-arrival-transit-1-docked', shuttleId,
      shipId: 'icebreaker', action: 'docked', occurredAt: new Date(base.now).toISOString(),
    },
  ]);
  expect(result.result).toEqual({
    shuttleId, hostShipId: 'icebreaker', arrivedAt: new Date(base.now).toISOString(),
    transitRequestId: 'transit-1', transitRevision: 1,
  });
});

it.each([
  ['foreign holder', { actorUid: 'owner' }],
  ['stale custody revision', { expectedControlRevision: 3 }],
  ['changed holder', { control: { ...control, holderUid: 'owner' } }],
  ['changed cycle', { currentCycle: 1 }],
  ['advanced cycle', { currentCycle: 3 }],
  ['unreached destination', { now: Date.parse(transit.arrivesAt) - 1 }],
  ['wrong fleet group', { group: { ...group, id: 'fleet-2' } }],
  ['inactive destination', { activeVesselIds: ['aegis'] }],
  ['stale transit identity', { expectedTransitRequestId: 'other-trip' }],
] as const)('rejects %s before changing public docking/history', (_label, patch) => {
  expect(() => completeShuttleArrival({ ...base, ...patch })).toThrow();
});

it('rejects duplicate arrival identifiers and malformed stored history', () => {
  const parsed = parseShuttleArrivalVisitLog([
    ...base.visitLog,
    { ...base.visitLog[0]!, shipId: 'icebreaker' },
  ], dockings, base.activeVesselIds);
  expect(parsed).toBeNull();
  expect(() => completeShuttleArrival({
    ...base,
    visitLog: [...base.visitLog, {
      id: 'shuttle-arrival-transit-1-docked', shuttleId,
      shipId: 'icebreaker', action: 'docked', occurredAt: new Date(base.now).toISOString(),
    }],
  })).toThrow(/already present/i);
});

it('bootstraps a missing legacy history without duplicating other shuttle state', () => {
  const parsed = parseShuttleArrivalVisitLog(undefined, dockings, base.activeVesselIds);
  expect(parsed).toEqual([
    { id: 'snn-initial-aegis-docking', shuttleId: 'snn-press-shuttle', shipId: 'aegis', action: 'docked', occurredAt: 'SESSION START' },
    { id: 'highwall-initial-icebreaker-docking', shuttleId: 'highwall', shipId: 'icebreaker', action: 'docked', occurredAt: 'SESSION START' },
  ]);
});
