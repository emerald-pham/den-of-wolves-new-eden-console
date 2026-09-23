import { expect, it } from 'vitest';
import { enterShuttleTransit, type ShuttleTransitState } from './shuttleTransit';
import { resolveAirspaceClosureShuttleParking } from './airspaceClosureParking';

const departedAt = Date.parse('2026-09-23T12:00:00.000Z');
const roles = ['wing-commander', 'icebreaker-miner'];
const activeVesselIds = ['aegis', 'dione', 'icebreaker'];
const fleetGroups = [{
  id: 'fleet-1', vesselIds: activeVesselIds, memberUids: ['holder', 'owner'],
}];
const dockings = [
  { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'SESSION START' },
  { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
];

function transit(fields: Partial<ShuttleTransitState> = {}): ShuttleTransitState {
  const entered = enterShuttleTransit({
    transitRequestId: 'transit-1',
    actorUid: 'holder',
    expectedDepartureRequestId: 'departure-1',
    expectedControlRevision: 4,
    expectedCycle: 2,
    departure: {
      status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
      holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
      destinationShipId: 'dione', cycle: 2, controlRevision: 4,
      requestedAt: new Date(departedAt - 60_000).toISOString(),
    },
    control: {
      shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
      holderUid: 'holder', revision: 4,
    },
    dockings: [
      ...dockings,
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
    ],
    group: fleetGroups[0]!,
    phase: {
      turn: 2,
      teamPhaseEndsAt: new Date(departedAt - 300_000).toISOString(),
      openAirspaceEndsAt: new Date(departedAt + 600_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    now: departedAt,
  });
  return { ...entered.transit, ...fields };
}

const base = {
  activeRoleIds: roles,
  activeVesselIds,
  dockings,
  fleetGroups,
  cycle: 2,
  visitLog: undefined,
};

it('parks a travelling shuttle at the nearest legal host at the airspace deadline', () => {
  const closedAt = new Date(departedAt + 30_000).toISOString();
  const result = resolveAirspaceClosureShuttleParking({
    ...base, transits: [transit()], closedAt,
  });

  expect(result.dockings).toEqual(expect.arrayContaining([
    ...dockings,
    { shuttleId: 'starlight', shipId: 'aegis', dockedAt: closedAt },
  ]));
  expect(result.decisions.find((decision) => decision.craftId === 'starlight')).toMatchObject({
    source: 'in-transit', hostShipId: 'aegis', tiedHostIds: ['aegis', 'dione'],
  });
  expect(result.clearedTransitIds).toEqual(['starlight']);
  expect(result.visitLog).toEqual(expect.arrayContaining([
    {
      id: 'airspace-close-2-transit-1-departed', shuttleId: 'starlight',
      shipId: 'aegis', action: 'departed', occurredAt: new Date(departedAt).toISOString(),
    },
    {
      id: 'airspace-close-2-transit-1-docked', shuttleId: 'starlight',
      shipId: 'aegis', action: 'docked', occurredAt: closedAt,
    },
  ]));
});

it('uses the same physical transit position and host policy after a shuttle reaches its destination', () => {
  const closedAt = new Date(departedAt + 75_000).toISOString();
  const result = resolveAirspaceClosureShuttleParking({
    ...base, transits: [transit()], closedAt,
  });

  expect(result.decisions.find((decision) => decision.craftId === 'starlight')).toMatchObject({
    source: 'in-transit', hostShipId: 'dione', tiedHostIds: ['dione'],
  });
  expect(result.dockings).toContainEqual({
    shuttleId: 'starlight', shipId: 'dione', dockedAt: closedAt,
  });
});

it('rejects a transit whose role is no longer active instead of losing its authoritative route', () => {
  expect(() => resolveAirspaceClosureShuttleParking({
    ...base, activeRoleIds: ['icebreaker-miner'], transits: [transit()],
    closedAt: new Date(departedAt + 30_000).toISOString(),
  })).toThrow();
});

it('rejects a transit when its authoritative fleet-group host partition is missing', () => {
  expect(() => resolveAirspaceClosureShuttleParking({
    ...base, fleetGroups: [], transits: [transit()],
    closedAt: new Date(departedAt + 30_000).toISOString(),
  })).toThrow(/fleet group|parking authority|partition/i);
});

it('rejects a union shuttle parked outside its two legal host ships', () => {
  expect(() => resolveAirspaceClosureShuttleParking({
    ...base,
    activeRoleIds: [...roles, 'joint-engineering-shepherd-icebreaker'],
    dockings: [...dockings, { shuttleId: 'ally', shipId: 'dione', dockedAt: 'SESSION START' }],
    closedAt: new Date(departedAt + 30_000).toISOString(),
    transits: [],
  })).toThrow(/docking ledger|illegal current host|role authority/i);
});

it('fails closed when the latest docking history does not match a shuttle transit origin', () => {
  expect(() => resolveAirspaceClosureShuttleParking({
    ...base,
    transits: [transit()],
    visitLog: [{
      id: 'prior-trip-docked', shuttleId: 'starlight', shipId: 'dione',
      action: 'docked', occurredAt: new Date(departedAt - 120_000).toISOString(),
    }],
    closedAt: new Date(departedAt + 30_000).toISOString(),
  })).toThrow(/visit history|transit origin/i);
});

it('rejects malformed visit history before producing a closure projection', () => {
  expect(() => resolveAirspaceClosureShuttleParking({
    ...base,
    transits: [transit()],
    visitLog: [{ id: 'bad', shuttleId: 'starlight', shipId: 'unknown', action: 'docked', occurredAt: 'x' }],
    closedAt: new Date(departedAt + 30_000).toISOString(),
  })).toThrow();
});

it('keeps the deterministic parking projection stable across transaction retries', () => {
  const input = { ...base, transits: [transit()], closedAt: new Date(departedAt + 30_000).toISOString() };

  expect(resolveAirspaceClosureShuttleParking(input)).toEqual(resolveAirspaceClosureShuttleParking(input));
});
