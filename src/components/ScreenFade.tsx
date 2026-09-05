import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, type Location } from 'react-router-dom';
import { useMotionPreference } from '@/lib/motionPreference';

/**
 * The crossing between screens.
 *
 * Half the crossing each way, so a screen change costs two tenths of a second
 * from start to finish. The stylesheet uses the same figure; if one moves, move
 * the other.
 */
export const SCREEN_FADE_MS = 100;
export const SHARED_FLAG_MOVE_MS = 200;

interface FlagMove {
  readonly clone: HTMLImageElement;
  readonly objectFit: string;
  readonly objectPosition: string;
  readonly opacity: string;
  readonly shipId: string;
  readonly source: DOMRect;
}

const shipIdFromPath = (pathname: string): string | null =>
  pathname.match(/^\/ships\/([^/]+)/)?.[1] ?? null;

/**
 * Holds the outgoing screen on stage while it fades, then swaps and brings the
 * new one in. `Routes` reads the location from context, so an already-rendered
 * element is no help -- it would re-render against the new location the moment
 * navigation happened. The delayed location has to be handed back to the caller
 * and passed to `Routes` explicitly, which is why this takes a function rather
 * than plain children.
 *
 * This wraps the routed screens only. The header, the settings menu and the
 * contact plot sit outside it: header chrome persists across screens, and the
 * board is the room the interface sits in rather than part of any one screen.
 */
export default function ScreenFade({
  children,
}: {
  children: (location: Location) => ReactNode;
}) {
  const location = useLocation();
  const { reducedMotion } = useMotionPreference();
  const [displayed, setDisplayed] = useState(location);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const pendingFlag = useRef<FlagMove | null>(null);
  const fadeRoot = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const move = pendingFlag.current;
    if (!move) return;
    pendingFlag.current = null;

    const destination = document.querySelector<HTMLImageElement>(
      `[data-shared-flag="${CSS.escape(move.shipId)}"]`,
    );
    if (
      !destination || move.source.width <= 0 || move.source.height <= 0 ||
      reducedMotion
    ) return;

    const target = destination.getBoundingClientRect();
    const destinationOpacity = window.getComputedStyle(destination).opacity;
    const clone = move.clone;
    Object.assign(clone.style, {
      position: 'fixed',
      zIndex: '20',
      left: `${move.source.left}px`,
      top: `${move.source.top}px`,
      width: `${move.source.width}px`,
      height: `${move.source.height}px`,
      margin: '0',
      objectFit: move.objectFit,
      objectPosition: move.objectPosition,
      opacity: move.opacity,
      pointerEvents: 'none',
      transform: 'none',
      transformOrigin: 'top left',
      transition: `transform ${SHARED_FLAG_MOVE_MS}ms ease-in-out, opacity ${SHARED_FLAG_MOVE_MS}ms ease-in-out`,
    });
    clone.className = 'shared-flag-transition';
    clone.alt = '';
    clone.setAttribute('aria-hidden', 'true');
    destination.style.visibility = 'hidden';
    fadeRoot.current?.append(clone);

    let finish = 0;
    const frame = window.requestAnimationFrame(() => {
      clone.style.opacity = destinationOpacity;
      clone.style.transform = `translate(${target.left - move.source.left}px, ${target.top - move.source.top}px) scale(${target.width / move.source.width}, ${target.height / move.source.height})`;
      finish = window.setTimeout(() => {
        destination.style.removeProperty('visibility');
        clone.remove();
      }, SHARED_FLAG_MOVE_MS);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(finish);
      destination.style.removeProperty('visibility');
      clone.remove();
    };
  }, [displayed, reducedMotion]);

  useEffect(() => {
    // A replace, or a guard redirecting back to where we already are, is not a
    // crossing. Only a change of screen is.
    if (location.pathname === displayed.pathname) return;

    setPhase('out');
    const swap = window.setTimeout(() => {
      const shipId = shipIdFromPath(location.pathname) ?? shipIdFromPath(displayed.pathname);
      const source = shipId
        ? document.querySelector<HTMLImageElement>(`[data-shared-flag="${CSS.escape(shipId)}"]`)
        : null;
      if (shipId && source && !reducedMotion) {
        const sourceStyle = window.getComputedStyle(source);
        pendingFlag.current = {
          clone: source.cloneNode(true) as HTMLImageElement,
          objectFit: sourceStyle.objectFit,
          objectPosition: sourceStyle.objectPosition,
          opacity: sourceStyle.opacity,
          shipId,
          source: source.getBoundingClientRect(),
        };
      }
      setDisplayed(location);
      setPhase('in');
    }, SCREEN_FADE_MS);
    return () => window.clearTimeout(swap);
  }, [location, displayed, reducedMotion]);

  return (
    <div ref={fadeRoot} className="screen-fade" data-phase={phase}>
      {children(displayed)}
    </div>
  );
}
