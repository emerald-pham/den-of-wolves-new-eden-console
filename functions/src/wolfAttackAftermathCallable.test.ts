import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomInt } from 'node:crypto';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseWolfAttackAftermathCommand } from './wolfAttackAftermathCallable';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const data = documents.get(path);
    return { exists: data !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path),
      get: (key: string) => data?.[key], data: () => data };
  };
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [path, value] of Object.entries(fields)) {
      const parts = path.split('.');
      if (parts.length === 1) current[path] = value;
      else {
        let cursor = current;
        for (const part of parts.slice(0, -1)) {
          cursor[part] = { ...((cursor[part] as Fields | undefined) ?? {}) };
          cursor = cursor[part] as Fields;
        }
        cursor[parts.at(-1)!] = value;
      }
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update }));
  return { documents, get, set, update, db: { doc: ref, runTransaction } };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({ run: maybeHandler ?? optionsOrHandler }),
}));
vi.mock('node:crypto', () => ({ randomInt: vi.fn(() => 5) }));

import { resolveWolfAttackAftermath } from './wolfAttackAftermathCallable';

const request = (data: Fields, uid = 'doctor-uid') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, value: Fields) => mock.documents.set(path, { ...value });
const resetFixture = () => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  mock.db.runTransaction.mockClear();
  put('sessions/s-1', {
    phase: 'active', currentTurn: 7, shipSurvivors: { aegis: 2_000 },
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 } },
  });
  put('sessions/s-1/players/doctor-uid', {
    role: 'player', connected: true, replacementRoleId: 'doctor', replacementStatus: null,
    activeConsoleRoleId: null, seatId: null, escapeState: null,
  });
  put('sessions/s-1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'resolved', attackId: 'attack-7', turn: 7, revision: 10,
    currentStep: 'resolved', deadlineAt: '2026-10-04T10:00:00.000Z', memberResults: [],
    calculationReceipt: {
      type: 'wolf-combat-calculation', version: 1, requestId: 'final-7',
      phase: { turn: 7, phase: 'coordination', serverTime: '2026-10-04T09:59:00.000Z',
        deadlineAt: '2026-10-04T10:00:00.000Z', overrun: false },
      targeting: {}, ranges: [], boarding: [],
      fleetDamage: [{ target: 'aegis', amount: 1, populationBefore: 2_500, population: 2_000,
        state: { damagedSystemIds: [], destroyed: false }, draws: [{ casualty: true }] }],
      forceField: { status: 'unavailable', preventedDamage: 0 }, returningInstanceIds: [],
      survivingWolfShips: [],
    },
  });
};

function reverseMapKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseMapKeyOrder);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Fields).reverse()
    .map(([key, entry]) => [key, reverseMapKeyOrder(entry)]));
}

beforeEach(resetFixture);

