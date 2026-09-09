import { isDeepStrictEqual } from 'node:util';
import { emptyMaintenanceCycle } from './maintenance';

export interface MaintenanceUndoField { field: string; before: unknown; after: unknown; existed: boolean; immutable?: boolean }
function matchesField(field: string, candidate: string): boolean {
  return field === candidate || field.startsWith(`${candidate}.`);
}
function legacyImmutableField(field: string): boolean {
  return field.startsWith('shipDamage.');
}
function damageDependentField(field: string, shipId: string): boolean {
  return field === `shipDamage.${shipId}` || field === `shipSurvivors.${shipId}` ||
    field === `shipUnrest.${shipId}` || field === 'unrestAlerts' || field === 'populationAlerts';
}
export function captureMaintenanceUndo(
  get: (field: string) => unknown,
  patch: Record<string, unknown>,
  immutableFields: readonly string[] = [],
): MaintenanceUndoField[] {
  return Object.entries(patch).filter(([field, after]) => !isDeepStrictEqual(get(field), after))
    .map(([field, after]) => ({
      field,
      after,
      before: get(field) ?? null,
      existed: get(field) !== undefined,
      ...(immutableFields.some(candidate => matchesField(field, candidate)) ? { immutable: true } : {}),
    }));
}
export function restoreMaintenanceUndo(entries: MaintenanceUndoField[], get: (field: string) => unknown, shipId: string, revision: number): Record<string, unknown> {
  const cycleField = `maintenanceCycles.${shipId}`;
  const legacyDamageEntry = entries.some(entry => legacyImmutableField(entry.field));
  const isImmutable = (entry: MaintenanceUndoField) => entry.immutable === true ||
    (legacyDamageEntry && damageDependentField(entry.field, shipId));
  const comparable = (field: string, value: unknown) => field === cycleField && value && typeof value === 'object'
    ? { ...value, revision: 0 } : value;
  for (const entry of entries) {
    if (isImmutable(entry)) continue;
    if (!isDeepStrictEqual(comparable(entry.field, get(entry.field)), comparable(entry.field, entry.after))) {
      throw new Error('Ship state changed after this step. Rollback would overwrite a later change.');
    }
  }
  const restored = Object.fromEntries(entries
    .filter(entry => !isImmutable(entry))
    .map(entry => [entry.field, entry.existed ? entry.before : undefined]));
  restored[cycleField] = { ...(restored[cycleField] ?? emptyMaintenanceCycle()), revision: revision + 1 };
  return restored;
}
