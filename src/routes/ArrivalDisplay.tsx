import { useEffect, useRef, useState } from 'react';
import HackingMessageOverlay, {
  HACKING_MESSAGE_DURATION_MS,
  HACKING_MESSAGE_INITIAL_DELAY_MS,
  HACKING_MESSAGE_INTERVAL_MS,
  nextHackingMessage,
  type HackingMessage,
} from '@/components/HackingMessageOverlay';
import { useMotionPreference } from '@/lib/motionPreference';

/** Readouts turn over every CYCLE_MS, staggered so the three never move at
 *  once. The stagger is a third of the cycle, and both scale together. */
const CYCLE_MS = 5000;
const SUS_ROLL_MS = 1000;
const SUS_DURATION_MS = SUS_ROLL_MS / 30;
const LOWEST_SURVIVOR_POPULATION = 222_500;
const PERMITTED_POPULATION_FINAL_DIGITS = [1, 2, 3, 4, 6, 7, 8, 9] as const;
const SURVIVOR_POPULATION_VALUE_COUNT = 16_000;
const POPULATION_ESTIMATE_STAGGER = 0.9;

function survivorPopulationForIndex(index: number): string {
  return String(
    LOWEST_SURVIVOR_POPULATION
      + Math.floor(index / PERMITTED_POPULATION_FINAL_DIGITS.length) * 10
      + (PERMITTED_POPULATION_FINAL_DIGITS[index % PERMITTED_POPULATION_FINAL_DIGITS.length] ?? 1),
  );
}

function drawSurvivorPopulation(): string {
  return survivorPopulationForIndex(Math.floor(Math.random() * SURVIVOR_POPULATION_VALUE_COUNT));
}

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

const populationEstimate: Draw = (showing) => {
  const showingNumber = Number(showing);
  const showingDigitIndex = PERMITTED_POPULATION_FINAL_DIGITS.indexOf(
    (showingNumber % 10) as (typeof PERMITTED_POPULATION_FINAL_DIGITS)[number],
  );
  const showingIndex = Math.floor((showingNumber - LOWEST_SURVIVOR_POPULATION) / 10)
    * PERMITTED_POPULATION_FINAL_DIGITS.length + showingDigitIndex;
  const drawn = Math.floor(Math.random() * (SURVIVOR_POPULATION_VALUE_COUNT - 1));
  const index = drawn >= showingIndex ? drawn + 1 : drawn;
  return survivorPopulationForIndex(index);
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

/** Keep the opening experience accessible and quiet until Wolf gameplay opts in. */
export const LAUNCHER_HACKING_MESSAGES_ENABLED = false;

export default function ArrivalDisplay({
  enableHackingMessages = LAUNCHER_HACKING_MESSAGES_ENABLED,
  onTransmission,
  standDown = false,
}: {
  enableHackingMessages?: boolean | undefined;
  onTransmission?: ((active: boolean) => void) | undefined;
  standDown?: boolean | undefined;
}) {
  const { reducedMotion } = useMotionPreference();
  const [values, setValues] = useState(() => manifests.map((manifest) => manifest.start));
  const [population, setPopulation] = useState(drawSurvivorPopulation);
  const [sus, setSus] = useState(false);
  const [message, setMessage] = useState<HackingMessage | null>(null);
  const notify = useRef(onTransmission);

  useEffect(() => {
    notify.current = onTransmission;
  }, [onTransmission]);

  useEffect(() => {
    notify.current?.(
      message !== null && enableHackingMessages && !reducedMotion && !standDown,
    );
  }, [enableHackingMessages, message, reducedMotion, standDown]);

  // Leaving the launcher or disabling the capability stands the overlay down
  // immediately, even if an earlier transmission was still on screen.
  useEffect(() => () => notify.current?.(false), []);

  useEffect(() => {
    if (!enableHackingMessages || reducedMotion || standDown) {
      setMessage(null);
      return;
    }

    const timers: number[] = [];
    let previous: HackingMessage | null = null;
    const transmit = () => {
      const next = nextHackingMessage(previous);
      previous = next;
      setMessage(next);
      timers.push(window.setTimeout(() => setMessage(null), HACKING_MESSAGE_DURATION_MS));
      timers.push(window.setTimeout(transmit, HACKING_MESSAGE_INTERVAL_MS));
    };

    timers.push(window.setTimeout(transmit, HACKING_MESSAGE_INITIAL_DELAY_MS));
    return () => timers.forEach(window.clearTimeout);
  }, [enableHackingMessages, reducedMotion, standDown]);

  useEffect(() => {
    if (reducedMotion || standDown) return;
    const timers: number[] = [];
    manifests.forEach((manifest, index) => {
      const tick = () => {
        setValues((previous) =>
          previous.map((value, i) => (i === index ? manifest.draw(value) : value)),
        );
        timers[index] = window.setTimeout(tick, CYCLE_MS);
      };
      timers[index] = window.setTimeout(tick, CYCLE_MS + manifest.offset);
    });
    return () => timers.forEach(window.clearTimeout);
  }, [reducedMotion, standDown]);

  useEffect(() => {
    if (reducedMotion || standDown) return;
    const tick = () => {
      setPopulation(populationEstimate);
      timer = window.setTimeout(tick, CYCLE_MS);
    };
    let timer = window.setTimeout(tick, CYCLE_MS + CYCLE_MS * POPULATION_ESTIMATE_STAGGER);
    return () => window.clearTimeout(timer);
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
              <span key={population} className={reducedMotion || standDown ? '' : 'arrival-digit'}>
                {Number(population).toLocaleString('en-US')}
              </span>
            </div>
            <div className="arrival-readout__label">POPULATION ESTIMATE AFTER INITIAL STARVATION</div>
          </div>
        </div>
      </section>
      <HackingMessageOverlay
        enabled={enableHackingMessages && !reducedMotion && !standDown}
        message={message}
      />
    </>
  );
}
