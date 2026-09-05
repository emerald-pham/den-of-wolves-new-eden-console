import { useEffect, useState } from 'react';
import { SIGNAL_GLITCH_INTERVAL_MS, scrambleSignalText } from './intrusionGlitch';

const SIGNAL_COPY = [
  'UNAUTHORIZED TRANSMISSION / SOURCE UNKNOWN',
  'SIGNAL INTEGRITY COMPROMISED',
] as const;

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
export default function Intrusion({ message }: { message: string }) {
  const [signalCopy, setSignalCopy] = useState<readonly [string, string]>(() => [
    scrambleSignalText(SIGNAL_COPY[0], Math.random, true),
    scrambleSignalText(SIGNAL_COPY[1], Math.random, true),
  ]);

  useEffect(() => {
    const glitch = window.setInterval(() => {
      setSignalCopy([
        scrambleSignalText(SIGNAL_COPY[0]),
        scrambleSignalText(SIGNAL_COPY[1]),
      ]);
    }, SIGNAL_GLITCH_INTERVAL_MS);
    return () => window.clearInterval(glitch);
  }, []);

  return (
    <div className="intrusion" aria-hidden="true">
      <div className="intrusion__signal">
        <span className="cic-overline">{signalCopy[0]}</span>
        <p className="intrusion__message" data-text={message}>
          {message}
        </p>
        <span className="cic-overline">{signalCopy[1]}</span>
      </div>
    </div>
  );
}
