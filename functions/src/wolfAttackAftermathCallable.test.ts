import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
