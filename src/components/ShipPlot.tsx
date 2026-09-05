import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import ContactPlot from './ContactPlot';
import { DRADIS_RESIZE_MS } from './dradisMotion';
import { fleetViewFrom } from '@/data/fleetFormation';
import { findShip } from '@/data/ships';

/** One continuous field-to-widget morph; deliberately isolated for easy tuning or removal. */
export const SHIP_PLOT_RESIZE_MS = DRADIS_RESIZE_MS;

type ShipPlotStyle = CSSProperties & { '--ship-plot-resize': string };

type Orientation = { readonly pitch: number; readonly yaw: number };

const DEFAULT_ORIENTATION: Orientation = { pitch: 14, yaw: 0 };
const ROTATION_PER_PIXEL = 0.35;

type Drag = {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
};

export default function ShipPlot({
  hostile,
  aboard,
  viewerId,
  capybaraEnabled = true,
}: {
  hostile: boolean;
  aboard: boolean;
  viewerId: string;
  capybaraEnabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>(DEFAULT_ORIENTATION);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (!aboard) setExpanded(false);
  }, [aboard]);

  function beginRotation(event: PointerEvent<HTMLDivElement>): void {
    if (!expanded) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function rotate(event: PointerEvent<HTMLDivElement>): void {
    if (!expanded || !drag.current || drag.current.pointerId !== event.pointerId) return;
    const horizontal = event.clientX - drag.current.x;
    const vertical = event.clientY - drag.current.y;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setOrientation((current) => ({
      pitch: Math.max(-75, Math.min(75, current.pitch - vertical * ROTATION_PER_PIXEL)),
      yaw: current.yaw + horizontal * ROTATION_PER_PIXEL,
    }));
  }

  function endRotation(event: PointerEvent<HTMLDivElement>): void {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function rotateByKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    const turns: Partial<Record<string, { pitch: number; yaw: number }>> = {
      ArrowUp: { pitch: -5, yaw: 0 },
      ArrowDown: { pitch: 5, yaw: 0 },
      ArrowLeft: { pitch: 0, yaw: -5 },
      ArrowRight: { pitch: 0, yaw: 5 },
    };
    if (event.key === 'Home') {
      event.preventDefault();
      setOrientation(DEFAULT_ORIENTATION);
      return;
    }
    const turn = turns[event.key];
    if (!turn) return;
    event.preventDefault();
    setOrientation((current) => ({
      pitch: Math.max(-75, Math.min(75, current.pitch + turn.pitch)),
      yaw: current.yaw + turn.yaw,
    }));
  }

  const viewer = findShip(viewerId) ?? findShip('aegis');
  const contacts = fleetViewFrom(viewer?.id ?? 'aegis', capybaraEnabled).map((ship) => ({
    tag: ship.name.toUpperCase(),
    x: ship.x,
    y: ship.y,
    z: ship.z,
    color: ship.color,
  }));

  return (
    <div
      className="ship-plot"
      data-aboard={String(aboard)}
      data-expanded={String(expanded)}
      style={{ '--ship-plot-resize': `${SHIP_PLOT_RESIZE_MS}ms` } as ShipPlotStyle}
    >
      <ContactPlot
        key={`${viewer?.id ?? 'aegis'}-${String(capybaraEnabled)}`}
        hostile={hostile}
        placement={aboard ? 'widget' : 'inset'}
        size="min(92cqi, 92cqb)"
        contacts={contacts}
        centerLabel={viewer?.name.toUpperCase() ?? 'AEGIS'}
        orientation={orientation}
      />
      {aboard ? (
        <>
          <span className="ship-plot__label" aria-hidden="true">
            {expanded ? 'DRADIS // DRAG TO ORIENT' : 'DRADIS // LOCAL PLOT'}
          </span>
          {expanded ? (
            <>
              <div
                className="ship-plot__viewport"
                role="application"
                aria-label="Rotatable DRADIS display"
                tabIndex={0}
                onPointerDown={beginRotation}
                onPointerMove={rotate}
                onPointerUp={endRotation}
                onPointerCancel={endRotation}
                onLostPointerCapture={() => { drag.current = null; }}
                onKeyDown={rotateByKeyboard}
              />
              <button
                className="ship-plot__close"
                type="button"
                onClick={() => setExpanded(false)}
              >
                Close DRADIS
              </button>
              <button
                className="ship-plot__legend"
                type="button"
                aria-label="Reset DRADIS to default galactic orientation"
                onClick={() => setOrientation(DEFAULT_ORIENTATION)}
              >
                <span className="ship-plot__legend-title">Galactic orientation</span>
                <span className="ship-plot__legend-north">North</span>
                <span className="ship-plot__legend-west">West</span>
                <span className="ship-plot__legend-origin">Reset</span>
                <span className="ship-plot__legend-east">East</span>
                <span className="ship-plot__legend-south">South</span>
              </button>
            </>
          ) : (
            <button
              className="ship-plot__toggle"
              type="button"
              aria-label="Zoom into DRADIS panel"
              onClick={() => setExpanded(true)}
            >
              Zoom
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
