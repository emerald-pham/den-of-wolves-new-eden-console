import { useEffect, useState, type CSSProperties } from 'react';
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
  const pendingCommands = useSessionStore((state) => state.pendingCommands);
  const [coverOpen, setCoverOpen] = useState(false);
  const [firing, setFiring] = useState(false);
  const [burst, setBurst] = useState(0);
  const queued = Boolean(session && pendingCommands.some((command) =>
    command.kind === 'popShipConfetti' &&
    command.payload.sessionId === session.id &&
    command.payload.shipId === 'snn-press-shuttle'));

  useEffect(() => {
    if (!session?.id) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeShipConfetti }) => {
      if (!active) return;
      unsubscribe = subscribeShipConfetti(
        session.id,
        'snn-press-shuttle',
        () => setBurst((value) => value + 1),
        () => useSessionStore.getState().setCommunicationError({
          code: 'newspaper-confetti-signal-link',
          message: 'The SNN newspaper-confetti signal link was lost.',
        }),
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [session?.id]);

  useEffect(() => {
    if (burst === 0) return;
    const timer = window.setTimeout(() => setBurst(0), 3_500);
    return () => window.clearTimeout(timer);
  }, [burst]);

  async function activate() {
    if (queued || firing) return;
    setFiring(true);
    try {
      await popShipConfetti('snn-press-shuttle');
      setCoverOpen(false);
    } catch {
      // The shared interception notice reports races and connectivity failures.
    } finally {
      setFiring(false);
    }
  }

  return (
    <>
      <section className="confetti-dispenser confetti-dispenser--newspaper" aria-label="SNN Newspaper Confetti Dispenser">
        <p className="confetti-dispenser__label">
          SNN Newspaper Confetti // Reusable evidence shredder
        </p>
        <div className="confetti-dispenser__housing" data-open={String(coverOpen)}>
          <button
            className="confetti-dispenser__trigger"
            type="button"
            aria-label="Activate newspaper confetti"
            disabled={!coverOpen || queued || firing}
            onClick={() => void activate()}
          >{queued ? 'QUEUED' : 'EXTRA!'}</button>
          <button
            className="confetti-dispenser__cover"
            type="button"
            aria-label={`${coverOpen ? 'Close' : 'Open'} newspaper confetti cover`}
            aria-pressed={coverOpen}
            disabled={queued}
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
