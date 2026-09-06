import { expect, it } from 'vitest';
import { captureMaintenanceUndo, restoreMaintenanceUndo } from './maintenanceRollback';
it('restores resources and cycle results, with a fresh revision, without overwriting unrelated state', () => {
  const before: Record<string, unknown> = { 'maintenanceCycles.aegis': { step: 2, revision: 2 }, 'shipResources.aegis': { food: 10 }, unrelated: 7 };
  const after = { 'maintenanceCycles.aegis': { step: 3, revision: 3 }, 'shipResources.aegis': { food: 6 } };
  const undo = captureMaintenanceUndo(key => before[key], after);
  const restored = restoreMaintenanceUndo(undo, key => (after as Record<string, unknown>)[key], 'aegis', 3);
  expect(restored).toEqual({ 'maintenanceCycles.aegis': { step: 2, revision: 4 }, 'shipResources.aegis': { food: 10 } });
});
it('refuses rollback when later damage or resource changes would be lost', () => {
  const undo = captureMaintenanceUndo(() => 10, { 'shipSurvivors.aegis': 9 });
  expect(() => restoreMaintenanceUndo(undo, () => 8, 'aegis', 3)).toThrow(/changed/);
});
it('supports repeated rollback while revisions remain monotonic', () => {
  const undo = captureMaintenanceUndo(() => ({ step: 1, revision: 1 }), { 'maintenanceCycles.aegis': { step: 2, revision: 2 } });
  expect(restoreMaintenanceUndo(undo, () => ({ step: 2, revision: 8 }), 'aegis', 8)).toEqual({ 'maintenanceCycles.aegis': { step: 1, revision: 9 } });
});
