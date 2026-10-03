import { useEffect, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';
import './WolfAttackStatusPanel.css';

const STEP_LABELS: Record<WolfAttackMemberView['currentStep'], string> = {
  targeting: 'Targeting',
  'long-range': 'Long Range',
  'medium-range': 'Medium Range',
  'short-range': 'Short Range',
  boarding: 'Boarding Action',
  resolved: 'Attack complete',
};

function formatOutcome(outcome: WolfAttackMemberView['results'][number]['outcome']): string {
  const values: string[] = [];
  if (typeof outcome.damage === 'number') values.push(`${outcome.damage} damage`);
  if (outcome.destroyed === true) values.push('destroyed');
  if (typeof outcome.populationLoss === 'number' && outcome.populationLoss > 0) {
    values.push(`${outcome.populationLoss} population lost`);
  }
  if (typeof outcome.survivingBoardingParties === 'number') {
    values.push(`${outcome.survivingBoardingParties} boarding parties remain`);
  }
  return values.length ? values.join(' // ') : 'Committed effect recorded';
}

/** Pure renderer so the solo review scene can supply synthetic attack states without transport. */
export function WolfAttackStatusView({ view }: Readonly<{ view: WolfAttackMemberView }>) {
  return (
    <section className="wolf-attack-status cic-frame" aria-label="Wolf attack status">
      <header className="wolf-attack-status__header">
        <div>
          <p className="eyebrow">Fleet alert // cycle {view.turn}</p>
          <h2>Wolf attack</h2>
        </div>
        <span className="wolf-attack-status__phase">{STEP_LABELS[view.currentStep]}</span>
      </header>
      <p className="wolf-attack-status__deadline">
        {view.currentStep === 'resolved' ? 'Resolution committed' : 'Current deadline'}
        {' // '}
        <time dateTime={view.deadlineAt}>{view.deadlineAt}</time>
      </p>
      {view.results.length > 0 ? (
        <ol className="wolf-attack-status__results" aria-label="Committed attack results">
          {view.results.map((result, index) => (
            <li key={`${result.range}-${result.sourceId}-${result.targetId}-${index}`}>
              <strong>{result.range === 'boarding' ? 'Boarding' : `${result.range} range`}</strong>
              <span>{result.sourceId} → {result.contactReference}</span>
              <span>{formatOutcome(result.outcome)}</span>
              <small>Committed {result.serverTime}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="wolf-attack-status__pending" aria-live="polite">
          Attack progress is server recorded. Results appear here when a step commits.
        </p>
      )}
    </section>
  );
}

export default function WolfAttackStatusPanel({
  sessionId: suppliedSessionId,
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{
  sessionId?: string;
  subscribe?: typeof subscribeWolfAttackMemberView;
}> = {}) {
  const storedSessionId = useSessionStore((state) => state.session?.id);
  const sessionId = suppliedSessionId ?? storedSessionId;
  const [view, setView] = useState<WolfAttackMemberView | null>(null);

  useEffect(() => {
    setView(null);
    if (!sessionId) return;
    return subscribe(sessionId, setView);
  }, [sessionId, subscribe]);

  if (!view) return null;
  return <WolfAttackStatusView view={view} />;
}
