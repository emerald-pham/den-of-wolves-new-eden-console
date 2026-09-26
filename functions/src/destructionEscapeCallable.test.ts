import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  damage: {} as Record<string, unknown>,
  players: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  randomInt: vi.fn(() => 0),
  update: vi.fn(),
  set: vi.fn(),
  receipts: new Map<string, Record<string, unknown>>(),
}));

vi.mock('node:crypto', () => ({ randomInt: mock.randomInt, randomUUID: vi.fn(() => 'damage-event') }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: async (ref: string) => {
        if (ref.includes('/actionAudits/')) return snapshot({}, ref, false);
        if (ref.includes('/commandReceipts/')) {
          const fields = mock.receipts.get(ref);
          return snapshot(fields ?? {}, ref, fields !== undefined);
        }
        if (ref.includes('/private/shipConsoleWriteGrant')) {
          return snapshot({
            type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge',
            uid: 'gm-1', shipId: 'aegis',
          }, ref);
        }
        if (ref === 'sessions/s1/players') {
          return { exists: true, docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
        }
        if (ref.includes('/players/')) return snapshot({ role: 'gm', connected: true }, ref);
        if (ref.includes('/gmInstances/')) return snapshot({
          uid: 'gm-1', connected: true, lastSeenAt: new Date(),
        }, ref);
        if (ref.includes('/damageDraws/')) return snapshot({}, ref, false);
        return snapshot({
          activeVesselIds: ['aegis'],
          shuttleDockings: [],
          shuttleControl: {},
          shipDamage: mock.damage,
          shipSurvivors: { aegis: 1000 },
          shipUnrest: { aegis: 0 },
          phase: 'active',
          currentTurn: 0,
        }, ref);
      },
      update: (ref: string, fields: Record<string, unknown>) => mock.update(ref, fields),
      set: (ref: string, fields: Record<string, unknown>) => {
        mock.set(ref, fields);
        if (ref.includes('/commandReceipts/')) mock.receipts.set(ref, fields);
      },
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { addShipDamage } from './index';
import { SHIP_DAMAGE_DECKS } from './shipDamage';

function snapshot(fields: Record<string, unknown>, path: string, exists = true) {
  return {
    exists,
    id: path.split('/').at(-1),
    ref: { path },
    get: (field: string) => fields[field],
  };
}

function request(data: Record<string, unknown>) {
  return { data, auth: { uid: 'gm-1' } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.damage = { aegis: { damagedSystemIds: SHIP_DAMAGE_DECKS.aegis.map(card => card.systemId), destroyed: false } };
  mock.players = [
    {
      id: 'player-1',
      fields: {
        role: 'player', connected: true, assignedRoleId: 'admiral',
        activeConsoleRoleId: 'admiral', seatId: 'admiral',
      },
    },
    {
      id: 'player-2',
      fields: {
        role: 'player', connected: true, assignedRoleId: 'dione-captain',
        activeConsoleRoleId: 'dione-captain', seatId: 'dione-captain',
      },
    },
    {
      id: 'player-mixed-authority',
      fields: {
        role: 'player', connected: true, assignedRoleId: 'admiral',
        activeConsoleRoleId: 'dione-captain', seatId: 'admiral',
      },
    },
  ];
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(0);
  mock.update.mockReset();
  mock.set.mockReset();
  mock.receipts.clear();
});

it('marks authoritative holders of the destroyed ship and revokes their console authority atomically', async () => {
  await expect(addShipDamage.run(request({
    sessionId: 's1', shipId: 'aegis', instanceId: 'bridge',
    requestId: 'destroy-aegis', expectedRevision: 0,
  }))).resolves.toMatchObject({ destroyed: true, revision: 1 });

  expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'sessions/s1/players/player-1' }), {
    escapeState: {
      status: 'pending', shipId: 'aegis', destructionEventId: 'damage-destroyed-aegis', revision: 1,
    },
    activeConsoleRoleId: null,
  });
  expect(mock.update).not.toHaveBeenCalledWith(expect.objectContaining({ path: 'sessions/s1/players/player-2' }), expect.anything());
  expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'sessions/s1/players/player-mixed-authority' }), {
    escapeState: {
      status: 'pending', shipId: 'aegis', destructionEventId: 'damage-destroyed-aegis', revision: 1,
    },
    activeConsoleRoleId: null,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    phase: 'failure',
    gameOutcome: expect.objectContaining({ cause: 'total-fleet-loss', cycle: 0 }),
  }));
});
