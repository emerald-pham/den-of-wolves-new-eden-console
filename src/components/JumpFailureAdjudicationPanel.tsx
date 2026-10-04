import { useState } from 'react';
import { STAR_CHART_SYSTEMS } from '@/data/starChart';
import {
  adjudicateFailedJump,
  createFailedJumpAdjudicationAttempt,
  isFailedJumpOutcomeUncertain,
  listUnresolvedJumpFailures,
  type FailedJumpConsequence,
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

const CONSEQUENCE_LABELS: Readonly<Record<FailedJumpConsequence, string>> = {
  'nothing-happens': 'Nothing happens // delay this ship until next cycle',
  'full-d6-damage': 'Jump correctly // apply the full d6 damage',
  'half-d6-damage': 'Jump correctly // apply half the d6 damage',
  'wrong-location': 'Normal jump // use the selected wrong location',
  'wrong-location-full-d6-damage': 'Wrong location // full d6 damage',
  'wrong-location-half-d6-damage': 'Wrong location // half d6 damage',
};

function consequenceChoices(failure: FailedJumpSummary): readonly FailedJumpConsequence[] {
  return failure.failureStatus === 'wrong-destination'
    ? ['full-d6-damage', 'half-d6-damage', 'wrong-location',
      'wrong-location-full-d6-damage', 'wrong-location-half-d6-damage']
    : ['nothing-happens', 'full-d6-damage', 'half-d6-damage',
      'wrong-location-full-d6-damage', 'wrong-location-half-d6-damage'];
}

function consequenceNeedsDestination(consequence: FailedJumpConsequence): boolean {
  return consequence !== 'nothing-happens';
}

export default function JumpFailureAdjudicationPanel({ active }: Props) {
  const [failures, setFailures] = useState<readonly FailedJumpSummary[]>([]);
  const [destinations, setDestinations] = useState<Readonly<Record<string, string>>>({});
  const [consequences, setConsequences] = useState<Readonly<Record<string, FailedJumpConsequence | ''>>>({});
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
    const consequence = attempts[failure.requestId]?.consequence ?? consequences[failure.requestId] ?? '';
    if (!consequence) {
      setNotice('Choose a documented consequence before adjudicating this failure.');
      return;
    }
    const chosenDestination = attempts[failure.requestId]?.destination ?? destinations[failure.requestId] ?? '';
    if (consequenceNeedsDestination(consequence) && !chosenDestination) {
      setNotice('No printed destination is available for this failed jump.');
      return;
    }
    let captured = attempts[failure.requestId];
    if (!captured) {
      try {
        captured = createFailedJumpAdjudicationAttempt(
          failure, consequenceNeedsDestination(consequence) ? chosenDestination : undefined, consequence,
        );
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
      setNotice(reply.status === 'delayed'
        ? `Adjudication committed // no jump this cycle // ${reply.damageCount ?? 0} damage draws.`
        : `Adjudication committed // ${CONSEQUENCE_LABELS[reply.consequence ?? consequence]} // ${reply.damageCount ?? reply.damageDraws?.length ?? 0} damage draws.`);
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
        Choose and record a facilitator consequence before resolution. The server applies the selected
        printed damage branch and any required jump costs; the fixed emergency-jump procedure is separate.
      </p>
      {notice && <p className="jump-failure-panel__notice" role="status">{notice}</p>}
      {failures.length > 0 && <ul className="jump-failure-panel__list">
        {failures.map((failure) => {
          const choices = destinationsFor(failure);
          const captured = attempts[failure.requestId];
          const selectedConsequence = captured?.consequence ?? consequences[failure.requestId] ?? '';
          const needsDestination = selectedConsequence ? consequenceNeedsDestination(selectedConsequence) : true;
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
              <span>Facilitator consequence</span>
              <select
                aria-label={`Failed-jump consequence for ${failure.shipId.toUpperCase()}`}
                value={selectedConsequence}
                disabled={checking || busyId !== null || Boolean(captured)}
                onChange={(event) => {
                  const value = event.currentTarget.value as FailedJumpConsequence | '';
                  setConsequences((current) => ({ ...current, [failure.requestId]: value }));
                }}
              >
                <option value="">Choose a documented consequence</option>
                {consequenceChoices(failure).map((consequence) =>
                  <option value={consequence} key={consequence}>{CONSEQUENCE_LABELS[consequence]}</option>)}
              </select>
            </label>
            {needsDestination && <label className="jump-failure-panel__destination">
              <span>Reachable printed destination</span>
              <select
                aria-label={`Adjudication destination for ${failure.shipId.toUpperCase()}`}
                value={captured?.destination ?? destinations[failure.requestId] ?? ''}
                disabled={checking || busyId !== null || Boolean(captured)}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDestinations((current) => ({ ...current, [failure.requestId]: value }));
                }}
              >
                <option value="">Choose a printed destination</option>
                {choices.map((coordinate) => <option value={coordinate} key={coordinate}>{coordinate}</option>)}
              </select>
            </label>}
            <button
              type="button"
              disabled={checking || busyId !== null || !selectedConsequence ||
                (needsDestination && !(captured?.destination ?? destinations[failure.requestId]))}
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
