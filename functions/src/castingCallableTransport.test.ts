import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type * as HttpsModule from 'firebase-functions/v2/https';
import { castingCallableTransport } from './castingCallableTransport';
const telemetry = vi.hoisted(() => ({ warn: vi.fn() }));
const sdk = vi.hoisted(() => ({ onCall: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({ warn: telemetry.warn }));
vi.mock('firebase-functions/v2/https', async importOriginal => {
  const original = await importOriginal<typeof HttpsModule>();
  return { ...original, onCall: (...args: Parameters<typeof original.onCall>) => { sdk.onCall(...args); return original.onCall(...args); } };
});
beforeEach(() => { telemetry.warn.mockClear(); sdk.onCall.mockClear(); });
describe('casting-only released callable transport consumer', () => {
  it('declares production AppCheck and canonical runtime at the SDK endpoint', () => {
    const callable = castingCallableTransport(async () => ({ ok: true }));
    expect(callable.__endpoint.region).toEqual(['us-central1']);
    expect(callable.__endpoint.maxInstances).toBe(10);
    // The SDK consumes enforcement in its HTTP closure, not endpoint metadata.
    expect(sdk.onCall.mock.calls[0][0].enforceAppCheck).toBe(true);
  });
  it('records safe denial metadata and retains exact error identity', async () => {
    const error = new HttpsError('permission-denied', 'PRIVATE ERROR', { details: 'PRIVATE DOSSIER' });
    const callable = castingCallableTransport(async () => { throw error; });
    await expect(callable.run({ auth: { uid: 'secret-actor' }, data: { payload: { sessionId: 'secret-session', attempt: 'secret-attempt', answers: 'PRIVATE ANSWERS' } }, rawRequest: { headers: { authorization: 'Bearer SECRET TOKEN' } } } as unknown as CallableRequest)).rejects.toBe(error);
    expect(telemetry.warn).toHaveBeenCalledOnce();
    const record = telemetry.warn.mock.calls[0][1];
    expect(record).toMatchObject({ callableName: 'castingCompanionCommand', code: 'permission-denied', category: 'authorization' });
    expect(record.actorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.sessionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(record)).not.toMatch(/secret-|PRIVATE|Bearer|TOKEN|ANSWERS/);
  });
  it('keeps the exact casting denial record shape and its casting hash domain', async () => {
    const error = new HttpsError('invalid-argument', 'PRIVATE ERROR');
    const callable = castingCallableTransport(async () => { throw error; });
    await expect(callable.run({ auth: { uid: 'secret-actor' }, data: { payload: { sessionId: 'secret-session', attempt: 'secret-attempt' } } } as unknown as CallableRequest)).rejects.toBe(error);
    expect(telemetry.warn).toHaveBeenCalledWith('Casting callable denial', {
      type: 'security-denial', schemaVersion: 1, callableName: 'castingCompanionCommand',
      code: 'invalid-argument', category: 'schema',
      // sha256 of 'casting-denial-<kind>\0<value>' (independently computed literals).
      actorHash: '165643497facc89d0bcc732f2b4dd8655644b22c4edb649ebf263fd293546371',
      sessionHash: '5b4ba51a73f5159775f9886f29b1dfd8be2a86b796c2ce52d8868011a9b8aa4c',
      requestHash: '4d373b56888625e14a219caa1a2ccaeab1cbafaff686a9e16776c4c4cf1c0992',
      redactionPolicy: 'casting-denial-hashed-metadata-v1',
    });
  });
  it('records nothing for a failure outside the denial categories', async () => {
    const error = new HttpsError('failed-precondition', 'conflict');
    await expect(castingCallableTransport(async () => { throw error; }).run({} as CallableRequest)).rejects.toBe(error);
    expect(telemetry.warn).not.toHaveBeenCalled();
  });
  it('preserves success and keeps logging failures from replacing authorization denial', async () => {
    await expect(castingCallableTransport(async () => ({ ok: true })).run({} as CallableRequest)).resolves.toEqual({ ok: true });
    const error = new HttpsError('unauthenticated', 'denied'); telemetry.warn.mockImplementationOnce(() => { throw new Error('telemetry failed'); });
    await expect(castingCallableTransport(async () => { throw error; }).run({} as CallableRequest)).rejects.toBe(error);
  });
});
