import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  session: { phase: 'casting', configurationLocked: false, setupRevision: 2 },
  actor: { connected: true, role: 'gm' },
  target: { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' },
  partner: { connected: true, role: 'player', assignedRoleId: 'admiral' },
  instance: { uid: 'u1' },
  loyaltySecrets: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  priorResults: {} as Record<string, Record<string, unknown>>,
  players: [] as Array<{ id: string; fields: Record<string, unknown> }>,
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

import { assignLoyalty, releaseRole, revealAndroidProof } from './index';

function snapshot(fields: Record<string, unknown>, path: string, exists = true) {
  return { exists, id: path.split('/').at(-1), ref: { path }, get: (field: string) => fields[field] };
}

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.delete.mockReset();
  mock.session = { phase: 'casting', configurationLocked: false, setupRevision: 2, activeRoleIds: ['admiral', 'icebreaker-miner'] };
  mock.actor = { connected: true, role: 'gm' };
  mock.target = { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' };
  mock.partner = { connected: true, role: 'player', assignedRoleId: 'admiral' };
  mock.instance = { uid: 'u1' };
  mock.loyaltySecrets = [];
  mock.priorResults = {};
  mock.players = [
    { id: 'u1', fields: mock.actor },
    { id: 'u2', fields: mock.target },
    { id: 'u3', fields: mock.partner },
  ];
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    const player = mock.players.find(({ id }) => ref.path === `sessions/s1/players/${id}`);
    if (player) return snapshot(player.fields, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return {
        exists: true,
        docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)),
      };
    }
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instance, ref.path);
    if (ref.path === 'sessions/s1/secrets') {
      return {
        exists: true,
        docs: mock.loyaltySecrets.map(({ id, fields }) => snapshot(fields, `sessions/s1/secrets/${id}`)),
      };
    }
    const loyaltySecret = mock.loyaltySecrets.find(({ id }) => ref.path === `sessions/s1/secrets/${id}`);
    if (loyaltySecret) return snapshot(loyaltySecret.fields, ref.path);
    const priorResult = mock.priorResults[ref.path];
    if (priorResult) return snapshot(priorResult, ref.path);
    return snapshot({}, ref.path, false);
  });
});

it('rejects Intelligence Agent setup when no Wolf remains, without writing state', async () => {
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'intelligence-without-wolf',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/wolf/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('assigns Intelligence Agent beside a Wolf with a private card and redacted event', async () => {
  mock.loyaltySecrets = [{
    id: 'loyalty-u3',
    fields: { visibleToUids: ['u3'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
  }];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'intelligence-with-wolf',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] });

  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
    expect.objectContaining({
      visibleToUids: ['u2'],
      payload: { type: 'loyalty', kind: 'intelligence-agent', suspicion: 6 },
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/loyaltyCensus/current' }),
    expect.objectContaining({
      type: 'loyalty-census', revision: 3,
      entries: expect.arrayContaining([
        { uid: 'u2', kind: 'intelligence-agent', suspicion: 6 },
        { uid: 'u3', kind: 'wolf-agent', suspicion: 0 },
      ]),
    }),
  );
  const eventWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/events/intelligence-with-wolf')?.[1];
  expect(eventWrite).toBeDefined();
  expect(eventWrite).not.toHaveProperty('fingerprint');
  expect(eventWrite).not.toHaveProperty('assignedUids');
  expect(eventWrite).not.toHaveProperty('result');
  expect(JSON.stringify(eventWrite)).not.toMatch(/u2|intelligence-agent|suspicion|partnerUid/);
  const receiptWrite = mock.set.mock.calls.find(
    ([ref]) => ref.path === 'sessions/s1/loyaltyAssignmentRequests/intelligence-with-wolf',
  )?.[1];
  expect(receiptWrite).toMatchObject({
    fingerprint: {
      action: 'assign-loyalty', actorUid: 'u1', instanceId: 'bridge', targetUid: 'u2',
      kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    },
    result: { sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] },
  });
});

it('retains a disconnected core loyalty when an unrelated assignment rebuilds the census', async () => {
  mock.players = [
    { id: 'u1', fields: mock.actor },
    { id: 'u2', fields: { ...mock.target, connected: false } },
    { id: 'u3', fields: mock.partner },
  ];
  mock.loyaltySecrets = [{
    id: 'loyalty-u2',
    fields: {
      visibleToUids: ['u2'],
      payload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5 },
    },
  }];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'rebuild-with-disconnected-core',
    targetUid: 'u3', kind: 'android', suspicion: null,
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 3, assignedUids: ['u3'] });

  const censusWrite = mock.set.mock.calls.find(
    ([ref]) => ref.path === 'sessions/s1/loyaltyCensus/current',
  )?.[1] as { entries: Array<{ uid: string; kind: string }> } | undefined;
  expect(censusWrite?.entries).toEqual(expect.arrayContaining([
    { uid: 'u2', kind: 'fleet-loyalist', suspicion: 5 },
    { uid: 'u3', kind: 'android', suspicion: null },
  ]));
});

