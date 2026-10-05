import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createCandidateCallables } from './candidatePathsCallable';

type Fields = Record<string, unknown>;
const documents = new Map<string, Fields>();
const ref = (path: string) => ({ path, id: path.split('/').at(-1)! });
const snapshot = (path: string) => ({ ...ref(path), ref: ref(path), exists: documents.has(path),
  get: (field: string) => field.split('.').reduce<unknown>((v, k) => (v as Fields | undefined)?.[k], documents.get(path)),
  data: () => documents.get(path) });
const update = (target: { path: string }, fields: Fields) => {
  const value = structuredClone(documents.get(target.path) ?? {});
  for (const [path, next] of Object.entries(fields)) {
    const parts = path.split('.'); let cursor = value;
    for (const key of parts.slice(0, -1)) { cursor[key] ??= {}; cursor = cursor[key] as Fields; }
    cursor[parts.at(-1)!] = next;
  }
  documents.set(target.path, value);
};
const db = { doc: ref, collection: (path: string) => ({ path, collection: true }),
  runTransaction: async (handler: (tx: unknown) => unknown) => {
    const before = structuredClone(documents);
    let written = false;
    try {
      return await handler({
        get: async (target: { path: string; collection?: boolean }) => {
          if (written) throw new Error('Read after write');
          return target.collection ? { docs: [...documents.keys()].filter(p => p.startsWith(`${target.path}/`) &&
            !p.slice(target.path.length + 1).includes('/')).map(snapshot) } : snapshot(target.path);
        },
        set: (target: { path: string }, fields: Fields) => { written = true; documents.set(target.path, structuredClone(fields)); },
        update: (target: { path: string }, fields: Fields) => { written = true; update(target, fields); },
      });
    } catch (error) { documents.clear(); for (const [key, value] of before) documents.set(key, value); throw error; }
  },
} as unknown as Firestore;
const die = vi.fn(() => 6);
const requireShipAuthority = vi.fn(async () => undefined);
const commitTerminal = vi.fn(async (_tx, _ref, _session, input) => input);
const handlers = createCandidateCallables({ db, die, now: () => new Date('2026-10-05T12:00:00Z'),
  requireShipAuthority, commitTerminal, serverTimestamp: () => 'server-time' });
const request = (data: Fields, uid = 'admiral') => ({ data, auth: { uid } });
const command = { sessionId: 's1', requestId: 'n1', expectedRevision: 0,
  expectedGroupId: 'fleet-1', code: 'O', coordinate: '0408', action: 'nebula-jump', shipId: 'aegis' };
const put = (path: string, value: Fields) => documents.set(path, value);

