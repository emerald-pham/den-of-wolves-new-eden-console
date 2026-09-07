import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSessionStore } from '@/store/useSessionStore';

const TOAST_MS = 6_000;
const RETRACT_MS = 450;

type FinaleStyle = CSSProperties & Record<`--${string}`, string | number>;

const CONFETTI_COLORS = [
  'var(--cic-cyan)',
  'var(--cic-cyan-hot)',
  'var(--cic-amber)',
  'var(--cic-ink)',
] as const;

const CONFETTI = Array.from({ length: 72 }, (_, index) => ({
  index,
  style: {
    '--debrief-x': `${((index * 37) % 106) - 53}vw`,
    '--debrief-drift': `${((index * 23) % 34) - 17}vw`,
    '--debrief-delay': `${-((index * 173) % 5_600)}ms`,
    '--debrief-duration': `${4_800 + ((index * 263) % 1_800)}ms`,
    '--debrief-rest-y': `${8 + ((index * 41) % 82)}vh`,
    '--debrief-spin': `${180 + ((index * 97) % 720)}deg`,
    '--debrief-color': CONFETTI_COLORS[index % CONFETTI_COLORS.length]!,
  } as FinaleStyle,
}));

const FACETS = Array.from({ length: 49 }, (_, index) => ({
  index,
  style: {
    '--debrief-facet-color': CONFETTI_COLORS[(index * 3 + Math.floor(index / 7)) % CONFETTI_COLORS.length]!,
    '--debrief-facet-delay': `${(index * 71) % 1_400}ms`,
  } as FinaleStyle,
}));

const BEAM_COLORS = [
  'var(--cic-cyan)',
  'var(--cic-cyan-hot)',
  'var(--cic-amber)',
  'var(--cic-cyan)',
  'var(--cic-amber-glow)',
  'var(--cic-cyan-hot)',
] as const;

const BEAM_ANGLES = [-34, -22, -10, 9, 22, 35] as const;

const LIGHT_BEAMS = BEAM_ANGLES.map((angle, index) => ({
  index,
  style: {
    '--debrief-beam-angle': `${angle}deg`,
    '--debrief-beam-delay': `${-(index * 1.1)}s`,
    '--debrief-beam-color': BEAM_COLORS[index % BEAM_COLORS.length]!,
  } as FinaleStyle,
}));

const LIGHT_LANDINGS = [
  { target: 'SESSION READOUTS', x: '14vw', y: '13vh', scale: '1.05', delay: '-0.5s' },
  { target: 'DRADIS INSTRUMENT', x: '82vw', y: '25vh', scale: '0.9', delay: '-1.7s' },
  { target: 'ROLE WORKSPACE', x: '29vw', y: '61vh', scale: '1.2', delay: '-2.6s' },
  { target: 'FLEET LEDGER', x: '73vw', y: '68vh', scale: '0.82', delay: '-3.4s' },
  { target: 'TRANSMISSION RAIL', x: '51vw', y: '91vh', scale: '0.72', delay: '-4.2s' },
].map((landing, index) => ({
  ...landing,
  index,
  style: {
    '--debrief-hit-x': landing.x,
    '--debrief-hit-y': landing.y,
    '--debrief-hit-scale': landing.scale,
    '--debrief-hit-delay': landing.delay,
  } as FinaleStyle,
}));

const MERIDIANS = ['near', 'mid', 'far'] as const;
const PARALLELS = ['north', 'equator', 'south'] as const;

type DebriefSnapshot = {
  readonly sessionId: string;
  readonly active: boolean;
  readonly revision: number;
};

/** Shared, server-authorized finale presentation; it never intercepts the active console. */
export default function DebriefMode() {
  const session = useSessionStore((state) => state.session);
  const state = session?.debriefMode ?? { active: false, revision: 0 };
  const previous = useRef<DebriefSnapshot | null>(null);
  const [toastRevision, setToastRevision] = useState<number | null>(null);
  const [retracting, setRetracting] = useState(false);

  useEffect(() => {
    if (!session) {
      previous.current = null;
      setToastRevision(null);
      setRetracting(false);
      return;
    }
    const next = { sessionId: session.id, active: state.active, revision: state.revision };
    const prior = previous.current;
    const wasEnabledLive = Boolean(
      prior && prior.sessionId === next.sessionId &&
      next.active && (!prior.active || prior.revision < next.revision),
    );
    if (next.active) setRetracting(false);
    else if (prior?.sessionId === next.sessionId && prior.active) setRetracting(true);
    previous.current = next;
    if (wasEnabledLive) setToastRevision(next.revision);
  }, [session, state.active, state.revision]);

  useEffect(() => {
    if (!retracting) return;
    const timer = window.setTimeout(() => setRetracting(false), RETRACT_MS);
    return () => window.clearTimeout(timer);
  }, [retracting]);

  useEffect(() => {
    if (toastRevision === null) return;
    const timer = window.setTimeout(() => setToastRevision(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toastRevision]);

  const visible = state.active || retracting;
  if (!visible && toastRevision === null) return null;

  return (
    <>
      {visible && (
        <div className="debrief-mode" aria-hidden="true">
          <div className="debrief-mode__lightfield">
            <div className="debrief-mode__beam-stack">
              {LIGHT_BEAMS.map((beam) => (
                <i className="debrief-mode__beam" key={beam.index} style={beam.style} />
              ))}
            </div>
            <div className="debrief-mode__landings">
              {LIGHT_LANDINGS.map((landing) => (
                <i
                  className="debrief-mode__light-landing"
                  data-target={landing.target}
                  key={landing.index}
                  style={landing.style}
                />
              ))}
            </div>
          </div>
          <div
            className="debrief-mode__ball"
            data-dimensionality="3d"
            data-state={state.active ? 'lowered' : 'retracting'}
          >
            <div className="debrief-mode__orb">
              <div className="debrief-mode__facet-field">
                {FACETS.map((facet) => <i key={facet.index} style={facet.style} />)}
              </div>
              {MERIDIANS.map((meridian) => (
                <i
                  className={`debrief-mode__meridian debrief-mode__meridian--${meridian}`}
                  key={meridian}
                />
              ))}
              {PARALLELS.map((parallel) => (
                <i
                  className={`debrief-mode__parallel debrief-mode__parallel--${parallel}`}
                  key={parallel}
                />
              ))}
            </div>
            <i className="debrief-mode__sweep debrief-mode__sweep--azimuth" />
            <i className="debrief-mode__sweep debrief-mode__sweep--polar" />
          </div>
          {state.active && (
            <div className="debrief-mode__confetti">
              {CONFETTI.map((piece) => <i key={piece.index} className="debrief-mode__confetti-piece" style={piece.style} />)}
            </div>
          )}
        </div>
      )}
      {toastRevision !== null && (
        <aside className="debrief-mode__toast cic-frame" role="status" aria-live="polite" aria-atomic="true">
          <strong>Debrief mode enabled</strong>
          <span>FLEET FINALE // BLUE CHANNEL LIVE</span>
        </aside>
      )}
    </>
  );
}
