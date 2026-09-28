import './onboarding.css';

export interface OnboardingFirstActionProps {
  readonly actionLabel: string;
  readonly actionHint: string;
  readonly onAction: () => void;
  readonly actionComplete?: boolean;
  readonly returnLabel?: string;
  readonly onReturn?: () => void;
}

/**
 * Presentation-only first-action handoff. Callers supply navigation or a
 * synthetic review callback; this component never writes session state.
 */
export function OnboardingFirstAction({
  actionLabel,
  actionHint,
  onAction,
  actionComplete = false,
  returnLabel,
  onReturn,
}: OnboardingFirstActionProps) {
  return (
    <section className="onboarding-panel onboarding-first-action" aria-label="First action">
      <p className="onboarding-eyebrow">Briefing // first action</p>
      <h2>Take your station</h2>
      <p>{actionHint}</p>
      <button className="cic-action-button" type="button" onClick={onAction}>
        {actionLabel}
      </button>
      {actionComplete && (
        <p className="onboarding-status" role="status">
          Action complete in this review scene.
        </p>
      )}
      {returnLabel && onReturn && (
        <button className="cic-text-button" type="button" onClick={onReturn}>
          {returnLabel}
        </button>
      )}
    </section>
  );
}
