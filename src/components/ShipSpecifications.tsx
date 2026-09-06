import { useId, useState } from 'react';
import { SHIP_SPECIFICATIONS } from '@/data/shipPopulation';

const CAPACITY_WARNING = 'Crew and passenger capacity exceeded. OVERRIDE: Within Operation New Eden parameters';

function CapacityWarning({ align }: { align: 'start' | 'end' }) {
  const tooltipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const open = hovered || focused || tapped;

  return (
    <span className="ship-capacity-warning" data-align={align}>
      <button
        type="button"
        aria-label={CAPACITY_WARNING}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setTapped(false);
        }}
        onClick={() => setTapped(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setTapped(false);
            event.currentTarget.blur();
          }
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <path d="M12 3 22 21H2Z M12 9v6 M12 17v2" />
        </svg>
      </button>
      {open && <span id={tooltipId} className="ship-capacity-warning__tooltip" role="tooltip">
        {CAPACITY_WARNING}
      </span>}
    </span>
  );
}

export default function ShipSpecifications({ shipId, shipName, population }: {
  shipId: string; shipName: string; population: number | undefined;
}) {
  const specs = SHIP_SPECIFICATIONS[shipId];
  if (!specs) return null;
  const overloaded = population !== undefined && population > specs.crewCapacity + specs.passengerCapacity;
  return (
    <section aria-label={`${shipName} specifications`}>
      <dl className="ship-specifications">
        {[
          ['Length', specs.length, false],
          ['Tonnage', specs.tonnage.toLocaleString('en-US'), false],
          ['Crew Capacity', specs.crewCapacity.toLocaleString('en-US'), overloaded],
          ['Passenger Capacity', specs.passengerCapacity.toLocaleString('en-US'), overloaded],
        ].map(([label, value, warning], index) => (
          <div key={String(label)}>
            <dt>{label}</dt><dd>{value}{warning && (
              <CapacityWarning align={index === 2 ? 'start' : 'end'} />
            )}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