describe('Wolf attack aftermath command contract', () => {
  it('accepts exact Doctor, salvage, and Scrap choices and rejects caller-owned results', () => {
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-7',
      action: 'doctor', selectedShipIds: ['aegis', 'dione'],
    })).toEqual({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-7',
      action: 'doctor', selectedShipIds: ['aegis', 'dione'],
    });
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'salvage-7', action: 'warrior-salvage',
    })?.action).toBe('warrior-salvage');
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'scrap-7', action: 'collect-scrap',
      shuttleId: 'macaw', targetShipId: 'aegis',
    })?.action).toBe('collect-scrap');
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-8', action: 'doctor',
      selectedShipIds: ['aegis'], damageDice: [6],
    })).toBeNull();
    expect(parseWolfAttackAftermathCommand({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'scrap-8', action: 'collect-scrap',
      shuttleId: 'boa', targetShipId: 'aegis', targetId: 'dione',
    })).toBeNull();
  });

  it('commits Doctor prevention against the private damage receipt and publishes only its safe result', async () => {
    await expect(resolveWolfAttackAftermath.run(request({
      sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-7',
      action: 'doctor', selectedShipIds: ['aegis'],
    }))).resolves.toEqual({ status: 'committed', sessionId: 's-1', attackId: 'attack-7',
      requestId: 'doctor-7', action: 'doctor', mitigated: [{ shipId: 'aegis', casualtiesBefore: 1,
        casualtiesAfter: 0, casualtiesPrevented: 1, foodSpent: 0, waterSpent: 0 }] });

    expect(mock.documents.get('sessions/s-1')?.shipSurvivors).toEqual({ aegis: 2_500 });
    expect(mock.documents.get('sessions/s-1')?.shipResources).toEqual({
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
    });
    const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
    expect(state.revision).toBe(11);
    expect(state.aftermath).toMatchObject({ doctor: { selectedShipIds: ['aegis'], actorUid: 'doctor-uid' } });
    expect(state.memberResults).toEqual([expect.objectContaining({
      sourceId: 'doctor-medical-aid', targetId: 'aegis', outcome: { casualtiesPrevented: 1, foodSpent: 0, waterSpent: 0 },
    })]);
    expect(mock.documents.get('sessions/s-1/wolfAttackAudience/current')?.results).toEqual([
      expect.objectContaining({ sourceId: 'doctor-medical-aid', outcome: { casualtiesPrevented: 1, foodSpent: 0, waterSpent: 0 } }),
    ]);
    expect(mock.documents.get('sessions/s-1/wolfAttackAudience/current')).not.toHaveProperty('calculationReceipt');
  });

  it('replays semantic Doctor fingerprints across map ordering but binds exact fields and array order', async () => {
    const session = mock.documents.get('sessions/s-1')!;
    (session.shipSurvivors as Fields).dione = 95_000;
    (session.shipResources as Fields).dione = { food: 9, water: 9 };
    const attack = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
    const receipt = attack.calculationReceipt as Fields;
    (receipt.fleetDamage as Fields[]).push({ target: 'dione', amount: 1, populationBefore: 100_000,
      population: 95_000, state: { damagedSystemIds: [], destroyed: false }, draws: [{ casualty: true }] });
    const command = { sessionId: 's-1', attackId: 'attack-7', requestId: 'doctor-order-7',
      action: 'doctor', selectedShipIds: ['aegis', 'dione'] };
    const first = await resolveWolfAttackAftermath.run(request(command));
    const receiptDoc = mock.documents.get('sessions/s-1/commandReceipts/doctor-order-7')!;
    receiptDoc.fingerprint = reverseMapKeyOrder(receiptDoc.fingerprint);
    mock.set.mockClear();
    mock.update.mockClear();

    await expect(resolveWolfAttackAftermath.run(request(command)))
      .resolves.toEqual({ ...first, status: 'replayed' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();

    receiptDoc.fingerprint = { ...(receiptDoc.fingerprint as Fields), extraAuthority: true };
    await expect(resolveWolfAttackAftermath.run(request(command)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();

    const reorderedFingerprint = reverseMapKeyOrder(receiptDoc.fingerprint) as Fields;
    delete reorderedFingerprint.extraAuthority;
    const payload = reorderedFingerprint.payload as Fields;
    receiptDoc.fingerprint = { ...reorderedFingerprint, payload: { ...payload, selectedShipIds: ['dione', 'aegis'] } };
    await expect(resolveWolfAttackAftermath.run(request(command)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('denies Doctor commands from another role without mutating results or stores', async () => {
    mock.documents.get('sessions/s-1/players/doctor-uid')!.replacementRoleId = 'commissar';
    await expect(resolveWolfAttackAftermath.run(request({ sessionId: 's-1', attackId: 'attack-7',
      requestId: 'doctor-denied', action: 'doctor', selectedShipIds: ['aegis'] })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  });

  it('rolls Warrior salvage dice only for damage in committed receipts and privately audits the faces', async () => {
    const session = mock.documents.get('sessions/s-1')!;
    session.activeVesselIds = ['aegis'];
    session.smallShipStates = { warrior: { id: 'warrior', hostShipId: 'aegis', dockingRevision: 1,
      population: 2_000, unrest: 0, cycle: { step: 5, revision: 1, results: {}, charges: ['salvage-drones'], turn: 7,
        rationBonus: 0, chargingSkipped: false } } };
    const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
    (state.calculationReceipt as Fields).ranges = [{ damageByInstance: { 'wolf-1': 1 } }];
    state.memberResults = [{ status: 'committed', range: 'long', sourceId: 'pdf-fighter-ace', targetId: '0:wolf',
      bearing: null, contactReference: 'Wolf ship', effect: 'Fighter Ace attack hit',
      outcome: { damage: 1 }, serverTime: '2026-10-04T09:58:00.000Z' }];
    put('sessions/s-1/players/warrior-uid', { role: 'player', connected: true,
      replacementRoleId: 'warrior-captain', replacementStatus: null, activeConsoleRoleId: null, seatId: null });

  await expect(resolveWolfAttackAftermath.run(request({ sessionId: 's-1', attackId: 'attack-7',
      requestId: 'salvage-7', action: 'warrior-salvage' }, 'warrior-uid'))).resolves.toEqual({
      status: 'committed', sessionId: 's-1', attackId: 'attack-7', requestId: 'salvage-7', action: 'warrior-salvage',
      materialsGained: 3, damageDice: [6, 6, 6],
    });
    expect((mock.documents.get('sessions/s-1')?.shipResources as Fields).aegis).toMatchObject({ materials: 4 });
    const updatedState = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
    expect(updatedState.memberResults).toEqual([expect.objectContaining({ sourceId: 'pdf-fighter-ace', outcome: { damage: 1 } }),
      expect.objectContaining({ sourceId: 'warrior-salvage-drones', outcome: { materialsGained: 3 } })]);
    expect(updatedState.aftermath).toMatchObject({ warriorSalvage: { hostShipId: 'aegis', damageDice: [6, 6, 6] } });
    expect(mock.documents.get('sessions/s-1/wolfAttackAudience/current')?.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'warrior-salvage-drones', outcome: { materialsGained: 3 } }),
    ]));
  });

  it('rechecks current role and attack before replaying a resolved-action receipt', async () => {
    const session = mock.documents.get('sessions/s-1')!;
    session.activeVesselIds = ['aegis'];
    session.smallShipStates = { warrior: { id: 'warrior', hostShipId: 'aegis', dockingRevision: 1,
      population: 2_000, unrest: 0, cycle: { step: 5, revision: 1, results: {}, charges: ['salvage-drones'], turn: 7,
        rationBonus: 0, chargingSkipped: false } } };
    put('sessions/s-1/players/warrior-uid', { role: 'player', connected: true,
      replacementRoleId: 'warrior-captain', replacementStatus: null, activeConsoleRoleId: null, seatId: null });
    const command = { sessionId: 's-1', attackId: 'attack-7', requestId: 'warrior-replay-7', action: 'warrior-salvage' };
    vi.mocked(randomInt).mockClear();

    const first = await resolveWolfAttackAftermath.run(request(command, 'warrior-uid'));
    expect(first).toMatchObject({ status: 'committed', materialsGained: 1 });
    expect(randomInt).toHaveBeenCalledTimes(1);
    const materialsAfterCommit = (mock.documents.get('sessions/s-1')?.shipResources as Fields).aegis;
    const writesAfterCommit = mock.set.mock.calls.length + mock.update.mock.calls.length;
    vi.mocked(randomInt).mockClear();
    mock.set.mockClear();
    mock.update.mockClear();

    await expect(resolveWolfAttackAftermath.run(request(command, 'warrior-uid')))
      .resolves.toEqual({ ...first, status: 'replayed' });
    expect((mock.documents.get('sessions/s-1')?.shipResources as Fields).aegis).toEqual(materialsAfterCommit);
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(randomInt).not.toHaveBeenCalled();
    expect(writesAfterCommit).toBeGreaterThan(0);

    mock.documents.get('sessions/s-1/players/warrior-uid')!.replacementRoleId = 'doctor';
    await expect(resolveWolfAttackAftermath.run(request(command, 'warrior-uid')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(randomInt).not.toHaveBeenCalled();

    mock.documents.get('sessions/s-1/players/warrior-uid')!.replacementRoleId = 'warrior-captain';
    session.currentTurn = 8;
    const attack = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
    attack.attackId = 'attack-8';
    attack.turn = 8;
    attack.status = 'declared';
    await expect(resolveWolfAttackAftermath.run(request(command, 'warrior-uid')))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(randomInt).not.toHaveBeenCalled();
  });

  it('requires the current shuttle holder before replaying a Scrap receipt', async () => {
    const session = mock.documents.get('sessions/s-1')!;
    session.activeVesselIds = ['aegis', 'capybara'];
    session.capybaraEnabled = true;
    session.shuttleDockings = [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'fixture' }];
    session.shuttleControl = { macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain',
      ownerUid: 'macaw-uid', holderUid: 'macaw-uid', revision: 0 } };
    session.shuttleCargo = {};
    const attack = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
    (attack.calculationReceipt as Fields).fleetDamage = [{ target: 'aegis', amount: 3, populationBefore: 2_500,
      population: 1_000, state: { damagedSystemIds: [], destroyed: false },
      draws: [{ casualty: true }, { casualty: true }, { casualty: true }] }];
    put('sessions/s-1/players/macaw-uid', { role: 'player', connected: true, assignedRoleId: 'capybara-captain',
      activeConsoleRoleId: 'capybara-captain', replacementRoleId: null, replacementStatus: null,
      escapeState: null, fleetGroupId: 'fleet-1' });
    put('sessions/s-1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis', 'capybara'], memberUids: ['macaw-uid'] });
    const command = { sessionId: 's-1', attackId: 'attack-7', requestId: 'macaw-replay-7', action: 'collect-scrap',
      shuttleId: 'macaw', targetShipId: 'aegis' };
    await expect(resolveWolfAttackAftermath.run(request(command, 'macaw-uid')))
      .resolves.toMatchObject({ status: 'committed', scrapGained: 1 });

    ((session.shuttleControl as Fields).macaw as Fields).holderUid = 'another-player';
    mock.set.mockClear();
    mock.update.mockClear();
    await expect(resolveWolfAttackAftermath.run(request(command, 'macaw-uid')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('collects a qualifying attack Scrap opportunity once into the currently docked shuttle cargo', async () => {
    const session = mock.documents.get('sessions/s-1')!;
    session.activeVesselIds = ['aegis', 'capybara'];
    session.capybaraEnabled = true;
    session.shuttleDockings = [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'fixture' }];
    session.shuttleControl = { macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain',
      ownerUid: 'macaw-uid', holderUid: 'macaw-uid', revision: 0 } };
    session.shuttleCargo = {};
    const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
    (state.calculationReceipt as Fields).fleetDamage = [{ target: 'aegis', amount: 3, populationBefore: 2_500,
      population: 2_000, state: { damagedSystemIds: [], destroyed: false },
      draws: [{ casualty: false }, { casualty: true }, { casualty: false }] }];
    put('sessions/s-1/players/macaw-uid', { role: 'player', connected: true, assignedRoleId: 'capybara-captain',
      activeConsoleRoleId: 'capybara-captain', replacementRoleId: null, replacementStatus: null,
      escapeState: null, fleetGroupId: 'fleet-1' });
    put('sessions/s-1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis', 'capybara'], memberUids: ['macaw-uid'] });
    const command = { sessionId: 's-1', attackId: 'attack-7', requestId: 'scrap-7', action: 'collect-scrap',
      shuttleId: 'macaw', targetShipId: 'aegis' };

    await expect(resolveWolfAttackAftermath.run(request(command, 'macaw-uid'))).resolves.toMatchObject({
      status: 'committed', action: 'collect-scrap', scrapGained: 1,
    });
    expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({ macaw: { scrap: 1 } });
    const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
    await expect(resolveWolfAttackAftermath.run(request(command, 'macaw-uid'))).resolves.toMatchObject({ status: 'replayed' });
    expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({ macaw: { scrap: 1 } });
    expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  });

  it('allows the active Boa Recycler console to collect its current Scrap opportunity', async () => {
    const session = mock.documents.get('sessions/s-1')!;
    session.activeVesselIds = ['aegis', 'capybara'];
    session.capybaraEnabled = true;
    session.shuttleDockings = [{ shuttleId: 'boa', shipId: 'aegis', dockedAt: 'fixture' }];
    session.shuttleControl = { boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler',
      ownerUid: 'boa-uid', holderUid: 'boa-uid', revision: 0 } };
    session.shuttleCargo = { boa: { scrap: 0 } };
    const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
    (state.calculationReceipt as Fields).fleetDamage = [{ target: 'aegis', amount: 3, populationBefore: 2_500,
      population: 2_000, state: { damagedSystemIds: [], destroyed: false },
      draws: [{ casualty: false }, { casualty: true }, { casualty: false }] }];
    put('sessions/s-1/players/boa-uid', { role: 'player', connected: true, assignedRoleId: 'capybara-recycler',
      replacementRoleId: null, activeConsoleRoleId: 'capybara-recycler', replacementStatus: null,
      escapeState: null, fleetGroupId: 'fleet-1' });
    put('sessions/s-1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis', 'capybara'], memberUids: ['boa-uid'] });

    await expect(resolveWolfAttackAftermath.run(request({ sessionId: 's-1', attackId: 'attack-7',
      requestId: 'boa-scrap-7', action: 'collect-scrap', shuttleId: 'boa', targetShipId: 'aegis' }, 'boa-uid')))
      .resolves.toMatchObject({ status: 'committed', action: 'collect-scrap', shuttleId: 'boa', scrapGained: 1 });
    expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({ boa: { scrap: 1 } });
  });
  describe('eligible attack Scrap pickups', () => {
    const scrapFixture = (options: Readonly<{
      fleetDamage: Fields[]; dockings?: Fields[]; retained?: Fields; activeVesselIds?: string[];
      candidateVesselOutcomes?: Fields;
    }>) => {
      const session = mock.documents.get('sessions/s-1')!;
      const vessels = options.activeVesselIds ?? ['aegis', 'capybara'];
      session.activeVesselIds = vessels;
      session.capybaraEnabled = true;
      session.shuttleDockings = options.dockings ?? [];
      if (options.retained) session.retainedShuttles = options.retained;
      if (options.candidateVesselOutcomes) session.candidateVesselOutcomes = options.candidateVesselOutcomes;
      session.shuttleControl = { macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain',
        ownerUid: 'macaw-uid', holderUid: 'macaw-uid', revision: 2 } };
      session.shuttleCargo = {};
      const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
      (state.calculationReceipt as Fields).fleetDamage = options.fleetDamage;
      put('sessions/s-1/players/macaw-uid', { role: 'player', connected: true, assignedRoleId: 'capybara-captain',
        activeConsoleRoleId: 'capybara-captain', replacementRoleId: null, replacementStatus: null,
        escapeState: null, fleetGroupId: 'fleet-1' });
      put('sessions/s-1/players/intruder-uid', { role: 'player', connected: true, assignedRoleId: 'capybara-captain',
        activeConsoleRoleId: 'capybara-captain', replacementRoleId: null, replacementStatus: null,
        escapeState: null, fleetGroupId: 'fleet-1' });
      put('sessions/s-1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: vessels,
        memberUids: ['macaw-uid', 'intruder-uid'] });
    };
    const destroyedAt = (target: string, amount: number): Fields => ({ target, amount, populationBefore: 2_500,
      population: 2_000, state: { damagedSystemIds: ['reactor'], destroyed: true },
      draws: [{ casualty: false }, { casualty: true }, { casualty: false }] });
    const liveAt = (target: string, amount: number): Fields => ({ target, amount, populationBefore: 2_500,
      population: 2_000, state: { damagedSystemIds: [], destroyed: false },
      draws: Array.from({ length: amount }, () => ({ casualty: false })) });
    const retainedFrom = (hostShipId: string, controlRevision = 2): Fields => ({ macaw: { status: 'retained',
      shuttleId: 'macaw', ownerRoleId: 'capybara-captain', holderUid: 'macaw-uid', destroyedHostShipId: hostShipId,
      controlRevision, retainedAt: '2026-10-04T09:59:00.000Z' } });
    const collect = (requestId: string, targetShipId = 'aegis') => ({ sessionId: 's-1', attackId: 'attack-7',
      requestId, action: 'collect-scrap', shuttleId: 'macaw', targetShipId });
    const expectNoWrites = () => {
      expect(mock.set).not.toHaveBeenCalled();
      expect(mock.update).not.toHaveBeenCalled();
    };

    it('lets the shuttle retained from a ship destroyed at the 3-damage threshold collect its one Scrap', async () => {
      scrapFixture({ fleetDamage: [destroyedAt('aegis', 3)], retained: retainedFrom('aegis') });

      await expect(resolveWolfAttackAftermath.run(request(collect('destroyed-scrap-7'), 'macaw-uid')))
        .resolves.toMatchObject({ status: 'committed', action: 'collect-scrap', shuttleId: 'macaw',
          targetShipId: 'aegis', scrapGained: 1 });
      expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({ macaw: { scrap: 1 } });
      const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
      expect((state.aftermath as Fields).scrapClaims).toEqual({ aegis: expect.objectContaining({
        shuttleId: 'macaw', actorUid: 'macaw-uid', requestId: 'destroyed-scrap-7', scrap: 1 }) });
      const audience = mock.documents.get('sessions/s-1/wolfAttackAudience/current')!;
      expect(JSON.stringify(audience)).not.toContain('macaw-uid');

      const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
      await expect(resolveWolfAttackAftermath.run(request(collect('destroyed-scrap-7'), 'macaw-uid')))
        .resolves.toMatchObject({ status: 'replayed', scrapGained: 1 });
      expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({ macaw: { scrap: 1 } });
      expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
    });

    it('denies the destroyed-host pickup to a player who does not hold the retained shuttle', async () => {
      scrapFixture({ fleetDamage: [destroyedAt('aegis', 3)], retained: retainedFrom('aegis') });

      await expect(resolveWolfAttackAftermath.run(request(collect('intruder-scrap-7'), 'intruder-uid')))
        .rejects.toMatchObject({ code: 'permission-denied' });
      expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({});
      expectNoWrites();
    });

    it('does not let a retained shuttle claim the Scrap of a different destroyed ship', async () => {
      scrapFixture({ activeVesselIds: ['aegis', 'dione', 'capybara'], fleetDamage: [destroyedAt('aegis', 3)],
        retained: retainedFrom('dione') });

      await expect(resolveWolfAttackAftermath.run(request(collect('unbound-scrap-7'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({});
      expectNoWrites();
    });

    it('does not honour retained custody recorded under an earlier shuttle control revision', async () => {
      scrapFixture({ fleetDamage: [destroyedAt('aegis', 3)], retained: retainedFrom('aegis', 1) });

      await expect(resolveWolfAttackAftermath.run(request(collect('stale-retained-scrap-7'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expectNoWrites();
    });

    it('creates no pickup for a destroyed ship that took fewer than three attack damage', async () => {
      scrapFixture({ fleetDamage: [destroyedAt('aegis', 2)], retained: retainedFrom('aegis') });

      await expect(resolveWolfAttackAftermath.run(request(collect('below-threshold-scrap-7'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expectNoWrites();
    });

    it('creates no pickup for a live ship that took fewer than three attack damage', async () => {
      scrapFixture({ fleetDamage: [liveAt('aegis', 2)],
        dockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'fixture' }] });

      await expect(resolveWolfAttackAftermath.run(request(collect('live-below-threshold-7'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expectNoWrites();
    });

    it('does not let a retained shuttle collect from a live ship it is not docked at', async () => {
      scrapFixture({ activeVesselIds: ['aegis', 'dione', 'capybara'],
        fleetDamage: [liveAt('aegis', 3), destroyedAt('dione', 4)], retained: retainedFrom('dione') });

      await expect(resolveWolfAttackAftermath.run(request(collect('retained-live-scrap-7'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expectNoWrites();
    });

    it('blocks a fresh pickup when the Capybara has a committed candidate disposition', async () => {
      scrapFixture({ fleetDamage: [liveAt('aegis', 3)],
        dockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'fixture' }],
        candidateVesselOutcomes: { capybara: { code: 'N', groupId: 'fleet-1', shipId: 'capybara',
          sourceId: 'source-1', cycle: 1, outcome: 'lost' } } });

      await expect(resolveWolfAttackAftermath.run(request(collect('settled-capybara-scrap-7'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({});
      expectNoWrites();
    });

    it('blocks a fresh pickup from a target with a committed candidate disposition', async () => {
      scrapFixture({ fleetDamage: [liveAt('aegis', 3)],
        dockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'fixture' }],
        candidateVesselOutcomes: { aegis: { code: 'N', groupId: 'fleet-1', shipId: 'aegis',
          sourceId: 'source-1', cycle: 1, outcome: 'settled' } } });

      await expect(resolveWolfAttackAftermath.run(request(collect('settled-target-scrap-7'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(mock.documents.get('sessions/s-1')?.shuttleCargo).toEqual({});
      expectNoWrites();
    });
  });

  describe('collecting an attack Scrap pickup once', () => {
    const live = (target: string, amount: number): Fields => ({ target, amount, populationBefore: 2_500,
      population: 2_000, state: { damagedSystemIds: [], destroyed: false },
      draws: Array.from({ length: amount }, () => ({ casualty: false })) });
    const operator = (uid: string, roleId: 'capybara-captain' | 'capybara-recycler') => put(`sessions/s-1/players/${uid}`, {
      role: 'player', connected: true, assignedRoleId: roleId, activeConsoleRoleId: roleId,
      replacementRoleId: null, replacementStatus: null, escapeState: null, fleetGroupId: 'fleet-1' });
    const fixture = (fleetDamage: Fields[]) => {
      const session = mock.documents.get('sessions/s-1')!;
      session.activeVesselIds = ['aegis', 'dione', 'capybara'];
      session.capybaraEnabled = true;
      session.shuttleDockings = [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'fixture' },
        { shuttleId: 'boa', shipId: 'aegis', dockedAt: 'fixture' }];
      session.shuttleControl = {
        macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'macaw-uid', holderUid: 'macaw-uid', revision: 0 },
        boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'boa-uid', holderUid: 'boa-uid', revision: 0 },
      };
      session.shuttleCargo = {};
      const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
      (state.calculationReceipt as Fields).fleetDamage = fleetDamage;
      operator('macaw-uid', 'capybara-captain');
      operator('boa-uid', 'capybara-recycler');
      put('sessions/s-1/players/outsider-uid', { role: 'player', connected: true, assignedRoleId: 'capybara-captain',
        activeConsoleRoleId: 'capybara-captain', replacementRoleId: null, replacementStatus: null,
        escapeState: null, fleetGroupId: 'fleet-1' });
      put('sessions/s-1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis', 'dione', 'capybara'],
        memberUids: ['macaw-uid', 'boa-uid', 'outsider-uid'] });
    };
    const collect = (requestId: string, fields: Fields = {}) => ({ sessionId: 's-1', attackId: 'attack-7', requestId,
      action: 'collect-scrap', shuttleId: 'macaw', targetShipId: 'aegis', ...fields });
    const cargo = () => mock.documents.get('sessions/s-1')?.shuttleCargo;
    const writeCount = () => mock.set.mock.calls.length + mock.update.mock.calls.length;
    /** The next declaration archives attack-7 and carries its uncollected pickups (see declaration tests). */
    const laterAttack = (pickups: Fields) => {
      const session = mock.documents.get('sessions/s-1')!;
      session.currentTurn = 8;
      session.attackScrapPickups = pickups;
      const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
      Object.assign(state, { attackId: 'attack-8', turn: 8, status: 'declared', currentStep: 'targeting',
        revision: 1, aftermath: undefined, memberResults: [] });
      delete state.aftermath;
    };
    /** The later attack resolves and releases the fleet, so shuttles may move again. */
    const releaseLaterAttack = () => {
      Object.assign(mock.documents.get('sessions/s-1/wolfAttackState/current')!, {
        status: 'resolved', currentStep: 'resolved', airspaceLocked: false,
        parkingReleaseCondition: 'normal-movement-reopened' });
    };

    it('blocks a carried pickup while a later attack holds the fleet, then allows it once released', async () => {
      fixture([live('aegis', 3)]);
      laterAttack({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });
      mock.set.mockClear();
      mock.update.mockClear();

      await expect(resolveWolfAttackAftermath.run(request(collect('carried-mid-attack'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      Object.assign(mock.documents.get('sessions/s-1/wolfAttackState/current')!, {
        status: 'resolved', currentStep: 'resolved', airspaceLocked: true });
      await expect(resolveWolfAttackAftermath.run(request(collect('carried-locked-aftermath'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(cargo()).toEqual({});
      expect(writeCount()).toBe(0);

      releaseLaterAttack();
      await expect(resolveWolfAttackAftermath.run(request(collect('carried-after-release'), 'macaw-uid')))
        .resolves.toMatchObject({ status: 'committed', attackId: 'attack-7', scrapGained: 1 });
      expect(cargo()).toEqual({ macaw: { scrap: 1 } });
    });

    it('lets a competing second request for the same pickup fail without adding stock', async () => {
      fixture([live('aegis', 3)]);
      await expect(resolveWolfAttackAftermath.run(request(collect('macaw-first'), 'macaw-uid')))
        .resolves.toMatchObject({ status: 'committed', scrapGained: 1 });
      const writes = writeCount();

      await expect(resolveWolfAttackAftermath.run(request(collect('boa-second', { shuttleId: 'boa' }), 'boa-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      await expect(resolveWolfAttackAftermath.run(request(collect('macaw-second'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(cargo()).toEqual({ macaw: { scrap: 1 } });
      expect(writeCount()).toBe(writes);
    });

    it('keeps the current attack pickup collectible after the cycle advances', async () => {
      fixture([live('aegis', 3)]);
      mock.documents.get('sessions/s-1')!.currentTurn = 8;

      await expect(resolveWolfAttackAftermath.run(request(collect('next-cycle-scrap'), 'macaw-uid')))
        .resolves.toMatchObject({ status: 'committed', attackId: 'attack-7', scrapGained: 1 });
      expect(cargo()).toEqual({ macaw: { scrap: 1 } });
    });

    it('collects a pickup carried past a later attack exactly once and leaves the later attack separate', async () => {
      fixture([live('aegis', 3)]);
      laterAttack({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });
      releaseLaterAttack();

      const first = await resolveWolfAttackAftermath.run(request(collect('carried-scrap'), 'macaw-uid'));
      expect(first).toEqual({ status: 'committed', sessionId: 's-1', attackId: 'attack-7',
        requestId: 'carried-scrap', action: 'collect-scrap', targetShipId: 'aegis', shuttleId: 'macaw', scrapGained: 1 });
      expect(cargo()).toEqual({ macaw: { scrap: 1 } });
      expect(mock.documents.get('sessions/s-1')).not.toHaveProperty('attackScrapPickups.aegis');
      const laterState = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
      expect(laterState).toMatchObject({ attackId: 'attack-8', status: 'resolved', revision: 1 });
      expect(laterState).not.toHaveProperty('aftermath');
      const writes = writeCount();

      await expect(resolveWolfAttackAftermath.run(request(collect('carried-scrap'), 'macaw-uid')))
        .resolves.toEqual({ ...first, status: 'replayed' });
      await expect(resolveWolfAttackAftermath.run(request(collect('carried-scrap-again', { shuttleId: 'boa' }), 'boa-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(cargo()).toEqual({ macaw: { scrap: 1 } });
      expect(writeCount()).toBe(writes);
    });

    it('keeps an earlier carried pickup and a later attack pickup for the same ship distinct', async () => {
      fixture([live('aegis', 3)]);
      laterAttack({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });
      const state = mock.documents.get('sessions/s-1/wolfAttackState/current')!;
      Object.assign(state, { status: 'resolved', currentStep: 'resolved', revision: 9 });

      await expect(resolveWolfAttackAftermath.run(request(collect('later-attack-scrap', { attackId: 'attack-8' }), 'macaw-uid')))
        .resolves.toMatchObject({ status: 'committed', attackId: 'attack-8' });
      releaseLaterAttack();
      await expect(resolveWolfAttackAftermath.run(request(collect('earlier-attack-scrap', { shuttleId: 'boa' }), 'boa-uid')))
        .resolves.toMatchObject({ status: 'committed', attackId: 'attack-7', shuttleId: 'boa' });
      expect(cargo()).toEqual({ macaw: { scrap: 1 }, boa: { scrap: 1 } });
      await expect(resolveWolfAttackAftermath.run(request(collect('later-attack-again', { attackId: 'attack-8',
        shuttleId: 'boa' }), 'boa-uid'))).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(cargo()).toEqual({ macaw: { scrap: 1 }, boa: { scrap: 1 } });
    });

    it('denies a carried pickup to a player who does not hold the shuttle and writes nothing', async () => {
      fixture([live('aegis', 3)]);
      laterAttack({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });
      mock.set.mockClear();
      mock.update.mockClear();

      await expect(resolveWolfAttackAftermath.run(request(collect('outsider-scrap'), 'outsider-uid')))
        .rejects.toMatchObject({ code: 'permission-denied' });
      expect(mock.documents.get('sessions/s-1')?.attackScrapPickups)
        .toEqual({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });
      expect(cargo()).toEqual({});
      expect(writeCount()).toBe(0);
    });

    it('rejects a carried pickup that is not pending or not reachable from the shuttle', async () => {
      fixture([live('aegis', 3)]);
      laterAttack({ dione: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });
      mock.set.mockClear();
      mock.update.mockClear();

      await expect(resolveWolfAttackAftermath.run(request(collect('not-pending-scrap'), 'macaw-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      await expect(resolveWolfAttackAftermath.run(request(collect('unreachable-scrap', { targetShipId: 'dione' }),
        'macaw-uid'))).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(cargo()).toEqual({});
      expect(writeCount()).toBe(0);
    });

    /** The ship was destroyed after its attack: the Macaw it hosted is retained, the Boa elsewhere. */
    const destroyAfterAttack = () => {
      const session = mock.documents.get('sessions/s-1')!;
      session.shipDamage = { aegis: { damagedSystemIds: [], destroyed: true } };
      session.shuttleDockings = [{ shuttleId: 'boa', shipId: 'capybara', dockedAt: 'fixture' }];
      session.retainedShuttles = { macaw: { status: 'retained', shuttleId: 'macaw', ownerRoleId: 'capybara-captain',
        holderUid: 'macaw-uid', destroyedHostShipId: 'aegis', controlRevision: 0,
        retainedAt: '2026-11-05T10:00:00.000Z' } };
    };

    it('makes a carried pickup on a ship destroyed later collectable only by the shuttle retained from it', async () => {
      fixture([live('aegis', 3)]);
      laterAttack({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });
      releaseLaterAttack();
      destroyAfterAttack();
      mock.documents.get('sessions/s-1')!.shuttleDockings = [{ shuttleId: 'boa', shipId: 'aegis', dockedAt: 'fixture' }];

      await expect(resolveWolfAttackAftermath.run(request(collect('docked-at-wreck', { shuttleId: 'boa' }), 'boa-uid')))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(cargo()).toEqual({});

      mock.documents.get('sessions/s-1')!.shuttleDockings = [{ shuttleId: 'boa', shipId: 'capybara', dockedAt: 'fixture' }];
      await expect(resolveWolfAttackAftermath.run(request(collect('retained-from-wreck'), 'macaw-uid')))
        .resolves.toMatchObject({ status: 'committed', attackId: 'attack-7', shuttleId: 'macaw', scrapGained: 1 });
      expect(cargo()).toEqual({ macaw: { scrap: 1 } });
      expect(mock.documents.get('sessions/s-1')).not.toHaveProperty('attackScrapPickups.aegis');
    });

    it('applies the same destroyed-ship custody to the current attack pickup', async () => {
      fixture([live('aegis', 3)]);
      destroyAfterAttack();

      await expect(resolveWolfAttackAftermath.run(request(collect('current-retained-wreck'), 'macaw-uid')))
        .resolves.toMatchObject({ status: 'committed', attackId: 'attack-7', shuttleId: 'macaw', scrapGained: 1 });
      expect(cargo()).toEqual({ macaw: { scrap: 1 } });
    });

    it('replays a current-attack receipt after that attack is carried past without crediting again', async () => {
      fixture([live('aegis', 3)]);
      const first = await resolveWolfAttackAftermath.run(request(collect('before-archive'), 'macaw-uid'));
      laterAttack({});
      const writes = writeCount();

      await expect(resolveWolfAttackAftermath.run(request(collect('before-archive'), 'macaw-uid')))
        .resolves.toEqual({ ...first, status: 'replayed' });
      expect(cargo()).toEqual({ macaw: { scrap: 1 } });
      expect(writeCount()).toBe(writes);
    });
  });
});
