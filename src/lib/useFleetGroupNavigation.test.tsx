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
