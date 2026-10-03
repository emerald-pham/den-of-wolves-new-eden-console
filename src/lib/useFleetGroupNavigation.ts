import {useEffect,useState} from 'react';
import {useSessionStore} from '@/store/useSessionStore';
import {readFleetGroupNavigation} from './fleetGroupService';
import {captureSessionAuthority,isCurrentSessionAuthority} from './sessionMutationAuthority';
import type {LocalDradisNavigation} from '@/components/localDradisContacts';
const SAMPLE_INTERVAL_MS=5000;
/** One current-audience sample stream; a changed identity or cached snapshot removes every old contact. */
export function useFleetGroupNavigation(enabled:boolean,gmViewerShipId?:string):LocalDradisNavigation|undefined{
 const session=useSessionStore(s=>s.session),me=useSessionStore(s=>s.me);
 const connection=useSessionStore(s=>s.connection),freshness=useSessionStore(s=>s.sessionSnapshotFreshness);
 const instance=useSessionStore(s=>s.gmInstance);
 const gm=me?.role==='gm';
 const fresh=enabled&&connection==='live'&&freshness==='server'&&session?.phase==='active'&&me?.sessionId===session.id&&
  Boolean(me?.uid)&& (gm?Boolean(gmViewerShipId&&instance?.uid===me?.uid&&instance.sessionId===session.id):Boolean(me?.fleetGroupId));
 const identity=fresh?JSON.stringify([session?.id,me?.uid,me?.fleetGroupId,me?.role,gmViewerShipId,instance?.id,
  session?.currentTurn,session?.updatedAt,session?.playerDiscovery?.revision]):'';
 const [sample,setSample]=useState<{identity:string;projection:LocalDradisNavigation}>();
 useEffect(()=>{
  if(!identity)return;
  let alive=true,inFlight=false;
  const refresh=async()=>{
   if(!alive||inFlight||!window.navigator.onLine)return;
   inFlight=true;
   const current=useSessionStore.getState();const checkpoint=captureSessionAuthority(current.session!.id,current.me!.uid);
   try{
    const projection=gm?await readFleetGroupNavigation(gmViewerShipId):await readFleetGroupNavigation();
    if(alive&&isCurrentSessionAuthority(checkpoint)&&(gm||projection.groupId===useSessionStore.getState().me?.fleetGroupId))
     setSample({identity,projection});
   }catch{if(alive)setSample(undefined);}finally{inFlight=false;}
  };
  void refresh();const timer=window.setInterval(()=>void refresh(),SAMPLE_INTERVAL_MS);
  return()=>{alive=false;window.clearInterval(timer);};
 },[identity,gm,gmViewerShipId]);
 return identity&&sample?.identity===identity?sample.projection:undefined;
}
