import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { castingCallableTransport } from './castingCallableTransport';
const telemetry = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({ warn: telemetry.warn }));
beforeEach(() => telemetry.warn.mockClear());
describe('casting-only released callable transport consumer', () => {
  it('declares production AppCheck and canonical runtime at the SDK endpoint', () => {
    const callable = castingCallableTransport(async () => ({ ok: true }));
    expect(callable.__endpoint.region).toEqual(['us-central1']);
    expect(callable.__endpoint.maxInstances).toBe(10);
    expect(callable.__endpoint.callableTrigger?.enforceAppCheck).toBe(true);
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
  it('preserves success and keeps logging failures from replacing authorization denial', async () => {
    await expect(castingCallableTransport(async () => ({ ok: true })).run({} as CallableRequest)).resolves.toEqual({ ok: true });
    const error = new HttpsError('unauthenticated', 'denied'); telemetry.warn.mockImplementationOnce(() => { throw new Error('telemetry failed'); });
    await expect(castingCallableTransport(async () => { throw error; }).run({} as CallableRequest)).rejects.toBe(error);
  });
});
