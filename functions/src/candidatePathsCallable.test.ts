import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createCandidateCallables } from './candidatePathsCallable';
import { commitTerminal as commitRealTerminal, sessionDebriefProjection } from './sessionDebrief';
import { aggregateSurvivorOutcome } from './survivorOutcome';
import { organiserSitesForChart } from './starChartLookup';

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
        create: (target: { path: string }, fields: Fields) => { written = true;
          if (documents.has(target.path)) throw new Error('Existing immutable audit');
          documents.set(target.path, structuredClone(fields)); },
        update: (target: { path: string }, fields: Fields) => { written = true; update(target, fields); },
      });
    } catch (error) { documents.clear(); for (const [key, value] of before) documents.set(key, value); throw error; }
  },
} as unknown as Firestore;
const die = vi.fn(() => 6);
const requireShipAuthority = vi.fn(async () => undefined);
const commitTerminal = vi.fn(async (_tx, _ref, _session, input) => input);
const survivorOutcome = vi.fn((session) => ({ type: 'survivor-outcome', finalSurvivors: session.get('shipSurvivors.shepherd') }));
const handlers = createCandidateCallables({ db, die, now: () => new Date('2026-10-05T12:00:00Z'),
  requireShipAuthority, commitTerminal, survivorOutcome, serverTimestamp: () => 'server-time' });
const request = (data: Fields, uid = 'admiral') => ({ data, auth: { uid } });
const command = { sessionId: 's1', requestId: 'n1', expectedRevision: 0,
  expectedGroupId: 'fleet-1', code: 'O', coordinate: '0408', action: 'nebula-jump', shipId: 'aegis' };
const put = (path: string, value: Fields) => documents.set(path, value);

