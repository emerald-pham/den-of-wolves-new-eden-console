import { useState } from 'react';
import { FIGHTER_WING_IDS, fighterWingCallsign, otherFighterWing, type FighterWingId } from '@/data/aegisConsoles';
import type { FighterWingExchangeResult } from '@/lib/sessionService';
import {
  clearSessionDraft, readSessionDraft, writeSessionDraft, type SessionDraftScope,
} from '@/lib/sessionDraftStorage';
import { useSessionStore } from '@/store/useSessionStore';
import './AegisFighterWingExchangePanel.css';

type WingCount = Readonly<{ count: number; revision: number }>;

type ExchangeDraft = Readonly<{ sourceWingId: FighterWingId; amount: number }>;

function exchangeDraftScope(sessionId: string | undefined, uid: string | undefined): SessionDraftScope {
  return { kind: 'aegis-fighter-exchange-draft', sessionId, uid, scope: 'aegis' };
}

/** Only the player's choice is kept: never a request identity, and it is never sent on restore. */
function parseExchangeDraft(value: unknown): ExchangeDraft | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (Object.keys(draft).length !== 2 || !FIGHTER_WING_IDS.includes(draft.sourceWingId as FighterWingId) ||
      !Number.isSafeInteger(draft.amount) || (draft.amount as number) < 1 || (draft.amount as number) > 6) return null;
  return { sourceWingId: draft.sourceWingId as FighterWingId, amount: draft.amount as number };
}

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
  const sessionId = useSessionStore((state) => state.session?.id);
  const uid = useSessionStore((state) => state.me?.uid);
  const draftScope = exchangeDraftScope(sessionId, uid);
  const [restored] = useState(() => readSessionDraft(draftScope, parseExchangeDraft));
  const [sourceWingId, setSourceWingIdState] = useState<FighterWingId>(restored?.sourceWingId ?? 'fighter-wing-alpha');
  const [amount, setAmountState] = useState(restored?.amount ?? 1);
  const saveDraft = (draft: ExchangeDraft) => writeSessionDraft(draftScope, draft);
  // Choosing a direction restarts the amount at one fighter, as the form always has.
  const setSourceWingId = (wingId: FighterWingId) => {
    setSourceWingIdState(wingId);
    setAmountState(1);
    saveDraft({ sourceWingId: wingId, amount: 1 });
  };
  const setAmount = (value: number) => { setAmountState(value); saveDraft({ sourceWingId, amount: value }); };
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
      (result) => {
        if (result && result.status !== 'stale') clearSessionDraft(draftScope);
        setNotice(resultNotice(result));
      },
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
            onChange={(event) => { setSourceWingId(event.target.value as FighterWingId); setNotice(undefined); }}>
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
