import { it, expect, vi, afterEach } from 'vitest';
const fixture=vi.hoisted(()=>{const state={currentUser:null as null|{uid:string},authStateReady:async()=>{}};return {state,listener:undefined as undefined|((user:unknown)=>void),invalidated:0,loads:[] as Promise<unknown>[]};});
vi.mock('../lib/firebase',()=>({auth:()=>fixture.state,functions:()=>({})}));
vi.mock('../lib/firebaseConfig',()=>({useEmulators:true,firebaseConfig:{projectId:'demo-dow-casting-test'}}));
vi.mock('firebase/auth',()=>({onAuthStateChanged:(_auth:unknown,listener:(user:unknown)=>void)=>{fixture.listener=listener;return ()=>{};},signInAnonymously:async()=>{fixture.state.currentUser={uid:'synthetic-owner'};fixture.listener?.(fixture.state.currentUser);return {user:fixture.state.currentUser};}}));
vi.mock('firebase/functions',()=>({httpsCallable:()=>async()=>({data:{sessions:[],gmAccessActive:false}})}));
vi.mock('../../companion/ui.mjs',()=>({mountCasting:(_root:unknown,{adapter}:{adapter:{load():Promise<unknown>}})=>{fixture.loads.push(adapter.load().catch(error=>error));return {invalidateSession:()=>{fixture.invalidated++;},dispose:()=>{}};}}));
afterEach(()=>{window.dispatchEvent(new Event('pagehide'));document.body.replaceChildren();});
it('first anonymous identity hydration does not clear the newly opening private flow',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false}));document.body.innerHTML='<main id="casting-app"></main>';await import('./main');await new Promise(resolve=>setTimeout(resolve,0));await Promise.all(fixture.loads);expect(fixture.state.currentUser?.uid).toBe('synthetic-owner');expect(fixture.invalidated).toBe(0);expect(fixture.loads).toHaveLength(1);expect(await fixture.loads[0]).toMatchObject({prerequisite:{mode:'firebase'}});
});
