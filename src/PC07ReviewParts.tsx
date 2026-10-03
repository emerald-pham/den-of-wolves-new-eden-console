import {useMemo, useState} from 'react';
import ShipPlot from '@/components/ShipPlot';
import FleetGroupPanel from '@/components/FleetGroupPanel';
import CycleBriefingClearanceView from '@/components/CycleBriefingClearanceView';
import AirspaceStatusView from '@/components/AirspaceStatusView';
import {ScoutResultPanel,GmScoutResolutionLog} from '@/components/ScoutResultPanels';
import {WolfAttackStatusView} from '@/components/WolfAttackStatusPanel';
import PC07AttackChoicesReview from './PC07AttackChoicesReview';
import type {LocalDradisNavigation} from '@/components/localDradisContacts';
import type {FleetGroupNavigationProjection,FleetGroupNote} from '@/lib/fleetGroupService';
import type {TurnPhase,WolfAttackMemberView} from '@/types/game';

const SAMPLE_TIME='2026-10-02T12:00:00.000Z';
const SAMPLE_NAVIGATION:FleetGroupNavigationProjection={groupId:'fleet-1',navigationRevision:3,fleetPartitionRevision:2,
 sampledAt:SAMPLE_TIME,ships:[{shipId:'aegis',fleetGroupId:'fleet-1',coordinate:'3145'},
  {shipId:'icebreaker',fleetGroupId:'fleet-1',coordinate:'3145'}],transits:[]};
const NO_TAXI={taxiDestinations:[],taxiShuttles:[],taxiPlayers:[]} as const;
const noop=()=>{};

export function PC07GroupsReview() {
 const [group,setGroup]=useState<'fleet-1'|'fleet-2'>('fleet-1');
 const [current,setCurrent]=useState(true);
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [notes,setNotes]=useState<Record<string,readonly FleetGroupNote[]>>({});
 const [notice,setNotice]=useState('LOCAL SAMPLE // Notes belong to the selected prepared group.');
 const sampledAt=useMemo(()=>new Date().toISOString(),[]);
 const phase=useMemo<TurnPhase>(()=>({turn:2,teamPhaseEndsAt:new Date(Date.now()-60000).toISOString(),
  openAirspaceEndsAt:new Date(Date.now()+900000).toISOString(),airspace:{state:'lifted',tickerActive:true,pressAccess:true}}),[]);
 const ships=group==='fleet-1'?['aegis','icebreaker']:['shepherd','dione'];
 const projection:LocalDradisNavigation={groupId:group,navigationRevision:3,fleetPartitionRevision:2,sampledAt,
  ships:ships.map(shipId=>({shipId,fleetGroupId:group,coordinate:group==='fleet-1'?'3145':'6798'})),transits:[]};
 return <section className="pc07-review__workspace" aria-label="Group-local DRADIS sample">
  <div className="pc07-review__controls" role="group" aria-label="Prepared group perspectives">
   <button className="cic-action-button" type="button" aria-pressed={group==='fleet-1'} onClick={()=>setGroup('fleet-1')}>View Fleet-1 sample</button>
   <button className="cic-action-button" type="button" aria-pressed={group==='fleet-2'} onClick={()=>setGroup('fleet-2')}>View Fleet-2 sample</button>
   <button className="cic-action-button" type="button" aria-pressed={!current} onClick={()=>setCurrent(false)}>Cached connection sample</button>
   <button className="cic-action-button" type="button" aria-pressed={current} onClick={()=>setCurrent(true)}>Current server sample</button>
  </div>
  <p className="pc07-review__note">Cycle 2 // one prepared clock for both groups. Fleet-1 pursuit 1; Fleet-2 pursuit 4. Changing perspective does not start a separate clock.</p>
  <div className="pc07-review__plot gm-dradis">
   <ShipPlot hostile={false} aboard viewerId={ships[0]!} requireLocalAuthority localNavigation={current?projection:undefined}
    turnPhase={phase} showGmEffects={false} layout="gm" />
  </div>
  <FleetGroupPanel groupId={group} actorUid="sample-participant" notes={notes[group]??[]} draft={drafts[group]??''} busy={!current}
   navigation={current?projection:null} scannedCoordinates={[]} {...NO_TAXI} canShare={false} onShare={noop} onTaxi={noop}
   notice={current?notice:'CACHED SAMPLE // Await the current group projection before sending a note.'}
   onDraft={text=>setDrafts(old=>({...old,[group]:text}))} onSend={()=>{
    const text=drafts[group]?.trim();if(!current||!text)return;
    setNotes(old=>({...old,[group]:[...(old[group]??[]),{id:`sample-${group}-${(old[group]?.length??0)+1}`,
     actorUid:'sample-participant',text,sentAt:new Date().toISOString()}]}));
    setDrafts(old=>({...old,[group]:''}));setNotice('LOCAL SIMULATION // Note added to this group’s prepared list.');
   }} onRefresh={()=>setNotice('LOCAL SIMULATION // Current prepared group notes retained; no server request sent.')} />
 </section>;
}

