import { expect, it } from 'vitest';
import {
  WOLF_ATTACK_HOST_TIE_ORDER,
  nearestWolfAttackHost,
  resolveWolfAttackShuttleParking,
} from './wolfAttackParking';
import type { ShuttleTransitState } from './shuttleTransit';

const departedAt = '2026-09-21T18:00:00.000Z';
const arrivesAt = '2026-09-21T18:01:00.000Z';
const transit = (fields: Partial<ShuttleTransitState> = {}): ShuttleTransitState => ({
  status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
  shuttleId: 'starlight', holderUid: 'holder', fleetGroupId: 'fleet-1',
  originShipId: 'aegis', destinationShipId: 'dione', cycle: 2, controlRevision: 1,
  requestedAt: departedAt, revision: 1,
  originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
  destinationPosition: { x: -0.32, y: 0.18, z: 0.22 },
  velocity: { x: -0.32 / 60, y: 0.18 / 60, z: 0.22 / 60 },
  departedAt, arrivesAt,
  ...fields,
});

it('selects the ship nearest to the craft authoritative local transit position', () => {
  expect(nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, [
    { shipId: 'refinery-124', position: { x: 5, y: 0, z: 0 } },
    { shipId: 'dione', position: { x: 1, y: 0, z: 0 } },
    { shipId: 'aegis', position: { x: 2, y: 0, z: 0 } },
  ])).toEqual({
    shipId: 'dione',
    position: { x: 1, y: 0, z: 0 },
    distanceSquared: 1,
    tiedHostIds: ['dione'],
  });
});

it('resolves exact equal distances by one explicit canonical vessel order', () => {
  expect(WOLF_ATTACK_HOST_TIE_ORDER).toEqual([
    'aegis', 'dione', 'icebreaker', 'capybara', 'shepherd', 'quellon', 'refinery-124',
  ]);
  const candidates = [
    { shipId: 'refinery-124', position: { x: 0, y: -1, z: 0 } },
    { shipId: 'dione', position: { x: -1, y: 0, z: 0 } },
    { shipId: 'aegis', position: { x: 1, y: 0, z: 0 } },
  ] as const;
  expect(nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, candidates)).toEqual({
    shipId: 'aegis',
    position: { x: 1, y: 0, z: 0 },
    distanceSquared: 1,
    tiedHostIds: ['aegis', 'dione', 'refinery-124'],
  });
  expect(nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, [...candidates].reverse())).toEqual(
    nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, candidates),
  );
});

it('applies the same order when only expansion and later core hosts are tied', () => {
  expect(nearestWolfAttackHost({ x: 0, y: 0, z: 0 }, [
    { shipId: 'shepherd', position: { x: 1, y: 0, z: 0 } },
    { shipId: 'capybara', position: { x: 0, y: 1, z: 0 } },
    { shipId: 'quellon', position: { x: 0, y: 0, z: 1 } },
  ])).toMatchObject({ shipId: 'capybara', tiedHostIds: ['capybara', 'shepherd', 'quellon'] });
});

it.each([
  ['no candidates', { x: 0, y: 0, z: 0 }, []],
  ['invalid craft position', { x: Number.NaN, y: 0, z: 0 }, [{ shipId: 'aegis', position: { x: 0, y: 0, z: 0 } }]],
  ['unknown host', { x: 0, y: 0, z: 0 }, [{ shipId: 'wolf-ship', position: { x: 1, y: 0, z: 0 } }]],
  ['invalid host position', { x: 0, y: 0, z: 0 }, [{ shipId: 'aegis', position: { x: Infinity, y: 0, z: 0 } }]],
  ['overflowing distance', { x: -1e308, y: 0, z: 0 }, [{ shipId: 'aegis', position: { x: 1e308, y: 0, z: 0 } }]],
  ['duplicate host', { x: 0, y: 0, z: 0 }, [
    { shipId: 'aegis', position: { x: 0, y: 0, z: 0 } },
    { shipId: 'aegis', position: { x: 1, y: 0, z: 0 } },
  ]],
] as const)('rejects %s rather than inventing a parking result', (_label, position, candidates) => {
  expect(() => nearestWolfAttackHost(position, candidates)).toThrow();
});

