/**
 * The member-visible part of a maintenance event. Keep this projection
 * separate from the private maintenance receipt/reply so new private fields
 * cannot accidentally become part of the event by spreading a larger object.
 */

export const MAINTENANCE_EVENT_ACTIONS = [
  'begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end',
] as const;
export type MaintenanceEventAction = typeof MAINTENANCE_EVENT_ACTIONS[number];

export const MAINTENANCE_EVENT_RESULT_STEPS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type MaintenanceEventResultStep = typeof MAINTENANCE_EVENT_RESULT_STEPS[number];
export type MaintenanceEventResults = Partial<Record<MaintenanceEventResultStep, string>>;

export interface MaintenanceEventProjection {
  readonly shipId: string;
  readonly shipName: string;
  readonly action: MaintenanceEventAction;
  readonly results: MaintenanceEventResults;
}

/** Build the allow-listed result projection written to member-visible events. */
export function projectMaintenanceEvent(input: {
  readonly shipId: string;
  readonly shipName: string;
  readonly action: string;
  readonly results: Readonly<Record<string, unknown>>;
}): MaintenanceEventProjection {
  if (!(MAINTENANCE_EVENT_ACTIONS as readonly string[]).includes(input.action)) {
    throw new Error('Invalid maintenance event action.');
  }

  const results: MaintenanceEventResults = {};
  for (const step of MAINTENANCE_EVENT_RESULT_STEPS) {
    const value = input.results[step];
    if (typeof value === 'string') results[step] = value;
  }

  return {
    shipId: input.shipId,
    shipName: input.shipName,
    action: input.action as MaintenanceEventAction,
    results,
  };
}
