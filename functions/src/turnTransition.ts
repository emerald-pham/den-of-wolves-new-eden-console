import type { MaintenanceCycle } from './maintenance';

export interface ExpiredTurnResources {
  readonly maintenanceCycles: Record<string, MaintenanceCycle>;
  readonly shuttleFuelled: Record<string, boolean>;
}

/** Clear resources that exist only for the turn that just ended. */
export function expireTurnScopedResources(
  maintenanceCycles: Readonly<Record<string, MaintenanceCycle>>,
  shuttleFuelled: Readonly<Record<string, boolean>>,
): ExpiredTurnResources {
  return {
    maintenanceCycles: Object.fromEntries(
      Object.entries(maintenanceCycles).map(([shipId, cycle]) => [
        shipId,
        {
          ...cycle,
          charges: [],
          refuelled: [],
        },
      ]),
    ),
    shuttleFuelled: Object.fromEntries(
      Object.keys(shuttleFuelled).map((shuttleId) => [shuttleId, false]),
    ),
  };
}