export function PC07KnownSystemsReview(){
 const [current,setCurrent]=useState(true);
 const [result,setResult]=useState('LOCAL SAMPLE // Two scanned locations are available to this ship.');
 return <section className="pc07-review__workspace" aria-label="Known system sharing sample">
  <div className="pc07-review__controls"><button className="cic-action-button" type="button" onClick={()=>setCurrent(false)}>Cached knowledge sample</button>
   <button className="cic-action-button" type="button" onClick={()=>setCurrent(true)}>Current knowledge sample</button></div>
  <FleetGroupPanel groupId="fleet-1" actorUid="sample-participant" notes={[]} draft="" busy={!current} notice="LOCAL SAMPLE // Only the current group receives this prepared detail."
   navigation={current?SAMPLE_NAVIGATION:null} scannedCoordinates={['3145','3155']} {...NO_TAXI} canShare
   onDraft={noop} onSend={noop} onRefresh={noop} onTaxi={noop} onShare={(coordinate,recipients)=>{
    if(!current||!['3145','3155'].includes(coordinate))return;
    const ids=recipients==='all'?SAMPLE_NAVIGATION.ships.map(ship=>ship.shipId):recipients;
    const names=ids.filter(id=>SAMPLE_NAVIGATION.ships.some(ship=>ship.shipId===id)).map(id=>id.toUpperCase());
    if(names.length)setResult(`LOCAL SIMULATION // ${coordinate} // ${names.join(', ')} // Scanned detail shared.`);
   }} />
  <p className="pc07-review__result" role="status" aria-label="Known system sample result">{result}</p>
  <p className="pc07-review__note">PREPARED RESULT // A legal Comms choice receives its report automatically; the GM result log records the same committed fact.</p>
  <ScoutResultPanel report={{requestId:'prepared-comms',cycle:2,entitlementId:'comms-officer',targetCoordinate:'3145',status:'resolved',noteId:'prepared-note'}}
   result={{type:'private-scout-result',sessionId:'prepared-pc07',requestId:'prepared-comms',requesterUid:'sample-participant',sourceId:'comms-officer',cycle:2,targetCoordinate:'3145',
    systemFact:{coordinate:'3145',code:'A',title:'Prepared system detail'}}}
   note={{type:'player-discovery-note',id:'prepared-note',cycle:2,targetCoordinate:'3145',systemFact:{coordinate:'3145',code:'A',title:'Prepared system detail'},recordedAt:SAMPLE_TIME}} />
  <GmScoutResolutionLog entries={[{requestId:'prepared-comms',cycle:2,sourceId:'comms-officer',originShipId:'aegis',receivingShipId:'aegis',targetCoordinate:'3145',
   systemFact:{coordinate:'3145',code:'A',title:'Prepared system detail'},recordedAt:SAMPLE_TIME,resolutionMode:'automatic'}]} />
 </section>;
}

