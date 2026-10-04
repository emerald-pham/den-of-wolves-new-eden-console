import { useEffect, useState, type FormEvent } from 'react';
import '../styles/pc09-specialist-presenters.css';

export interface Pc09DetectorTarget {
  readonly uid: string;
  readonly label: string;
}

export interface Pc09DetectorReport {
  readonly targetLabel: string;
  readonly reportedLoyalty: 'loyal' | 'wolf';
  readonly cycle: number;
}

export function WolfAgentDetectorPanel({
  cycle,
  testsUsed,
  targets,
  report,
  onTest,
}: {
  readonly cycle: number;
  readonly testsUsed: number;
  readonly targets: readonly Pc09DetectorTarget[];
  /** This is the investigator's sanitized report, never the hidden truth. */
  readonly report: Pc09DetectorReport | null;
  readonly onTest: (targetUid: string) => Promise<unknown>;
}) {
  const [targetUid, setTargetUid] = useState(targets[0]?.uid ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const availableTests = Math.max(0, 3 - testsUsed);
  const selectedTarget = targets.find((target) => target.uid === targetUid);

  useEffect(() => {
    if (!targets.some((target) => target.uid === targetUid)) setTargetUid(targets[0]?.uid ?? '');
  }, [targetUid, targets]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTarget || availableTests === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onTest(selectedTarget.uid);
    } catch {
      setMessage('The detector test could not be recorded. Refresh the console and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pc09-specialist-panel cic-frame" aria-label="Wolf Agent Detector">
      <header className="pc09-specialist-panel__header">
        <div><p className="pc09-specialist-panel__eyebrow">Shepherd // Endeavour lab</p>
          <h2>Wolf Agent Detector</h2></div>
        <span className="pc09-specialist-panel__cycle">Cycle {cycle}</span>
      </header>
      <p className="pc09-specialist-panel__copy">Run up to three private tests this cycle. Only the investigator receives each reported result.</p>
      <p className="pc09-specialist-panel__count" role="status">{availableTests} {availableTests === 1 ? 'test remains' : 'tests remain'} this cycle.</p>
      <form className="pc09-specialist-panel__form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="pc09-detector-target">Player to test</label>
        <select id="pc09-detector-target" value={targetUid} onChange={(event) => setTargetUid(event.target.value)}
          disabled={targets.length === 0 || availableTests === 0 || busy}>
          {targets.length === 0 && <option value="">No eligible player</option>}
          {targets.map((target) => <option key={target.uid} value={target.uid}>{target.label}</option>)}
        </select>
        <button className="cic-action-button" type="submit" disabled={!selectedTarget || availableTests === 0 || busy}>
          {busy ? 'Testing…' : 'Run detector test'}
        </button>
      </form>
      {report && <p className="pc09-specialist-panel__result" role="status" aria-live="polite">
        {report.targetLabel} // Report: {report.reportedLoyalty === 'wolf' ? 'Wolf' : 'Loyal'} // Cycle {report.cycle}
      </p>}
      {message && <p role="alert" className="pc09-specialist-panel__message">{message}</p>}
    </section>
  );
}

export interface VipHostDestination {
  readonly id: string;
  readonly label: string;
}

export interface VipHostGrantView {
  readonly shipLabel: string;
  readonly cycle: number;
  readonly status: 'available' | 'consumed';
}

/** Injected maintenance-step control for the member-safe VIP Host benefit. */
export function VipHostMaintenanceRerollPanel({
  cycle,
  cycleStep,
  shipLabel,
  unrestRolls,
  grantStatus,
  canUseGrant,
  onReroll,
}: {
  readonly cycle: number;
  readonly cycleStep: number;
  readonly shipLabel: string;
  readonly unrestRolls: readonly [number, number] | undefined;
  readonly grantStatus: 'available' | 'consumed' | null;
  readonly canUseGrant: boolean;
  readonly onReroll: (dieIndex: 0 | 1) => Promise<unknown>;
}) {
  const [dieIndex, setDieIndex] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = canUseGrant && grantStatus === 'available' && cycleStep === 4 &&
    unrestRolls !== undefined && unrestRolls.length === 2;

  async function reroll() {
    if (!ready || busy) return;
    setBusy(true);
    setMessage(null);
    try { await onReroll(dieIndex); }
    catch { setMessage('The hosted maintenance reroll could not be recorded. Refresh the ship console and try again.'); }
    finally { setBusy(false); }
  }

  return <section className="pc09-specialist-panel cic-frame" aria-label="VIP Host maintenance reroll">
    <header className="pc09-specialist-panel__header">
      <div><p className="pc09-specialist-panel__eyebrow">{shipLabel} // hosted maintenance benefit</p>
        <h2>VIP Host reroll</h2></div>
      <span className="pc09-specialist-panel__cycle">Cycle {cycle}</span>
    </header>
    {grantStatus === 'available' && unrestRolls && <p className="pc09-specialist-panel__copy">
      Current unrest dice: {unrestRolls[0]} and {unrestRolls[1]}. Choose one die to reroll before the riot check.
    </p>}
    {grantStatus === 'consumed' && <p className="pc09-specialist-panel__count" role="status">The hosted maintenance reroll has been used.</p>}
    {grantStatus === null && <p className="pc09-specialist-panel__count" role="status">No VIP Host maintenance visit is recorded for this ship and cycle.</p>}
    {grantStatus === 'available' && <div className="pc09-specialist-panel__form">
      <label htmlFor="pc09-vip-unrest-die">Unrest die</label>
      <select id="pc09-vip-unrest-die" value={dieIndex} onChange={(event) => setDieIndex(Number(event.target.value) as 0 | 1)}
        disabled={!ready || busy}>
        <option value={0}>Die 1{unrestRolls ? ` // ${unrestRolls[0]}` : ''}</option>
        <option value={1}>Die 2{unrestRolls ? ` // ${unrestRolls[1]}` : ''}</option>
      </select>
      <button className="cic-action-button" type="button" onClick={() => void reroll()} disabled={!ready || busy}>
        {busy ? 'Rerolling…' : 'Reroll one maintenance die'}
      </button>
      {!ready && <p role="status">The reroll is available during this ship’s open unrest step.</p>}
    </div>}
    {message && <p role="alert" className="pc09-specialist-panel__message">{message}</p>}
  </section>;
}

export function VipHostPanel({
  cycle,
  visitStatus,
  currentShipId,
  destinations,
  grant,
  canAttestVisit = currentShipId === 'dione',
  canUseGrant = true,
  attestedDestinationLabel,
  onAttestVisit,
  onReroll,
}: {
  readonly cycle: number;
  readonly visitStatus: 'unattested' | 'attested';
  readonly currentShipId: string;
  readonly destinations: readonly VipHostDestination[];
  readonly grant: VipHostGrantView | null;
  readonly canAttestVisit?: boolean;
  readonly canUseGrant?: boolean;
  readonly attestedDestinationLabel?: string;
  readonly onAttestVisit: (shipId: string) => Promise<unknown>;
  readonly onReroll: (shipId: string, cycle: number) => Promise<unknown>;
}) {
  const eligibleDestinations = destinations.filter((destination) => destination.id !== 'dione');
  const [shipId, setShipId] = useState(eligibleDestinations[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const matchingGrant = canUseGrant && grant?.cycle === cycle && grant.status === 'available' &&
    eligibleDestinations.some((destination) => destination.label === grant.shipLabel);

  async function attest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visitStatus !== 'unattested' || busy || !eligibleDestinations.some((destination) => destination.id === shipId)) return;
    setBusy(true);
    setMessage(null);
    try {
      await onAttestVisit(shipId);
    } catch {
      setMessage('The visit attestation could not be recorded. Refresh and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function reroll() {
    const destination = eligibleDestinations.find((option) => option.label === grant?.shipLabel);
    if (!destination || !matchingGrant || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onReroll(destination.id, cycle);
    } catch {
      setMessage('The maintenance reroll could not be recorded. Refresh and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pc09-specialist-panel cic-frame" aria-label="VIP Host maintenance benefit">
      <header className="pc09-specialist-panel__header">
        <div><p className="pc09-specialist-panel__eyebrow">Dione // VIP Host</p><h2>Hosted maintenance</h2></div>
        <span className="pc09-specialist-panel__cycle">Cycle {cycle}</span>
      </header>
      <p className="pc09-specialist-panel__copy">A facilitator records the Host’s Team Time visit. The visited ship may reroll one die during this cycle’s maintenance.</p>
      {visitStatus === 'unattested' && canAttestVisit ? (
        <form className="pc09-specialist-panel__form" onSubmit={(event) => void attest(event)}>
          <label htmlFor="pc09-vip-destination">Visited ship</label>
          <select id="pc09-vip-destination" value={shipId} onChange={(event) => setShipId(event.target.value)} disabled={busy || eligibleDestinations.length === 0}>
            {eligibleDestinations.length === 0 && <option value="">No eligible ship</option>}
            {eligibleDestinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.label}</option>)}
          </select>
          <button className="cic-action-button" type="submit" disabled={busy || !shipId}>Record ship visit</button>
        </form>
      ) : visitStatus === 'attested' ? <p className="pc09-specialist-panel__count" role="status">
        {attestedDestinationLabel ? `Physical visit to ${attestedDestinationLabel} attested for this cycle.` : 'Visit attested for this cycle.'}
      </p>
        : canAttestVisit ? null : <p className="pc09-specialist-panel__count" role="status">A facilitator must attest the physical visit.</p>}
      {grant?.status === 'consumed' && grant.cycle === cycle && <p className="pc09-specialist-panel__count" role="status">The hosted maintenance reroll has been used.</p>}
      {matchingGrant && <div className="pc09-specialist-panel__grant">
        <p>{grant.shipLabel} // one maintenance die available</p>
        <button className="cic-action-button" type="button" onClick={() => void reroll()} disabled={busy}>
          {busy ? 'Recording…' : 'Reroll one maintenance die'}
        </button>
      </div>}
      {message && <p role="alert" className="pc09-specialist-panel__message">{message}</p>}
    </section>
  );
}

export interface PdfFighterAceTarget {
  /** Opaque attack-scoped contact ID; it must not disclose hidden roster identity. */
  readonly id: string;
  readonly label: string;
}

export interface PdfFighterAceSource {
  readonly id: string;
  readonly label: string;
  readonly fighters: number;
}

export interface PdfFighterAceAction {
  readonly attackId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly range: 'long' | 'medium' | 'short';
  readonly targetShift: -1 | 1 | undefined;
  readonly extraTargetId?: string;
}

export function PdfFighterAcePanel({
  attackId,
  range,
  fighterSources,
  targets,
  onCommit,
}: {
  readonly attackId: string;
  readonly range: 'long' | 'medium' | 'short';
  readonly fighterSources: readonly PdfFighterAceSource[];
  readonly targets: readonly PdfFighterAceTarget[];
  readonly onCommit: (action: PdfFighterAceAction) => Promise<Readonly<{ outcome: string; damage: number }>>;
}) {
  const [sourceId, setSourceId] = useState(fighterSources[0]?.id ?? '');
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [extraTargetId, setExtraTargetId] = useState('');
  const [shift, setShift] = useState<'none' | '-1' | '1'>('none');
  const [result, setResult] = useState<Readonly<{ outcome: string; damage: number }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasFighter = fighterSources.some((source) => source.id === sourceId && source.fighters > 0);
  const hasTarget = targets.some((target) => target.id === targetId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasFighter || !hasTarget || busy) return;
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      setResult(await onCommit({ attackId, sourceId, targetId, range,
        targetShift: range === 'medium' && shift !== 'none' ? Number(shift) as -1 | 1 : undefined,
        ...(range === 'short' && extraTargetId ? { extraTargetId } : {}),
      }));
    } catch {
      setMessage('The Fighter Ace action could not be recorded. Refresh the attack console and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pc09-specialist-panel cic-frame" aria-label="PDF Fighter Ace personal combat">
      <header className="pc09-specialist-panel__header">
        <div><p className="pc09-specialist-panel__eyebrow">Refinery 124 // Fighter Ace</p><h2>Personal combat</h2></div>
        <span className="pc09-specialist-panel__cycle">{range} range</span>
      </header>
      <p className="pc09-specialist-panel__copy">Choose one available fighter and the printed option for this range. On Short Range, a second point of damage may target the same or a different contact.</p>
      <form className="pc09-specialist-panel__form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="pc09-ace-source">Fighter source</label>
        <select id="pc09-ace-source" value={sourceId} onChange={(event) => setSourceId(event.target.value)} disabled={busy || fighterSources.length === 0}>
          {fighterSources.length === 0 && <option value="">No fighter available</option>}
          {fighterSources.map((source) => <option key={source.id} value={source.id} disabled={source.fighters < 1}>{source.label} // {source.fighters} available</option>)}
        </select>
        <label htmlFor="pc09-ace-target">Wolf contact</label>
        <select id="pc09-ace-target" value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={busy || targets.length === 0}>
          {targets.length === 0 && <option value="">No current contact</option>}
          {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
        </select>
        {range === 'short' && <>
          <label htmlFor="pc09-ace-extra-target">Optional second target</label>
          <select id="pc09-ace-extra-target" value={extraTargetId}
            onChange={(event) => setExtraTargetId(event.target.value)} disabled={busy || targets.length === 0}>
            <option value="">No second target</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
        </>}
        {range === 'medium' && <>
          <label htmlFor="pc09-ace-target-shift">Optional targeting shift</label>
          <select id="pc09-ace-target-shift" value={shift} onChange={(event) => setShift(event.target.value as typeof shift)} disabled={busy}>
            <option value="none">No shift</option><option value="-1">Shift −1</option><option value="1">Shift +1</option>
          </select>
        </>}
        <button className="cic-action-button" type="submit" disabled={busy || !hasFighter || !hasTarget}>
          {busy ? 'Resolving…' : 'Commit Fighter Ace action'}
        </button>
      </form>
      {result && <p className="pc09-specialist-panel__result" role="status" aria-live="polite">Action resolved: {result.outcome} // {result.damage} damage</p>}
      {message && <p role="alert" className="pc09-specialist-panel__message">{message}</p>}
    </section>
  );
}

/** Pure source-officer control. The injected grant action is the only write boundary. */
export function PdfFighterAcePermissionPanel({
  view,
  onGrant,
}: {
  readonly view: import('@/types/game').PdfFighterAcePermissionView;
  readonly onGrant: (input: Readonly<{
    attackId: string;
    expectedRevision: number;
    sourceId: import('@/types/game').PdfFighterAceSourceId;
    fighterIndex: number;
  }>) => Promise<unknown>;
}) {
  const [fighterIndex, setFighterIndex] = useState(view.availableFighterIndexes[0] ?? -1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canGrant = view.status === 'ready' && Boolean(view.attackId) && view.range !== null &&
    view.availableFighterIndexes.includes(fighterIndex);

  useEffect(() => {
    if (!view.availableFighterIndexes.includes(fighterIndex)) {
      setFighterIndex(view.availableFighterIndexes[0] ?? -1);
    }
  }, [fighterIndex, view.availableFighterIndexes]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canGrant || !view.attackId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onGrant({ attackId: view.attackId, expectedRevision: view.revision,
        sourceId: view.sourceId, fighterIndex });
    } catch {
      setMessage('The fighter slot permission could not be recorded. Refresh this attack and try again.');
    } finally {
      setBusy(false);
    }
  }

  const reason = view.reason === 'range-not-open' ? 'The Wolf attack range is not open.'
    : view.reason === 'current-ace-unavailable' ? 'The current Fighter Ace is unavailable.'
      : view.reason === 'source-not-launched' ? 'Launch this fighter wing for the current attack first.'
        : view.reason === 'ace-already-acted' ? 'The Fighter Ace has already acted in this attack.'
          : view.reason ? 'This fighter slot cannot be authorized for the current attack.' : null;

  return (
    <section className="pc09-specialist-panel cic-frame" aria-label="Fighter Ace source permission">
      <header className="pc09-specialist-panel__header">
        <div><p className="pc09-specialist-panel__eyebrow">{view.sourceLabel} // commander authority</p>
          <h2>Fighter Ace permission</h2></div>
        <span className="pc09-specialist-panel__cycle">{view.range ? `${view.range} range` : 'No open range'}</span>
      </header>
      {view.status === 'granted'
        ? <p className="pc09-specialist-panel__count" role="status">A fighter slot is already authorized for this attack.</p>
        : view.status === 'ready' ? <form className="pc09-specialist-panel__form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="pc09-ace-fighter-slot">Fighter slot</label>
          <select id="pc09-ace-fighter-slot" value={fighterIndex < 0 ? '' : fighterIndex}
            onChange={(event) => setFighterIndex(Number(event.target.value))} disabled={busy || !canGrant}>
            {view.availableFighterIndexes.map((index) => <option key={index} value={index}>Slot {index + 1}</option>)}
          </select>
          <button className="cic-action-button" type="submit" disabled={busy || !canGrant}>
            {busy ? 'Authorizing…' : 'Authorize Fighter Ace'}
          </button>
        </form> : <>
          <button className="cic-action-button" type="button" disabled>Authorize Fighter Ace</button>
          {reason && <p className="pc09-specialist-panel__count" role="status">{reason}</p>}
        </>}
      {message && <p role="alert" className="pc09-specialist-panel__message">{message}</p>}
    </section>
  );
}
