import { useState, type CSSProperties } from 'react';
import { popShipConfetti } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';

type PaperStyle = CSSProperties & Record<`--${string}`, string | number>;
const PAPER = Array.from({ length: 32 }, (_, index) => ({
  index,
  style: {
    '--confetti-x': `${((index * 43) % 95) - 47}vw`,
    '--confetti-y': `${-32 - ((index * 31) % 54)}vh`,
    '--confetti-turn': `${90 + ((index * 71) % 540)}deg`,
    '--confetti-delay': `${(index % 8) * 28}ms`,
  } as PaperStyle,
}));

export default function PressConfetti() {
  const session = useSessionStore((state) => state.session);
  const [coverOpen, setCoverOpen] = useState(false);
  const [firing, setFiring] = useState(false);
  const [burst, setBurst] = useState(0);
  const spent = session?.confettiUsedShipIds?.includes('snn-press-shuttle') === true;

  async function activate() {
    if (spent || firing) return;
    setFiring(true);
    try {
      await popShipConfetti('snn-press-shuttle');
      setBurst((value) => value + 1);
      setCoverOpen(false);
    } finally {
      setFiring(false);
    }
  }

  return (
    <>
      <section className="confetti-dispenser confetti-dispenser--newspaper" aria-label="SNN Newspaper Confetti Dispenser">
        <p className="confetti-dispenser__label">SNN Newspaper Confetti Dispenser</p>
        <div className="confetti-dispenser__housing" data-open={String(coverOpen)}>
          <button
            className="confetti-dispenser__trigger"
            type="button"
            aria-label="Activate newspaper confetti"
            disabled={!coverOpen || spent || firing}
            onClick={() => void activate()}
          >{spent ? 'SPENT' : 'EXTRA!'}</button>
          <button
            className="confetti-dispenser__cover"
            type="button"
            aria-label={`${coverOpen ? 'Close' : 'Open'} newspaper confetti cover`}
            aria-pressed={coverOpen}
            disabled={spent}
            onClick={() => setCoverOpen((open) => !open)}
          >{coverOpen ? 'EDITION READY' : 'HOLD THE PRESSES'}</button>
        </div>
      </section>
      {burst > 0 && <div className="confetti-burst" key={burst} aria-hidden="true">
        {PAPER.map((piece) => <i
          className="confetti-burst__piece confetti-burst__piece--newspaper"
          key={piece.index}
          style={piece.style}
        />)}
      </div>}
    </>
  );
}
