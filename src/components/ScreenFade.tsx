import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, type Location } from 'react-router-dom';

/**
 * The crossing between screens.
 *
 * Half the crossing each way, so a screen change costs two tenths of a second
 * from start to finish. The stylesheet uses the same figure; if one moves, move
 * the other.
 */
export const SCREEN_FADE_MS = 100;

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
  const [displayed, setDisplayed] = useState(location);
  const [phase, setPhase] = useState<'in' | 'out'>('in');

  useEffect(() => {
    // A replace, or a guard redirecting back to where we already are, is not a
    // crossing. Only a change of screen is.
    if (location.pathname === displayed.pathname) return;

    setPhase('out');
    const swap = window.setTimeout(() => {
      setDisplayed(location);
      setPhase('in');
    }, SCREEN_FADE_MS);
    return () => window.clearTimeout(swap);
  }, [location, displayed]);

  return (
    <div className="screen-fade" data-phase={phase}>
      {children(displayed)}
    </div>
  );
}
