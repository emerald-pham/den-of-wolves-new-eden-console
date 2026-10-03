import {useState} from 'react';
import {PC07GroupsReview,PC07RecoveryReview,PC07KnownSystemsReview,PC07TaxiReview,PC07AttackReview} from './PC07ReviewParts';
import './PC07ReviewScene.css';

const STEPS=[
 {label:'1 Groups and DRADIS',title:'Share one clock; see your local fleet',prompt:'Switch between two prepared group perspectives, send a local note, and check that cached authority removes contacts.'},
 {label:'2 Known systems',title:'Share what this ship has actually scanned',prompt:'Choose a scanned destination and recipient. An unknown location stays unavailable; another group’s information does not appear.'},
 {label:'3 Taxi and rejoin',title:'Carry a bounded load and rejoin at the same fix',prompt:'Choose a scout and a permitted payload. Check fuel, one attempt this cycle, current membership and the resulting pursuit state.'},
 {label:'4 Attack lifecycle',title:'Follow automatic progress and real player choices',prompt:'Declare the prepared attack and follow committed range results, weapon use or pass, boarding defence and reopened airspace.'},
 {label:'5 Recovery',title:'Recover the same held clock',prompt:'Try offline, reconnect and uncertain clearance states. Clearing this sample resumes its preserved Team Time.'},
] as const;

export default function PC07ReviewScene(){
 const [index,setIndex]=useState(0);
 const step=STEPS[index]!;
 return <div className="pc07-review">
  <a className="pc07-review__skip" href="#pc07-review-content">Skip to review workspace</a>
  <header className="pc07-review__header"><div><p>New Eden Console // solo review</p><h1>PC07 // Airspace, split fleets and attacks</h1></div>
   <a className="cic-text-button" href="/#/">Return to station and console chooser</a></header>
  <p className="pc07-review__boundary" role="note" aria-label="Prepared review boundary">Prepared review // No live session writes. Controls change local samples only. Authenticated emulator gameplay, Rules, independent review and deployment evidence are recorded separately.</p>
  <nav className="pc07-review__steps" aria-label="PC07 review steps">{STEPS.map((item,i)=><button key={item.label} className="cic-action-button" type="button" aria-pressed={i===index} onClick={()=>setIndex(i)}>{item.label}</button>)}</nav>
  <main id="pc07-review-content" className="pc07-review__content" tabIndex={-1}>
   <section className="pc07-review__intro cic-frame"><p>Check {index+1} of {STEPS.length}</p><h2>{step.title}</h2><p>{step.prompt}</p></section>
   {index===0&&<PC07GroupsReview />}{index===1&&<PC07KnownSystemsReview />}{index===2&&<PC07TaxiReview />}{index===3&&<PC07AttackReview />}{index===4&&<PC07RecoveryReview />}
   <div className="pc07-review__step-controls"><button className="cic-action-button" type="button" aria-label="Previous review step" disabled={index===0} onClick={()=>setIndex(i=>Math.max(0,i-1))}>Previous check</button>
    <p>{index+1} / {STEPS.length} // local samples</p><button className="cic-action-button" type="button" aria-label="Next review step" disabled={index===STEPS.length-1} onClick={()=>setIndex(i=>Math.min(STEPS.length-1,i+1))}>Next check</button></div>
  </main><footer className="pc07-review__footer">PC07 prepared solo review // gameplay proof remains separately labelled.</footer>
 </div>;
}
