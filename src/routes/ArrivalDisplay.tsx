import { useEffect, useState } from 'react';

const manifests = [
  { label: 'SHIPS IN CONVOY', values: ['6', '7', '5', '0', '1', '3', '4'], offset: 0 },
  { label: 'CREW', values: ['20', '18', '8', '6', '0', '21'], offset: 3000 },
  { label: 'WOLF AMONG US', values: ['1', '?', '2'], offset: 6000 },
];
const messages = ['EARTH IS NOT FOR YOU', 'BE AFRAID', 'A COLD GRAVE AWAITS YOU'];

export default function ArrivalDisplay() {
  const [paused, setPaused] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [indices, setIndices] = useState([0, 0, 0]);
  const [message, setMessage] = useState<string | null>(null);

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
      <section className="arrival-manifest" aria-label="Convoy transmission — atmospheric display">
        <div className="cic-overline arrival-manifest__header"><span>DRADIS / FLEET TELEMETRY</span><span>RELAY 01</span></div>
        <div className="arrival-manifest__grid">
          {manifests.map((manifest, index) => (
            <div className="arrival-readout" key={manifest.label}>
              <div className="arrival-readout__index" aria-hidden="true">0{index + 1} / {index === 2 ? 'INTERNAL THREAT' : 'MANIFEST'}</div>
              <div className="arrival-readout__value" aria-label={manifest.label}>
                <span key={indices[index]} className={paused ? '' : 'arrival-digit'}>{manifest.values[indices[index] ?? 0]}</span>
              </div>
              <div className="arrival-readout__label">{manifest.label}</div>
              <div className="arrival-readout__trace" aria-hidden="true">{manifest.values.join(' — ')}</div>
            </div>
          ))}
        </div>
        <div className="arrival-manifest__footer cic-overline">
          <span>SCENARIO SIGNAL / NOT LIVE SESSION DATA</span>
          <button className="cic-text-button" type="button" onClick={() => setPaused(!paused)}>{paused ? 'Resume effects' : 'Pause effects'}</button>
        </div>
      </section>
      {message && !paused && (
        <div className="arrival-transmission" aria-hidden="true">
          <div className="arrival-transmission__signal">
            <span className="cic-overline">UNAUTHORIZED TRANSMISSION / SOURCE UNKNOWN</span>
            <p>{message}</p>
            <span className="cic-overline">SIGNAL INTEGRITY COMPROMISED</span>
          </div>
        </div>
      )}
    </>
  );
}
