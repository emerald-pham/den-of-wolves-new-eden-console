import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  session: {} as Record<string, unknown>,
  actor: {} as Record<string, unknown>,
  target: {} as Record<string, unknown>,
  instance: {} as Record<string, unknown>,
  players: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  releasedSecret: null as Record<string, unknown> | null,
  releasedPartnerSecret: null as Record<string, unknown> | null,
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
      delete: mock.delete,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => new Date('2026-09-07T12:00:00.000Z') },
}));

import { assignRole, releaseRole, setShipPreference } from './index';
import { recommendedRoleIds } from './roleConfiguration';

function snapshot(
  fields: Record<string, unknown>,
  path: string,
  exists = true,
) {
  return {
    exists,
    ref: { path },
    get: (field: string) => fields[field],
  };
}

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.delete.mockReset();
  mock.session = {
    phase: 'lobby',
    configurationLocked: false,
    setupRevision: 0,
    activeRoleIds: ['admiral', 'icebreaker-miner'],
  };
  mock.actor = { connected: true, role: 'gm' };
  mock.target = { connected: true, role: 'player', assignedRoleId: null };
  mock.instance = { uid: 'u1' };
  mock.players = [
    { id: 'u1', fields: mock.actor },
    { id: 'u2', fields: mock.target },
  ];
  mock.releasedSecret = null;
  mock.releasedPartnerSecret = null;
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/u2') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return {
        exists: true,
        docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)),
      };
    }
    if (ref.path === 'sessions/s1/secrets/loyalty-u2' && mock.releasedSecret) {
      return snapshot(mock.releasedSecret, ref.path);
    }
    if (ref.path === 'sessions/s1/secrets/loyalty-u3' && mock.releasedPartnerSecret) {
      return snapshot(mock.releasedPartnerSecret, ref.path);
    }
    return snapshot({}, ref.path, false);
  });
});

