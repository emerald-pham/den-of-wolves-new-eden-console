import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMotionPreference } from '@/lib/motionPreference';
import './fleetTicker.css';

export interface FleetMessage {
  readonly id: string;
  readonly text: string;
  readonly tone: 'danger' | 'normal';
  /** Omit to repeat until replaced. */
  readonly passes?: number;
}

function Message({ message, fallback }: {
  readonly message: FleetMessage;
  readonly fallback?: FleetMessage;
}) {
  const { reducedMotion } = useMotionPreference();
  const windowRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [copyCount, setCopyCount] = useState(2);
  const key = `fleet-ticker:${message.id}`;
  const [completed, setCompleted] = useState(() => {
    try { return Number(sessionStorage.getItem(key)) || 0; } catch { return 0; }
  });
  const done = message.passes !== undefined && completed >= message.passes;
  const finishPass = () => setCompleted(value => value + 1);
  useEffect(() => {
    if (message.passes === undefined) return;
    try { sessionStorage.setItem(key, String(completed)); } catch { /* Storage may be disabled. */ }
  }, [completed, key, message.passes]);
  useEffect(() => {
    if (!reducedMotion || done || message.passes === undefined) return;
    const timer = window.setInterval(finishPass, 30_000);
    return () => window.clearInterval(timer);
  }, [reducedMotion, done, message.passes]);
  useLayoutEffect(() => {
    if (reducedMotion) return;
    const windowElement = windowRef.current;
    const copyElement = copyRef.current;
    if (!windowElement || !copyElement) return;
    const measure = () => {
      const copyWidth = copyElement.scrollWidth || copyElement.getBoundingClientRect().width;
      if (copyWidth <= 0) return;
      setCopyCount(Math.max(2, Math.ceil(windowElement.clientWidth / copyWidth) + 1));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(windowElement);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [message.text, reducedMotion]);
  if (done) return fallback ? <Message key={fallback.id} message={fallback} /> : null;
  return <aside className="fleet-ticker" aria-label="Fleet broadcasts" data-tone={message.tone} data-reduced={reducedMotion}>
    <div ref={windowRef} className="fleet-ticker__window" role="status" aria-label={message.text}
      aria-live="polite" aria-atomic="true">
      {reducedMotion ? (
        <p className="fleet-ticker__message">{message.text}</p>
      ) : (
        <div className="fleet-ticker__track" aria-hidden="true"
          onAnimationIteration={message.passes === undefined ? undefined : finishPass}
          onAnimationEnd={message.passes === undefined ? undefined : finishPass}>
          {[0, 1].map((group) => (
            <span className="fleet-ticker__group" key={group}>
              {Array.from({ length: copyCount }, (_, index) => (
                <span className="fleet-ticker__copy" key={index}
                  ref={group === 0 && index === 0 ? copyRef : undefined}>
                  {message.text}<span className="fleet-ticker__separator"> // </span>
                </span>
              ))}
            </span>
          ))}
        </div>
      )}
    </div>
  </aside>;
}

/** Shared viewport surface for alert and press messages; identity owns playback. */
export default function FleetTicker({ message, fallback }: {
  readonly message: FleetMessage;
  readonly fallback?: FleetMessage;
}) {
  return <Message key={message.id} message={message}
    {...(fallback === undefined ? {} : { fallback })} />;
}
