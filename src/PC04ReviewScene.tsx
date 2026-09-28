import { useState } from 'react';
import FleetGroupContext from '@/components/FleetGroupContext';
import './PC04ReviewScene.css';

type Step = 'entry' | 'copy' | 'mission' | 'split' | 'recovery';
type SplitState = 'whole' | 'split' | 'taxi' | 'rejoin';

const STEPS: readonly { readonly id: Step; readonly label: string; readonly intro: string }[] = [
  { id: 'entry', label: '1 Enter once', intro: 'Use one early console catalog. Ordinary players enter a station; the authenticated GM joins through Role Select.' },
  { id: 'copy', label: '2 Read the console', intro: 'Check the CIC typography, current console wording, and exact default fleet alert.' },
  { id: 'mission', label: '3 Follow a mission', intro: 'Follow one group-bound mission from recorded team choice through private hand and automatic procedure log.' },
  { id: 'split', label: '4 Follow a split', intro: 'Keep group locations, rosters, pursuit, communications, and the scout-taxi exception distinct.' },
  { id: 'recovery', label: '5 Recover safely', intro: 'Compare stale, replay, and lost-acknowledgement states without repeating a committed procedure.' },
];

const RED_ALERT = 'RED ALERT // WOLF ATTACK IMMINENT ALL HANDS TO BATTLE STATIONS. NON-CREW MUST SHELTER IN PLACE UNTIL ALERT LIFTED';

function EntryCheck() {
  const [entered, setEntered] = useState(false);
  return <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared unified console entry">
    <header className="pc04-review__panel-heading">
      <div><p className="cic-overline">SINGLE EARLY SCREEN</p><h2>Console and station entry</h2></div>
      <p>PLAYER PATH // NO SECOND ROLE CHOICE</p>
    </header>
    <div className="pc04-review__entry-grid">
      <article className="pc04-review__entry-card" data-entry-state="assigned">
        <p>Assigned console</p><h3>AEGIS // Admiral</h3><p>Held by you // ready to enter</p>
        <button className="cic-action-button" type="button" onClick={() => setEntered(true)}>Enter assigned console</button>
      </article>
      <article className="pc04-review__entry-card" data-entry-state="open">
        <p>Open console</p><h3>Dione // Engineer</h3><p>First entry claims this station through the server.</p>
        <button className="cic-action-button" type="button" disabled>Prepared claim only</button>
      </article>
      <article className="pc04-review__entry-card" data-entry-state="view">
        <p>View only</p><h3>Shepherd // Scientist</h3><p>Occupied // inspection does not transfer authority.</p>
        <button className="cic-text-button" type="button" disabled>Prepared view</button>
      </article>
      <article className="pc04-review__entry-card pc04-review__entry-card--gm" data-entry-state="gm">
        <p>Authenticated facilitator path</p><h3>GM join // Role Select</h3><p>Separate from ordinary station entry.</p>
        <button className="cic-text-button" type="button" disabled>Prepared GM access</button>
      </article>
    </div>
    <p className="pc04-review__result" role="status" aria-label="Prepared entry result">
      {entered
        ? 'Prepared result // single server-authorized console claim // catalog position retained for return'
        : 'Prepared result // choose the assigned console to review the entry handoff'}
    </p>
  </section>;
}

function CopyCheck() {
  return <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared typography and copy check">
    <header className="pc04-review__panel-heading">
      <div><p className="cic-overline">MANDATORY TYPOGRAPHY GATE</p><h2>CIC console contract</h2></div>
      <p>DISPLAY // MONO // READOUT</p>
    </header>
    <div className="pc04-review__type-grid">
      <section className="pc04-review__type-sample pc04-review__type-sample--display">
        <p>Display face</p><h3>DRADIS CONTACT PLOT</h3><strong>WOLF VECTOR // 02</strong>
      </section>
      <section className="pc04-review__type-sample pc04-review__type-sample--mono">
        <p>Mono face</p><h3>CONSOLE READOUT</h3><strong>FLEET-2 // 6798 // PURSUIT 07</strong>
      </section>
    </div>
    <blockquote className="pc04-review__alert">{RED_ALERT}</blockquote>
    <p className="pc04-review__procedure-copy">UPGRADES AND PROCEDURE OUTCOMES ARE TRACKED AT THE CONSOLE</p>
    <p className="pc04-review__note">Rendered browser checks compare the candidate against the intended CIC tokens. PC01 is the strongest known-good reference, not permission to preserve an outlier.</p>
  </section>;
}

