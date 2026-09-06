import type { CSSProperties } from 'react';
import { populationTrackForShip } from '@/data/shipPopulation';

type PopulationStyle = CSSProperties & { '--population-rows': number };

export default function PopulationTrack({ shipId, population }: { shipId: string; population: number }) {
  const track = populationTrackForShip(shipId);
  return (
    <div className="population-track">
      <p className="population-track__reading">Survivor Population <strong>{population.toLocaleString('en-US')}</strong></p>
      {track && <>
        <ol
          aria-label="Survivor Population steps"
          style={{ '--population-rows': Math.ceil(track.steps.length / 2) } as PopulationStyle}
        >
          {track.steps.map((amount) => (
            <li key={amount} aria-current={amount === population ? 'step' : undefined}
              data-threshold={track.thresholds.includes(amount) ? 'true' : undefined}
              aria-label={track.thresholds.includes(amount) ? `${amount.toLocaleString('en-US')} — GM alert threshold` : undefined}>
              <span>{amount.toLocaleString('en-US')}</span>
              <span className="population-track__mark" aria-hidden="true">{amount === population ? '×' : ''}</span>
            </li>
          ))}
        </ol>
        <p className="population-track__key">Red marks // GM alert thresholds</p>
      </>}
    </div>
  );
}
