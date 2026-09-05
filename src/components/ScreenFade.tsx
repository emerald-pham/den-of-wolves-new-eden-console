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
  readonly shipId: string;
  readonly source: DOMRect;
  readonly sourceElement: HTMLImageElement;
}

const shipIdFromPath = (pathname: string): string | null =>
  pathname.match(/^\/ships\/([^/]+)/)?.[1] ?? null;

const sharedShipForCrossing = (fromPath: string, toPath: string): string | null => {
  const fromShipId = shipIdFromPath(fromPath);
  const toShipId = shipIdFromPath(toPath);
  return fromShipId && fromShipId === toShipId ? fromShipId : null;
};

// Routed content forms a stacking context at 19. Console artwork belongs below
// that entire context; a higher z-index on a pane inside it cannot cover a clone.
const flagLayer = (flag: HTMLImageElement): string =>
  flag.dataset.sharedFlagLayer === 'background' ? '18' : '20';

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
  const [crossing, setCrossing] = useState(false);
  const pendingFlag = useRef<FlagMove | null>(null);
  const activeFlagCleanup = useRef<(() => void) | null>(null);
  const fadeRoot = useRef<HTMLDivElement>(null);
  const crossingEnd = useRef(0);

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
    ) {
      move.sourceElement.style.removeProperty('visibility');
      move.clone.remove();
      return;
    }

    const target = destination.getBoundingClientRect();
    const destinationStyle = window.getComputedStyle(destination);
    const destinationOpacity = destinationStyle.opacity;
    const destinationObjectPosition = destinationStyle.objectPosition;
    const clone = move.clone;
    Object.assign(clone.style, {
      zIndex: flagLayer(destination),
      transition: `left ${SHARED_FLAG_MOVE_MS}ms ease-in-out, top ${SHARED_FLAG_MOVE_MS}ms ease-in-out, width ${SHARED_FLAG_MOVE_MS}ms ease-in-out, height ${SHARED_FLAG_MOVE_MS}ms ease-in-out, opacity ${SHARED_FLAG_MOVE_MS}ms ease-in-out, object-position ${SHARED_FLAG_MOVE_MS}ms ease-in-out`,
    });
    destination.style.visibility = 'hidden';

    let finish = 0;
    let frame = 0;
    const cleanup = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(finish);
      destination.style.removeProperty('visibility');
      clone.remove();
      if (activeFlagCleanup.current === cleanup) activeFlagCleanup.current = null;
    };
    activeFlagCleanup.current = cleanup;
    frame = window.requestAnimationFrame(() => {
      clone.style.left = `${target.left}px`;
      clone.style.top = `${target.top}px`;
      clone.style.width = `${target.width}px`;
      clone.style.height = `${target.height}px`;
      clone.style.opacity = destinationOpacity;
      clone.style.objectPosition = destinationObjectPosition;
      finish = window.setTimeout(cleanup, SHARED_FLAG_MOVE_MS);
    });
    return cleanup;
  }, [displayed, reducedMotion]);

  useEffect(() => {
    // A replace, or a guard redirecting back to where we already are, is not a
    // crossing. Only a change of screen is.
    if (location.pathname === displayed.pathname) return;

    window.clearTimeout(crossingEnd.current);
    activeFlagCleanup.current?.();
    const previousMove = pendingFlag.current;
    if (previousMove) {
      previousMove.sourceElement.style.removeProperty('visibility');
      previousMove.clone.remove();
      pendingFlag.current = null;
    }

    const shipId = sharedShipForCrossing(displayed.pathname, location.pathname);
    const source = shipId && !reducedMotion
      ? document.querySelector<HTMLImageElement>(
          `[data-shared-flag="${CSS.escape(shipId)}"]`,
        )
      : null;
    if (shipId && source) {
      const sourceStyle = window.getComputedStyle(source);
      const sourceRect = source.getBoundingClientRect();
      const clone = source.cloneNode(true) as HTMLImageElement;
      Object.assign(clone.style, {
        position: 'fixed',
        zIndex: flagLayer(source),
        left: `${sourceRect.left}px`,
        top: `${sourceRect.top}px`,
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
        margin: '0',
        objectFit: sourceStyle.objectFit,
        objectPosition: sourceStyle.objectPosition,
        opacity: sourceStyle.opacity,
        pointerEvents: 'none',
        transform: 'none',
      });
      clone.className = 'shared-flag-transition';
      clone.alt = '';
      clone.setAttribute('aria-hidden', 'true');
      source.style.visibility = 'hidden';
      fadeRoot.current?.append(clone);
      pendingFlag.current = {
        clone,
        shipId,
        source: sourceRect,
        sourceElement: source,
      };
    }

    setCrossing(true);
    setPhase('out');
    const swap = window.setTimeout(() => {
      setDisplayed(location);
      setPhase('in');
      // Keep the foreground's layer stable through both the fade-in and the
      // longer shared-flag move. Dropping it at the fade timer boundary can
      // expose DRADIS one frame before the CSS transition finishes painting.
      crossingEnd.current = window.setTimeout(() => setCrossing(false), SHARED_FLAG_MOVE_MS);
    }, SCREEN_FADE_MS);
    return () => window.clearTimeout(swap);
  }, [location, displayed, reducedMotion]);

  useEffect(() => () => window.clearTimeout(crossingEnd.current), []);

  return (
    <div
      ref={fadeRoot}
      className="screen-fade"
      data-crossing={String(crossing)}
      data-phase={phase}
    >
      <div className="screen-fade__content">
        {children(displayed)}
      </div>
    </div>
  );
}
