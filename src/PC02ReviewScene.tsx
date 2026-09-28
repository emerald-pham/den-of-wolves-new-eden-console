import { useState } from 'react';
import ContactPlot, { type PlotContact } from '@/components/ContactPlot';
import PursuitTracker from '@/components/PursuitTracker';
import { PrimaryStatusView } from '@/components/PrimaryStatus';
import SessionWaiver from '@/components/SessionWaiver';
import { CONSOLE_ROLES } from '@/data/roles';
import './PC02ReviewScene.css';

type Step = 'setup' | 'waiver' | 'fleet' | 'press' | 'dradis' | 'continuity';
type Perspective = 'gm' | 'press' | 'president' | 'player';
type WaiverTime = 'new' | 'accepted' | 'before-expiry' | 'expired';
type ScanStage = 'first' | 'repeat' | 'after';
type ContinuityStage = 'active' | 'disconnected' | 'resumed' | 'left';

const STEPS: readonly { id: Step; label: string; intro: string }[] = [
  { id: 'setup', label: 'Setup', intro: 'Review ground rules, the GM setup checklist, and the first-action route.' },
  { id: 'waiver', label: 'Waiver', intro: 'Compare acknowledgement before and at the 72-hour boundary.' },
  { id: 'fleet', label: 'Fleet board', intro: 'Check the opening board, pending pursuit readout, and GM-only status.' },
  { id: 'press', label: 'Press handoff', intro: 'Follow committed events into editorial review and publication.' },
  { id: 'dradis', label: 'DRADIS', intro: 'Compare the first enlarged return, a repeat ping, and the later normal size.' },
  { id: 'continuity', label: 'Leave and reconnect', intro: 'Compare temporary reconnect with deliberate departure.' },
];

const PERSPECTIVES: readonly { id: Perspective; label: string }[] = [
  { id: 'gm', label: 'GM // authenticated' },
  { id: 'press', label: 'Press Officer' },
  { id: 'president', label: 'President' },
  { id: 'player', label: 'Player // Admiral' },
];

const SAMPLE_CONTACTS: readonly PlotContact[] = [
  { id: 'first', tag: 'UNKNOWN CONTACT', x: 0.2, y: -0.32, z: 0.2, color: 'var(--cic-cyan-hot)' },
  { id: 'dione', tag: 'DIONE', x: -0.33, y: 0.19, z: 0.12, color: 'var(--cic-faction-dione)', showCombatRange: false },
  { id: 'icebreaker', tag: 'ICEBREAKER', x: 0.12, y: 0.07, z: 0.16, color: 'var(--cic-faction-icebreaker)', showCombatRange: false },
  { id: 'capybara', tag: 'CAPYBARA', x: -0.14, y: -0.22, z: 0.06, color: 'var(--cic-faction-capybara)', showCombatRange: false },
  { id: 'shepherd', tag: 'SHEPHERD', x: 0.25, y: 0.22, z: -0.08, color: 'var(--cic-faction-proxima)', showCombatRange: false },
  { id: 'quellon', tag: 'QUELLON', x: -0.18, y: 0.04, z: -0.17, color: 'var(--cic-faction-gliese)', showCombatRange: false },
];

const SAMPLE_GM_STATUS = {
  cycle: 'CYCLE 0',
  phase: 'LOBBY',
  location: 'SESSION // ROLE SELECT',
  authority: 'FACILITATOR // AUTHENTICATED',
  nextAction: 'OPEN THE FACILITATOR SETUP CHECKLIST',
  failureState: 'NO ACTIVE FAILURE REPORTED',
  severity: 'normal',
} as const;

