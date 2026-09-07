import { useEffect, useRef } from 'react';

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
] as const;

export interface SessionWaiverProps {
  readonly onAcknowledge: () => void;
}

export default function SessionWaiver({ onAcknowledge }: SessionWaiverProps) {
  const acknowledgeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    acknowledgeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      acknowledgeButton.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="session-waiver-backdrop" data-waiver-gate="true">
      <section
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
              <span className="session-waiver__check" role="img" aria-label="Regulation acknowledged">
                ✓
              </span>
            </article>
          ))}
        </div>

        <p className="session-waiver__thanks">Thank you for being part of the solution.</p>
        <button
          className="session-waiver__acknowledge cic-action-button"
          ref={acknowledgeButton}
          type="button"
          onClick={onAcknowledge}
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
