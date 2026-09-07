import { navigationEntryMessage } from '@/lib/navigationLog';
import type { ShipNavigationLogEntry } from '@/types/game';

interface Props {
  readonly shipName: string;
  readonly entries?: readonly ShipNavigationLogEntry[];
}

export default function ShipNavigationLog({ shipName, entries = [] }: Props) {
  return (
    <section className="ship-navigation-log cic-frame" role="region" aria-label={`${shipName} ship log`}>
      <header>
        <p className="cic-overline">Navigation record // stardate</p>
        <h3>{shipName} ship log</h3>
      </header>
      <div className="ship-navigation-log__scroll" tabIndex={0} aria-label={`${shipName} navigation log entries`}>
        {entries.length > 0 ? (
          <ol>
            {entries.map((entry) => (
              <li key={entry.id} data-navigation-event={entry.type}>
                <time dateTime={entry.occurredAt}>{entry.stardate}</time>
                <span>{navigationEntryMessage(entry)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="ship-navigation-log__empty">No navigation entries recorded.</p>}
      </div>
    </section>
  );
}
