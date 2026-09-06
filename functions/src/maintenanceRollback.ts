import { isDeepStrictEqual } from 'node:util';
import { emptyMaintenanceCycle } from './maintenance';

export interface MaintenanceUndoField { field: string; before: unknown; after: unknown; existed: boolean }
export function captureMaintenanceUndo(get: (field: string) => unknown, patch: Record<string, unknown>): MaintenanceUndoField[] {
  return Object.entries(patch).filter(([field, after]) => !isDeepStrictEqual(get(field), after))
    .map(([field, after]) => ({ field, after, before: get(field) ?? null, existed: get(field) !== undefined }));
}
export function restoreMaintenanceUndo(entries: MaintenanceUndoField[], get: (field: string) => unknown, shipId: string, revision: number): Record<string, unknown> {
  const cycleField = `maintenanceCycles.${shipId}`;
  const comparable = (field: string, value: unknown) => field === cycleField && value && typeof value === 'object'
    ? { ...value, revision: 0 } : value;
  for (const entry of entries) {
    if (!isDeepStrictEqual(comparable(entry.field, get(entry.field)), comparable(entry.field, entry.after))) {
      throw new Error('Ship state changed after this step. Rollback would overwrite a later change.');
    }
  }
  const restored = Object.fromEntries(entries.map(entry => [entry.field, entry.existed ? entry.before : undefined]));
  restored[cycleField] = { ...(restored[cycleField] ?? emptyMaintenanceCycle()), revision: revision + 1 };
  return restored;
}
