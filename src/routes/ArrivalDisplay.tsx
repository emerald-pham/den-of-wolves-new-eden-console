import { useEffect, useRef, useState } from 'react';
import Intrusion from '@/components/Intrusion';

/** Readouts turn over every CYCLE_MS, staggered so the three never move at
 *  once. The stagger is a third of the cycle, and both scale together. */
const CYCLE_MS = 5000;

/**
 * A readout either walks a fixed sequence or draws from a range. Both refuse to
 * land on the value already showing: a readout that "changes" to what it
 * already reads looks like a panel that has stopped working.
 */
type Draw = (showing: string) => string;

const inOrder =
  (values: readonly string[]): Draw =>
  (showing) =>
    values[(values.indexOf(showing) + 1) % values.length] ?? values[0] ?? '';

const inRange =
  (low: number, high: number): Draw =>
  (showing) => {
    // Draw across the range minus one, then step over whatever is showing. The
    // result is uniform across every value the readout could move to.
    const drawn = low + Math.floor(Math.random() * (high - low));
    return String(drawn >= Number(showing) ? drawn + 1 : drawn);
  };

const manifests: readonly {
  label: string;
  start: string;
  offset: number;
  draw: Draw;
}[] = [
  { label: 'SHIPS IN CONVOY', start: '6', offset: 0, draw: inOrder(['6', '7']) },
  { label: 'PERSONNEL', start: '20', offset: CYCLE_MS * 0.3, draw: inRange(8, 21) },
  { label: 'WOLVES AMONG US', start: '1', offset: CYCLE_MS * 0.6, draw: inOrder(['1', '?', '2']) },
];
const messages = [
  'EARTH IS NOT FOR YOU',
  'BE AFRAID',
  'A COLD GRAVE AWAITS YOU',
  'YOU WILL DIE A HORRIBLE DEATH',
  'EVERYONE YOU KNOW IS A SPY',
  'WE CANNOT BE STOPPED',
];

/**
 * `onTransmission` lets the rest of the launcher react to an intrusion without
 * this component knowing what reacts. It is held in a ref so a parent that
 * hands over a fresh closure on every render cannot restart the timers and
 * reset the manifest cycle underneath it.
 */
export default function ArrivalDisplay({
  onTransmission,
  standDown = false,
}: {
  onTransmission?: ((active: boolean) => void) | undefined;
  standDown?: boolean | undefined;
}) {
  const [paused, setPaused] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [values, setValues] = useState(() => manifests.map((manifest) => manifest.start));
  const [message, setMessage] = useState<string | null>(null);
  const notify = useRef(onTransmission);

  useEffect(() => {
    notify.current = onTransmission;
  }, [onTransmission]);

  useEffect(() => {
    notify.current?.(message !== null && !paused && !standDown);
  }, [message, paused, standDown]);

  // Leaving the launcher stands the board down; nothing is hunting an unmounted
  // screen.
  useEffect(() => () => notify.current?.(false), []);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => { if (event.matches) setPaused(true); };
    preference?.addEventListener('change', onChange);
    return () => preference?.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (paused || standDown) { setMessage(null); return; }
    const timers: number[] = [];
    manifests.forEach((manifest, index) => {
      const tick = () => {
        setValues((previous) =>
          previous.map((value, i) => (i === index ? manifest.draw(value) : value)),
        );
        timers.push(window.setTimeout(tick, CYCLE_MS));
      };
      timers.push(window.setTimeout(tick, CYCLE_MS + manifest.offset));
    });
    let lastMessage = -1;
    const transmit = () => {
      // Select randomly without repeating the previous transmission.
      const next = lastMessage < 0 ? Math.floor(Math.random() * messages.length)
        : (lastMessage + 1 + Math.floor(Math.random() * (messages.length - 1))) % messages.length;
      lastMessage = next;
      setMessage(messages[next] ?? messages[0] ?? '');
      timers.push(window.setTimeout(() => setMessage(null), 5000));
      timers.push(window.setTimeout(transmit, 60000));
    };
    timers.push(window.setTimeout(transmit, 20000));
    return () => timers.forEach(window.clearTimeout);
  }, [paused, standDown]);

  return (
    <>
      <section className="arrival-manifest cic-frame" aria-label="Arrival display">
        <div className="arrival-manifest__grid">
          {manifests.map((manifest, index) => (
            <div className="arrival-readout" key={index}>
              <div className="arrival-readout__value" aria-label={`Arrival readout ${index + 1}`}>
                <span key={values[index]} className={paused || standDown ? '' : 'arrival-digit'}>{values[index]}</span>
              </div>
              <div className="arrival-readout__label">{manifest.label}</div>
            </div>
          ))}
        </div>
      </section>
      {message && !paused && !standDown && <Intrusion message={message} />}
    </>
  );
}
