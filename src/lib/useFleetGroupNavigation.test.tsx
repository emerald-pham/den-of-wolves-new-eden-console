import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {useSessionStore} from '@/store/useSessionStore';
const read=vi.hoisted(()=>vi.fn());
vi.mock('./fleetGroupService',()=>({readFleetGroupNavigation:read}));
import {useFleetGroupNavigation} from './useFleetGroupNavigation';
const projection={groupId:'fleet-1',navigationRevision:1,fleetPartitionRevision:1,sampledAt:'2026-10-03T01:00:00.000Z',
 ships:[{shipId:'aegis',fleetGroupId:'fleet-1',coordinate:'0000'}],dockedShuttles:[],transits:[]};
beforeEach(()=>{
 useSessionStore.getState().reset();read.mockReset().mockResolvedValue(projection);
 useSessionStore.getState().setIdentity({id:'s1',name:'PC07',joinCode:'1234',ownerUid:'u1',phase:'active',currentTurn:1,createdAt:'',updatedAt:''},
  {uid:'u1',sessionId:'s1',displayName:'Captain',role:'player',seatId:null,joinedAt:'',fleetGroupId:'fleet-1'});
 useSessionStore.getState().setConnection('live');useSessionStore.getState().setSessionSnapshotFreshness('server');
});
it('connects the current group endpoint to a fresh live consumer',async()=>{
 const {result}=renderHook(()=>useFleetGroupNavigation(true));await waitFor(()=>expect(result.current).toEqual(projection));expect(read).toHaveBeenCalledWith();
});
it('has no navigation for cache or a disabled catalog consumer',async()=>{
 useSessionStore.getState().setSessionSnapshotFreshness('cache');const {result,rerender}=renderHook(({enabled})=>useFleetGroupNavigation(enabled),{initialProps:{enabled:true}});
 expect(result.current).toBeUndefined();expect(read).not.toHaveBeenCalled();
 act(()=>useSessionStore.getState().setSessionSnapshotFreshness('server'));rerender({enabled:false});expect(result.current).toBeUndefined();
});
it('drops a late response after group/identity changes and never restores an old sample',async()=>{
 let finish!:(value:unknown)=>void;read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const {result}=renderHook(()=>useFleetGroupNavigation(true));await waitFor(()=>expect(finish).toBeDefined());
 act(()=>{useSessionStore.getState().setMe({...useSessionStore.getState().me!,fleetGroupId:'fleet-2'});});
 await act(async()=>finish(projection));expect(result.current).toBeUndefined();
});
it('clears an accepted projection immediately when reconnect needs server authority',async()=>{
 const {result}=renderHook(()=>useFleetGroupNavigation(true));await waitFor(()=>expect(result.current).toEqual(projection));
 act(()=>useSessionStore.getState().setSessionSnapshotFreshness('cache'));expect(result.current).toBeUndefined();
});
it('does not replay a previously committed sample after reconnect while the fresh read is pending',async()=>{
 let finish!:(value:unknown)=>void;
 read.mockResolvedValueOnce(projection).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const {result}=renderHook(()=>useFleetGroupNavigation(true));
 await waitFor(()=>expect(result.current).toEqual(projection));
 act(()=>useSessionStore.getState().setConnection('offline'));
 expect(result.current).toBeUndefined();
 act(()=>useSessionStore.getState().setConnection('live'));
 await waitFor(()=>expect(read).toHaveBeenCalledTimes(2));
 expect(result.current).toBeUndefined();
 const fresh={...projection,navigationRevision:2,sampledAt:'2026-10-03T01:00:05.000Z'};
 await act(async()=>finish(fresh));
 await waitFor(()=>expect(result.current).toEqual(fresh));
});
const touchSession=(updatedAt:string)=>act(()=>{
 const current=useSessionStore.getState().session!;useSessionStore.getState().setSession({...current,updatedAt});
});
it('keeps the last good plot while the member budget is exhausted and replaces it on the next permitted sample',async()=>{
 vi.useFakeTimers();
 try{
  const exhausted=Object.assign(new Error('Too many requests for this session. Please try again shortly.'),
   {code:'functions/resource-exhausted',details:{commandError:'rate-limited',retryAfterSeconds:4}});
  read.mockResolvedValueOnce(projection).mockRejectedValueOnce(exhausted);
  const {result}=renderHook(()=>useFleetGroupNavigation(true));
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(result.current).toEqual(projection);
  await act(async()=>{await vi.advanceTimersByTimeAsync(5_000);});
  expect(read).toHaveBeenCalledTimes(2);
  expect(result.current).toEqual(projection);
  const next={...projection,sampledAt:'2026-10-03T01:00:10.000Z'};
  read.mockResolvedValueOnce(next);
  await act(async()=>{await vi.advanceTimersByTimeAsync(5_000);});
  expect(result.current).toEqual(next);
  expect(read).toHaveBeenCalledTimes(3);
 }finally{vi.useRealTimers();}
});
it('clears the plot when a sample fails for a reason other than the rate limit',async()=>{
 vi.useFakeTimers();
 try{
  read.mockResolvedValueOnce(projection).mockRejectedValueOnce(Object.assign(new Error('denied'),{code:'functions/permission-denied'}));
  const {result}=renderHook(()=>useFleetGroupNavigation(true));
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(result.current).toEqual(projection);
  await act(async()=>{await vi.advanceTimersByTimeAsync(5_000);});
  expect(result.current).toBeUndefined();
 }finally{vi.useRealTimers();}
});
it('keeps the current plot while a session update refresh is pending',async()=>{
 vi.useFakeTimers();
 try{
  const {result}=renderHook(()=>useFleetGroupNavigation(true));
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(result.current).toEqual(projection);
  let finish!:(value:unknown)=>void;read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  touchSession('2026-10-03T01:00:01.000Z');
  expect(result.current).toEqual(projection);
  await act(async()=>{await vi.advanceTimersByTimeAsync(5_000);});
  const moved={...projection,navigationRevision:2};
  await act(async()=>finish(moved));
  expect(result.current).toEqual(moved);
 }finally{vi.useRealTimers();}
});
it('spaces session-update refreshes so three devices stay well under the 180 per minute budget',async()=>{
 vi.useFakeTimers();
 try{
  renderHook(()=>useFleetGroupNavigation(true));
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  // A busy minute: the shared session document changes ten times a second.
  for(let tick=1;tick<=600;tick++){
   touchSession(new Date(Date.UTC(2026,9,3,1,0,0,tick*100)).toISOString());
   await act(async()=>{await vi.advanceTimersByTimeAsync(100);});
  }
  const perDevice=read.mock.calls.length;
  expect(perDevice).toBeLessThanOrEqual(21);
  expect(3*perDevice).toBeLessThan(180/2);
  // Updates are still sampled promptly rather than starved by the cadence.
  expect(perDevice).toBeGreaterThanOrEqual(13);
 }finally{vi.useRealTimers();}
});
it('refreshes at once and drops the old plot when the audience changes',async()=>{
 vi.useFakeTimers();
 try{
  const {result}=renderHook(()=>useFleetGroupNavigation(true));
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(result.current).toEqual(projection);
  let finish!:(value:unknown)=>void;read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  act(()=>{const current=useSessionStore.getState().session!;useSessionStore.getState().setSession({...current,fleetPartitionRevision:2});});
  expect(result.current).toBeUndefined();
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(read).toHaveBeenCalledTimes(2);
  await act(async()=>finish(projection));
  expect(result.current).toEqual(projection);
 }finally{vi.useRealTimers();}
});
