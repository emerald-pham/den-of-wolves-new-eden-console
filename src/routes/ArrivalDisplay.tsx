import { useEffect, useRef, useState } from 'react';
import Intrusion from '@/components/Intrusion';

const manifests = [
  { label: 'SHIPS IN CONVOY', values: ['6', '7', '5', '0', '1', '3', '4'], offset: 0 },
  { label: 'CREW', values: ['20', '18', '8', '6', '0', '21'], offset: 3000 },
  { label: 'WOLF AMONG US', values: ['1', '?', '2'], offset: 6000 },
];
const messages = ['EARTH IS NOT FOR YOU', 'BE AFRAID', 'A COLD GRAVE AWAITS YOU'];

/**
 * `onTransmission` lets the rest of the launcher react to an intrusion without
 * this component knowing what reacts. It is held in a ref so a parent that
 * hands over a fresh closure on every render cannot restart the timers and
 * reset the manifest cycle underneath it.
 */
export default function ArrivalDisplay({
  onTransmission,
}: {
  onTransmission?: (active: boolean) => void;
}) {
  const [paused, setPaused] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [indices, setIndices] = useState([0, 0, 0]);
  const [message, setMessage] = useState<string | null>(null);
  const notify = useRef(onTransmission);

  useEffect(() => {
    notify.current = onTransmission;
  }, [onTransmission]);

  useEffect(() => {
    notify.current?.(message !== null && !paused);
  }, [message, paused]);

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
    if (paused) { setMessage(null); return; }
    const timers: number[] = [];
    manifests.forEach((manifest, index) => {
      const tick = () => {
        setIndices((previous) => previous.map((value, i) => i === index ? (value + 1) % manifest.values.length : value));
        timers.push(window.setTimeout(tick, 10000));
      };
      timers.push(window.setTimeout(tick, 10000 + manifest.offset));
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
  }, [paused]);

  return (
    <>
      <section className="arrival-manifest cic-frame" aria-label="Arrival display">
        <div className="arrival-manifest__grid">
          {manifests.map((manifest, index) => (
            <div className="arrival-readout" key={index}>
              <div className="arrival-readout__value" aria-label={`Arrival readout ${index + 1}`}>
                <span key={indices[index]} className={paused ? '' : 'arrival-digit'}>{manifest.values[indices[index] ?? 0]}</span>
              </div>
              <div className="arrival-readout__label">{manifest.label}</div>
            </div>
          ))}
        </div>
      </section>
      {message && !paused && <Intrusion message={message} />}
    </>
  );
}
