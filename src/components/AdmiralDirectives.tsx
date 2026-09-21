import { useState, type FormEvent } from 'react';
import { publishAdmiralDirective } from '@/lib/admiralDirectiveService';
import { useSessionStore } from '@/store/useSessionStore';
import type { AdmiralDirectiveKind, AdmiralDirectiveState } from '@/types/game';

const LABELS: Readonly<Record<AdmiralDirectiveKind, string>> = {
  'fleet-policy': 'Fleet policy',
  'defence-coordination': 'Defence coordination',
};

function DirectiveList({ state }: { readonly state: AdmiralDirectiveState | undefined }) {
  const entries = [...(state?.entries ?? [])].reverse();
  return entries.length ? (
    <ol className="admiral-directives__list" aria-label="Published fleet directives">
      {entries.map((entry) => (
        <li key={entry.id} data-kind={entry.kind}>
          <p>{LABELS[entry.kind]} // Cycle {entry.cycle}</p>
          <strong>{entry.text}</strong>
        </li>
      ))}
    </ol>
  ) : <p className="admiral-directives__empty">No fleet directives published</p>;
}

export function FleetDirectives() {
  const directives = useSessionStore((state) => state.session?.admiralDirectives);
  if (!directives?.entries.length) return null;
  return (
    <details className="fleet-directives">
      <summary>Fleet directives</summary>
      <section className="fleet-directives__panel" aria-label="Current fleet directives">
        <DirectiveList state={directives} />
      </section>
    </details>
  );
}

export default function AdmiralDirectiveWorkspace({
  consoleLocked = false,
}: {
  readonly consoleLocked?: boolean;
}) {
  const directives = useSessionStore((state) => state.session?.admiralDirectives);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [copy, setCopy] = useState<Record<AdmiralDirectiveKind, string>>({
    'fleet-policy': '',
    'defence-coordination': '',
  });
  const [pending, setPending] = useState<AdmiralDirectiveKind | null>(null);
  const [status, setStatus] = useState('');
  const live = connection === 'live' && freshness === 'server' && !consoleLocked;

  async function submit(event: FormEvent, kind: AdmiralDirectiveKind): Promise<void> {
    event.preventDefault();
    const text = copy[kind].trim();
    if (!text || pending) return;
    setPending(kind);
    setStatus('');
    try {
      await publishAdmiralDirective(kind, text);
      setCopy((current) => ({ ...current, [kind]: '' }));
      setStatus(`${LABELS[kind]} published.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Fleet directive was not published.');
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="admiral-directives console-workspace__section" aria-label="Admiral policy and defence coordination">
      <header>
        <p>AEGIS command channel // Public fleet record</p>
        <h3>Fleet directives</h3>
        <p>Publish fleet policy or defence coordination. This channel does not grant facilitator controls.</p>
      </header>
      <div className="admiral-directives__composers">
        {(Object.keys(LABELS) as AdmiralDirectiveKind[]).map((kind) => (
          <form key={kind} onSubmit={(event) => void submit(event, kind)}>
            <label htmlFor={`admiral-directive-${kind}`}>{LABELS[kind]}</label>
            <textarea
              id={`admiral-directive-${kind}`}
              maxLength={500}
              value={copy[kind]}
              onChange={(event) => setCopy((current) => ({ ...current, [kind]: event.target.value }))}
              disabled={!live || pending !== null}
              aria-describedby={`admiral-directive-${kind}-limit`}
            />
            <div className="admiral-directives__form-footer">
              <span id={`admiral-directive-${kind}-limit`}>{copy[kind].length}/500</span>
              <button className="cic-action-button" type="submit"
                disabled={!live || pending !== null || !copy[kind].trim()}>
                {pending === kind ? 'Publishing…' : `Publish ${LABELS[kind].toLowerCase()}`}
              </button>
            </div>
          </form>
        ))}
      </div>
      {!live && <p className="admiral-directives__availability" role="status">
        Publication unavailable // reconnect to live Admiral authority
      </p>}
      <DirectiveList state={directives} />
      <p className="admiral-directives__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
