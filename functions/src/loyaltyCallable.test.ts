import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  session: { phase: 'casting', configurationLocked: false, setupRevision: 2 },
  actor: { connected: true, role: 'gm' },
  target: { connected: true, role: 'player' },
  partner: { connected: true, role: 'player' },
  instance: { uid: 'u1' },
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({ path }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get,
      update: mock.update,
      set: mock.set,
      delete: vi.fn(),
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => new Date('2026-09-07T12:00:00.000Z') },
}));

import { assignLoyalty, revealAndroidProof } from './index';

function snapshot(fields: Record<string, unknown>, path: string, exists = true) {
  return { exists, ref: { path }, get: (field: string) => fields[field] };
}

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/u2') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/players/u3') return snapshot(mock.partner, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    return snapshot({}, ref.path, false);
  });
});

it('writes Android loyalty only to the target secret and leaves the assignment event redacted', async () => {
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'loyalty-1',
    targetUid: 'u2', kind: 'android', suspicion: null,
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] });

  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
    expect.objectContaining({
      visibleToUids: ['u2'],
      payload: { type: 'loyalty', kind: 'android', suspicion: null },
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/events/loyalty-1' }),
    expect.objectContaining({ type: 'loyalty-assignment' }),
  );
  const eventWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/events/loyalty-1')?.[1];
  expect(JSON.stringify(eventWrite)).not.toContain('android');
});

it('pairs Friends by writing reciprocal private records and rejects malformed suspicion', async () => {
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'loyalty-2',
    targetUid: 'u2', kind: 'friend', suspicion: 0, partnerUid: 'u3',
  }))).resolves.toMatchObject({ assignedUids: ['u2', 'u3'] });
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u3' }),
    expect.objectContaining({ visibleToUids: ['u3'] }),
  );

  mock.set.mockClear();
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'loyalty-3',
    targetUid: 'u2', kind: 'fleet-loyalist', suspicion: 4,
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('allows only the Android holder to disclose proof and makes the disclosure auditable', async () => {
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1/secrets/loyalty-u2') {
      return snapshot({ payload: { type: 'loyalty', kind: 'android', suspicion: null } }, ref.path);
    }
    if (ref.path === 'sessions/s1/events/android-1') return snapshot({}, ref.path, false);
    return snapshot({}, ref.path, false);
  });
  await expect(revealAndroidProof.run(request({
    sessionId: 's1', requestId: 'android-1',
  }, 'u2'))).resolves.toEqual({ disclosed: true });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
    { payload: { type: 'loyalty', kind: 'android', suspicion: null, proofRevealed: true } },
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/events/android-1' }),
    expect.objectContaining({ type: 'android-proof-disclosed', actorUid: 'u2' }),
  );
});

it('denies proof disclosure when the private card is not Android', async () => {
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1/secrets/loyalty-u2') {
      return snapshot({ payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } }, ref.path);
    }
    return snapshot({}, ref.path, false);
  });
  await expect(revealAndroidProof.run(request({
    sessionId: 's1', requestId: 'android-2',
  }, 'u2'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
