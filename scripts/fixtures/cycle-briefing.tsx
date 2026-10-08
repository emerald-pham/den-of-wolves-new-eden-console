import { createRoot } from 'react-dom/client';
import TurnStartAnnouncement from '../../src/components/TurnStartAnnouncement';
import { useSessionStore } from '../../src/store/useSessionStore';
import '../../src/index.css';
const actor = new URLSearchParams(location.search).get('actor') === 'player' ? 'player' : 'gm';
const stamp = '2026-10-08T00:00:00.000Z';
useSessionStore.getState().reset();
useSessionStore.getState().setIdentity({id:'visual-fixture',name:'Synthetic briefing',joinCode:'FIXTURE',ownerUid:'fixture-gm',
  phase:'active',currentTurn:1,createdAt:stamp,updatedAt:stamp,
  turnStartAnnouncement:{turn:1,survivorPopulation:242500},
  turnPhase:{turn:1,teamPhaseEndsAt:stamp,openAirspaceEndsAt:stamp,
    airspace:{state:'restricted',tickerActive:true,pressAccess:false},
    timerPause:{reason:'turn-interstitial',window:'restricted',remainingMs:300000,pausedAt:stamp}}},
  {uid:'fixture-'+actor,sessionId:'visual-fixture',role:actor,displayName:'Synthetic actor',seatId:null,joinedAt:stamp});
if (actor === 'gm') useSessionStore.getState().setGmInstance({id:'fixture-gm-instance',uid:'fixture-gm',sessionId:'visual-fixture',name:'Synthetic GM',deviceLabel:'Fixture',claimedAt:stamp});
useSessionStore.getState().setConnection('live');
useSessionStore.getState().setSessionSnapshotFreshness('server');
createRoot(document.getElementById('root')!).render(<div data-motion="reduce"><TurnStartAnnouncement /></div>);
