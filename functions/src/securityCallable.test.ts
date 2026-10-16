import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { auditedOnCall, buildSecurityDenialRecord } from './securityCallable';

const telemetry = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({ warn: telemetry.warn }));
const request = { auth: { uid: 'actor-secret' }, data: {
  sessionId: 'session-secret', requestId: 'request-secret', notes: 'DO-NOT-LOG-PRIVATE-NOTE',
  cards: ['HIDDEN-HAND'], loyalty: 'wolf-agent',
}, rawRequest: { headers: { authorization: 'Bearer SECRET-TOKEN', 'x-firebase-appcheck': 'SECRET-ATTESTATION' } } } as unknown as CallableRequest;
beforeEach(() => telemetry.warn.mockClear());

describe('private callable denial telemetry', () => {
  it.each([
    ['unauthenticated', 'auth'], ['permission-denied', 'authorization'],
    ['invalid-argument', 'schema'], ['resource-exhausted', 'rate-limit'],
  ] as const)('records %s without any request body or error prose', async (code, category) => {
    const failure = new HttpsError(code, 'PRIVATE ERROR NOTE', { cards: ['SECRET'] });
    const callable = auditedOnCall('readCandidateWorkspace', async () => { throw failure; });
    await expect(callable.run(request)).rejects.toBe(failure);
    expect(telemetry.warn).toHaveBeenCalledOnce();
    const record = telemetry.warn.mock.calls[0]![1];
    expect(record).toMatchObject({ type: 'security-denial', schemaVersion: 1, callableName: 'readCandidateWorkspace',
      category, code, redactionPolicy: 'security-denial-hashed-metadata-v1' });
    const encoded = JSON.stringify(record);
    for (const secret of ['actor-secret', 'session-secret', 'request-secret', 'PRIVATE', 'SECRET', 'wolf-agent']) {
      expect(encoded).not.toContain(secret);
    }
    expect(record.actorHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves successful replies and the SDK callable endpoint', async () => {
    const callable = auditedOnCall('readCandidateWorkspace', () => ({ status: 'ready' as const }));
    await expect(callable.run(request)).resolves.toEqual({ status: 'ready' });
    expect(callable.__endpoint.platform).toBe('gcfv2');
    expect(callable.__endpoint.callableTrigger).toBeDefined();
    expect(telemetry.warn).not.toHaveBeenCalled();
  });

  it('does not turn unrelated gameplay conflicts into security denials', async () => {
    const failure = new HttpsError('failed-precondition', 'PRIVATE CONFLICT');
    await expect(auditedOnCall('readCandidateWorkspace', () => { throw failure; }).run(request)).rejects.toBe(failure);
    expect(telemetry.warn).not.toHaveBeenCalled();
  });

  it('does not derive identity from unverified data and ignores malformed identifier values', () => {
    const record = buildSecurityDenialRecord('rollDice', { data: { uid: 'forged', sessionId: '../PRIVATE', requestId: { notes: 'PRIVATE' } } },
      new HttpsError('unauthenticated', 'SECRET'));
    expect(record).not.toHaveProperty('actorHash');
    expect(record).not.toHaveProperty('sessionHash');
    expect(record).not.toHaveProperty('requestHash');
  });
});

describe('server-owned uncertainty boundary', () => {
  it.each(['adjudicateFailedJump', 'commitAwayMissionLifecycleCommand', 'runWolfAgentDetectorTest',
    'resolveWolfAttackAftermath', 'advanceWolfAttackLifecycle'])(
    'rejects client outcomes on the real %s server-random procedure', async callableName => {
      const handler = vi.fn(() => ({ status: 'committed' }));
      await expect(auditedOnCall(callableName, handler).run({ ...request,
        data: { sessionId: 's1', outcome: 'client-forced' } })).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(handler).not.toHaveBeenCalled();
    });
  it.each(['rolls', 'dice', 'result', 'outcome', 'seed', 'entropy', 'bonus', 'accuracy', 'deckOrder', 'cardDraw', 'clueRoll'])(
    'rejects injected %s before a random producer runs', async key => {
      const handler = vi.fn(() => ({ rolls: [4] }));
      const callable = auditedOnCall('rollDice', handler);
      await expect(callable.run({ ...request, data: { sessionId: 's1', sides: 6, count: 1, [key]: 'CLIENT-OUTCOME' } }))
        .rejects.toMatchObject({ code: 'invalid-argument' });
      expect(handler).not.toHaveBeenCalled();
      expect(telemetry.warn).toHaveBeenCalledWith('Callable security denial', expect.objectContaining({ category: 'schema' }));
    });

  it('permits required player choices and facilitator rulings on their own endpoints', async () => {
    const handler = vi.fn(req => req.data);
    await expect(auditedOnCall('recordFacilitatorRuleCall', handler).run({ ...request,
      data: { decision: 'a genuine ruling', requiredChoice: 'a player choice' } })).resolves
      .toEqual({ decision: 'a genuine ruling', requiredChoice: 'a player choice' });
  });
});
