import type { ReactNode } from 'react';

export type SystemTiming = 1 | 5 | 6 | 7 | 'ftl' | 'combat' | 'passive';

interface TimedSystem {
  readonly name: string;
  readonly timing?: SystemTiming;
}

/** The printed maintenance path owns system placement for every ship workspace. */
export default function MaintenanceSystems<T extends TimedSystem>({ name, systems, renderSystem, rations }: {
  readonly name: string;
  readonly systems: readonly T[];
  readonly renderSystem: (system: T) => ReactNode;
  readonly rations: ReactNode;
}) {
  const finalStep = systems.some(system => system.timing === 7) ? 7 : 6;
  const labels = ['Storage', 'Rations', 'Unrest check', 'Riot check', 'Reactor',
    finalStep === 7 ? 'Shuttle Bay Zeta' : 'Shuttle Bay', 'Shuttle Bay Omega'];
  return <div className="maintenance-systems">
    <section className="maintenance-systems__cycle" aria-label={`${name} maintenance cycle`}>
      <h3>Maintenance cycle</h3>
      <ol aria-label={`${name} maintenance sequence`}>
        {labels.slice(0, finalStep).map((label, index) => {
          const step = index + 1;
          return <li key={step}>
            <div className="maintenance-systems__step"><span>{step}</span><strong>{label}</strong></div>
            {step === 2 && <><p>Select food and water rations separately. Add both bonuses to the roll in step 3.</p>{rations}</>}
            {step === 3 && <p>Roll 2d6 plus both ration bonuses. Under 12 adds 2 unrest; otherwise under 20 adds 1 unrest.</p>}
            {step === 4 && <p>Roll 1d6. Below current unrest deals 1 damage from rioting.</p>}
            {step === 5 && <p>Charge consoles with the reactor, then resolve the consoles marked 5 when charged.</p>}
            <div className="aegis-system-grid">{systems.filter(system => system.timing === step).map(renderSystem)}</div>
          </li>;
        })}
      </ol>
    </section>
    <div className="maintenance-systems__other">
      {(['ftl', 'combat', 'passive'] as const).map(timing => {
        const group = systems.filter(system => (system.timing ?? 'passive') === timing);
        if (!group.length) return null;
        const label = { ftl: 'FTL Jump', combat: 'Wolf Attack', passive: 'Damage control' }[timing];
        return <section key={timing} aria-label={`${name} ${label} systems`}>
          <h3>{label}</h3><div className="aegis-system-grid">{group.map(renderSystem)}</div>
        </section>;
      })}
    </div>
  </div>;
}