beforeEach(() => {
  documents.clear(); die.mockClear(); requireShipAuthority.mockClear(); commitTerminal.mockClear();
  put('sessions/s1', { phase: 'active', currentTurn: 6, chartId: 'A', configurationLocked: true,
    activeVesselIds: ['aegis', 'shepherd'], activeRoleIds: ['admiral', 'shepherd-captain'],
    fullGameDemo: { status: 'active', progression: 'manual' },
    turnPhase: { turn: 6, teamPhaseEndsAt: '2026-10-05T11:00:00.000Z', openAirspaceEndsAt: '2026-10-05T13:00:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
    maintenanceCycles: { aegis: { step: 0, revision: 1, turn: 6, charges: ['jump-drive'], results: {}, refuelled: [] },
      shepherd: { step: 0, revision: 1, turn: 6, charges: ['jump-drive'], results: {}, refuelled: [] } },
    shipResources: Object.fromEntries(['aegis', 'shepherd'].map(ship => [ship,
      { ore: 0, fuel: 6, materials: 10, food: 10, water: 10, securityTeams: 1 }])),
    shipSurvivors: { aegis: 5000, shepherd: 5000 }, shuttleControl: {}, shuttleDockings: [],
  });
  put('sessions/s1/players/admiral', { role: 'player', connected: true, assignedRoleId: 'admiral', seatId: 'admiral', fleetGroupId: 'fleet-1' });
  put('sessions/s1/players/captain', { role: 'player', connected: true, assignedRoleId: 'shepherd-captain', seatId: 'shepherd-captain', fleetGroupId: 'fleet-1' });
  put('sessions/s1/players/gm', { role: 'gm', connected: true, fleetGroupId: 'fleet-1' });
  put('sessions/s1/gmInstances/instance1', { uid: 'gm', connected: true, lastSeenAt: '2026-10-05T12:00:00Z' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis', 'shepherd'], memberUids: ['admiral', 'captain', 'gm'] });
  put('sessions/s1/serverState/navigation', { revision: 1, shipGalacticCoordinates: { aegis: '0408', shepherd: '0408' },
    systemHistory: { aegis: { '0408': { coordinate: '0408', candidateDiscovery: {
      id: 'arrival1', occurredAt: '2026-10-05T10:00:00.000Z', code: 'O', title: 'Deep Nebula', source: 'arrival' } } } } });
  for (let i = 0; i < 2; i++) put(`sessions/s1/deepNebulaScans/scan-${i}`, {
    type: 'deep-nebula-scan', sessionId: 's1', requestId: `scan-${i}`, shipId: 'aegis', cycle: 5, targetCoordinate: '0408' });
});

describe('ordinary candidate callable authority and durable replay', () => {
  it('commits a server loss once, retains private arithmetic, revokes vessel actions and preserves demo state', async () => {
    const reply = await handlers.execute(request(command));
    expect(reply).toMatchObject({ status: 'committed', outcome: 'lost', fuelSpent: 3 });
    expect(die).toHaveBeenCalledTimes(1);
    expect(documents.get('sessions/s1/candidateCalculationAudits/n1')).toMatchObject({ calculation: { die: 6, scouts: 2, total: 8 } });
    expect(documents.get('sessions/s1/players/admiral')).toMatchObject({ candidateDisposition: { outcome: 'lost', shipId: 'aegis' } });
    expect(documents.get('sessions/s1')).toMatchObject({ fullGameDemo: { status: 'active', progression: 'manual' },
      shipResources: { aegis: { fuel: 3 } }, shipDamage: { aegis: { destroyed: true } }, shipSurvivors: { aegis: 0 } });
    expect(JSON.stringify(reply)).not.toMatch(/die|scouts|total|hidden/);
  });
  it('recovers the exact request after debrief without fresh calculation, and rejects payload and actor collisions', async () => {
    const first = await handlers.execute(request(command));
    update(ref('sessions/s1'), { phase: 'debrief' });
    const retry = await handlers.execute(request(command));
    expect(retry).toEqual({ ...first, status: 'replayed' });
    expect(die).toHaveBeenCalledTimes(1);
    await expect(handlers.execute(request({ ...command, coordinate: '6798' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(handlers.execute(request(command, 'captain'))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('does not roll for foreign groups, wrong ship, stale revision or client-controlled randomness', async () => {
    await expect(handlers.execute(request({ ...command, expectedGroupId: 'fleet-2' }))).rejects.toThrow();
    await expect(handlers.execute(request({ ...command, shipId: 'shepherd' }))).rejects.toThrow();
    await expect(handlers.execute(request({ ...command, expectedRevision: 1 }))).rejects.toThrow();
    await expect(handlers.execute(request({ ...command, dice: 6 }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(die).not.toHaveBeenCalled();
  });
  it('exposes only found candidate operations to the current group and restricts GM calculations to an owned live instance', async () => {
    const view = await handlers.read(request({ sessionId: 's1', expectedGroupId: 'fleet-1' }));
    expect(view.paths).toHaveLength(1);
    expect(view.paths[0]).toMatchObject({ code: 'O', coordinate: '0408' });
    expect(JSON.stringify(view)).not.toMatch(/hiddenScoutCount|scouts|calculation|wolfRoster|chartId/);
    await expect(handlers.read(request({ sessionId: 's1', expectedGroupId: 'fleet-1' }, 'gm'))).rejects.toThrow();
    const gm = await handlers.read(request({ sessionId: 's1', expectedGroupId: 'fleet-1', instanceId: 'instance1' }, 'gm'));
    expect(gm).toHaveProperty('privateCalculations');
  });
  it('counts only protected matching scout markers and closes only after all group ships have durable outcomes', async () => {
    put('sessions/s1/deepNebulaScans/foreign', { type: 'deep-nebula-scan', sessionId: 's1', requestId: 'foreign',
      shipId: 'aegis', cycle: 5, targetCoordinate: '8378' });
    await handlers.execute(request(command));
    expect(commitTerminal).not.toHaveBeenCalled();
    await expect(handlers.execute(request({ ...command, requestId: 'n2', expectedRevision: 1, shipId: 'shepherd' }, 'captain')))
      .resolves.toMatchObject({ outcome: 'reached' });
    expect(commitTerminal).toHaveBeenCalledTimes(1);
    expect(commitTerminal.mock.calls[0]?.[3]).toMatchObject({ source: 'candidate', outcome: {
      result: 'success', candidateCode: 'O', successfulShipIds: ['shepherd'], leftBehindShipIds: ['aegis'] } });
  });
});
