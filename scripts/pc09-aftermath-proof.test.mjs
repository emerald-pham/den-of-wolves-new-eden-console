import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFinalizationReceipt } from './pc09-aftermath-proof.mjs';

test('authenticated finalization comparison equates omitted and empty optional result collections', () => {
  const legacy = {
    boarding: undefined,
    returningInstanceIds: undefined,
    ranges: [{ rolls: undefined, targetShifts: undefined, unusedHitsByAction: undefined,
      assignments: [{ targetInstanceIds: undefined }] }],
    survivingWolfShips: [],
  };
  const persisted = {
    boarding: [],
    returningInstanceIds: [],
    ranges: [{ rolls: [], targetShifts: [], unusedHitsByAction: [],
      assignments: [{ targetInstanceIds: [] }] }],
    survivingWolfShips: [],
  };
  assert.deepEqual(normalizeFinalizationReceipt(persisted), normalizeFinalizationReceipt(legacy));
});

test('receipt comparison preserves empty survivor lists as meaningful authority', () => {
  assert.notDeepEqual(
    normalizeFinalizationReceipt({ survivingWolfShips: [] }),
    normalizeFinalizationReceipt({}),
  );
});