it('retains a legally docked shuttle at its zero-distance host', () => {
  expect(resolveWolfAttackShuttleParking({
    shuttleIds: ['starlight'], activeVesselIds: ['aegis', 'dione'],
    dockings: [{ shuttleId: 'starlight', shipId: 'dione', dockedAt: 'earlier' }],
    transits: [], fleetGroups: [{ id: 'fleet-1', vesselIds: ['aegis', 'dione'] }],
    cycle: 2, parkedAt: '2026-09-21T18:00:30.000Z',
  })).toEqual({
    dockings: [{ shuttleId: 'starlight', shipId: 'dione', dockedAt: 'earlier' }],
    decisions: [{
      craftId: 'starlight', source: 'docked', hostShipId: 'dione',
      distanceSquared: 0, tiedHostIds: ['dione'],
    }],
    clearedTransitIds: [],
  });
});

it('parks an in-flight midpoint tie by policy and clears its transit authority', () => {
  const result = resolveWolfAttackShuttleParking({
    shuttleIds: ['starlight'], activeVesselIds: ['aegis', 'dione'], dockings: [],
    transits: [transit()], fleetGroups: [{ id: 'fleet-1', vesselIds: ['dione', 'aegis'] }],
    cycle: 2, parkedAt: '2026-09-21T18:00:30.000Z',
  });
  expect(result).toMatchObject({
    dockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: '2026-09-21T18:00:30.000Z' }],
    decisions: [{
      craftId: 'starlight', source: 'in-transit', hostShipId: 'aegis',
      tiedHostIds: ['aegis', 'dione'],
    }],
    clearedTransitIds: ['starlight'],
  });
});

it('parks an in-flight craft at the physically nearer group-local ship', () => {
  expect(resolveWolfAttackShuttleParking({
    shuttleIds: ['starlight'], activeVesselIds: ['aegis', 'dione', 'icebreaker'], dockings: [],
    transits: [transit()], fleetGroups: [
      { id: 'fleet-1', vesselIds: ['aegis', 'dione'] },
      { id: 'fleet-2', vesselIds: ['icebreaker'] },
    ],
    cycle: 2, parkedAt: '2026-09-21T18:00:45.000Z',
  }).decisions[0]).toMatchObject({
    source: 'in-transit', hostShipId: 'dione', tiedHostIds: ['dione'],
  });
});

it('never crosses a split-fleet boundary even when another group ship is physically closer', () => {
  const splitTransit = transit({
    originShipId: 'quellon', destinationShipId: 'refinery-124',
    originPosition: { x: -0.28, y: -0.08, z: -0.26 },
    currentPosition: { x: -0.28, y: -0.08, z: -0.26 },
    destinationPosition: { x: 0.09, y: 0.32, z: 0.31 },
    velocity: { x: 0.37 / 60, y: 0.4 / 60, z: 0.57 / 60 },
  });
  const result = resolveWolfAttackShuttleParking({
    shuttleIds: ['starlight'], activeVesselIds: ['aegis', 'quellon', 'refinery-124'],
    dockings: [], transits: [splitTransit],
    fleetGroups: [
      { id: 'fleet-1', vesselIds: ['quellon', 'refinery-124'] },
      { id: 'fleet-2', vesselIds: ['aegis'] },
    ],
    cycle: 2, parkedAt: '2026-09-21T18:00:30.000Z',
  });
  expect(result.decisions[0]).toMatchObject({
    hostShipId: 'quellon', tiedHostIds: ['quellon', 'refinery-124'],
  });
  expect(result.decisions[0]!.tiedHostIds).not.toContain('aegis');
});

it.each([
  ['missing source', { dockings: [], transits: [] }],
  ['simultaneous dock and transit', {
    dockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'earlier' }],
    transits: [transit()],
  }],
  ['stale cycle', { dockings: [], transits: [transit({ cycle: 1 })] }],
  ['future departure', { dockings: [], transits: [transit({
    departedAt: '2026-09-21T18:00:31.000Z',
    arrivesAt: '2026-09-21T18:01:31.000Z',
  })] }],
  ['foreign group route', { dockings: [], transits: [transit({ destinationShipId: 'icebreaker' })] }],
  ['forged route geometry', { dockings: [], transits: [transit({
    velocity: { x: 0, y: 0, z: 0 },
  })] }],
] as const)('rejects %s instead of producing partial Wolf parking', (_label, sources) => {
  expect(() => resolveWolfAttackShuttleParking({
    shuttleIds: ['starlight'], activeVesselIds: ['aegis', 'dione', 'icebreaker'],
    dockings: sources.dockings, transits: sources.transits,
    fleetGroups: [
      { id: 'fleet-1', vesselIds: ['aegis', 'dione'] },
      { id: 'fleet-2', vesselIds: ['icebreaker'] },
    ], cycle: 2, parkedAt: '2026-09-21T18:00:30.000Z',
  })).toThrow();
});
