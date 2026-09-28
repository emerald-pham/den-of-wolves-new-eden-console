import { useEffect, useState } from 'react';
import { subscribePressLog } from '@/lib/pressLogService';
import type { PressLogEntry } from '@/lib/pressLogState';
import { useSessionStore } from '@/store/useSessionStore';

function count(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function entryCopy(entry: PressLogEntry): string {
  if (entry.type === 'survivor-change') {
    return `${entry.vesselId.toUpperCase()} // SURVIVORS ${count(entry.fromPopulation)} → ${count(entry.toPopulation)} // ${entry.cause.replaceAll('-', ' ')}`;
  }
  if (entry.type === 'survivor-transfer') {
    return `SHUTTLE EVACUATION // ${count(entry.amount)} SURVIVORS FROM ${entry.sourceShipId.toUpperCase()} TO ${entry.destinationShipId.toUpperCase()}`;
  }
  if (entry.type === 'commissar-purge') {
    return `COMMISSAR PURGE // ${entry.shipId.toUpperCase()} // ${count(entry.survivorsRemoved)} SURVIVORS REMOVED // UNREST ${entry.unrestBefore} → ${entry.unrestAfter}`;
  }
  return `PRESIDENT // ${entry.actionKind.replaceAll('-', ' ').toUpperCase()} // ${entry.text}`;
}

function entryTime(entry: PressLogEntry): string {
  return new Date(entry.recordedAt).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Presentation-only inbox. Callers supply records and copy; it never reads or writes live state. */
export function PressEventLogView({
  entries,
  status,
  busy = false,
}: {
  readonly entries: readonly PressLogEntry[];
  readonly status: string;
  readonly busy?: boolean;
}) {
  return (
    <section className="press-event-log" aria-label="SNN Press log" aria-busy={busy}>
      <header className="press-event-log__header">
        <p className="press-event-log__eyebrow">SNN // INCOMING REPORTS</p>
        <h3>Press log</h3>
      </header>
      {entries.length > 0 ? (
        <ol className="press-event-log__list">
          {entries.map((entry) => (
            <li className="press-event-log__entry" key={entry.id}>
              <time dateTime={entry.recordedAt} className="press-event-log__time">
                CYCLE {entry.cycle} // {entryTime(entry)}
              </time>
              <p className="press-event-log__copy">{entryCopy(entry)}</p>
            </li>
          ))}
        </ol>
      ) : <p className="press-event-log__status" role="status">{status}</p>}
    </section>
  );
}

export default function PressEventLog() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const hasPressRole = me?.activeConsoleRoleId === 'press-officer';
  const sessionId = session?.id;
  const canRead = Boolean(
    hasPressRole && sessionId && session?.pressEnabled !== false &&
    connection === 'live' && freshness === 'server',
  );
  const [entries, setEntries] = useState<readonly PressLogEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setEntries([]);
    setReady(false);
    setUnavailable(false);
    if (!canRead || !sessionId) return undefined;
    return subscribePressLog(
      sessionId,
      (next) => {
        setEntries(next);
        setReady(true);
        setUnavailable(false);
      },
      () => {
        setEntries([]);
        setReady(true);
        setUnavailable(true);
      },
    );
  }, [canRead, sessionId]);

  if (!hasPressRole || !sessionId) return null;

  const status = session?.pressEnabled === false
    ? 'PRESS ACCESS // DISABLED'
    : connection !== 'live' || freshness !== 'server'
      ? 'AWAITING CIC HANDSHAKE'
      : unavailable
        ? 'PRESS LOG // LINK UNAVAILABLE'
        : !ready
          ? 'AWAITING CIC HANDSHAKE'
          : entries.length === 0
            ? 'NO INCOMING REPORTS'
            : '';

  return <PressEventLogView
    entries={canRead ? entries : []}
    status={status}
    busy={!ready && canRead}
  />;
}