export function PC07TaxiReview(){
 const [attempted,setAttempted]=useState(false),[outOfRange,setOutOfRange]=useState(false),[arrived,setArrived]=useState(false),[rejoined,setRejoined]=useState(false);
 const [result,setResult]=useState('LOCAL SAMPLE // Three fuel units and two connected passengers are available.');
 return <section className="pc07-review__workspace" aria-label="Scout taxi and rejoin sample">
  <div className="pc07-review__controls">
   <button className="cic-action-button" type="button" onClick={()=>{setAttempted(false);setOutOfRange(false);setArrived(false);setRejoined(false);setResult('LOCAL SAMPLE RESTORED // No game state changed.');}}>Restore taxi sample</button>
   <button className="cic-action-button" type="button" onClick={()=>setOutOfRange(true)}>Out-of-range destination sample</button>
   <button className="cic-action-button" type="button" onClick={()=>setArrived(true)}>Arrival at the same fix sample</button>
   <button className="cic-action-button" type="button" disabled={!arrived||rejoined} onClick={()=>setRejoined(true)}>Rejoin co-located sample</button>
  </div>
  <FleetGroupPanel groupId="fleet-1" actorUid="sample-pilot" notes={[]} draft="" busy={attempted} notice="LOCAL SAMPLE // The taxi returns; its pilot remains aboard. Other groups’ coordinates stay hidden."
   navigation={SAMPLE_NAVIGATION} scannedCoordinates={[]} canShare={false} taxiDestinations={['shepherd']}
   taxiShuttles={['starlight']} taxiPlayers={[{uid:'sample-passenger-1',label:'Sample crew one'},{uid:'sample-passenger-2',label:'Sample crew two'}]}
   onDraft={noop} onSend={noop} onRefresh={noop} onShare={noop} onTaxi={({payload})=>{
    if(attempted)return;
    if(outOfRange){setResult('LOCAL SIMULATION // Range denied. No fuel, membership or shuttle state changed.');return;}
    setAttempted(true);setResult(payload.kind==='fuel'?`LOCAL SIMULATION // ${payload.units} fuel transferred. One attempt this cycle is now recorded.`:
     `LOCAL SIMULATION // ${payload.playerUids.length} passengers transferred. Their current host and group now govern local information. One attempt this cycle is now recorded.`);
   }} />
  <p className="pc07-review__result" role="status" aria-label="Taxi sample result">{result}</p>
  <p className="pc07-review__result" role="status" aria-label="Rejoin sample result">{rejoined?'LOCAL SIMULATION // Membership rejoined; communication restored; pursuit 4 retained.':
   arrived?'CO-LOCATED SAMPLE // Both group positions now match. Rejoin is available.':'SEPARATED SAMPLE // Rejoin requires the same current fix. Fleet-1 pursuit 1; Fleet-2 pursuit 4.'}</p>
 </section>;
}

export function PC07AttackReview(){
 const [step,setStep]=useState<'targeting'|'long-range'|'boarding'|'resolved'>('targeting'),[paused,setPaused]=useState(false);
 const [results,setResults]=useState<WolfAttackMemberView['results']>([]),[result,setResult]=useState('LOCAL SAMPLE // Attack declaration awaits the prepared facilitator action.');
 const view:WolfAttackMemberView={type:'wolf-attack-member-view',schemaVersion:1,sessionId:'prepared-pc07',attackId:'prepared-attack',turn:2,revision:results.length+1,
  status:step==='resolved'?'resolved':'declared',phase:'active',currentStep:step,range:step==='long-range'?'long':null,
  deadlineAt:'2026-10-02T12:15:00.000Z',serverTime:SAMPLE_TIME,visibility:'members',redaction:['composition','unresolved-dice','facilitator-notes','intervention-state'],results};
 const completeRanges=(use:boolean)=>{
  if(paused||step!=='long-range')return;
  setResults(['long','medium','short'].map(range=>({range:range as 'long'|'medium'|'short',sourceId:use&&range==='long'?'AEGIS':'WOLF',
   targetId:'sample-local-target',bearing:null,contactReference:'LOCAL CONTACT 1',effect:'range-result',outcome:{damage:use&&range==='long'?1:0},serverTime:SAMPLE_TIME})));
  setStep('boarding');setResult(use?'LOCAL SIMULATION // Charged weapon used; Charge retained for its permitted later range. Ranges committed; boarding choice awaits crew.':
   'LOCAL SIMULATION // Charge retained after an explicit pass. Ranges committed; boarding choice awaits crew.');
 };
 return <section className="pc07-review__workspace" aria-label="Automatic attack sample">
  <div className="pc07-review__controls">
   <button className="cic-action-button" type="button" disabled={step!=='targeting'} onClick={()=>{setStep('long-range');setResult('LOCAL SIMULATION // Attack declared. Movement remains restricted while an entitled weapon choice awaits.');}}>Declare attack sample</button>
   <button className="cic-action-button" type="button" disabled={paused||step!=='long-range'} onClick={()=>completeRanges(true)}>Use charged weapon sample</button>
   <button className="cic-action-button" type="button" disabled={paused||step!=='long-range'} onClick={()=>completeRanges(false)}>Pass charged weapon sample</button>
   <button className="cic-action-button" type="button" disabled={paused||step!=='boarding'} onClick={()=>{setResults(old=>[...old,{range:'boarding',sourceId:'LOCAL DEFENCE',targetId:'sample-local-target',bearing:null,
    contactReference:'LOCAL CONTACT 1',effect:'boarding-result',outcome:{survivingBoardingParties:0},serverTime:SAMPLE_TIME}]);setStep('resolved');setResult('LOCAL SIMULATION // Boarding result committed; attack ends; airspace opens once.');}}>Commit boarding sample</button>
   <button className="cic-action-button" type="button" disabled={step==='resolved'} onClick={()=>{setPaused(true);setResult('HELD SAMPLE // Global clock hold suspends this attack; no choice or result is invented.');}}>Pause attack sample</button>
   <button className="cic-action-button" type="button" onClick={()=>{setPaused(false);setResult('RECONNECTED SAMPLE // The same committed progress and pending choice return.');}}>Reconnect attack sample</button>
   <button className="cic-action-button" type="button" onClick={()=>{setStep('targeting');setPaused(false);setResults([]);setResult('LOCAL SAMPLE RESTORED // No game state changed.');}}>Restore attack sample</button>
  </div>
  <WolfAttackStatusView view={view} />
  <p className="pc07-review__note">Five ordered steps: targeting, Long Range, Medium Range, Short Range, Boarding. This prepared sequence illustrates the current audience view; server calculations and genuine player decisions are proved separately.</p>
  <p className="pc07-review__result" role="status" aria-label="Attack sample result">{result}</p>
  <PC07AttackChoicesReview />
 </section>;
}

