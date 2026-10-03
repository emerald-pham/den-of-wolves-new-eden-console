import {createRoot} from 'react-dom/client';
import {useSessionStore} from '@/store/useSessionStore';
import TurnStartAnnouncement from '@/components/TurnStartAnnouncement';
import '@/index.css';
if (!Object.hasOwn(window,'pc07BriefingLayout')) throw new Error('Local harness only.');
const pausedAt=new Date().toISOString();
const sample = new URLSearchParams(location.search);
const cycle = sample.has('initial') ? 1 : 2;
useSessionStore.getState().setIdentity({id:'local-briefing',name:'Local fixture',joinCode:'0000',phase:'active',currentTurn:2,
 ownerUid:'fixture',createdAt:pausedAt,updatedAt:pausedAt,turnStartAnnouncement:{turn:2,survivorPopulation:242500},
 turnPhase:{turn:2,teamPhaseEndsAt:new Date(Date.now()+300000).toISOString(),openAirspaceEndsAt:new Date(Date.now()+1200000).toISOString(),
  airspace:{state:'restricted',tickerActive:true,pressAccess:false},timerPause:{reason:'turn-interstitial',window:'restricted',remainingMs:300000,pausedAt}}},
{uid:'fixture',sessionId:'local-briefing',displayName:'Local participant',role:'player',seatId:null,joinedAt:pausedAt});
useSessionStore.setState(state => ({session: {...state.session!, currentTurn: cycle,
 turnStartAnnouncement: {...state.session!.turnStartAnnouncement!, turn: cycle},
 turnPhase: {...state.session!.turnPhase!, turn: cycle}}}));
useSessionStore.getState().setConnection(sample.has('offline') ? 'offline' : 'live');useSessionStore.getState().setSessionSnapshotFreshness('server');
createRoot(document.getElementById('root')!).render(<><main><h1>LOCAL PREPARED LAYOUT // No gameplay proof</h1><button>Underlying console action</button></main><TurnStartAnnouncement /></>);