beforeEach(() => {
  documents.clear(); die.mockClear(); requireShipAuthority.mockClear(); commitTerminal.mockClear(); survivorOutcome.mockClear();
  put('sessions/s1', { phase: 'active', currentTurn: 6, chartId: 'A', configurationLocked: true,
    activeVesselIds: ['aegis', 'shepherd'], activeRoleIds: ['admiral', 'shepherd-captain'],
    fullGameDemo: { status: 'active', progression: 'manual' },
    turnPhase: { turn: 6, teamPhaseEndsAt: '2026-10-05T11:00:00.000Z', openAirspaceEndsAt: '2026-10-05T13:00:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
    maintenanceCycles: { aegis: { step: 0, revision: 1, turn: 6, charges: ['jump-drive'], results: {}, refuelled: [] },
      shepherd: { step: 0, revision: 1, turn: 6, charges: ['jump-drive'], results: {}, refuelled: [] } },
    shipResources: Object.fromEntries(['aegis', 'shepherd'].map(ship => [ship,
      { ore: 0, fuel: 20, materials: 10, food: 10, water: 10, securityTeams: 1 }])),
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
  it('authorizes edition selection only to the live GM instance and locks it across every fleet group', async () => {
    const choice = { sessionId: 's1', requestId: 'edition-deluxe', expectedRevision: 0,
      expectedGroupId: 'fleet-1', instanceId: 'instance1', edition: 'deluxe' };
    await expect(handlers.selectEdition(request(choice, 'admiral'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(handlers.selectEdition(request({ ...choice, instanceId: 'missing' }, 'gm')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(documents.has('sessions/s1/serverState/candidates')).toBe(false);
    const selected = await handlers.selectEdition(request(choice, 'gm'));
    expect(selected).toMatchObject({ status: 'committed', revision: 1, edition: 'deluxe' });
    expect(documents.get('sessions/s1/serverState/candidates')).toMatchObject({ revision: 1, edition: 'deluxe', sites: {} });
    const otherGroupStarted = { revision: 2, edition: 'deluxe', sites: { 'fleet-2:0408': {
      code: 'O', coordinate: '0408', groupId: 'fleet-2', materials: 0, researchIds: [], ships: {}, reactors: {},
    } } };
    put('sessions/s1/serverState/candidates', otherGroupStarted);
    await expect(handlers.selectEdition(request({ ...choice, requestId: 'edition-home', expectedRevision: 2, edition: 'home' }, 'gm')))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(documents.get('sessions/s1/serverState/candidates')).toEqual(otherGroupStarted);
    expect(documents.has('sessions/s1/candidateActionReceipts/edition-home')).toBe(false);
  });
  it('replays the exact session edition receipt after another group starts and rejects request collisions', async () => {
    const choice = { sessionId: 's1', requestId: 'edition-replay', expectedRevision: 0,
      expectedGroupId: 'fleet-1', instanceId: 'instance1', edition: 'deluxe' };
    const first = await handlers.selectEdition(request(choice, 'gm'));
    const started = { revision: 2, edition: 'deluxe', sites: { 'fleet-2:0408': {
      code: 'O', coordinate: '0408', groupId: 'fleet-2', materials: 0, researchIds: [], ships: {}, reactors: {},
    } } };
    put('sessions/s1/serverState/candidates', started);
    await expect(handlers.selectEdition(request(choice, 'gm'))).resolves.toEqual({ ...first, status: 'replayed' });
    expect(documents.get('sessions/s1/serverState/candidates')).toEqual(started);
    await expect(handlers.selectEdition(request({ ...choice, edition: 'home' }, 'gm')))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(handlers.selectEdition(request(choice, 'admiral'))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('permanently consumes an available Engineering Shuttle in the candidate transaction and retains its exact receipt', async () => {
    const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'N')![0];
    const current = documents.get('sessions/s1')!;
    put('sessions/s1', { ...current, shuttleControl: { philia: { shuttleId: 'philia', ownerRoleId: 'admiral',
      ownerUid: 'gm', holderUid: 'gm', revision: 0 } }, shuttleDockings: [{ shuttleId: 'philia', shipId: 'aegis' }] });
    put('sessions/s1/serverState/navigation', { revision: 2, shipGalacticCoordinates: { aegis: coordinate, shepherd: coordinate },
      systemHistory: { aegis: { [coordinate]: { coordinate, candidateDiscovery: { id: 'ring-arrival',
        occurredAt: '2026-10-05T10:00:00.000Z', code: 'N', title: 'Ancient Jump Ring', source: 'arrival' } } } } });
    const choice = { ...command, requestId: 'ring-craft', code: 'N', coordinate, action: 'commit-engineering-shuttle',
      shuttleId: 'philia', instanceId: 'instance1' };
    delete (choice as Fields).shipId;
    const result = await handlers.execute(request(choice, 'gm'));
    expect(documents.get('sessions/s1')?.candidateCraftReservations).toEqual({ philia: { code: 'N', groupId: 'fleet-1',
      coordinate, sourceId: 'ring-craft', cycle: 6 } });
    expect(documents.get('sessions/s1')?.shuttleDockings).toEqual([]);
    expect(result.summary).toMatch(/permanently|consumed/i);
    await expect(handlers.execute(request(choice, 'gm'))).resolves.toMatchObject({ ...result, status: 'replayed' });
  });
  it('commits a server loss once, retains private arithmetic, revokes vessel actions and preserves demo state', async () => {
    const reply = await handlers.execute(request(command));
    expect(reply).toMatchObject({ status: 'committed', outcome: 'lost', fuelSpent: 6 });
    expect(die).toHaveBeenCalledTimes(1);
    expect(documents.get('sessions/s1/candidateCalculationAudits/n1')).toMatchObject({ calculation: { die: 6, scouts: 2, total: 8 } });
    expect(documents.get('sessions/s1/players/admiral')?.candidateDisposition).toEqual({ code: 'O', outcome: 'lost', cycle: 6 });
    expect(documents.get('sessions/s1')).toMatchObject({ fullGameDemo: { status: 'active', progression: 'manual' },
      shipResources: { aegis: { fuel: 14 } }, shipDamage: { aegis: { destroyed: true } }, shipSurvivors: { aegis: 0 } });
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
    expect(view).toMatchObject({ edition: 'home', editionLocked: false });
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
      result: 'success', candidateCode: 'O' } });
    expect(commitTerminal.mock.calls[0]?.[3].candidate.groups[0].losses).toEqual([
      { shipId: 'aegis', reason: 'lost-in-nebula', audience: 'members' },
    ]);
    expect(survivorOutcome).toHaveBeenCalledTimes(1);
    expect(survivorOutcome.mock.calls[0]?.[0].get('shipSurvivors.aegis')).toBe(0);
    expect(commitTerminal.mock.calls[0]?.[3].survivorOutcome).toMatchObject({ type: 'survivor-outcome', finalSurvivors: 5000 });
  });
  it('writes standard private procedure evidence once and does not replace it on original-result recovery', async () => {
    await handlers.execute(request(command));
    expect(documents.get('sessions/s1/actionAudits/n1')).toMatchObject({
      action: 'candidate-nebula-jump', resolutionSource: 'server-random', outcome: 'committed',
    });
    expect(documents.get('sessions/s1/procedureAudits/n1')).toMatchObject({
      calculation: { die: 6, scouts: 2, total: 8 }, consequences: { aegis: { destroyed: true } },
    });
    const originalAudit = structuredClone(documents.get('sessions/s1/procedureAudits/n1'));
    await handlers.execute(request(command));
    expect(documents.get('sessions/s1/procedureAudits/n1')).toEqual(originalAudit);
  });
  it('commits the last all-Nebula-loss die and cost with the real immutable failure debrief helper', async () => {
    const stableLossDie = vi.fn(() => 1);
    const real = createCandidateCallables({ db, die: stableLossDie, now: () => new Date('2026-10-05T12:00:00Z'),
      requireShipAuthority, commitTerminal: commitRealTerminal, serverTimestamp: () => 'server-time',
      survivorOutcome: (session, cycle, occurredAt) => aggregateSurvivorOutcome({ cycle, occurredAt,
        activeFleetShipIds: session.get('activeVesselIds'), shipPopulations: session.get('shipSurvivors'),
        destroyedShipIds: ['aegis', 'shepherd'], escapePodCapacities: { aegis: 2500, shepherd: 5000 } }),
    });
    await real.execute(request(command));
    const lastCommand = { ...command, requestId: 'last-loss', expectedRevision: 1, shipId: 'shepherd' };
    const last = await real.execute(request(lastCommand, 'captain'));
    expect(last).toMatchObject({ outcome: 'lost', fuelSpent: 12 });
    expect(documents.get('sessions/s1')).toMatchObject({ phase: 'debrief',
      shipResources: { aegis: { fuel: 14 }, shepherd: { fuel: 8 } }, shipSurvivors: { aegis: 0, shepherd: 0 },
      gameOutcome: { result: 'failure', cause: 'total-fleet-loss' },
      debriefSnapshot: { source: 'candidate', result: 'failure', candidate: { code: 'O' } },
      survivorOutcome: { finalSurvivors: 0 }, fullGameDemo: { status: 'complete', progression: 'manual' } });
    const snapshot = structuredClone(documents.get('sessions/s1')?.debriefSnapshot);
    expect(await real.execute(request(lastCommand, 'captain'))).toEqual({ ...last, status: 'replayed' });
    expect(documents.get('sessions/s1')?.debriefSnapshot).toEqual(snapshot);
    expect(stableLossDie).toHaveBeenCalledTimes(2);
    expect(documents.get('sessions/s1/serverState/candidates')?.revision).toBe(2);
  });
});


function realPathHandlers() {
  return createCandidateCallables({ db, die, now: () => new Date('2026-10-05T12:00:00Z'),
    requireShipAuthority, commitTerminal: commitRealTerminal, serverTimestamp: () => 'server-time',
    survivorOutcome: (session, cycle, occurredAt) => aggregateSurvivorOutcome({ cycle, occurredAt,
      activeFleetShipIds: session.get('activeVesselIds'), shipPopulations: session.get('shipSurvivors'),
      destroyedShipIds: Object.entries(session.get('shipDamage') as Fields ?? {})
        .filter(([, damage]) => (damage as Fields).destroyed === true).map(([id]) => id),
      escapePodCapacities: {} }),
  });
}
it('records the actual paid Nebula path in the real terminal helper and projects only scoped vessels', async () => {
  const real = realPathHandlers();
  await real.execute(request(command));
  await real.execute(request({ ...command, requestId: 'second-path', expectedRevision: 1, shipId: 'shepherd' }, 'captain'));
  const terminal = documents.get('sessions/s1')!.debriefSnapshot;
  expect(terminal).toMatchObject({ candidate: { groups: [{ path: [
    { action: 'nebula-jump', result: 'lost', shipId: 'aegis', fuelSpent: 6, audience: 'members' },
    { action: 'nebula-jump', result: 'reached', shipId: 'shepherd', fuelSpent: 12, audience: 'members' },
  ] }] } });
  const member = sessionDebriefProjection(terminal, { groupId: 'fleet-1', vesselIds: ['shepherd'] });
  expect(member).toMatchObject({ candidate: { groups: [{ path: [
    { action: 'nebula-jump', result: 'reached', shipId: 'shepherd', fuelSpent: 12 },
  ] }] } });
  const encoded = JSON.stringify(member);
  expect(encoded).not.toMatch(/0408|sourceId|groupId|priorLosses|scouts|total|audience/);
});
it('keeps an earlier group’s committed Ring call cycle when the last group finishes later', async () => {
  const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'N')![0];
  // Prepared prior-group result; the last group’s paid attempt and real helper are executed here.
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['admiral', 'gm'] });
  put('sessions/s1/fleetGroups/fleet-2', { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['captain'] });
  documents.get('sessions/s1/players/captain')!.fleetGroupId = 'fleet-2';
  documents.get('sessions/s1')!.candidateVesselOutcomes = { shepherd: { code: 'N', groupId: 'fleet-2',
    shipId: 'shepherd', sourceId: 'earlier-cutoff-private', cycle: 3, outcome: 'crossed' } };
  put('sessions/s1/serverState/candidates', { revision: 0, sites: { [coordinate]: {
    code: 'N', groupId: 'fleet-2', coordinate, materials: 10,
    researchIds: ['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'water-production'],
    shuttleId: 'philia', repairedAt: '2026-10-05T09:00:00.000Z', sabotagedAt: '2026-10-05T09:01:00.000Z', reactors: {},
    ships: { shepherd: { type: 'candidate-action-result', status: 'committed', sessionId: 's1', requestId: 'earlier-crossing',
      revision: 1, code: 'N', action: 'ring-passage', summary: 'Ring passage committed.', outcome: 'crossed', fuelSpent: 5 } },
    completed: { type: 'candidate-group-outcome', result: 'success', candidateCode: 'N', groupId: 'fleet-2', cycle: 3,
      occurredAt: '2026-10-05T09:01:00.000Z', sourceId: 'earlier-cutoff-private', successfulShipIds: ['shepherd'], leftBehindShipIds: [] },
  } } });
  await realPathHandlers().execute(request(command));
  const oldGroup = sessionDebriefProjection(documents.get('sessions/s1')!.debriefSnapshot,
    { groupId: 'fleet-2', vesselIds: ['shepherd'] });
  expect(oldGroup).toMatchObject({ candidate: { groups: [{ humanCalls: [{ id: 'ring-far-side-sabotage', cycle: 3 }],
    path: [{ action: 'ring-repair' }, { action: 'ring-passage', fuelSpent: 5 }, { action: 'sabotage-ring' }] }] } });
  expect(JSON.stringify(oldGroup)).not.toContain('earlier-cutoff-private');
  expect(documents.get('sessions/s1')!.debriefSnapshot).toMatchObject({ cycle: 6 });
});
it('explains Ring repair paid passage and explicit cutoff through the real helper in a labeled prepared prerequisite counterexample', async () => {
  const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'N')![0];
  put('sessions/s1/serverState/navigation', { revision: 2, shipGalacticCoordinates: { aegis: coordinate, shepherd: coordinate },
    systemHistory: { aegis: { [coordinate]: { coordinate, candidateDiscovery: { id: 'prepared-ring-arrival',
      occurredAt: '2026-10-05T10:00:00.000Z', code: 'N', title: 'Ancient Jump Ring', source: 'arrival' } } } } });
  put('sessions/s1/serverState/candidates', { revision: 0, sites: { [coordinate]: { code: 'N', groupId: 'fleet-1',
    coordinate, materials: 10, researchIds: ['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'water-production'],
    shuttleId: 'philia', repairedAt: '2026-10-05T11:00:00.000Z', ships: {}, reactors: {} } } });
  const real = realPathHandlers();
  await real.execute(request({ ...command, code: 'N', coordinate, action: 'ring-passage' }));
  const sabotage = { sessionId: 's1', instanceId: 'instance1', requestId: 'cutoff-path', expectedRevision: 1,
    expectedGroupId: 'fleet-1', code: 'N', coordinate, action: 'sabotage-ring' };
  const original = await real.execute(request(sabotage, 'gm'));
  expect(documents.get('sessions/s1')!.debriefSnapshot).toMatchObject({ candidate: { code: 'N', groups: [{ path: [
    { action: 'ring-repair', result: 'completed', audience: 'members' },
    { action: 'ring-passage', result: 'crossed', shipId: 'aegis', fuelSpent: 5, audience: 'members' },
    { action: 'sabotage-ring', result: 'completed', audience: 'members' },
  ], losses: [{ shipId: 'shepherd', reason: 'left-behind' }] }] } });
  const member = sessionDebriefProjection(documents.get('sessions/s1')!.debriefSnapshot,
    { groupId: 'fleet-1', vesselIds: ['aegis', 'shepherd'] });
  expect(member).toMatchObject({ candidate: { groups: [{ humanCalls: [{ id: 'ring-far-side-sabotage', cycle: 6 }] }] } });
  expect(JSON.stringify(member)).not.toContain(sabotage.requestId);
  expect(await real.execute(request(sabotage, 'gm'))).toEqual({ ...original, status: 'replayed' });
  expect(documents.get('sessions/s1')!.shipSurvivors).toEqual({ aegis: 5000, shepherd: 5000 });
});
it('explains authoritative Station liberation unique capacity and activation in a labeled prepared liberation counterexample', async () => {
  const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'P')![0];
  const ships = ['aegis', 'dione', 'icebreaker', 'refinery-124'];
  const root = documents.get('sessions/s1')!;
  put('sessions/s1', { ...root, activeVesselIds: ships, shipUpgrades: { aegis: ['reactor'] },
    shipResources: Object.fromEntries(ships.map(id => [id, { ore: 0, fuel: 20, materials: 10, food: 10, water: 10, securityTeams: 1 }])),
    shipSurvivors: Object.fromEntries(ships.map(id => [id, 5000])), activeRoleIds: ['admiral', 'dione-captain', 'icebreaker-captain', 'refinery-124-captain'] });
  const members = ['admiral', ...ships.slice(1)];
  for (const ship of ships.slice(1)) put(`sessions/s1/players/${ship}`, { role: 'player', connected: true,
    assignedRoleId: `${ship}-captain`, seatId: `${ship}-captain`, fleetGroupId: 'fleet-1' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ships, memberUids: members });
  put('sessions/s1/serverState/navigation', { revision: 2, shipGalacticCoordinates: Object.fromEntries(ships.map(id => [id, coordinate])),
    systemHistory: { aegis: { [coordinate]: { coordinate, candidateDiscovery: { id: 'prepared-station-arrival',
      occurredAt: '2026-10-05T10:00:00.000Z', code: 'P', title: 'Ancient Space Station', source: 'arrival' } } } } });
  put('sessions/s1/serverState/candidateStationLiberations', { [`fleet-1:${coordinate}`]: {
    type: 'candidate-station-liberation', sessionId: 's1', groupId: 'fleet-1', coordinate, chart: 'A',
    sequenceId: 'wolf-p-station-prepared', sourceId: 'wolf-attack-prepared', cycle: 6,
    liberatedAt: '2026-10-05T11:00:00.000Z' } });
  const real = realPathHandlers();
  for (const [revision, ship] of ships.entries()) await real.execute(request({ ...command,
    requestId: `reactor-path-${ship}`, expectedRevision: revision, code: 'P', coordinate,
    action: 'contribute-reactor', shipId: ship }, ship === 'aegis' ? 'admiral' : ship));
  expect(documents.get('sessions/s1')!.debriefSnapshot).toMatchObject({ candidate: { code: 'P', groups: [{ path: [
    { action: 'station-liberation', result: 'completed', audience: 'members' },
    { action: 'contribute-reactor', result: 'completed', shipId: 'aegis', capacity: 6, audience: 'members' },
    { action: 'contribute-reactor', result: 'completed', shipId: 'dione', capacity: 4, audience: 'members' },
    { action: 'contribute-reactor', result: 'completed', shipId: 'icebreaker', capacity: 4, audience: 'members' },
    { action: 'contribute-reactor', result: 'completed', shipId: 'refinery-124', capacity: 4, audience: 'members' },
    { action: 'station-activation', result: 'activated', capacity: 18, audience: 'members' },
  ] }] } });
});
