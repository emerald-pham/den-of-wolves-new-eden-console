import { useEffect, useState, type CSSProperties } from 'react';
import ContactPlot from './ContactPlot';
import { fleetViewFrom } from '@/data/fleetFormation';
import { findShip } from '@/data/ships';

/** One continuous field-to-widget morph; deliberately isolated for easy tuning or removal. */
export const SHIP_PLOT_RESIZE_MS = 200;

type ShipPlotStyle = CSSProperties & { '--ship-plot-resize': string };

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

  useEffect(() => {
    if (!aboard) setExpanded(false);
  }, [aboard]);

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
      />
      {aboard ? (
        <>
          <span className="ship-plot__label" aria-hidden="true">
            {expanded ? 'DRADIS // RETURN' : 'DRADIS // FULL SCREEN'}
          </span>
          <button
            className="ship-plot__toggle"
            type="button"
            aria-label={expanded ? 'Collapse DRADIS display' : 'Expand DRADIS display'}
            aria-pressed={expanded}
            onClick={() => setExpanded((current) => !current)}
          />
        </>
      ) : null}
    </div>
  );
}
