import { useEffect, useMemo, useState } from 'react';
import { findVessel } from '@/data/ships';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberResult, WolfAttackMemberView } from '@/types/game';
import type { subscribeWolfAttackMemberView } from '@/lib/firestore';
import './WolfAttackDradis.css';

const STEP_LABELS: Record<WolfAttackMemberView['currentStep'], string> = {
  targeting: 'Targeting',
  'long-range': 'Long range',
  'medium-range': 'Medium range',
  'short-range': 'Short range',
  boarding: 'Boarding action',
  resolved: 'Attack complete',
};

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  'aegis:missile-launchers': 'AEGIS // Missile launchers',
  'aegis-missile-launchers': 'AEGIS // Missile launchers',
  'aegis-point-defence-lasers': 'AEGIS // Point defence lasers',
  'aegis-alpha-wing': 'AEGIS // Alpha Fighter Wing',
  'aegis-bravo-wing': 'AEGIS // Bravo Fighter Wing',
  'aegis-weapons': 'AEGIS // Weapons',
  'pdf-escort-wing': 'PDF Escort Wing',
  'gorgoneion-missile-array': 'Gorgoneion // Missile Array',
  'gorgoneion-force-field': 'Gorgoneion // Force Field',
  highwall: 'Highwall Cannon',
  boa: 'Boa Scrap Strike',
  maliades: 'Maliades',
  'wolf-boarding': 'Wolf boarding parties',
  'wolf-attack-damage': 'Wolf attack',
};

const NUMERIC_OUTCOMES = [
  ['damage', 'damage'],
  ['remainingCapacity', 'capacity remaining'],
  ['shipsDestroyed', 'ships destroyed'],
  ['populationLoss', 'population lost'],
  ['survivingBoardingParties', 'boarding parties remain'],
  ['securityCasualties', 'security casualties'],
  ['boarderCasualties', 'boarder casualties'],
  ['returnedCraftCount', 'craft returned'],
] as const;

function outcomeLabel(outcome: WolfAttackMemberResult['outcome']): string {
  const readings: string[] = [];
  for (const [field, label] of NUMERIC_OUTCOMES) {
    const value = outcome[field];
    if (typeof value === 'number' && Number.isFinite(value)) readings.push(`${value} ${label}`);
  }
  if (outcome.destroyed === true) readings.push('Destroyed');
  if (outcome.overrun === true) readings.push('Overrun');
  return readings.length > 0 ? readings.join(' // ') : 'Committed effect recorded';
}

type VisibleResult = Readonly<{
  result: WolfAttackMemberResult;
  target: string;
  contact: string | null;
}>;

function visibleResult(result: WolfAttackMemberResult, visibleTargets: ReadonlySet<string>): VisibleResult | null {
  const contact = /^Wolf contact [1-9]\d*$/.test(result.contactReference) ? result.contactReference : null;
  if (result.targetId === null) return { result, target: 'None', contact: null };
  const vessel = findVessel(result.targetId);
  // A published Wolf reference never makes its associated remote fleet target local.
  if (vessel) return visibleTargets.has(vessel.id) ? { result, target: vessel.name, contact } : null;
  // The opaque ID is neither a label nor a position. Only the published contact name is usable.
  return contact ? { result, target: contact, contact: null } : null;
}

function publishedTime(instant: string): string {
  const value = new Date(instant);
  return Number.isFinite(value.getTime()) ? `${value.toISOString().slice(11, 19)} UTC` : 'Time unavailable';
}