it('stores a nonbinding preference and advances the casting revision', async () => {
  await expect(setShipPreference.run(request({
    sessionId: 's1', requestId: 'preference-1', shipId: 'icebreaker',
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 1 });

  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u1' }),
    { shipPreferenceId: 'icebreaker' },
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/events/preference-1' }),
    expect.objectContaining({ type: 'casting-preference', requestId: 'preference-1' }),
  );
});

it('rejects preferences for inactive vessels and after casting is locked', async () => {
  await expect(setShipPreference.run(request({
    sessionId: 's1', requestId: 'preference-1', shipId: 'dione',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  mock.session.configurationLocked = true;
  await expect(setShipPreference.run(request({
    sessionId: 's1', requestId: 'preference-2', shipId: 'aegis',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects a persisted mixed mode before casting mutations can write', async () => {
  mock.session = {
    ...mock.session,
    phase: 'casting',
    playerCount: 19,
    expansion: 'base',
    capybaraEnabled: true,
    activeRoleIds: recommendedRoleIds(19),
  };

  await expect(setShipPreference.run(request({
    sessionId: 's1', requestId: 'mixed-preference', shipId: 'dione',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { commandError: 'malformed-input' },
  });
  await expect(assignRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'mixed-assignment',
    targetUid: 'u2', roleId: 'admiral',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { commandError: 'malformed-input' },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects changed-payload and cross-action reuse of a casting receipt without mutating', async () => {
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/u2') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/commandReceipts/preference-collision') {
      return snapshot({
        fingerprint: {
          action: 'set-ship-preference', sessionId: 's1', requestId: 'preference-collision',
          actorUid: 'u1', instanceId: null, expectedRevision: null,
          payload: { shipId: 'icebreaker' },
        },
        result: { sessionId: 's1', setupRevision: 1 },
      }, ref.path);
    }
    if (ref.path === 'sessions/s1/commandReceipts/cross-action') {
      return snapshot({
        fingerprint: {
          action: 'set-ship-preference', sessionId: 's1', requestId: 'cross-action',
          actorUid: 'u1', instanceId: null, expectedRevision: null,
          payload: { shipId: 'icebreaker' },
        },
        result: { sessionId: 's1', setupRevision: 1 },
      }, ref.path);
    }
    return snapshot({}, ref.path, false);
  });

  await expect(setShipPreference.run(request({
    sessionId: 's1', requestId: 'preference-collision', shipId: 'aegis',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(assignRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'cross-action',
    targetUid: 'u2', roleId: 'icebreaker-miner',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('assigns one active role through a facilitator instance and rejects duplicates', async () => {
  await expect(assignRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'assign-1',
    targetUid: 'u2', roleId: 'icebreaker-miner',
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 1 });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u2' }),
    { assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: null },
  );

  mock.update.mockClear();
  mock.players = [
    { id: 'u1', fields: mock.actor },
    { id: 'u2', fields: { ...mock.target, assignedRoleId: 'admiral' } },
  ];
  await expect(assignRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'assign-2',
    targetUid: 'u2', roleId: 'admiral',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects assigning a player who still holds a different canonical core seat', async () => {
  mock.target = {
    connected: true,
    role: 'player',
    assignedRoleId: null,
    activeConsoleRoleId: null,
    seatId: 'admiral',
  };
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/u2') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/seats/admiral') {
      return snapshot({ roleId: 'admiral', status: 'claimed', holderUid: 'u2' }, ref.path);
    }
    return snapshot({}, ref.path, false);
  });

  await expect(assignRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'assign-held-seat',
    targetUid: 'u2', roleId: 'icebreaker-miner',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('rejects assigning an active Press holder without touching Press ownership or private state', async () => {
  mock.session.pressHolderUid = 'u2';
  mock.target = {
    connected: true,
    role: 'player',
    assignedRoleId: null,
    activeConsoleRoleId: 'press-officer',
    seatId: null,
  };

  await expect(assignRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'assign-press-holder',
    targetUid: 'u2', roleId: 'icebreaker-miner',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('rejects casting a target named by the session Press holder pointer even if the player snapshot is stale', async () => {
  mock.session.pressHolderUid = 'u2';
  mock.target = {
    connected: true,
    role: 'player',
    assignedRoleId: 'icebreaker-miner',
    activeConsoleRoleId: null,
    seatId: null,
  };

  await expect(assignRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'assign-stale-press-owner',
    targetUid: 'u2', roleId: 'icebreaker-miner',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();

  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-stale-press-owner', targetUid: 'u2',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('rejects role release from a non-facilitator actor before reading private state', async () => {
  mock.target = { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' };
  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-wrong-actor', targetUid: 'u2',
  }, 'u2'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it.each([
  ['an unassigned player', { connected: true, role: 'player', assignedRoleId: null }],
  ['an active Press holder', {
    connected: true, role: 'player', assignedRoleId: null, activeConsoleRoleId: 'press-officer',
  }],
])('rejects role release from %s without clearing unrelated state', async (_label, target) => {
  mock.target = target;
  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-invalid', targetUid: 'u2',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('releases a role and replays a completed release request', async () => {
  mock.target = { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' };
  mock.releasedSecret = {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  };
  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-1', targetUid: 'u2',
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 1 });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u2' }),
    { assignedRoleId: null, activeConsoleRoleId: null, seatId: null },
  );
  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
  );

  mock.update.mockClear();
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1/commandReceipts/release-2') {
      return snapshot({
        fingerprint: {
          action: 'release-role', sessionId: 's1', requestId: 'release-2',
          actorUid: 'u1', instanceId: 'bridge', expectedRevision: null,
          payload: { targetUid: 'u2' },
        },
        result: { sessionId: 's1', setupRevision: 4 },
      }, ref.path);
    }
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/u2') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    return snapshot({}, ref.path, false);
  });
  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-2', targetUid: 'u2',
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 4 });
  expect(mock.update).not.toHaveBeenCalled();
});

it('opens the target player\'s canonical seat and clears the seat pointer atomically', async () => {
  mock.target = {
    connected: true,
    role: 'player',
    assignedRoleId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner',
    seatId: 'icebreaker-miner',
  };
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/u2') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/seats/icebreaker-miner') {
      return snapshot({
        roleId: 'icebreaker-miner', status: 'claimed', holderUid: 'u2', claimedAt: 'claimed',
      }, ref.path);
    }
    return snapshot({}, ref.path, false);
  });

  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-seat', targetUid: 'u2',
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 1 });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/u2' }),
    { assignedRoleId: null, activeConsoleRoleId: null, seatId: null },
  );
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/icebreaker-miner' }),
    { status: 'open', holderUid: null, claimedAt: null },
  );
});

it('refuses to release a role when its claimed seat belongs to another player', async () => {
  mock.target = {
    connected: true,
    role: 'player',
    assignedRoleId: 'icebreaker-miner',
    seatId: 'icebreaker-miner',
  };
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/u2') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/seats/icebreaker-miner') {
      return snapshot({ roleId: 'icebreaker-miner', status: 'claimed', holderUid: 'u3' }, ref.path);
    }
    return snapshot({}, ref.path, false);
  });

  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-nonstealing', targetUid: 'u2',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('refuses to release when the assigned role and claimed seat pointer disagree', async () => {
  mock.target = {
    connected: true,
    role: 'player',
    assignedRoleId: 'icebreaker-miner',
    seatId: 'admiral',
  };
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/u2') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/seats/admiral') {
      return snapshot({ roleId: 'admiral', status: 'claimed', holderUid: 'u2' }, ref.path);
    }
    return snapshot({}, ref.path, false);
  });

  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-role-seat-mismatch', targetUid: 'u2',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('removes both private Friend records when releasing one paired role', async () => {
  mock.target = { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' };
  mock.players.push({ id: 'u3', fields: { connected: true, role: 'player', assignedRoleId: 'admiral' } });
  mock.releasedSecret = {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u3' },
  };
  mock.releasedPartnerSecret = {
    visibleToUids: ['u3'],
    payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u2' },
  };

  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-friend', targetUid: 'u2',
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 1 });
  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
  );
  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u3' }),
  );
});

