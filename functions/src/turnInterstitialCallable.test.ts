import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { createTurnInterstitialHandler } from './turnInterstitialCallable';
const pausedAt = '2026-10-03T01:00:00.000Z';
const original = {turn:2,teamPhaseEndsAt:'2026-10-03T01:05:00.000Z',
  openAirspaceEndsAt:'2026-10-03T01:20:00.000Z',
  airspace:{state:'restricted',tickerActive:true,pressAccess:false},
  timerPause:{reason:'turn-interstitial',window:'restricted',remainingMs:300000,pausedAt}};
let docs: Record<string,Record<string,unknown>>;let writes: Array<{path:string,data:Record<string,unknown>}>;
const request = (overrides = {},uid='u1') => ({auth:{uid},data:{sessionId:'s1',requestId:'clear1',expectedCycle:2,expectedPausedAt:pausedAt,...overrides}});
const db = {doc:(path:string)=>path,runTransaction:async(fn:(tx:unknown)=>unknown)=>fn({
  get:async(path:string)=>({exists:!!docs[path],get:(k:string)=>docs[path]?.[k]}),
  update:(path:string,data:Record<string,unknown>)=>{writes.push({path,data});docs[path]={...docs[path],...data};},
  set:(path:string,data:Record<string,unknown>)=>{writes.push({path,data});docs[path]=data;}
})} as unknown as Firestore;
const handler = createTurnInterstitialHandler({db,
  requireUid:(auth)=>{if(!auth?.uid)throw new HttpsError('unauthenticated','Sign in');return auth.uid;},
  isActivePlayer:(p:DocumentSnapshot)=>p.exists && p.get('connected')===true && !p.get('kickedAt'),
  requireActiveGameplayPhase:(s:DocumentSnapshot)=>{if(s.get('phase')!=='active')throw new HttpsError('failed-precondition','Inactive');},
  serverTimestamp:()=> 'server-time',now:()=>Date.parse('2026-10-03T01:10:00.000Z')});
beforeEach(()=>{docs={'sessions/s1':{phase:'active',currentTurn:2,turnPhase:original},
  'sessions/s1/players/u1':{connected:true},'sessions/s1/players/u2':{connected:true},
  'sessions/s1/turnInterstitials/2':{cycle:2,pausedAt,status:'held'}};writes=[];});
it('commits one exact resume, one safe event and a private receipt, then replays without writes',async()=>{
  const result=await handler(request());
  expect(result.turnPhase.timerPause).toBeUndefined();
  expect(result.turnPhase.teamPhaseEndsAt).toBe('2026-10-03T01:15:00.000Z');
  expect(writes.filter(w=>w.path.includes('/events/'))).toHaveLength(1);
  const firstWrites=writes.length;
  expect(await handler(request())).toEqual(result);expect(writes).toHaveLength(firstWrites);
  expect(await handler(request({requestId:'clear2'},'u2'))).toEqual(result);
  expect(writes.filter(w=>w.path.includes('/events/'))).toHaveLength(1);
});
it('denies wrong actor before replay and conflicting fingerprints without a resume',async()=>{
  await handler(request());const prior=writes.length;
  docs['sessions/s1/players/u1']!.connected=false;
  await expect(handler(request())).rejects.toMatchObject({code:'permission-denied'});
  docs['sessions/s1/players/u1']!.connected=true;
  await expect(handler(request({},'u2'))).rejects.toMatchObject({code:'permission-denied'});
  await expect(handler(request({expectedPausedAt:'2026-10-03T01:00:01.000Z'}))).rejects.toMatchObject({code:'failed-precondition'});
  expect(writes).toHaveLength(prior);
});
it('rejects stale, malformed and unrelated holds with no writes',async()=>{
  for(const input of [{expectedCycle:3},{expectedPausedAt:'wrong'},{outcome:'resume'},{requestId:''}])
    await expect(handler(request(input))).rejects.toBeDefined();
  docs['sessions/s1']!.turnPhase={...original,timerPause:{...original.timerPause,reason:'empty-session'}};
  await expect(handler(request())).rejects.toMatchObject({code:'failed-precondition'});
  expect(writes).toHaveLength(0);
});
