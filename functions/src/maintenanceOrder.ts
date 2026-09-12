/**
 * The numbered maintenance lane from the implemented vessel sheets.
 *
 * Supplemental identities are intentionally absent: they have no authoritative
 * resource, damage, role, or maintenance callable path yet. Their printed
 * statistics remain registered in the client catalog until those gameplay
 * foundations are delivered by their owning prompts.
 */
export const MAINTENANCE_ORDERS = {
  aegis: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays'],
  dione: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  icebreaker: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  shepherd: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  quellon: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  'refinery-124': ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  capybara: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
} as const;

export type MaintainedShipId = keyof typeof MAINTENANCE_ORDERS;
export type MaintenanceAction = typeof MAINTENANCE_ORDERS[MaintainedShipId][number];

export function maintenanceOrderFor(shipId: string): readonly MaintenanceAction[] | undefined {
  return MAINTENANCE_ORDERS[shipId as MaintainedShipId];
}
