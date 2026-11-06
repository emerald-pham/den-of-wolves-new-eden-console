import { useState } from 'react';
import { fighterWingCallsign, otherFighterWing, type FighterWingId } from '@/data/aegisConsoles';
import type { FighterWingExchangeResult } from '@/lib/sessionService';
import './AegisFighterWingExchangePanel.css';

type WingCount = Readonly<{ count: number; revision: number }>;

function fighters(count: number): string {
  return `${count} fighter${count === 1 ? '' : 's'}`;
}

function resultNotice(result: FighterWingExchangeResult | null): string {
  if (!result) {
    return 'Exchange not confirmed // check the live counts. Retrying the same choice resends the same request and cannot move fighters twice.';
  }
  if (result.status === 'stale') {
    return 'Exchange not committed // the wing counts changed first. No fighters moved; review the live counts and try again.';
  }
  const prefix = result.status === 'replayed' ? 'Exchange already committed' : 'Exchange committed';
  return `${prefix} // ${fighters(result.amount)} moved from ${fighterWingCallsign(result.sourceWingId)} to ${fighterWingCallsign(result.targetWingId)} // Alpha now ${fighters(result.counts['fighter-wing-alpha'].count)}, Bravo now ${fighters(result.counts['fighter-wing-bravo'].count)}.`;
}

/** Team Phase transfer of fighters between the two AEGIS wings. */
export default function AegisFighterWingExchangePanel({ counts, capacity, blockerFor, onExchange }: {
  readonly counts: Readonly<Record<FighterWingId, WingCount | undefined>>;
  readonly capacity: 4 | 6;
  readonly blockerFor: (sourceWingId: FighterWingId) => string | null;
  readonly onExchange: (sourceWingId: FighterWingId, amount: number) => Promise<FighterWingExchangeResult | null>;
}) {
  const [sourceWingId, setSourceWingId] = useState<FighterWingId>('fighter-wing-alpha');
  const [amount, setAmount] = useState(1);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const targetWingId = otherFighterWing(sourceWingId);
  const source = counts[sourceWingId];
  const target = counts[targetWingId];
  const maximum = source && target ? Math.max(0, Math.min(source.count, capacity - target.count)) : 0;
  const chosen = Math.min(amount, Math.max(1, maximum));
  const blocker = blockerFor(sourceWingId);
  const sourceName = fighterWingCallsign(sourceWingId);
  const targetName = fighterWingCallsign(targetWingId);

  function submit() {
    if (blocker || pending || chosen > maximum) return;
    setPending(true);
    setNotice(undefined);
    void onExchange(sourceWingId, chosen).then(
      (result) => setNotice(resultNotice(result)),
      () => setNotice(resultNotice(null)),
    ).finally(() => setPending(false));
  }

  return (
    <section className="aegis-wing-exchange cic-frame" aria-label="Fighter Wing exchange">
      <header className="aegis-wing-exchange__header">
        <p className="console-workspace__eyebrow">Team Phase // Wing Commander</p>
        <h3>Fighter Wing exchange</h3>
      </header>
      <p className="aegis-wing-exchange__strength">
        Alpha // {counts['fighter-wing-alpha'] ? fighters(counts['fighter-wing-alpha'].count) : 'count unavailable'}
        <span aria-hidden="true"> · </span>
        Bravo // {counts['fighter-wing-bravo'] ? fighters(counts['fighter-wing-bravo'].count) : 'count unavailable'}
        <span aria-hidden="true"> · </span>
        Capacity {capacity} per wing
      </p>
      <div className="aegis-wing-exchange__form">
        <label>
          Move fighters from
          <select value={sourceWingId} disabled={pending}
            onChange={(event) => { setSourceWingId(event.target.value as FighterWingId); setAmount(1); setNotice(undefined); }}>
            <option value="fighter-wing-alpha">Alpha to Bravo</option>
            <option value="fighter-wing-bravo">Bravo to Alpha</option>
          </select>
        </label>
        <label>
          Fighters to move
          <select value={chosen} disabled={pending || maximum < 1}
            onChange={(event) => { setAmount(Number(event.target.value)); setNotice(undefined); }}>
            {Array.from({ length: Math.max(1, maximum) }, (_, index) => index + 1).map((value) =>
              <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="cic-action-button" disabled={Boolean(blocker) || pending || maximum < 1}
          aria-busy={pending} onClick={submit}>
          {`Move ${fighters(chosen)} from ${sourceName} to ${targetName}`}
        </button>
      </div>
      <p className="aegis-wing-exchange__guidance">
        {blocker ?? `Move up to ${fighters(maximum)} from ${sourceName} to ${targetName}. Each wing holds up to ${capacity} fighters.`}
      </p>
      {(pending || notice) && <p className="aegis-wing-exchange__result" role="status" aria-live="polite">
        {pending ? 'Exchange pending // awaiting the server commit.' : notice}
      </p>}
    </section>
  );
}
