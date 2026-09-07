import { useEffect, useRef, useState } from 'react';
import { SESSION_WAIVER_CONFIRM_DELAY_MS } from '@/lib/sessionWaiver';

const REGULATIONS = [
  {
    id: 'console-custody',
    title: 'ICNY REGISTERED VESSEL CONSOLES CANNOT BE REMOVED FROM THE TABLES',
    eyebrow: 'ROLE-PLAY / IRL TABLE RULE',
    copy: 'Your console stays with your ship. Do not use it while you are off your ship. The only exception is when you are aboard your shuttle. If you travel to another ship, bring yourself only. Wireless commands are illegal for informational security.',
  },
  {
    id: 'cic-security',
    title: 'CIC AUTHORIZED PERSONNEL MAY HIDE RESOURCE COUNTS',
    eyebrow: 'IN-WORLD INFORMATION SECURITY',
    copy: 'CIC authorized personnel may hide resource counts from other ships and are not compelled to share them. They may lie about resource counts, jump coordinates, or other details when informational security requires it.',
  },
  {
    id: 'human-on-the-other-side',
    title: 'REMEMBER THE HUMAN ON THE OTHER SIDE',
    eyebrow: 'OUT-OF-CHARACTER / TABLE RULE',
    copy: "We're all playing roles, but remember there's another human on the other side. You'll have to debrief and say hi with them when the game is over anyways, even if they are your enemy in the present moment.",
  },
] as const;

export interface SessionWaiverProps {
  readonly onAcknowledge: () => void;
}

export default function SessionWaiver({ onAcknowledge }: SessionWaiverProps) {
  const dialog = useRef<HTMLElement>(null);
  const [acknowledged, setAcknowledged] = useState(() => REGULATIONS.map(() => false));
  const [remainingMs, setRemainingMs] = useState(SESSION_WAIVER_CONFIRM_DELAY_MS);
  const allRegulationsAcknowledged = acknowledged.every(Boolean);
  const confirmationReady = allRegulationsAcknowledged && remainingMs <= 0;
  const remainingSeconds = Math.ceil(remainingMs / 1_000);

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

  useEffect(() => {
    const startedAt = Date.now();
    const updateRemaining = () => {
      const remaining = Math.max(0, SESSION_WAIVER_CONFIRM_DELAY_MS - (Date.now() - startedAt));
      setRemainingMs(remaining);
      if (remaining === 0) window.clearInterval(timer);
    };
    const timer = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(timer);
  }, []);

  function setRegulationAcknowledged(index: number, checked: boolean): void {
    setAcknowledged((current) => current.map((value, currentIndex) =>
      currentIndex === index ? checked : value,
    ));
  }

  function acknowledge(): void {
    if (!confirmationReady) return;
    onAcknowledge();
  }

  return (
    <div className="session-waiver-backdrop" data-waiver-gate="true">
      <section
        ref={dialog}
        className="session-waiver cic-frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-waiver-title"
        aria-describedby="session-waiver-intro"
      >
        <header className="session-waiver__header">
          <p className="cic-overline">SESSION ACCESS // REVIEW REQUIRED</p>
          <h1 id="session-waiver-title">CODE OF CONDUCT</h1>
          <p id="session-waiver-intro">
            Help keep the table fair, safe, and in-world by acknowledging all session
            regulations before continuing.
          </p>
        </header>

        <div className="session-waiver__ticks cic-ticks" aria-hidden="true" />

        <div className="session-waiver__regulations">
          {REGULATIONS.map((regulation, index) => (
            <article
              className="session-waiver__regulation cic-frame"
              aria-label={regulation.title}
              key={regulation.id}
            >
              <div className="session-waiver__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div className="session-waiver__copy">
                <p className="cic-overline">{regulation.eyebrow}</p>
                <h2>{regulation.title}</h2>
                <p>{regulation.copy}</p>
              </div>
              <label className="session-waiver__check">
                <input
                  type="checkbox"
                  checked={acknowledged[index] ?? false}
                  aria-label={`Acknowledge regulation ${index + 1}: ${regulation.title}`}
                  onChange={(event) => setRegulationAcknowledged(index, event.target.checked)}
                />
              </label>
            </article>
          ))}
        </div>

        <p className="session-waiver__thanks">Thank you for being part of the solution.</p>
        <p className="session-waiver__countdown" role="status" aria-live="polite">
          {remainingMs > 0
            ? `FINAL CONFIRMATION LOCK // ${remainingSeconds} SECONDS REMAINING`
            : allRegulationsAcknowledged
              ? 'FINAL CONFIRMATION READY'
              : 'CHECK EVERY REGULATION TO ENABLE FINAL CONFIRMATION'}
        </p>
        <button
          className="session-waiver__acknowledge cic-action-button"
          type="button"
          disabled={!confirmationReady}
          onClick={acknowledge}
        >
          Acknowledge regulations and continue
        </button>
        <p className="session-waiver__retention">
          Acknowledgement saved for 24 hours on this device.
        </p>
      </section>
    </div>
  );
}
