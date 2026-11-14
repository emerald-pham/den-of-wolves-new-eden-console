import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useSessionStore} from '@/store/useSessionStore';
import {readFleetGroupNavigation} from './fleetGroupService';
import {captureSessionAuthority,isCurrentSessionAuthority} from './sessionMutationAuthority';
import type {LocalDradisNavigation} from '@/components/localDradisContacts';
const SAMPLE_INTERVAL_MS=5000;
/**
 * A session-document update asks for a fresh sample no sooner than this after the previous
 * request. With the five-second cadence a device sends at most 60 000 / 3 000 = 20 samples a
 * minute however busy the session is, so one member's three devices use at most a third of the
 * server's 180/min budget. A new audience (or a return from cache) is never delayed.
 */
const UPDATE_REFRESH_SPACING_MS=3000;
const isRateLimited=(error:unknown)=>typeof error==='object'&&error!==null&&
 (error as {code?:unknown}).code==='functions/resource-exhausted';
/** One current-audience sample stream; a changed audience or cached snapshot removes every old contact. */
export function useFleetGroupNavigation(enabled:boolean,gmViewerShipId?:string):LocalDradisNavigation|undefined{
 const session=useSessionStore(s=>s.session),me=useSessionStore(s=>s.me);
 const connection=useSessionStore(s=>s.connection),freshness=useSessionStore(s=>s.sessionSnapshotFreshness);
 const instance=useSessionStore(s=>s.gmInstance);
 const gm=me?.role==='gm';
 const fresh=enabled&&connection==='live'&&freshness==='server'&&session?.phase==='active'&&me?.sessionId===session.id&&
  Boolean(me?.uid)&& (gm?Boolean(gmViewerShipId&&instance?.uid===me?.uid&&instance.sessionId===session.id):Boolean(me?.fleetGroupId));
 const identity=fresh?JSON.stringify([session?.id,me?.uid,me?.fleetGroupId,me?.role,gmViewerShipId,instance?.id,
  session?.currentTurn,session?.playerDiscovery?.revision,session?.fleetPartitionRevision]):'';
 // Any other session write may move a contact: sample again, keeping the same-audience plot meanwhile.
 const updatedAt=fresh?session?.updatedAt:undefined;
 const [sample,setSample]=useState<{identity:string;projection:LocalDradisNavigation}>();
 const previousIdentity=useRef(identity);
 const lastRequestAt=useRef(Number.NEGATIVE_INFINITY);
 const streamIdentity=useRef('');
 useLayoutEffect(()=>{
  if(previousIdentity.current===identity)return;
  previousIdentity.current=identity;
  setSample(undefined);
 },[identity]);
 useEffect(()=>{
  if(!identity){streamIdentity.current='';return;}
  let alive=true,inFlight=false,timer:number|undefined;
  const refresh=async()=>{
   if(!alive||inFlight||!window.navigator.onLine)return;
   inFlight=true;lastRequestAt.current=Date.now();
   const current=useSessionStore.getState();const checkpoint=captureSessionAuthority(current.session!.id,current.me!.uid);
   try{
    const projection=gm?await readFleetGroupNavigation(gmViewerShipId):await readFleetGroupNavigation();
    if(alive&&isCurrentSessionAuthority(checkpoint)&&(gm||projection.groupId===useSessionStore.getState().me?.fleetGroupId))
     setSample({identity,projection});
   }catch(error){
    // An exhausted budget is temporary: the last same-audience plot stays until a permitted sample.
    if(alive&&!isRateLimited(error))setSample(undefined);
   }finally{inFlight=false;}
  };
  const updateOnly=streamIdentity.current===identity;
  streamIdentity.current=identity;
  const delay=updateOnly?Math.max(0,lastRequestAt.current+UPDATE_REFRESH_SPACING_MS-Date.now()):0;
  const kick=window.setTimeout(()=>{
   void refresh();timer=window.setInterval(()=>void refresh(),SAMPLE_INTERVAL_MS);
  },delay);
  return()=>{alive=false;window.clearTimeout(kick);window.clearInterval(timer);};
 },[identity,updatedAt,gm,gmViewerShipId]);
 return identity&&sample?.identity===identity?sample.projection:undefined;
}
