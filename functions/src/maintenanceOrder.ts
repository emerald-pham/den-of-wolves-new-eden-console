/**
 * The numbered maintenance lane from every implemented vessel sheet.
 * Full fleet ships use the damage/resource engine; admitted small vessels and
 * Voyage 33-0 use their host-funded engines. All three authorities consume
 * this registry instead of inferring a generic sequence.
 */
export const MAINTENANCE_ORDERS = {
  aegis: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays'],
  dione: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  icebreaker: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  shepherd: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  quellon: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  'refinery-124': ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  capybara: ['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays'],
  gorgoneion: ['rations', 'unrest', 'riot', 'reactor'],
  'capybara-small': ['rations', 'unrest', 'riot', 'reactor'],
  warrior: ['rations', 'unrest', 'riot', 'reactor'],
  vulcan: ['rations', 'unrest', 'riot', 'reactor'],
  'voyage-33-0': ['rations', 'unrest', 'riot', 'reactor'],
} as const;

export type MaintainedShipId = keyof typeof MAINTENANCE_ORDERS;
export type MaintenanceAction = typeof MAINTENANCE_ORDERS[MaintainedShipId][number];

export function maintenanceOrderFor(shipId: string): readonly MaintenanceAction[] | undefined {
  return MAINTENANCE_ORDERS[shipId as MaintainedShipId];
}

export type MaintenanceLaneAction = 'begin' | MaintenanceAction | 'end';

/** Resolve the legal lane action for a persisted cycle step. */
export function maintenanceActionForStep(shipId: string, step: number): MaintenanceLaneAction | undefined {
  const order = maintenanceOrderFor(shipId);
  if (!order || !Number.isSafeInteger(step) || step < 0) return undefined;
  if (step === 0) return 'begin';
  return order[step - 1] ?? (step === order.length + 1 ? 'end' : undefined);
}
