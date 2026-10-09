import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';
import { firebaseConfig, useEmulators } from '../lib/firebaseConfig';
import { createCastingFirebaseAdapter } from './adapter';
import { mountCasting } from '../../companion/ui.mjs';
import '../styles/cic.css';
import '../../companion/casting.css';

const root=document.getElementById('casting-app');
if(!root)throw new Error('Casting root missing');
async function start(root:HTMLElement) {
 if(useEmulators){if(!/^demo-dow-casting-[a-z0-9-]+$/.test(firebaseConfig.projectId??'')||!['localhost','127.0.0.1'].includes(location.hostname))throw new Error('Casting emulator integration requires an isolated demo-dow-casting project and loopback host.');const banner=document.createElement('p');banner.className='casting-fixture-banner';banner.textContent='LOCAL EMULATOR INTEGRATION · Synthetic data only';root.before(banner);}
 else if(import.meta.env.VITE_CASTING_ENABLED!=='1'){root.textContent='Casting is not published yet.';return;}
 const identity=auth();await identity.authStateReady();
 let signIn:Promise<unknown>|undefined;const ensureIdentity=async()=>{if(!identity.currentUser){signIn??=signInAnonymously(identity).finally(()=>{signIn=undefined;});await signIn;}};
 if(!location.hash.startsWith('#dossier/'))await ensureIdentity();
 const initialWorkspace=location.hash.startsWith('#workspace/')?location.hash.slice(11):'';
 const adapter=createCastingFirebaseAdapter({workspace:initialWorkspace,ensureIdentity,call:async(name,payload)=>(await httpsCallable(functions(),name)(payload)).data,onBinding:workspace=>history.replaceState(null,'',`#workspace/${workspace}`)});
 let mounted:ReturnType<typeof mountCasting>|undefined,uid=identity.currentUser?.uid,mountGeneration=0;
 async function mount(){const generation=++mountGeneration;const[kind,handle]=location.hash.slice(1).split('/');const route=(kind==='form'||kind==='dossier')&&handle?{name:kind,handle}:{name:'owner'};if(route.name!=='dossier')await ensureIdentity();if(generation!==mountGeneration)return;uid=identity.currentUser?.uid;mounted?.dispose();let introSeen=false;try{introSeen=localStorage.getItem('dow-casting-intro-seen')==='yes';}catch{/* Optional preference only. */}mounted=mountCasting(root,{adapter,route,introSeen,motionReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,rememberIntro:()=>{try{localStorage.setItem('dow-casting-intro-seen','yes');}catch{/* No private data storage. */}}});}
 const stopAuth=onAuthStateChanged(identity,user=>{if(user?.uid!==uid){uid=user?.uid;void adapter.resetAuthority();mounted?.invalidateSession();}});
 await mount();window.addEventListener('hashchange',()=>{void mount().catch(()=>{mounted?.invalidateSession();});});
 const heartbeat=window.setInterval(()=>{void adapter.heartbeat().catch(error=>{if(['permission-denied','unauthenticated'].includes(error?.code)){void adapter.resetAuthority();mounted?.invalidateSession();}});},15000);
 window.addEventListener('pagehide',()=>{window.clearInterval(heartbeat);stopAuth();mounted?.dispose();},{once:true});
}
void start(root).catch(()=>{root.textContent='Casting could not connect. Check the approved local configuration.';});
