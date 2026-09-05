import { useEffect, useState } from 'react';
import ContactPlot from './ContactPlot';
import { fleetViewFrom } from '@/data/fleetFormation';
import { findShip } from '@/data/ships';

export default function ShipPlot({
  hostile,
  aboard,
  viewerId,
}: {
  hostile: boolean;
  aboard: boolean;
  viewerId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!aboard) setExpanded(false);
  }, [aboard]);

  const viewer = findShip(viewerId) ?? findShip('aegis');
  const contacts = fleetViewFrom(viewer?.id ?? 'aegis').map((ship) => ({
    tag: ship.name.toUpperCase(),
    x: ship.x,
    y: ship.y,
    z: ship.z,
    color: ship.color,
  }));

  return (
    <div className="ship-plot" data-aboard={String(aboard)} data-expanded={String(expanded)}>
      <ContactPlot
        hostile={hostile}
        placement={aboard ? 'widget' : 'field'}
        size={aboard ? (expanded ? 'min(94vmin, 128vw)' : '92%') : undefined}
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
