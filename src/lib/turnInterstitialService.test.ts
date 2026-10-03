import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));
import { clearTurnAdvanceInterstitial } from './turnInterstitialService';
const { acceptCallableSessionAuthority } = await import('./firestore');
const phase = {turn:2, teamPhaseEndsAt:'2026-10-03T01:05:00.000Z',openAirspaceEndsAt:'2026-10-03T01:20:00.000Z',
  airspace:{state:'restricted' as const,tickerActive:true,pressAccess:false},
  timerPause:{reason:'turn-interstitial' as const,window:'restricted' as const,remainingMs:300000,pausedAt:'2026-10-03T01:00:00.000Z'}};
const request = {expectedCycle:2,expectedPausedAt:phase.timerPause.pausedAt,requestId:'clear-one'};
const resumed = {...phase,timerPause:undefined,teamPhaseEndsAt:'2026-10-03T01:15:00.000Z',openAirspaceEndsAt:'2026-10-03T01:30:00.000Z'};
beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({id:'s1',name:'PC07',joinCode:'123456',ownerUid:'u1',phase:'active',currentTurn:2,
    createdAt:'',updatedAt:'',turnPhase:phase}, {uid:'u1',sessionId:'s1',role:'player',displayName:'Captain',seatId:null,joinedAt:''});
  useSessionStore.getState().setConnection('live');useSessionStore.getState().setSessionSnapshotFreshness('server');
  mocks.call.mockReset().mockResolvedValue({data:{status:'cleared',cycle:2,pausedAt:request.expectedPausedAt,turnPhase:resumed}});
  mocks.callable.mockReset().mockReturnValue(mocks.call);
});
it('calls the normal endpoint from current authority and accepts its resumed clock', async () => {
  await clearTurnAdvanceInterstitial(request);
  expect(mocks.callable).toHaveBeenCalledWith('functions','clearTurnAdvanceInterstitial');
  expect(mocks.call).toHaveBeenCalledWith({...request,sessionId:'s1'});
  expect(useSessionStore.getState().session?.turnPhase).toEqual(resumed);
});
it('rejects cache or an obsolete hold before calling', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(clearTurnAdvanceInterstitial(request)).rejects.toThrow(/Reconnect/);
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  await expect(clearTurnAdvanceInterstitial({...request,expectedCycle:1})).rejects.toThrow(/changed/);
  expect(mocks.call).not.toHaveBeenCalled();
});
it.each(['new-snapshot','new-actor','new-cycle','new-deadline','offline','wrong-reply'] as const)('does not apply a delayed clear after %s',async change => {
  let finish!: (reply:unknown)=>void;
  mocks.call.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=clearTurnAdvanceInterstitial(request);
  const old=useSessionStore.getState().session!;
  if(change==='new-snapshot'){const newer={...old,updatedAt:'new'};acceptCallableSessionAuthority(newer,'u1');useSessionStore.getState().setSession(newer);}
  if(change==='new-actor')useSessionStore.getState().setMe({...useSessionStore.getState().me!,uid:'u2'});
  if(change==='new-cycle')useSessionStore.getState().setSession({...old,currentTurn:3});
  if(change==='new-deadline')useSessionStore.getState().setSession({...old,turnPhase:{...phase,teamPhaseEndsAt:'2026-10-03T01:06:00.000Z'}});
  if(change==='offline')useSessionStore.getState().setConnection('offline');
  const current=useSessionStore.getState().session;
  finish({data:{status:'cleared',cycle:change==='wrong-reply'?3:2,pausedAt:request.expectedPausedAt,turnPhase:resumed}});
  await pending;expect(useSessionStore.getState().session).toEqual(current);
});
