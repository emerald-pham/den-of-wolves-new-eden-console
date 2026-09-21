import { findShip } from './ships';

export const SERVICE_SHUTTLE_IDS = ['black-sheep', 'condor', 'wobbly'] as const;

/** Mirror the printed Reactor target envelope for display; the server remains authoritative. */
export function serviceRechargeConsoleOptions(shipId: string): readonly { id: string; name: string }[] {
  return (findShip(shipId)?.systems ?? []).flatMap((system) =>
    !['storage', 'reactor'].includes(system.id) &&
    !system.id.startsWith('shuttle-bay') &&
    !system.id.startsWith('armoured-hull')
      ? [{ id: system.id, name: system.name }]
      : []);
}