it('does not delete an unrelated partner secret named by a corrupt Friend record', async () => {
  mock.target = { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' };
  mock.players.push({ id: 'u3', fields: { connected: true, role: 'player', assignedRoleId: 'admiral' } });
  mock.releasedSecret = {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u3' },
  };
  mock.releasedPartnerSecret = {
    visibleToUids: ['u3'],
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  };

  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-corrupt-friend', targetUid: 'u2',
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 1 });
  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
  );
  expect(mock.delete).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u3' }),
  );
});

it('deletes a reciprocal Friend only when both records are exact private Friend cards', async () => {
  mock.target = { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' };
  mock.players.push({ id: 'u3', fields: { connected: true, role: 'player', assignedRoleId: 'admiral' } });
  const validTarget = {
    visibleToUids: ['u2'],
    payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u3' },
  };
  const validPartner = {
    visibleToUids: ['u3'],
    payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u2' },
  };
  const malformedPairs = [
    [{ ...validTarget, visibleToUids: ['u2', 'u1'] }, validPartner],
    [{ ...validTarget, payload: { ...validTarget.payload, type: 'legacy' } }, validPartner],
    [{ ...validTarget, payload: { ...validTarget.payload, suspicion: 5 } }, validPartner],
    [validTarget, { ...validPartner, visibleToUids: ['u3', 'u1'] }],
    [validTarget, { ...validPartner, payload: { ...validPartner.payload, suspicion: 5 } }],
  ] as const;

  for (const [index, [targetSecret, partnerSecret]] of malformedPairs.entries()) {
    mock.delete.mockClear();
    mock.releasedSecret = targetSecret;
    mock.releasedPartnerSecret = partnerSecret;

    await expect(releaseRole.run(request({
      sessionId: 's1', instanceId: 'bridge', requestId: `release-malformed-friend-${index}`, targetUid: 'u2',
    }))).resolves.toEqual({ sessionId: 's1', setupRevision: 1 });
    expect(mock.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
    );
    expect(mock.delete).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u3' }),
    );
  }
});