it('removes a released core loyalty from the rebuilt census', async () => {
  mock.loyaltySecrets = [{
    id: 'loyalty-u2',
    fields: {
      visibleToUids: ['u2'],
      payload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5 },
    },
  }];

  await expect(releaseRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'release-census-loyalty', targetUid: 'u2',
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 3 });

  const censusWrite = mock.set.mock.calls.find(
    ([ref]) => ref.path === 'sessions/s1/loyaltyCensus/current',
  )?.[1] as { entries: Array<{ uid: string }> } | undefined;
  expect(censusWrite?.entries).toEqual([]);
  expect(mock.delete).toHaveBeenCalledWith(expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }));
});

it('rejects replacing the sole Wolf with Intelligence Agent before any write', async () => {
  mock.loyaltySecrets = [{
    id: 'loyalty-u2',
    fields: { payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
  }];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'intelligence-replaces-wolf',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/wolf/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('replays a committed Intelligence Agent request without reevaluating or writing it', async () => {
  const reply = { sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] };
  mock.loyaltySecrets = [{
    id: 'loyalty-u3', fields: { payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
  }];
  mock.priorResults['sessions/s1/loyaltyAssignmentRequests/intelligence-replay'] = {
    action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    fingerprint: {
      action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
      targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    },
    result: reply,
  };

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'intelligence-replay',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).resolves.toEqual(reply);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed when a private loyalty receipt has a valid fingerprint but mismatched top-level binding', async () => {
  mock.priorResults['sessions/s1/loyaltyAssignmentRequests/malformed-receipt-binding'] = {
    action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
    targetUid: 'u3', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    fingerprint: {
      action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
      targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    },
    result: { sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] },
  };

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'malformed-receipt-binding',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/receipt|binding|fingerprint/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed when a bound private receipt contains a result for another command', async () => {
  mock.priorResults['sessions/s1/loyaltyAssignmentRequests/malformed-receipt-result'] = {
    action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    fingerprint: {
      action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
      targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    },
    result: { sessionId: 'other-session', setupRevision: 3, assignedUids: ['u3'] },
  };

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'malformed-receipt-result',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/receipt|result|replay/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a replay from a different authorized actor before touching setup', async () => {
  const reply = { sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] };
  mock.priorResults['sessions/s1/loyaltyAssignmentRequests/actor-collision'] = {
    action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    fingerprint: {
      action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
      targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    },
    result: reply,
  };
  mock.target = { connected: true, role: 'gm', assignedRoleId: 'icebreaker-miner' };
  mock.actor = { connected: true, role: 'player' };
  mock.instance = { uid: 'u2' };
  mock.players = [
    { id: 'u1', fields: mock.actor },
    { id: 'u2', fields: mock.target },
    { id: 'u3', fields: mock.partner },
  ];
  mock.loyaltySecrets = [{
    id: 'loyalty-u3', fields: { payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
  }];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'actor-collision',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }, 'u2'))).rejects.toMatchObject({
    code: 'permission-denied',
    message: expect.stringMatching(/different facilitator|actor/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a changed payload under an existing request id', async () => {
  const reply = { sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] };
  mock.priorResults['sessions/s1/loyaltyAssignmentRequests/payload-collision'] = {
    action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    fingerprint: {
      action: 'assign-loyalty', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
      targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    },
    result: reply,
  };

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'payload-collision',
    targetUid: 'u2', kind: 'android', suspicion: null,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/fingerprint|payload|collision/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a legacy unbound receipt instead of replaying or re-running setup', async () => {
  mock.priorResults['sessions/s1/loyaltyAssignmentRequests/legacy-receipt'] = {
    result: { sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] },
  };
  mock.loyaltySecrets = [{
    id: 'loyalty-u3', fields: { payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
  }];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'legacy-receipt',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/fingerprint|legacy|replay/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed for a malformed unbound fingerprint before actor comparison', async () => {
  mock.priorResults['sessions/s1/loyaltyAssignmentRequests/malformed-fingerprint'] = {
    fingerprint: {
      action: 'assign-loyalty', sessionId: 's1', instanceId: 'bridge',
      targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6, partnerUid: null,
    },
    result: { sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] },
  };

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'malformed-fingerprint',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/legacy|fingerprint|unbound/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a legacy public-event receipt instead of replaying an unbound command', async () => {
  mock.priorResults['sessions/s1/events/legacy-event-receipt'] = {
    type: 'loyalty-assignment',
    result: { sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] },
  };
  mock.loyaltySecrets = [{
    id: 'loyalty-u3', fields: { payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
  }];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'legacy-event-receipt',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/legacy|unbound|receipt/i),
  });
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'legacy-event-receipt',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/refresh|resume|not applied/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['missing assigned role', { connected: true, role: 'player' }],
  ['inactive assigned role', { connected: true, role: 'player', assignedRoleId: 'stale-role' }],
  ['GM holder', { connected: true, role: 'gm', assignedRoleId: 'icebreaker-miner' }],
] as const)('requires a canonical active non-GM target for loyalty setup: %s', async (label, target) => {
  mock.target = target;
  mock.players = [
    { id: 'u1', fields: mock.actor },
    { id: 'u2', fields: mock.target },
    { id: 'u3', fields: mock.partner },
  ];
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: `canonical-${label.replaceAll(' ', '-')}`,
    targetUid: 'u2', kind: 'android', suspicion: null,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/role|holder|roster|eligible/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects duplicate active role holders instead of assigning either stale record', async () => {
  mock.players.push({ id: 'u4', fields: { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' } });
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'duplicate-holder',
    targetUid: 'u2', kind: 'android', suspicion: null,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/duplicate|role|holder/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('requires a canonical active Friend partner as well as a canonical target', async () => {
  mock.partner = { connected: true, role: 'player', assignedRoleId: 'stale-role' };
  mock.players = [
    { id: 'u1', fields: mock.actor },
    { id: 'u2', fields: mock.target },
    { id: 'u3', fields: mock.partner },
  ];
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'friend-stale-partner',
    targetUid: 'u2', kind: 'friend', suspicion: 0, partnerUid: 'u3',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/partner|role|holder|roster/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('ignores stale Wolf records when deciding whether Intelligence Agent setup is safe', async () => {
  mock.loyaltySecrets = [{
    id: 'loyalty-u3', fields: { payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
  }];
  mock.partner = { connected: false, role: 'player', assignedRoleId: 'admiral' };
  mock.players = [
    { id: 'u1', fields: mock.actor },
    { id: 'u2', fields: mock.target },
    { id: 'u3', fields: mock.partner },
  ];
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'stale-wolf',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/wolf/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not count malformed or non-loyalty secrets as a Wolf', async () => {
  mock.loyaltySecrets = [{
    id: 'loyalty-u3', fields: { payload: { kind: 'wolf-agent', suspicion: 0 } },
  }];
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'malformed-wolf',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/wolf/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not count a mis-audienced loyalty secret as a Wolf', async () => {
  mock.loyaltySecrets = [{
    id: 'loyalty-u3',
    fields: {
      visibleToUids: ['u3', 'u1'],
      payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
    },
  }];
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'mis-audienced-wolf',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/wolf/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a second Intelligence Agent even when a Wolf remains', async () => {
  mock.players.push({ id: 'u4', fields: { connected: true, role: 'player', assignedRoleId: 'admiral' } });
  mock.loyaltySecrets = [
    {
      id: 'loyalty-u3',
      fields: { visibleToUids: ['u3'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
    },
    {
      id: 'loyalty-u4',
      fields: { visibleToUids: ['u4'], payload: { type: 'loyalty', kind: 'intelligence-agent', suspicion: 6 } },
    },
  ];
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'duplicate-intelligence',
    targetUid: 'u2', kind: 'intelligence-agent', suspicion: 6,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/Intelligence Agent|already|one/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
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
  expect(eventWrite).not.toHaveProperty('assignedUids');
  expect(eventWrite).not.toHaveProperty('result');
  expect(JSON.stringify(eventWrite)).not.toMatch(/u2|android|suspicion|partnerUid/);
});

it('denies optional loyalties when their public setup mode is disabled', async () => {
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'universal-disabled',
    targetUid: 'u2', kind: 'universal-arbour', suspicion: 10,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/optional-disabled/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('allows Wolf Cult only in the explicit two-Wolf setup and keeps its card private', async () => {
  mock.session = {
    ...mock.session,
    playerCount: 14,
    universalArbourEnabled: false,
    wolfCultEnabled: true,
  };
  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'wolf-cult-enabled',
    targetUid: 'u2', kind: 'wolf-cult', suspicion: 15,
  }))).resolves.toEqual({ sessionId: 's1', setupRevision: 3, assignedUids: ['u2'] });
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
    expect.objectContaining({
      visibleToUids: ['u2'],
      payload: { type: 'loyalty', kind: 'wolf-cult', suspicion: 15 },
    }),
  );
  const eventWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/events/wolf-cult-enabled')?.[1];
  expect(eventWrite).not.toHaveProperty('assignedUids');
  expect(eventWrite).not.toHaveProperty('result');
  expect(JSON.stringify(eventWrite)).not.toMatch(/u2|suspicion/);
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

it('removes only the reciprocal displaced Friend when replacing a target loyalty', async () => {
  mock.loyaltySecrets = [
    {
      id: 'loyalty-u2',
      fields: {
        visibleToUids: ['u2'],
        payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u3' },
      },
    },
    {
      id: 'loyalty-u3',
      fields: {
        visibleToUids: ['u3'],
        payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u2' },
      },
    },
  ];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replace-target-friend',
    targetUid: 'u2', kind: 'android', suspicion: null,
  }))).resolves.toMatchObject({ assignedUids: ['u2'] });

  expect(mock.delete).toHaveBeenCalledTimes(1);
  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u3' }),
  );
});

it('removes only the reciprocal displaced Friend when replacing a new Friend partner', async () => {
  mock.loyaltySecrets = [
    {
      id: 'loyalty-u3',
      fields: {
        visibleToUids: ['u3'],
        payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u4' },
      },
    },
    {
      id: 'loyalty-u4',
      fields: {
        visibleToUids: ['u4'],
        payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u3' },
      },
    },
  ];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replace-partner-friend',
    targetUid: 'u2', kind: 'friend', suspicion: 0, partnerUid: 'u3',
  }))).resolves.toMatchObject({ assignedUids: ['u2', 'u3'] });

  expect(mock.delete).toHaveBeenCalledTimes(1);
  expect(mock.delete).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u4' }),
  );
});

