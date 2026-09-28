import { useState } from 'react';
import './onboarding.css';

export interface GmSetupChecklistReceipt {
  readonly playerCount: number;
  readonly wolfCount: number;
  readonly wolfRule: string;
  readonly privateCardCount: number;
}

export interface GmSetupChecklistProps {
  readonly chartId: string;
  readonly chartLocked: boolean;
  readonly playerCount: number;
  readonly connectedPlayerCount: number;
  readonly roleAssignmentCount: number;
  /** Aggregate fields only; no role or loyalty identities belong here. */
  readonly setupReceipt?: GmSetupChecklistReceipt | null;
}

const PREP_STEPS = [
  'Room and components are ready',
  'Star chart is selected and ready for the session',
  'Casting and private role briefs are accounted for',
  'Loyalty assignments remain private',
] as const;

/**
 * A local preparation aid. Its checkboxes are presentation state only and do
 * not confirm roster setup, write gameplay state, or certify production start.
 */
export function GmSetupChecklist({
  chartId,
  chartLocked,
  playerCount,
  connectedPlayerCount,
  roleAssignmentCount,
  setupReceipt = null,
}: GmSetupChecklistProps) {
  const [checkedSteps, setCheckedSteps] = useState<ReadonlySet<string>>(() => new Set());

  const toggleStep = (step: string) => {
    setCheckedSteps((current) => {
      const next = new Set(current);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  return (
    <section className="onboarding-panel gm-setup-checklist" aria-label="Setup checklist">
      <p className="onboarding-eyebrow">Facilitator // preflight</p>
      <h2>One facilitator can run the session.</h2>
      <p>
        The primary facilitator prepares the room and components, teaches the rules,
        manages setup, and calls the phases. Assistant help is optional: a helper may
        stage pieces, track the chart, or read announcements.
      </p>
      <p className="onboarding-facilitator-lane">
        <strong>Primary facilitator //</strong> room, components, teaching, setup, and phase calls.
      </p>
      <p className="onboarding-facilitator-lane">
        <strong>Main facilitator lane //</strong> assign loyalty privately; monitor AEGIS, Dione, and
        Icebreaker; prepare Wolf attacks and deliver crises.
      </p>
      <p className="onboarding-facilitator-lane">
        <strong>Assistant facilitator lane //</strong> monitor Refinery 124, Quellon, and Shepherd;
        support players and keep the main facilitator briefed.
      </p>
      <p>
        Assistant help is optional. One facilitator can cover both printed lanes; no helper assignment
        blocks setup or production readiness.
      </p>

      <ul className="onboarding-checklist" aria-label="Local preparation checks">
        {PREP_STEPS.map((step) => (
          <li key={step}>
            <label>
              <input
                type="checkbox"
                checked={checkedSteps.has(step)}
                onChange={() => toggleStep(step)}
              />
              <span>{step}</span>
            </label>
          </li>
        ))}
      </ul>

      <dl className="onboarding-snapshot" aria-label="Setup snapshot">
        <div><dt>Chart</dt><dd>Chart {chartId} // {chartLocked ? 'locked' : 'not locked'}</dd></div>
        <div><dt>Roster</dt><dd>{connectedPlayerCount} players connected // {playerCount} configured</dd></div>
        <div><dt>Casting</dt><dd>{roleAssignmentCount} roles assigned</dd></div>
        <div>
          <dt>Automatic setup</dt>
          <dd>
            {setupReceipt
              ? `Wolf rule // ${setupReceipt.wolfRule} // ${setupReceipt.privateCardCount} private card${setupReceipt.privateCardCount === 1 ? '' : 's'} // ${setupReceipt.wolfCount} Wolf${setupReceipt.wolfCount === 1 ? '' : 's'}`
              : 'The server calculates assignments. The server validates readiness when Start Production is requested.'}
          </dd>
        </div>
      </dl>

      <p className="onboarding-readiness" role="note">
        Checklist marks are local preparation notes. The server validates readiness when Start Production is requested. Review its receipt before the first action.
      </p>
    </section>
  );
}
