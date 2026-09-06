import { useEffect, useState, type ReactNode } from 'react';
import { SIGNAL_GLITCH_INTERVAL_MS, scrambleSignalText } from './intrusionGlitch';

const SIGNAL_COPY = [
  'UNAUTHORIZED TRANSMISSION / SOURCE UNKNOWN',
  'SIGNAL INTEGRITY COMPROMISED',
] as const;

type IntrusionVariant = 'hostile' | 'fleet';

interface IntrusionProps {
  readonly message?: string;
  readonly children?: ReactNode;
  readonly variant?: IntrusionVariant;
  readonly overlines?: readonly [string, string];
}

/**
 * Something hostile has taken the screen.
 *
 * Reusable on any route: it is fullscreen and fixed, but it is decoration and
 * nothing more -- `pointer-events: none`, `aria-hidden`, no dialog semantics,
 * no focus trap. Whatever the player was doing underneath it keeps working,
 * and a screen reader never hears about it.
 *
 * The red and cyan colour-split ghosts behind the message are painted by CSS
 * from `data-text`, so the message exists exactly once in the DOM.
 */
export default function Intrusion({
  message,
  children,
  variant = 'hostile',
  overlines = SIGNAL_COPY,
}: IntrusionProps) {
  const [signalCopy, setSignalCopy] = useState<readonly [string, string]>(() => [
    scrambleSignalText(overlines[0], Math.random, variant === 'hostile'),
    scrambleSignalText(overlines[1], Math.random, variant === 'hostile'),
  ]);

  useEffect(() => {
    if (variant !== 'hostile') {
      setSignalCopy(overlines);
      return;
    }
    const glitch = window.setInterval(() => {
      setSignalCopy([
        scrambleSignalText(overlines[0]),
        scrambleSignalText(overlines[1]),
      ]);
    }, SIGNAL_GLITCH_INTERVAL_MS);
    return () => window.clearInterval(glitch);
  }, [overlines, variant]);

  return (
    <div className={`intrusion intrusion--${variant}`} aria-hidden="true">
      <div className="intrusion__signal">
        <span className="cic-overline">{signalCopy[0]}</span>
        {children ?? (
          <p className="intrusion__message" data-text={message ?? ''}>
            {message}
          </p>
        )}
        <span className="cic-overline">{signalCopy[1]}</span>
      </div>
    </div>
  );
}
