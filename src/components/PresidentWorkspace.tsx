import { useState, type FormEvent } from 'react';
import { recordPresidentAction } from '@/lib/presidentWorkspaceService';
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
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [kind, setKind] = useState<PresidentActionKind>('fleet-policy');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
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

  return <section className="president-workspace console-workspace__section" aria-label="President workspace">
    <header>
      <p>Dione executive channel // Public audit record</p>
      <h3>President workspace</h3>
      <p>Record fleet policy, crisis decisions, political capital, addresses, visits, and election actions.</p>
      <p>These records document table decisions. Mechanical effects resolve through their dedicated controls.</p>
    </header>
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
