import { isStarSystemCoordinate } from './navigation';
import { isResourceShipId } from './resources';
import { organiserSitesForChart, type ChartId } from './starChartLookup';

export interface MissionNebulaBenefit {
  readonly missionId: string;
  readonly coordinate: string;
  readonly suppressMaintenanceDamage: boolean;
  readonly freeExitFuel: boolean;
}
export type MissionNebulaBenefitsByShip = Readonly<Record<string, MissionNebulaBenefit>>;

/** Protected state is strict: a malformed present grant never becomes an ordinary fallback. */
export function parseMissionNebulaBenefits(value: unknown): MissionNebulaBenefitsByShip | null {
  if (value === undefined) return {};
  if (!record(value)) return null;
  const result: Record<string, MissionNebulaBenefit> = {};
  for (const [shipId, entry] of Object.entries(value)) {
    if (!isResourceShipId(shipId) || !record(entry) || Object.keys(entry).length !== 4 ||
        typeof entry.missionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(entry.missionId) ||
        typeof entry.coordinate !== 'string' || !isStarSystemCoordinate(entry.coordinate) ||
        typeof entry.suppressMaintenanceDamage !== 'boolean' || typeof entry.freeExitFuel !== 'boolean' ||
        (!entry.suppressMaintenanceDamage && !entry.freeExitFuel)) return null;
    result[shipId] = entry as unknown as MissionNebulaBenefit;
  }
  return result;
}

export function hasMissionNebulaBenefit(
  benefits: MissionNebulaBenefitsByShip | undefined, shipId: string, coordinate: string,
  chart: ChartId, kind: 'suppressMaintenanceDamage' | 'freeExitFuel',
): boolean {
  return organiserSitesForChart(chart)[coordinate]?.code === 'I' &&
    benefits?.[shipId]?.coordinate === coordinate && benefits[shipId]![kind] === true;
}

/** A successful departure consumes that ship's entire coordinate-bound grant. Failed attempts keep it. */
export function consumeMissionNebulaDeparture(
  benefits: MissionNebulaBenefitsByShip | undefined, shipId: string, origin: string, destination: string,
): MissionNebulaBenefitsByShip {
  if (!benefits) return {};
  if (origin === destination || benefits[shipId]?.coordinate !== origin) return benefits;
  const next = { ...benefits };
  delete next[shipId];
  return next;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
