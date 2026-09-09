import type {
  MaintenanceEvent,
  MaintenanceEventAction,
  MaintenanceEventResultStep,
  MaintenanceEventResults,
} from '@/types/game';

const MAINTENANCE_EVENT_ACTIONS: readonly MaintenanceEventAction[] = [
  'begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end',
];
const MAINTENANCE_EVENT_RESULT_STEPS: readonly MaintenanceEventResultStep[] = [
  '1', '2', '3', '4', '5', '6', '7',
];

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Readonly<Record<string, unknown>>;
}

/** Parse only the explicit member-visible maintenance event projection. */
export function parseMaintenanceEvent(
  id: string,
  sessionId: string,
  value: unknown,
  createdAt: string,
): MaintenanceEvent | null {
  const data = record(value);
  if (
    data === null || data.type !== 'maintenance' ||
    typeof data.shipId !== 'string' || typeof data.shipName !== 'string' ||
    !MAINTENANCE_EVENT_ACTIONS.includes(data.action as MaintenanceEventAction)
  ) return null;

  const rawResults = record(data.results);
  if (rawResults === null) return null;
  const results: MaintenanceEventResults = {};
  for (const step of MAINTENANCE_EVENT_RESULT_STEPS) {
    const result = rawResults[step];
    if (typeof result === 'string') results[step] = result;
  }

  return {
    id,
    sessionId,
    type: 'maintenance',
    shipId: data.shipId,
    shipName: data.shipName,
    action: data.action as MaintenanceEventAction,
    results,
    createdAt,
  };
}
