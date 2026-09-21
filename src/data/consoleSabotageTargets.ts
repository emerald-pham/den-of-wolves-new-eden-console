import { SHIPS } from './ships';
import { VULCAN_LABOUR_TARGETS } from './vulcanLabour';

export interface ConsoleSabotageTarget {
  readonly id: string;
  readonly name: string;
}

/** Public console labels only. Damage-card identities and order remain server-owned. */
export function consoleSabotageTargetsForShip(shipId: string): readonly ConsoleSabotageTarget[] {
  const ship = SHIPS.find((candidate) => candidate.id === shipId);
  const candidates = [
    ...(ship?.systems ?? []).map(({ id, name }) => ({ id, name })),
    ...(VULCAN_LABOUR_TARGETS[shipId] ?? []),
  ].filter(({ id }) => !id.startsWith('armoured-hull'));
  return [...new Map(candidates.map((target) => [target.id, target])).values()];
}
