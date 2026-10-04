import { useState, type FormEvent } from 'react';
import { recordPresidentAction, recordPresidentialVisit, updatePoliticalCapital } from '@/lib/presidentWorkspaceService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, PoliticalCapitalAction, PresidentActionKind } from '@/types/game';
import { ALL_VESSEL_DEFINITIONS } from '@/data/ships';

const LABELS: Readonly<Record<PresidentActionKind, string>> = {
  'fleet-policy': 'Fleet policy',
  crisis: 'Crisis decision',
  'political-capital': 'Political capital',
  address: 'Presidential address',
  visit: 'Presidential visit',
  election: 'Election action',
};

export interface PresidentWorkspaceViewProps {
  readonly session: GameSession | null;
  readonly live: boolean;
  readonly onRecordPresidentAction: (kind: PresidentActionKind, text: string) => Promise<void>;
  readonly onChangePoliticalCapital: (action: PoliticalCapitalAction) => Promise<void>;
  readonly onPresidentialVisit: (shipId: string) => Promise<void>;
}

/** The real President interface with injected state and actions for safe prepared views. */
export function PresidentWorkspaceView({
  session, live, onRecordPresidentAction, onChangePoliticalCapital, onPresidentialVisit,
}: PresidentWorkspaceViewProps) {
  const workspace = session?.presidentWorkspace;
  const capital = session?.politicalCapital;
  const crisis = session?.resolvedCrisisOutcome;
  const [kind, setKind] = useState<PresidentActionKind>('fleet-policy');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [capitalPending, setCapitalPending] = useState(false);
  const [visitPending, setVisitPending] = useState(false);
  const [visitShipChoice, setVisitShipChoice] = useState('');
  const currentTurn = session?.currentTurn ?? 1;
  const inTeamPhase = session?.turnState?.currentTurn === currentTurn && session.turnState.phase === 'team' &&
    session.turnPhase?.turn === currentTurn && session.turnPhase.airspace.state === 'restricted';
  const inCoordination = session?.turnState?.currentTurn === currentTurn && session.turnState.phase === 'coordination' &&
    session.turnPhase?.turn === currentTurn && session.turnPhase.airspace.state === 'lifted';
  const alreadyAddressed = workspace?.entries.some((entry) => entry.kind === 'address' && entry.cycle === currentTurn) ?? false;
  const activeVesselIds = session?.activeVesselIds ?? [];
  const visitableShips = activeVesselIds.filter((shipId) => (session?.shipUnrest?.[shipId] ?? 0) > 0);
  const canClaimLegacyAward = Boolean(crisis && crisis.capitalApplied === undefined &&
    !capital?.entries.some(entry => entry.action === 'gain' && entry.crisisId === crisis.crisisId) &&
    (capital?.balance ?? 0) < 8);
  const visitShipId = visitableShips.includes(visitShipChoice) ? visitShipChoice : visitableShips[0] ?? '';

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const copy = text.trim();
    if (!live || !copy || pending || (kind === 'address' && (!inTeamPhase || alreadyAddressed))) return;
    setPending(true);
    setStatus('');
    try {
      await onRecordPresidentAction(kind, copy);
      setText('');
      setStatus(`${LABELS[kind]} recorded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'President action was not recorded.');
    } finally {
      setPending(false);
    }
  }

  async function changeCapital(action: PoliticalCapitalAction): Promise<void> {
    if (!live || capitalPending || !crisis) return;
    setCapitalPending(true);
    setStatus('');
    try {
      await onChangePoliticalCapital(action);
      setStatus(`Political capital ${action === 'gain' ? 'gained' : 'spent'}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Political capital was not updated.');
    } finally {
      setCapitalPending(false);
    }
  }

  async function submitVisit(): Promise<void> {
    if (!live || !inCoordination || visitPending || !visitShipId || (capital?.balance ?? 0) < 1) return;
    setVisitPending(true);
    setStatus('');
    try {
      await onPresidentialVisit(visitShipId);
      const name = ALL_VESSEL_DEFINITIONS.find((ship) => ship.id === visitShipId)?.name ?? visitShipId;
      setStatus(`Visit committed // ${name} unrest reduced by 1; political capital spent.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The presidential visit was not recorded.');
    } finally {
      setVisitPending(false);
    }
  }

  return <section className="president-workspace console-workspace__section" aria-label="President workspace">
    <header>
      <p>Dione executive channel // Public audit record</p>
      <h3>President workspace</h3>
      <p>Record fleet policy, crisis decisions, political capital, addresses, visits, and election actions.</p>
      <p>Resolved crises grant political capital automatically when the ledger has room. Other mechanical effects resolve through their dedicated controls.</p>
    </header>
    <section aria-label="Political capital ledger" className="president-workspace__capital">
      <p>Political capital // Server ledger</p>
      <strong aria-label="Political capital balance">{capital?.balance ?? 0} / 8</strong>
      {crisis
        ? <p>Resolved crisis // {crisis.title}</p>
        : <p>No resolved crisis outcome available</p>}
      {crisis?.capitalApplied === false && crisis.capitalDelta === 0 &&
        <p role="status">The crisis capital award was recorded but not added because the ledger is at its maximum.</p>}
      <div>
        {canClaimLegacyAward && <button className="cic-action-button" type="button"
          disabled={!live || capitalPending || !crisis}
          onClick={() => void changeCapital('gain')}>
          {capitalPending ? 'Updating…' : 'Claim 1 legacy award'}
        </button>}
        <button className="cic-action-button" type="button"
          disabled={!live || capitalPending || !crisis || (capital?.balance ?? 0) < 1}
          onClick={() => void changeCapital('spend')}>
          {capitalPending ? 'Updating…' : 'Spend 1'}
        </button>
      </div>
      {capital?.entries.length ? <ol aria-label="Political capital history">
        {[...capital.entries].reverse().map(entry => <li key={entry.id}>
          <p>{entry.action === 'gain' ? 'Gained' : 'Spent'} 1 // Cycle {entry.cycle}</p>
          <strong>{entry.crisisTitle} // Balance {entry.balanceAfter}</strong>
        </li>)}
      </ol> : <p>No political capital activity recorded</p>}
    </section>
    <section aria-label="Presidential visit" className="president-workspace__visit">
      <p>Coordination // one atomic visit</p>
      <h4>Reduce ship unrest</h4>
      <p>Spend 1 political capital to reduce one active ship&apos;s unrest by 1. No route, docking, or extra GM confirmation is required.</p>
      {visitableShips.length > 0 ? <>
        <label htmlFor="president-visit-ship">Ship to visit</label>
        <select id="president-visit-ship" aria-label="Ship to visit" value={visitShipId}
          onChange={(event) => setVisitShipChoice(event.target.value)} disabled={!live || !inCoordination || visitPending}>
          {visitableShips.map((shipId) => <option key={shipId} value={shipId}>
            {ALL_VESSEL_DEFINITIONS.find((ship) => ship.id === shipId)?.name ?? shipId}
            {' // unrest '}{session?.shipUnrest?.[shipId] ?? 0}
          </option>)}
        </select>
        <button className="cic-action-button" type="button"
          disabled={!live || !inCoordination || visitPending || !visitShipId || (capital?.balance ?? 0) < 1}
          onClick={() => void submitVisit()}>
          {visitPending ? 'Recording visit…' : 'Spend 1 and reduce unrest'}
        </button>
      </> : <p>No active ship has unrest to reduce.</p>}
      {!inCoordination && <p role="status">Available during Coordination only.</p>}
      {(capital?.balance ?? 0) < 1 && <p>One political capital is required.</p>}
    </section>
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="president-action-kind">Action family</label>
      <select id="president-action-kind" value={kind}
        onChange={(event) => setKind(event.target.value as PresidentActionKind)} disabled={!live || pending}>
        {(Object.keys(LABELS) as PresidentActionKind[]).map((value) =>
          <option key={value} value={value}>{LABELS[value]}</option>)}
      </select>
      {kind === 'address' && <p role="status">
        {inTeamPhase ? alreadyAddressed ? 'The fleet address was already used this cycle.' : 'Available once during Team Phase.' : 'Fleet addresses are available at the start of Team Phase.'}
      </p>}
      <label htmlFor="president-action-text">Decision record</label>
      <textarea id="president-action-text" value={text} maxLength={500}
        onChange={(event) => setText(event.target.value)} disabled={!live || pending} />
      <div className="president-workspace__form-footer">
        <span>{text.length}/500</span>
        <button className="cic-action-button" type="submit" disabled={!live || pending || !text.trim() ||
          (kind === 'address' && (!inTeamPhase || alreadyAddressed))}>
          {pending ? 'Recording…' : `Record ${LABELS[kind].toLowerCase()}`}
        </button>
      </div>
    </form>
    {!live && <p role="status">Recording unavailable // active President authority and live connection required</p>}
    {workspace?.entries.length ? <ol aria-label="President action history">
      {[...workspace.entries].reverse().map((entry) => <li key={entry.id} data-kind={entry.kind}>
        <p>{LABELS[entry.kind]} // Cycle {entry.cycle}</p><strong>{entry.text}</strong>
      </li>)}
    </ol> : <p>No President actions recorded</p>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}

export default function PresidentWorkspace({ writable, consoleLocked = false }: {
  readonly writable: boolean;
  readonly consoleLocked?: boolean;
}) {
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const live = writable && connection === 'live' && freshness === 'server' && !consoleLocked;
  return <PresidentWorkspaceView session={session ?? null} live={live}
    onRecordPresidentAction={recordPresidentAction}
    onChangePoliticalCapital={updatePoliticalCapital}
    onPresidentialVisit={recordPresidentialVisit} />;
}