export default function PC02ReviewScene() {
  const [step, setStep] = useState<Step>('setup');
  const [perspective, setPerspective] = useState<Perspective>('gm');
  const [waiverTime, setWaiverTime] = useState<WaiverTime>('new');
  const [scanStage, setScanStage] = useState<ScanStage>('first');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [continuityStage, setContinuityStage] = useState<ContinuityStage>('active');
  const [continuityRole, setContinuityRole] = useState('admiral');
  const selectedStep = STEPS.find((candidate) => candidate.id === step) ?? STEPS[0]!;
  const continuityRoleLabel = CONSOLE_ROLES.find((role) => role.id === continuityRole)?.name
    ?? continuityRole;

  return <div className="pc02-review">
    <a className="pc02-review__skip" href="#pc02-review-content">Skip to review step</a>
    <header className="pc02-review__header">
      <div>
        <p className="cic-overline">Prepared playtest // PC02</p>
        <h1>PC02 // Setup, fleet board, and continuity</h1>
        <p>One sitting through the opening session and the first active fleet view.</p>
      </div>
      <label className="pc02-review__select">
        Review perspective
        <select value={perspective} onChange={(event) => setPerspective(event.currentTarget.value as Perspective)}>
          {PERSPECTIVES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        </select>
      </label>
    </header>

    <aside className="pc02-review__sample-banner" aria-label="Synthetic sample notice">
      <strong>SAMPLE ONLY</strong>
      <span>No live session is connected. Controls on this page change only prepared sample states.</span>
    </aside>

    <nav className="pc02-review__steps" aria-label="PC02 review steps">
      {STEPS.map((candidate, index) => <button
        key={candidate.id}
        className="cic-action-button"
        type="button"
        aria-pressed={step === candidate.id}
        onClick={() => setStep(candidate.id)}
      >{index + 1}. {candidate.label}</button>)}
    </nav>

    <main id="pc02-review-content" className="pc02-review__content" tabIndex={-1}>
      <section className="pc02-review__intro cic-frame" aria-label="Current review step">
        <p className="cic-overline">Step {STEPS.indexOf(selectedStep) + 1} of {STEPS.length} // {perspective.toUpperCase()} sample</p>
        <h2>{selectedStep.label}</h2>
        <p>{selectedStep.intro}</p>
      </section>

      {step === 'setup' && <section className="pc02-review__panel cic-frame" aria-label="Setup sample">
        <h3>Opening station</h3>
        <p>Prepared setup, ground rules, and first-action guide will appear here with the production help components.</p>
      </section>}

      {step === 'waiver' && <section className="pc02-review__panel cic-frame" aria-label="Waiver sample">
        <label className="pc02-review__select">
          Waiver sample time
          <select value={waiverTime} onChange={(event) => setWaiverTime(event.currentTarget.value as WaiverTime)}>
            <option value="new">First arrival // checks required</option>
            <option value="accepted">Just acknowledged // accepted</option>
            <option value="before-expiry">Before 72 hours // accepted</option>
            <option value="expired">At 72 hours // checks required again</option>
          </select>
        </label>
        {(waiverTime === 'accepted' || waiverTime === 'before-expiry')
          ? <p role="status">Acknowledgement accepted on this device. No new checks are required before 72 hours.</p>
          : <SessionWaiver onAcknowledge={() => setWaiverTime('accepted')} />}
      </section>}

      {step === 'fleet' && <section className="pc02-review__panel" aria-label="Fleet board sample">
        <div className="pc02-review__fleet-summary cic-frame">
          <p className="cic-overline">FLEET // AEGIS</p>
          <h3>Cycle 1 // Team phase</h3>
          <dl>
            <div><dt>Rations</dt><dd>Food 3 // Water 2</dd></div>
            <div><dt>Alert</dt><dd>Fleetwide red alert inactive</dd></div>
            <div><dt>Available action</dt><dd>Review the Admiral console</dd></div>
          </dl>
        </div>
        <PursuitTracker
          currentTurn={1}
          shipId="aegis"
          shipName="AEGIS"
          shipCoordinate="0000"
        />
        <div className="pc02-review__status-note cic-frame">
          <p className="cic-overline">Primary Status // Cycle 0 lobby</p>
          {perspective === 'gm'
            ? <PrimaryStatusView status={SAMPLE_GM_STATUS} />
            : <p>Player view // the GM status instrument is absent.</p>}
        </div>
      </section>}

      {step === 'press' && <section className="pc02-review__panel cic-frame" aria-label="Press handoff sample">
        <h3>Editorial intake</h3>
        <p>Prepared survivor, purge, and Presidential records will appear here in the production Press log.</p>
      </section>}

      {step === 'dradis' && <section className="pc02-review__panel" aria-label="DRADIS sample">
        <div className="pc02-review__scan-controls cic-frame">
          <p className="cic-overline">Review clock // sample states</p>
          <p>First contact enlargement lasts through the original first sweep time. A repeat sweep pings without shortening it.</p>
          <div className="pc02-review__control-row">
            <button type="button" className="cic-action-button" aria-pressed={scanStage === 'first'}
              onClick={() => setScanStage('first')}>First contact</button>
            <button type="button" className="cic-action-button" aria-pressed={scanStage === 'repeat'}
              onClick={() => setScanStage('repeat')}>Repeat sweep</button>
            <button type="button" className="cic-action-button" aria-pressed={scanStage === 'after'}
              onClick={() => setScanStage('after')}>After first sweep</button>
          </div>
          <p role="status">{scanStage === 'after'
            ? 'Original first-sweep time passed // normal return size'
            : scanStage === 'repeat'
              ? 'Repeat ping // original enlargement continues'
              : 'First acquisition // enlarged return'}</p>
        </div>
        <div className="pc02-review__plot dradis-outline" data-scan-stage={scanStage}>
          <ContactPlot placement="inset" size="min(80vw, 24rem)" centerLabel="AEGIS" contacts={SAMPLE_CONTACTS} />
        </div>
      </section>}

      {step === 'continuity' && <section className="pc02-review__panel cic-frame" aria-label="Leave and reconnect sample">
        <label className="pc02-review__select">
          Non-GM station
          <select value={continuityRole} onChange={(event) => {
            setContinuityRole(event.currentTarget.value);
            setContinuityStage('active');
          }}>
            {CONSOLE_ROLES.map((role) => <option key={role.id} value={role.id}>
              {role.shipId.toUpperCase()} // {role.name}
            </option>)}
          </select>
        </label>
        <p>Session FLEET-02 // Cycle 2 remains active for the other players.</p>
        <p role="status">{continuityRoleLabel} // {continuityStage === 'disconnected'
          ? 'temporary connection loss; same member and role reserved'
          : continuityStage === 'resumed'
            ? 'reconnected; latest authorized role and private state restored'
            : continuityStage === 'left'
              ? 'deliberate leave; role vacated and private state unavailable'
              : 'connected and active'}</p>
        <div className="pc02-review__control-row">
          <button className="cic-action-button" type="button"
            disabled={continuityStage === 'left'}
            onClick={() => setContinuityStage('disconnected')}>
            Temporary disconnect
          </button>
          <button className="cic-action-button" type="button"
            disabled={continuityStage !== 'disconnected'}
            onClick={() => setContinuityStage('resumed')}>
            Resume same role
          </button>
          <button className="cic-action-button" type="button" onClick={() => setSettingsOpen(true)}>
            Open sample settings
          </button>
        </div>
        {settingsOpen && <div className="settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-dialog cic-frame" role="dialog" aria-modal="true"
            aria-labelledby="pc02-settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-dialog__header">
              <h2 id="pc02-settings-title">Session settings</h2>
              <button className="settings-dialog__close" type="button" aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <p>Disconnect this device from session FLEET-02.</p>
            <button className="settings-dialog__disconnect cic-action-button cic-action-button--confirm"
              type="button" onClick={() => {
                setContinuityStage('left');
                setSettingsOpen(false);
              }}>Disconnect</button>
          </section>
        </div>}
      </section>}
    </main>

    <footer className="pc02-review__footer">
      <p>Prepared sample states only // gameplay and authority are verified separately.</p>
      <a href="/">Return to console landing</a>
    </footer>
  </div>;
}