it('never deletes a corrupt or unrelated secret while replacing a Friend target', async () => {
  mock.loyaltySecrets = [
    {
      id: 'loyalty-u2',
      fields: { payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u3' } },
    },
    {
      id: 'loyalty-u3',
      fields: { payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 } },
    },
    {
      id: 'loyalty-u4',
      fields: { payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u5' } },
    },
  ];

  await expect(assignLoyalty.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replace-corrupt-friend',
    targetUid: 'u2', kind: 'android', suspicion: null,
  }))).resolves.toMatchObject({ assignedUids: ['u2'] });

  expect(mock.delete).not.toHaveBeenCalled();
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
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/commandReceipts/android-1' }),
    expect.objectContaining({
      fingerprint: {
        action: 'reveal-android-proof', sessionId: 's1', requestId: 'android-1', actorUid: 'u2',
        instanceId: null, expectedRevision: null, payload: {},
      },
      result: { disclosed: true },
    }),
  );
});

it('does not replay Android proof after the holder secret is missing or stale', async () => {
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1/commandReceipts/android-stale') {
      return snapshot({
        fingerprint: {
          action: 'reveal-android-proof', sessionId: 's1', requestId: 'android-stale', actorUid: 'u2',
          instanceId: null, expectedRevision: null, payload: {},
        },
        result: { disclosed: true, privateDetail: 'prior secret result' },
      }, ref.path);
    }
    return snapshot({}, ref.path, false);
  });

  await expect(revealAndroidProof.run(request({
    sessionId: 's1', requestId: 'android-stale',
  }, 'u2'))).rejects.toMatchObject({
    code: 'permission-denied',
    message: expect.not.stringContaining('prior secret result'),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('requires refresh before reissuing Android proof when only an old event remains', async () => {
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1/secrets/loyalty-u2') {
      return snapshot({ payload: { type: 'loyalty', kind: 'android', suspicion: null } }, ref.path);
    }
    if (ref.path === 'sessions/s1/events/android-legacy') {
      return snapshot({ type: 'android-proof-disclosed', actorUid: 'u2', requestId: 'android-legacy' }, ref.path);
    }
    return snapshot({}, ref.path, false);
  });

  await expect(revealAndroidProof.run(request({
    sessionId: 's1', requestId: 'android-legacy',
  }, 'u2'))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/refresh|resume|not applied/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
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
