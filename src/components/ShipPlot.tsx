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
import { ORIGIN_GALACTIC_COORDINATE } from '@/data/ships';

/** One continuous field-to-widget morph; deliberately isolated for easy tuning or removal. */
export const SHIP_PLOT_RESIZE_MS = DRADIS_RESIZE_MS;
/** Keep the complete rotation path ready, but do not expose orientation changes yet. */
export const SHIP_PLOT_ROTATION_ENABLED = false;

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
  shipGalacticCoordinates = {},
}: {
  hostile: boolean;
  aboard: boolean;
  viewerId: string;
  capybaraEnabled?: boolean;
  shipGalacticCoordinates?: Readonly<Record<string, string>> | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>(DEFAULT_ORIENTATION);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (!aboard) setExpanded(false);
  }, [aboard]);

  function beginRotation(event: PointerEvent<HTMLDivElement>): void {
    if (!SHIP_PLOT_ROTATION_ENABLED || !expanded) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function rotate(event: PointerEvent<HTMLDivElement>): void {
    if (
      !SHIP_PLOT_ROTATION_ENABLED || !expanded || !drag.current ||
      drag.current.pointerId !== event.pointerId
    ) return;
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
    if (!SHIP_PLOT_ROTATION_ENABLED) return;
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
  const effectiveViewerId = viewer?.id ?? 'aegis';
  const galacticCoordinate = shipGalacticCoordinates[effectiveViewerId] ??
    ORIGIN_GALACTIC_COORDINATE;
  const fleetContacts = fleetViewFrom(
    effectiveViewerId,
    capybaraEnabled,
    shipGalacticCoordinates,
  );
  const contacts = fleetContacts.map((ship) => ({
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
      data-rotation-enabled={String(SHIP_PLOT_ROTATION_ENABLED)}
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
            {expanded ? 'DRADIS // ORIENTATION LOCKED' : 'DRADIS // LOCAL PLOT'}
          </span>
          {expanded ? (
            <>
              <span className="ship-plot__galactic-coordinate">
                <span className="ship-plot__galactic-coordinate-label">GALACTIC COORDINATES</span>
                <span className="ship-plot__galactic-coordinate-separator" aria-hidden="true"> // </span>
                <span className="ship-plot__galactic-coordinate-value">
                  <span>{galacticCoordinate}</span>
                </span>
              </span>
              <div
                className="ship-plot__viewport"
                role={SHIP_PLOT_ROTATION_ENABLED ? 'application' : undefined}
                aria-label={SHIP_PLOT_ROTATION_ENABLED ? 'Rotatable DRADIS display' : undefined}
                tabIndex={SHIP_PLOT_ROTATION_ENABLED ? 0 : undefined}
                onPointerDown={SHIP_PLOT_ROTATION_ENABLED ? beginRotation : undefined}
                onPointerMove={SHIP_PLOT_ROTATION_ENABLED ? rotate : undefined}
                onPointerUp={SHIP_PLOT_ROTATION_ENABLED ? endRotation : undefined}
                onPointerCancel={SHIP_PLOT_ROTATION_ENABLED ? endRotation : undefined}
                onLostPointerCapture={SHIP_PLOT_ROTATION_ENABLED
                  ? () => { drag.current = null; }
                  : undefined}
                onKeyDown={SHIP_PLOT_ROTATION_ENABLED ? rotateByKeyboard : undefined}
              />
              <button
                className="ship-plot__close"
                type="button"
                onClick={() => setExpanded(false)}
              >
                Close DRADIS
              </button>
              <div
                className="ship-plot__compass"
                role="img"
                aria-label="3D galactic orientation compass: north, south, east, west"
              >
                <span className="ship-plot__compass-title">Galactic orientation // locked</span>
                <span className="ship-plot__compass-rig" aria-hidden="true">
                  <span className="ship-plot__compass-ring" />
                  <span className="ship-plot__compass-ring ship-plot__compass-ring--vertical" />
                  <span className="ship-plot__compass-axis ship-plot__compass-axis--north-south" />
                  <span className="ship-plot__compass-axis ship-plot__compass-axis--east-west" />
                  <span className="ship-plot__compass-north">North</span>
                  <span className="ship-plot__compass-west">West</span>
                  <span className="ship-plot__compass-origin">+</span>
                  <span className="ship-plot__compass-east">East</span>
                  <span className="ship-plot__compass-south">South</span>
                </span>
              </div>
            </>
          ) : (
            <div className="ship-plot__compact-controls">
              <span className="ship-plot__galactic-coordinate">
                <span className="ship-plot__galactic-coordinate-label">GALACTIC COORDINATES</span>
                <span className="ship-plot__galactic-coordinate-separator" aria-hidden="true"> // </span>
                <span className="ship-plot__galactic-coordinate-value">
                  <span>{galacticCoordinate}</span>
                </span>
              </span>
              <button
                className="ship-plot__toggle"
                type="button"
                aria-label="Zoom into DRADIS panel"
                onClick={() => setExpanded(true)}
              >
                Zoom
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