function MissionCheck() {
  return <div className="pc04-review__mission-layout">
    <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared away mission">
      <header className="pc04-review__panel-heading">
        <div><p className="cic-overline">NEW LOCATION // GROUP-BOUND</p><h2>Away mission start</h2></div>
        <p>FLEET-2 // 6798 // CYCLE 4</p>
      </header>
      <dl className="pc04-review__mission-facts">
        <div><dt>Mission Leader</dt><dd>Mission Leader // Dione Engineer</dd></div>
        <div><dt>Eligible craft</dt><dd>Craft // Starlight</dd></div>
        <div><dt>Participants</dt><dd>AEGIS Wing Commander // Dione Engineer</dd></div>
        <div><dt>Opportunity</dt><dd>Opportunity // Explore</dd></div>
      </dl>
      <section className="pc04-review__private-hand" aria-label="Prepared private mission hand">
        <p className="cic-overline">ENTITLED PARTICIPANT ONLY</p>
        <h3>Your private hand</h3>
        <div><span>EXPLORE +2</span><span>SALVAGE +1</span><span>DANGER −1</span></div>
        <p>Choose one secret discard. Other participants' cards are not rendered.</p>
      </section>
      <p className="pc04-review__note">This prepared view illustrates the production contract. Optional craft, rewards, and unresolved rejoin behavior are not admitted here.</p>
    </section>
    <section className="pc04-review__panel pc04-review__log cic-frame" role="region" aria-label="Prepared automated GM log">
      <header className="pc04-review__panel-heading">
        <div><p className="cic-overline">SERVER-OWNED RECEIPT</p><h2>Automated GM log</h2></div>
        <p>AUTOMATIC // NO GM TRANSCRIPTION</p>
      </header>
      <dl>
        <div><dt>Source</dt><dd>Away Mission procedure // Player's Guide v1.1</dd></div>
        <div><dt>Inputs</dt><dd>FLEET-2 // 6798 // Cycle 4 // two participants</dd></div>
        <div><dt>Modifiers</dt><dd>Starlight Explore bonus // prepared example</dd></div>
        <div><dt>Outcome</dt><dd>Initial private deal committed</dd></div>
        <div><dt>State delta</dt><dd>Mission snapshot + participant hands</dd></div>
        <div><dt>Revision and replay</dt><dd>Revision 12 // request pc04-mission-1</dd></div>
        <div><dt>Recovery</dt><dd>Exact replay returns the committed receipt</dd></div>
      </dl>
    </section>
  </div>;
}

