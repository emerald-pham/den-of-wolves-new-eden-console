import { useEffect, useState } from 'react';
import { useMotionPreference } from '@/lib/motionPreference';
import './fleetTicker.css';

export interface FleetMessage {
  readonly id: string;
  readonly text: string;
  readonly tone: 'danger' | 'normal';
  /** Omit to repeat until replaced. */
  readonly passes?: number;
}

function Message({ message }: { readonly message: FleetMessage }) {
  const { reducedMotion } = useMotionPreference();
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
  if (done) return null;
  return <aside className="fleet-ticker" aria-label="Fleet broadcasts" data-tone={message.tone} data-reduced={reducedMotion}>
    <div className="fleet-ticker__window" role="status" aria-live="polite" aria-atomic="true">
      <p className="fleet-ticker__message"
        style={reducedMotion ? { animation: 'none' } : undefined}
        onAnimationIteration={message.passes === undefined ? undefined : finishPass}
        onAnimationEnd={message.passes === undefined ? undefined : finishPass}>{message.text}</p>
    </div>
  </aside>;
}

/** Shared viewport surface for alert and press messages; identity owns playback. */
export default function FleetTicker({ message }: { readonly message: FleetMessage }) {
  return <Message key={message.id} message={message} />;
}
