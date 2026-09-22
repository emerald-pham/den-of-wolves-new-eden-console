import { organiserSitesForChart, type ChartId } from './starChartLookup';

export interface EnvironmentalMaintenanceHazard {
  readonly coordinate: string;
  readonly code: 'I' | 'J';
  readonly name: 'Ion Nebula' | 'Unstable Star';
  readonly threshold: 3 | 4;
}

/** Resolve the printed I/J maintenance check from the organiser-only chart. */
export function environmentalMaintenanceHazard(
  chart: ChartId,
  coordinate: string,
): EnvironmentalMaintenanceHazard | undefined {
  const site = organiserSitesForChart(chart)[coordinate];
  if (site?.code === 'I') {
    return { coordinate, code: 'I', name: 'Ion Nebula', threshold: 3 };
  }
  if (site?.code === 'J') {
    return { coordinate, code: 'J', name: 'Unstable Star', threshold: 4 };
  }
  return undefined;
}
