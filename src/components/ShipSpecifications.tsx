import { SHIP_SPECIFICATIONS } from '@/data/shipPopulation';

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
          ['Passengers Capacity', specs.passengerCapacity.toLocaleString('en-US'), overloaded],
        ].map(([label, value, warning]) => (
          <div key={String(label)}>
            <dt>{label}</dt><dd>{value}{warning && (
              <svg className="ship-capacity-warning" role="img"
                aria-label="Survivors exceed combined crew and passenger capacity"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <title>Vessel exceeds capacity</title>
                <path d="M12 3 22 21H2Z M12 9v6 M12 17v2" />
              </svg>
            )}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
