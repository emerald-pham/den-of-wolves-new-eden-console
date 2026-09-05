import { useEffect, useRef, useState } from 'react';
import Intrusion from '@/components/Intrusion';
import { useMotionPreference } from '@/lib/motionPreference';

/** Readouts turn over every CYCLE_MS, staggered so the three never move at
 *  once. The stagger is a third of the cycle, and both scale together. */
const CYCLE_MS = 5000;
const SUS_ROLL_MS = 1000;
const SUS_DURATION_MS = SUS_ROLL_MS / 30;
const SURVIVOR_DIGITS = [1, 2, 3, 4, 6, 7, 8, 9] as const;

const drawSurvivorPopulation = () => {
  const index = Math.floor(Math.random() * 16_000);
  const population = 222_500 + Math.floor(index / SURVIVOR_DIGITS.length) * 10
    + (SURVIVOR_DIGITS[index % SURVIVOR_DIGITS.length] ?? 1);
  return population.toLocaleString('en-US');
};

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
  {
    label: 'PERSONNEL GRANTED CIC DATA ACCESS',
    start: '20',
    offset: CYCLE_MS * 0.3,
    draw: inRange(8, 21),
  },
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
  const { reducedMotion } = useMotionPreference();
  const [values, setValues] = useState(() => manifests.map((manifest) => manifest.start));
  const [survivorPopulation] = useState(drawSurvivorPopulation);
  const [sus, setSus] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const notify = useRef(onTransmission);

  useEffect(() => {
    notify.current = onTransmission;
  }, [onTransmission]);

  useEffect(() => {
    notify.current?.(message !== null && !reducedMotion && !standDown);
  }, [message, reducedMotion, standDown]);

  // Leaving the launcher stands the board down; nothing is hunting an unmounted
  // screen.
  useEffect(() => () => notify.current?.(false), []);

  useEffect(() => {
    if (reducedMotion || standDown) { setMessage(null); return; }
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
  }, [reducedMotion, standDown]);

  useEffect(() => {
    if (reducedMotion || standDown) { setSus(false); return; }

    let clearSus: number | undefined;
    const rollForSus = () => {
      if (Math.random() >= 0.01) return;
      setSus(true);
      if (clearSus !== undefined) window.clearTimeout(clearSus);
      clearSus = window.setTimeout(() => setSus(false), SUS_DURATION_MS);
    };
    const roll = window.setInterval(rollForSus, SUS_ROLL_MS);
    return () => {
      window.clearInterval(roll);
      if (clearSus !== undefined) window.clearTimeout(clearSus);
    };
  }, [reducedMotion, standDown]);

  return (
    <>
      <section className="arrival-manifest cic-frame" aria-label="Arrival display">
        <div className="arrival-manifest__grid">
          {manifests.map((manifest, index) => (
            <div className="arrival-readout" key={index}>
              <div className="arrival-readout__value" aria-label={`Arrival readout ${index + 1}`}>
                <span key={index === 2 && sus ? 'sus' : values[index]} className={reducedMotion || standDown ? '' : 'arrival-digit'}>
                  {index === 2 && sus ? 'sus' : values[index]}
                </span>
              </div>
              <div className="arrival-readout__label">
                {index === 2 && values[index] === '1' ? 'WOLF AMONG US' : manifest.label}
              </div>
            </div>
          ))}
          <div className="arrival-readout arrival-readout--population">
            <div className="arrival-readout__value" aria-label="Arrival readout 4">
              <span>{survivorPopulation}</span>
            </div>
            <div className="arrival-readout__label">SURVIVORS</div>
          </div>
        </div>
      </section>
      {message && !reducedMotion && !standDown && <Intrusion message={message} />}
    </>
  );
}
