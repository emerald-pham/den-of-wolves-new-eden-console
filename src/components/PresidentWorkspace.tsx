import { useState, type FormEvent } from 'react';
import { recordPresidentAction, updatePoliticalCapital } from '@/lib/presidentWorkspaceService';
import { useSessionStore } from '@/store/useSessionStore';
import type { PresidentActionKind } from '@/types/game';

const LABELS: Readonly<Record<PresidentActionKind, string>> = {
  'fleet-policy': 'Fleet policy',
  crisis: 'Crisis decision',
  'political-capital': 'Political capital',
  address: 'Presidential address',
  visit: 'Presidential visit',
  election: 'Election action',
};

export default function PresidentWorkspace({ writable, consoleLocked = false }: {
  readonly writable: boolean;
  readonly consoleLocked?: boolean;
}) {
  const workspace = useSessionStore((state) => state.session?.presidentWorkspace);
  const capital = useSessionStore((state) => state.session?.politicalCapital);
  const crisis = useSessionStore((state) => state.session?.resolvedCrisisOutcome);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [kind, setKind] = useState<PresidentActionKind>('fleet-policy');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [capitalPending, setCapitalPending] = useState(false);
  const live = writable && connection === 'live' && freshness === 'server' && !consoleLocked;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const copy = text.trim();
    if (!live || !copy || pending) return;
    setPending(true);
    setStatus('');
    try {
      await recordPresidentAction(kind, copy);
      setText('');
      setStatus(`${LABELS[kind]} recorded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'President action was not recorded.');
    } finally {
      setPending(false);
    }
  }

  async function changeCapital(action: 'gain' | 'spend'): Promise<void> {
    if (!live || capitalPending || !crisis) return;
    setCapitalPending(true);
    setStatus('');
    try {
      await updatePoliticalCapital(action);
      setStatus(`Political capital ${action === 'gain' ? 'gained' : 'spent'}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Political capital was not updated.');
    } finally {
      setCapitalPending(false);
    }
  }

  return <section className="president-workspace console-workspace__section" aria-label="President workspace">
    <header>
      <p>Dione executive channel // Public audit record</p>
      <h3>President workspace</h3>
      <p>Record fleet policy, crisis decisions, political capital, addresses, visits, and election actions.</p>
      <p>These records document table decisions. Mechanical effects resolve through their dedicated controls.</p>
    </header>
    <section aria-label="Political capital ledger" className="president-workspace__capital">
      <p>Political capital // Server ledger</p>
      <strong aria-label="Political capital balance">{capital?.balance ?? 0} / 8</strong>
      {crisis
        ? <p>Resolved crisis // {crisis.title}</p>
        : <p>No resolved crisis outcome available</p>}
      <div>
        <button className="cic-action-button" type="button"
          disabled={!live || capitalPending || !crisis || (capital?.balance ?? 0) >= 8 ||
            Boolean(capital?.entries.some(entry => entry.action === 'gain' && entry.crisisId === crisis.crisisId))}
          onClick={() => void changeCapital('gain')}>
          {capitalPending ? 'Updating…' : 'Gain 1'}
        </button>
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
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="president-action-kind">Action family</label>
      <select id="president-action-kind" value={kind}
        onChange={(event) => setKind(event.target.value as PresidentActionKind)} disabled={!live || pending}>
        {(Object.keys(LABELS) as PresidentActionKind[]).map((value) =>
          <option key={value} value={value}>{LABELS[value]}</option>)}
      </select>
      <label htmlFor="president-action-text">Decision record</label>
      <textarea id="president-action-text" value={text} maxLength={500}
        onChange={(event) => setText(event.target.value)} disabled={!live || pending} />
      <div className="president-workspace__form-footer">
        <span>{text.length}/500</span>
        <button className="cic-action-button" type="submit" disabled={!live || pending || !text.trim()}>
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
