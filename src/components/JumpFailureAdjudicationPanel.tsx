import { useState } from 'react';
import { STAR_CHART_SYSTEMS } from '@/data/starChart';
import {
  adjudicateFailedJump,
  createFailedJumpAdjudicationAttempt,
  isFailedJumpOutcomeUncertain,
  listUnresolvedJumpFailures,
  type FailedJumpAdjudicationAttempt,
  type FailedJumpSummary,
} from '@/lib/sessionService';

interface Props {
  readonly active: boolean;
}

function failureLabel(status: FailedJumpSummary['failureStatus']): string {
  if (status === 'fuel-shortage') return 'FUEL SHORTAGE';
  if (status === 'wrong-destination') return 'UNPRINTED DESTINATION';
  return 'DAMAGED-DRIVE FAILURE';
}

function destinationsFor(failure: FailedJumpSummary): readonly string[] {
  return STAR_CHART_SYSTEMS.map((system) => system.coordinate)
    .filter((coordinate) => coordinate !== failure.origin);
}

export default function JumpFailureAdjudicationPanel({ active }: Props) {
  const [failures, setFailures] = useState<readonly FailedJumpSummary[]>([]);
  const [destinations, setDestinations] = useState<Readonly<Record<string, string>>>({});
  const [attempts, setAttempts] = useState<Readonly<Record<string, FailedJumpAdjudicationAttempt>>>({});
  const [checking, setChecking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  if (!active) return null;

  async function refresh(): Promise<void> {
    setChecking(true);
    setNotice('');
    try {
      const reply = await listUnresolvedJumpFailures();
      if (reply.stale) {
        setFailures([]);
        setNotice('Facilitator session changed // check failed jumps again.');
        return;
      }
      setFailures(reply.failures);
      setNotice(reply.failures.length
        ? `${reply.failures.length} current failed jump${reply.failures.length === 1 ? '' : 's'} available.`
        : 'No current failed jumps require adjudication.');
    } catch {
      setNotice('Failed-jump list unavailable // refresh facilitator session and retry.');
    } finally {
      setChecking(false);
    }
  }

  async function complete(failure: FailedJumpSummary): Promise<void> {
    const chosenDestination = destinations[failure.requestId] ??
      (destinationsFor(failure).includes(failure.destination)
        ? failure.destination
        : destinationsFor(failure)[0] ?? '');
    if (!chosenDestination) {
      setNotice('No printed destination is available for this failed jump.');
      return;
    }
    let captured = attempts[failure.requestId];
    if (!captured) {
      try {
        captured = createFailedJumpAdjudicationAttempt(failure, chosenDestination);
        setAttempts((current) => ({ ...current, [failure.requestId]: captured! }));
      } catch {
        setNotice('Adjudication request rejected // claim the active facilitator console and reconnect.');
        return;
      }
    }
    setBusyId(failure.requestId);
    setNotice('Facilitator adjudication // committing exact failed jump.');
    try {
      const reply = await adjudicateFailedJump(captured);
      if (reply.status === 'stale') {
        setAttempts((current) => {
          const next = { ...current };
          delete next[failure.requestId];
          return next;
        });
        setNotice('Failed jump changed // refresh the unresolved list before a new decision.');
        return;
      }
      setAttempts((current) => {
        const next = { ...current };
        delete next[failure.requestId];
        return next;
      });
      setFailures((current) => current.filter((candidate) => candidate.requestId !== failure.requestId));
      setNotice(`Jump completed to ${reply.destination ?? captured.destination} // ${reply.damageDraws?.length ?? 0} damage draws.`);
    } catch (cause) {
      if (isFailedJumpOutcomeUncertain(cause)) {
        setNotice('Confirmation was lost // retry this exact adjudication to check the same request.');
      } else {
        setAttempts((current) => {
          const next = { ...current };
          delete next[failure.requestId];
          return next;
        });
        setNotice('Adjudication rejected // refresh the unresolved list before trying again.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="jump-failure-panel" aria-label="Failed jump adjudication">
      <header className="jump-failure-panel__header">
        <div>
          <p className="jump-failure-panel__eyebrow">Facilitator // private decision</p>
          <h2>Failed jump adjudication</h2>
        </div>
        <button type="button" disabled={checking || busyId !== null} onClick={() => void refresh()}>
          {checking ? 'Checking…' : 'Check failed jumps'}
        </button>
      </header>
      <p className="jump-failure-panel__rule">
        Completing a listed failure applies one full server d6 of common ship damage. An under-fueled
        decision spends only the fuel still available.
      </p>
      {notice && <p className="jump-failure-panel__notice" role="status">{notice}</p>}
      {failures.length > 0 && <ul className="jump-failure-panel__list">
        {failures.map((failure) => {
          const choices = destinationsFor(failure);
          const selected = destinations[failure.requestId] ??
            (choices.includes(failure.destination) ? failure.destination : choices[0] ?? '');
          const captured = attempts[failure.requestId];
          const isBusy = busyId === failure.requestId;
          return <li key={failure.requestId} className="jump-failure-panel__item">
            <div className="jump-failure-panel__failure">
              <strong>{failure.shipId.toUpperCase()} // {failureLabel(failure.failureStatus)}</strong>
              <span>{failure.origin} → {failure.destination} // cycle {failure.currentTurn}</span>
              {failure.failureStatus === 'fuel-shortage' && <span>
                {failure.fuelAtFailure} fuel available; {failure.requiredFuel ?? '?'} required
              </span>}
              {failure.failureStatus === 'drive-failure' && <span>
                Drive roll {failure.failureRoll ?? '?'} // failure on 1–{failure.failureThreshold ?? '?'}
              </span>}
              {failure.failureStatus === 'wrong-destination' && <span>
                The original destination is outside the locked printed chart.
              </span>}
            </div>
            <label className="jump-failure-panel__destination">
              <span>Reachable printed destination</span>
              <select
                aria-label={`Adjudication destination for ${failure.shipId.toUpperCase()}`}
                value={captured?.destination ?? selected}
                disabled={checking || busyId !== null || Boolean(captured)}
                onChange={(event) => setDestinations((current) => ({
                  ...current, [failure.requestId]: event.currentTarget.value,
                }))}
              >
                {choices.map((coordinate) => <option value={coordinate} key={coordinate}>{coordinate}</option>)}
              </select>
            </label>
            <button
              type="button"
              disabled={checking || busyId !== null || !selected}
              onClick={() => void complete(failure)}
            >{isBusy
              ? 'Committing…'
              : captured
                ? `Retry exact adjudication for ${failure.shipId.toUpperCase()}`
                : `Complete failed jump for ${failure.shipId.toUpperCase()}`}</button>
          </li>;
        })}
      </ul>}
    </section>
  );
}