export function PC07RecoveryReview() {
 const [online,setOnline]=useState(true);
 const [cleared,setCleared]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState('HELD SAMPLE // Cycle briefing has preserved 5:00 of Team Time.');
 const phase=useMemo<TurnPhase>(()=>{const now=Date.now();return{turn:2,teamPhaseEndsAt:new Date(now+300000).toISOString(),
  openAirspaceEndsAt:new Date(now+1200000).toISOString(),airspace:{state:'restricted',tickerActive:true,pressAccess:false},
  timerPause:{reason:'turn-interstitial',window:'restricted',remainingMs:300000,pausedAt:new Date(now).toISOString()}};},[]);
 return <section className="pc07-review__workspace pc07-review__recovery" aria-label="Restriction and cycle briefing recovery sample">
  <div className="pc07-review__controls" role="group" aria-label="Prepared recovery states">
   <button className="cic-action-button" type="button" onClick={()=>{setOnline(false);setResult('CACHED SAMPLE // Current clearance required; prohibited controls stay unavailable.');}}>Offline recovery sample</button>
   <button className="cic-action-button" type="button" onClick={()=>{setOnline(true);setError('');setResult('RECONNECTED SAMPLE // The same held cycle and preserved 5:00 return.');}}>Reconnect sample</button>
   <button className="cic-action-button" type="button" onClick={()=>{setOnline(true);setCleared(false);setError('The clearance could not be confirmed. Retry the same briefing.');}}>Uncertain clearance sample</button>
   <button className="cic-action-button" type="button" onClick={()=>{setOnline(true);setCleared(false);setError('');setResult('HELD SAMPLE RESTORED // No game state changed.');}}>Restore held sample</button>
  </div>
  {!cleared&&<CycleBriefingClearanceView online={online} clearing={false} error={error} onClear={()=>{
   if(!online)return;setCleared(true);setError('');setResult('LOCAL SIMULATION // Briefing cleared; 5:00 preserved Team Time resumes. No game clock changed.');
  }} />}
  <div className="pc07-review__panel cic-frame">
   <AirspaceStatusView current={online} phase={cleared?{turn:phase.turn,teamPhaseEndsAt:phase.teamPhaseEndsAt,
    openAirspaceEndsAt:phase.openAirspaceEndsAt,airspace:phase.airspace}:phase} />
   <p className="pc07-review__note">Clearing the briefing resumes Team Time. Movement stays restricted until the authoritative Coordination window or attack end condition permits it.</p>
   <p className="pc07-review__result" role="status" aria-label="Recovery sample result">{result}</p>
  </div>
 </section>;
}
