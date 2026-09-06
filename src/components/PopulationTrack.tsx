import { POPULATION_STEPS, POPULATION_THRESHOLDS } from '@/data/shipPopulation';

export default function PopulationTrack({ population }: { population: number }) {
  return (
    <div className="population-track">
      <p className="population-track__reading">Survivor Population <strong>{population.toLocaleString('en-US')}</strong></p>
      <ol aria-label="Survivor Population steps">
        {POPULATION_STEPS.map((amount) => (
          <li key={amount} aria-current={amount === population ? 'step' : undefined}
            data-threshold={POPULATION_THRESHOLDS.includes(amount) ? 'true' : undefined}
            aria-label={POPULATION_THRESHOLDS.includes(amount) ? `${amount.toLocaleString('en-US')} — GM alert threshold` : undefined}>
            <span>{amount.toLocaleString('en-US')}</span>
            <span className="population-track__mark" aria-hidden="true">{amount === population ? '×' : ''}</span>
          </li>
        ))}
      </ol>
      <p className="population-track__key">Red marks // GM alert thresholds</p>
    </div>
  );
}