function SplitCheck() {
  const [state, setState] = useState<SplitState>('split');
  const readout: Record<SplitState, string> = {
    whole: 'Whole fleet sample // one group // one location // one pursuit value',
    split: 'Split sample // independent groups, locations, pursuit values, and ordinary communication audiences',
    taxi: 'Scout taxi sample // separate authority path // range check // two players or two fuel',
    rejoin: 'Pending rejoin sample // pursuit values remain separate // no invented merge',
  };
  return <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared split fleet">
    <header className="pc04-review__panel-heading">
      <div><p className="cic-overline">GROUP-LOCAL STATE</p><h2>Split-fleet status</h2></div>
      <p>Ordinary communications remain within each group.</p>
    </header>
    <div className="pc04-review__controls" role="group" aria-label="Prepared split states">
      {([
        ['whole', 'Whole fleet'], ['split', 'Split'], ['taxi', 'Scout taxi'], ['rejoin', 'Pending rejoin'],
      ] as const).map(([id, label]) => <button
        className="cic-action-button" type="button" key={id}
        aria-pressed={state === id} onClick={() => setState(id)}
      >{label}</button>)}
    </div>
    <p className="pc04-review__result" role="status" aria-label="Prepared split state">{readout[state]}</p>
    <div className="pc04-review__group-grid">
      <section role="region" aria-label="FLEET-1 status">
        <FleetGroupContext groupId="fleet-1" currentCoordinate="5143" vesselIds={['aegis', 'quellon']} pursuitValue={4} />
      </section>
      <section role="region" aria-label="FLEET-2 status">
        <FleetGroupContext groupId="fleet-2" currentCoordinate="6798" vesselIds={['dione', 'shepherd']} pursuitValue={7} />
      </section>
    </div>
    <p className="pc04-review__note">The pending-rejoin sample deliberately keeps both pursuit values. No review control performs a split, taxi move, or merge.</p>
  </section>;
}

function RecoveryCheck() {
  return <section className="pc04-review__panel cic-frame" role="region" aria-label="Prepared PC04 recovery">
    <header className="pc04-review__panel-heading">
      <div><p className="cic-overline">FAIL CLOSED // EXACT REPLAY</p><h2>Recovery boundary</h2></div>
      <p>NO DUPLICATE PROCEDURE</p>
    </header>
    <div className="pc04-review__recovery-grid">
      <article><h3>Stale revision</h3><p>Stale revision // refresh the current group and mission snapshot before another choice.</p></article>
      <article><h3>Lost acknowledgement</h3><p>Lost acknowledgement // retry the same request identity and recover its committed receipt.</p></article>
      <article><h3>Authority changed</h3><p>GM instance, participant, group, coordinate, cycle, or craft changed // no mutation.</p></article>
      <article><h3>Private state</h3><p>Reconnect restores only the entitled hand and current group projection.</p></article>
    </div>
    <button className="cic-action-button" type="button" disabled>Repeat automated mission start</button>
  </section>;
}

export default function PC04ReviewScene() {
  const [step, setStep] = useState<Step>('entry');
  const selected = STEPS.find((candidate) => candidate.id === step) ?? STEPS[0]!;
  return <div className="pc04-review">
    <a className="pc04-review__skip" href="#pc04-review-content">Skip to review step</a>
    <header className="pc04-review__header">
      <div><p>DEN OF WOLVES // NEW EDEN CONSOLE</p><h1>PC04 // Exploration and split-fleet map</h1></div>
      <p className="pc04-review__mode">SINGLE FACILITATOR // SYNTHETIC REVIEW</p>
    </header>
    <aside className="pc04-review__sample-banner" aria-label="Synthetic sample notice">
      Prepared synthetic states // no live session writes. Authority, privacy, and production-play evidence remain separate gates.
    </aside>
    <nav className="pc04-review__steps" aria-label="PC04 review steps">
      {STEPS.map((candidate) => <button
        type="button" key={candidate.id} aria-pressed={step === candidate.id}
        onClick={() => setStep(candidate.id)}
      >{candidate.label}</button>)}
    </nav>
    <main id="pc04-review-content" className="pc04-review__content" tabIndex={-1}>
      <section className="pc04-review__intro cic-frame" aria-label="Current review step">
        <p className="cic-overline">OWNER CHECK // {selected.label.toUpperCase()}</p>
        <p>{selected.intro}</p>
      </section>
      {step === 'entry' ? <EntryCheck />
        : step === 'copy' ? <CopyCheck />
          : step === 'mission' ? <MissionCheck />
            : step === 'split' ? <SplitCheck />
              : <RecoveryCheck />}
    </main>
    <footer className="pc04-review__footer">
      <span>PC04 PREPARED CHECKPOINT</span><span>NO LIVE COMMANDS</span>
    </footer>
  </div>;
}