/** Member-projection readings only; this renderer never creates or positions a contact. */
export function WolfAttackDradisView({ view, visibleTargetIds }: Readonly<{
  view: WolfAttackMemberView;
  visibleTargetIds: readonly string[];
}>) {
  const visibleTargets = new Set(visibleTargetIds);
  const results = view.results.flatMap((result) => {
    const visible = visibleResult(result, visibleTargets);
    return visible ? [visible] : [];
  });
  const complete = view.status === 'resolved' || view.currentStep === 'resolved';
  const phase = complete ? 'Attack complete' : STEP_LABELS[view.currentStep];

  return (
    <section className="wolf-attack-dradis cic-frame" aria-label="Wolf attack DRADIS" data-complete={String(complete)}>
      <header className="wolf-attack-dradis__header">
        <div className="wolf-attack-dradis__identity">
          <h2>Wolf attack</h2>
          <span className="wolf-attack-dradis__cycle">Cycle {view.turn}</span>
        </div>
        <p className="wolf-attack-dradis__phase" role="status" aria-live="polite" aria-atomic="true">
          <span className="wolf-attack-dradis__phase-label">Phase // </span>{phase}
        </p>
      </header>
      <div className="wolf-attack-dradis__readings" tabIndex={0} role="region" aria-label="Wolf attack committed readings">
        <p className="wolf-attack-dradis__stamp">
          <span>{complete ? 'Committed' : 'Deadline'} // </span>
          <time dateTime={complete ? view.serverTime : view.deadlineAt} title={complete ? view.serverTime : view.deadlineAt}>
            {publishedTime(complete ? view.serverTime : view.deadlineAt)}
          </time>
        </p>
        {results.length > 0 ? (
          <ol className="wolf-attack-dradis__results" aria-label="Committed attack results">
            {results.map(({ result, target, contact }, index) => (
              <li className="wolf-attack-dradis__result" key={index}>
                <div className="wolf-attack-dradis__result-header">
                  <span>{result.range === 'boarding' ? 'Boarding' : `${result.range} range`}</span>
                  <span className="wolf-attack-dradis__committed">Committed</span>
                </div>
                <dl className="wolf-attack-dradis__values">
                  <div><dt>Source</dt><dd>{SOURCE_LABELS[result.sourceId] ?? result.sourceId.replace(/[:-]+/g, ' ')}</dd></div>
                  <div><dt>Target</dt><dd>{target}</dd></div>
                  {contact && <div><dt>Contact</dt><dd>{contact}</dd></div>}
                  <div>
                    <dt>Bearing</dt>
                    <dd className="wolf-attack-dradis__bearing" data-known={String(typeof result.bearing === 'number' && Number.isFinite(result.bearing))}>
                      {typeof result.bearing === 'number' && Number.isFinite(result.bearing) ? `${result.bearing}°` : 'Unknown'}
                    </dd>
                  </div>
                  <div><dt>Effect</dt><dd>{result.effect}</dd></div>
                  <div><dt>Outcome</dt><dd className="wolf-attack-dradis__outcome">{outcomeLabel(result.outcome)}</dd></div>
                </dl>
                <time className="wolf-attack-dradis__result-time" dateTime={result.serverTime} title={result.serverTime}>
                  {publishedTime(result.serverTime)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="wolf-attack-dradis__empty">
            {complete ? 'No committed results for the current plot.' : 'Awaiting committed results for the current plot.'}
          </p>
        )}
      </div>
    </section>
  );
}

type Subscribe = typeof subscribeWolfAttackMemberView;
type Subscription = Readonly<{ sessionId: string | undefined; enabled: boolean; subscribe: Subscribe | undefined }>;
type Reading = Readonly<{ subscription: Subscription; view: WolfAttackMemberView }>;

/** The caller owns current local authority; an invalidated listener can never restore its readings. */
export function WolfAttackDradisPanel({
  sessionId: suppliedSessionId,
  visibleTargetIds,
  enabled,
  subscribe,
}: Readonly<{
  sessionId?: string | undefined;
  visibleTargetIds: readonly string[];
  enabled: boolean;
  subscribe?: Subscribe;
}>) {
  const storedSessionId = useSessionStore((state) => state.session?.id);
  const sessionId = suppliedSessionId ?? storedSessionId;
  const subscription = useMemo(() => ({ sessionId, enabled, subscribe }), [sessionId, enabled, subscribe]);
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    setReading(null);
    if (!enabled || !sessionId) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let latest: WolfAttackMemberView | null = null;
    const retiredAttackIds = new Set<string>();

    const receive = (next: WolfAttackMemberView | null): void => {
      if (!active) return;
      if (!next || next.sessionId !== sessionId) {
        setReading(null);
        return;
      }
      if (latest) {
        if (next.attackId === latest.attackId) {
          if (next.revision < latest.revision) return;
        } else {
          if (retiredAttackIds.has(next.attackId) || next.turn < latest.turn ||
            Date.parse(next.serverTime) < Date.parse(latest.serverTime)) return;
          retiredAttackIds.add(latest.attackId);
        }
      }
      latest = next;
      setReading({ subscription, view: next });
    };

    if (subscribe) {
      unsubscribe = subscribe(sessionId, receive);
    } else {
      // DRADIS is mounted on the landing screen too; load transport only with local authority.
      void import('@/lib/firestore').then((transport) => {
        if (active) unsubscribe = transport.subscribeWolfAttackMemberView(sessionId, receive);
      }).catch(() => { if (active) setReading(null); });
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [enabled, sessionId, subscribe, subscription]);

  if (!enabled || !sessionId || reading?.subscription !== subscription) return null;
  return <WolfAttackDradisView key={reading.view.attackId} view={reading.view} visibleTargetIds={visibleTargetIds} />;
}

export default WolfAttackDradisPanel;
