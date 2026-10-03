import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ auth: () => ({ currentUser: { uid: 'gm1' } }), functions: () => ({}) }));
const { httpsCallable } = await import('firebase/functions');
const { setEmergencyTimerPaused } = await import('./sessionService');
const reason = 'Safety pause during the attack.';
const clock = { turn: 2, teamPhaseEndsAt: '2026-10-03T08:00:00.000Z', openAirspaceEndsAt: '2026-10-03T08:15:00.000Z',
  airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false } };
const hold = { window: 'restricted', remainingMs: 180_000, pausedAt: '2026-10-03T07:57:00.000Z' };
const intervention = { expectedAttackRevision: 4, reason, dangerConfirmed: true as const };
function receipt(payload: Record<string, unknown>) {
  const from = { attackRevision: 4, currentStep: 'long-range', teamPhaseEndsAt: clock.teamPhaseEndsAt,
    openAirspaceEndsAt: clock.openAirspaceEndsAt, timerPause: null };
  return { status: 'committed', type: 'wolf-attack-timer-intervention', sessionId: payload.sessionId,
    requestId: payload.requestId, turn: 2, revision: 5, action: 'paused', reason, dangerConfirmed: true,
    delta: { from, to: { ...from, attackRevision: 5, timerPause: hold } }, rollback: { allowed: false },
    turnPhase: { ...clock, timerPause: hold } };
}
beforeEach(() => {
  vi.resetAllMocks();useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Timer test', joinCode: '1234', phase: 'active', currentTurn: 2,
    ownerUid: 'gm1', createdAt: '', updatedAt: '', turnPhase: clock },
  { uid: 'gm1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null, joinedAt: '' });
  useSessionStore.getState().setGmInstance({ id: 'instance-1', sessionId: 's1', uid: 'gm1', name: 'GM test', deviceLabel: 'Browser', claimedAt: '' });
  useSessionStore.getState().setConnection('live');useSessionStore.getState().setSessionSnapshotFreshness('server');
});
it('binds the attack pause command to reason, confirmation, revision and idempotency', async () => {
  const call=Object.assign(vi.fn(async (payload: Record<string, unknown>) => ({data:receipt(payload)})),{stream:vi.fn()});
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await setEmergencyTimerPaused(true, intervention);
  expect(call).toHaveBeenCalledWith(expect.objectContaining({ sessionId:'s1',instanceId:'instance-1',expectedTurn:2,paused:true,
    requestId:expect.any(String),expectedAttackRevision:4,reason,dangerConfirmed:true }));
  expect(useSessionStore.getState().session?.turnPhase?.timerPause).toEqual(hold);
});
it.each([
  ['bad reason', {...intervention,reason:'short'}],
  ['no confirmation', {...intervention,dangerConfirmed:false}],
  ['bad revision', {...intervention,expectedAttackRevision:-1}],
])('denies %s before requesting an attack pause',async(_label,options)=>{
  await expect(setEmergencyTimerPaused(true,options as typeof intervention)).rejects.toThrow(/reason|confirm|revision/i);
  expect(httpsCallable).not.toHaveBeenCalled();
});
it.each([
  ['a foreign request', (value:ReturnType<typeof receipt>)=>({...value,requestId:'foreign'})],
  ['a stale delta', (value:ReturnType<typeof receipt>)=>({...value,delta:{...value.delta,from:{...value.delta.from,attackRevision:3}}})],
  ['a rewritten reason', (value:ReturnType<typeof receipt>)=>({...value,reason:'Different sufficient reason.'})],
  ['an injected private delta field', (value:ReturnType<typeof receipt>)=>({...value,delta:{...value.delta,to:{...value.delta.to,actorUid:'private'}}})],
  ['a contradictory pause', (value:ReturnType<typeof receipt>)=>({...value,turnPhase:clock})],
  ['a hidden pause field', (value:ReturnType<typeof receipt>)=>({...value,delta:{...value.delta,to:{...value.delta.to,timerPause:{...hold,privateUid:'private'}}}})],
  ['an authorized rollback', (value:ReturnType<typeof receipt>)=>({...value,rollback:{allowed:true}})],
])('rejects %s without hydrating a new clock',async(_label,mutate)=>{
  const before=useSessionStore.getState().session;
  const call=Object.assign(vi.fn(async(payload:Record<string,unknown>)=>({data:mutate(receipt(payload))})),{stream:vi.fn()});
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await expect(setEmergencyTimerPaused(true,intervention)).rejects.toThrow(/invalid.*receipt/i);
  expect(useSessionStore.getState().session).toBe(before);
});
it('does not hydrate a late attack pause after GM instance replacement',async()=>{
  let resolve!: (value:unknown)=>void;
  const call=Object.assign(vi.fn((payload:Record<string,unknown>)=>new Promise(resolveCall=>{
    resolve=()=>resolveCall({data:receipt(payload)});
  })),{stream:vi.fn()});
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  const pending=setEmergencyTimerPaused(true,intervention);
  await vi.waitFor(()=>expect(call).toHaveBeenCalled());
  useSessionStore.getState().setGmInstance({...useSessionStore.getState().gmInstance!,id:'replacement'});
  resolve(undefined);await pending;
  expect(useSessionStore.getState().session?.turnPhase?.timerPause).toBeUndefined();
});
