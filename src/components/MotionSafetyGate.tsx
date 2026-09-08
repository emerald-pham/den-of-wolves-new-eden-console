import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  acknowledgeMotionSafety,
  readMotionSafetyChoice,
  type MotionSafetyChoice,
} from '@/lib/motionSafety';
import {
  hasMotionOverride,
  MotionPreferenceProvider,
  setMotionOverride,
} from '@/lib/motionPreference';

export interface MotionSafetyGateProps {
  readonly children: ReactNode;
}

interface MotionSafetyPromptProps {
  readonly onChoose: (choice: MotionSafetyChoice) => void;
}

function MotionSafetyPrompt({ onChoose }: MotionSafetyPromptProps) {
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const getFocusableControls = () => [...(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    getFocusableControls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = getFocusableControls();
      if (controls.length === 0) return;
      const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? controls.length - 1 : currentIndex - 1)
        : (currentIndex === controls.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      controls[nextIndex]?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="motion-safety-backdrop" data-motion-safety-gate="true">
      <section
        ref={dialog}
        className="motion-safety-dialog cic-frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="motion-safety-title"
        aria-describedby="motion-safety-intro motion-safety-warning"
      >
        <header className="motion-safety-dialog__header">
          <p className="cic-overline">DISPLAY SAFETY // REVIEW REQUIRED</p>
          <h1 id="motion-safety-title">MOTION SAFETY CHECK</h1>
          <p id="motion-safety-intro">
            Choose how much movement the console may use for the next 24 hours before you
            enter the game.
          </p>
        </header>

        <div className="motion-safety-dialog__ticks cic-ticks" aria-hidden="true" />

        <p id="motion-safety-warning" className="motion-safety-dialog__warning">
          WARNING: THIS GAME INCLUDES A LOT OF MOTION, MOVING PARTS, AND MOVING COLORS.
          NORMAL MOTION IS HIGHLY RECOMMENDED AND IS IMPORTANT FOR SEVERAL GAMEPLAY SYSTEMS.
          THE GAME REMAINS PLAYABLE WITH REDUCED MOTION, BUT SOME VISUAL MOVEMENT WILL BE
          SIMPLIFIED OR REMOVED.
        </p>

        <div className="motion-safety-dialog__choices">
          <button
            className="motion-safety-dialog__choice cic-action-button"
            type="button"
            onClick={() => onChoose('full')}
          >
            <span className="motion-safety-dialog__choice-title">NORMAL MOTION</span>
            <span className="motion-safety-dialog__choice-note">HIGHLY RECOMMENDED</span>
            <span className="motion-safety-dialog__choice-copy">
              Keep the complete movement language used by timing, attention, and several
              gameplay systems.
            </span>
          </button>
          <button
            className="motion-safety-dialog__choice cic-action-button"
            type="button"
            onClick={() => onChoose('reduce')}
          >
            <span className="motion-safety-dialog__choice-title">REDUCED MOTION</span>
            <span className="motion-safety-dialog__choice-note">PLAYABLE MODE</span>
            <span className="motion-safety-dialog__choice-copy">
              Keep the game playable while simplifying moving effects and color movement.
            </span>
          </button>
        </div>

        <p className="motion-safety-dialog__retention">
          Your choice is saved on this device for 24 hours. You will be asked again when that
          window expires.
        </p>
      </section>
    </div>
  );
}

export default function MotionSafetyGate({ children }: MotionSafetyGateProps) {
  const [choice, setChoice] = useState<MotionSafetyChoice | null>(() => readMotionSafetyChoice());
  const [hydratingChoice, setHydratingChoice] = useState<MotionSafetyChoice | null>(() => (
    choice !== null && !hasMotionOverride() ? choice : null
  ));
  const pending = choice === null;
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hydratingChoice === null) return;
    setMotionOverride(hydratingChoice);
    setHydratingChoice(null);
  }, [hydratingChoice]);

  useEffect(() => {
    const element = content.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (!element) return;
    const previousInert = element.inert ?? false;
    element.inert = pending;
    return () => {
      element.inert = previousInert;
    };
  }, [pending]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (pending) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pending]);

  function choose(nextChoice: MotionSafetyChoice): void {
    acknowledgeMotionSafety(nextChoice);
    setMotionOverride(nextChoice);
    setHydratingChoice(null);
    setChoice(nextChoice);
  }

  return (
    <MotionPreferenceProvider
      forceReducedMotion={pending}
      safetyOverride={pending ? 'reduce' : hydratingChoice}
    >
      <div className="motion-safety-shell" data-motion={pending ? 'reduce' : undefined}>
        {pending && <MotionSafetyPrompt onChoose={choose} />}
        <div
          ref={content}
          className="motion-safety-content"
          aria-hidden={pending ? 'true' : undefined}
        >
          {children}
        </div>
      </div>
    </MotionPreferenceProvider>
  );
}
