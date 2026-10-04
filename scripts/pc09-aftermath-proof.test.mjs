import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizationAudienceThreatCounts, normalizeFinalizationReceipt } from './pc09-aftermath-proof.mjs';

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

test('audience count comparison treats an omitted optional return list as zero', () => {
  assert.deepEqual(finalizationAudienceThreatCounts({
    survivingWolfShips: [{ instanceId: 'wolf-1', shipId: 'wolf-cruiser', target: 'aegis' }],
  }), { remainingThreatCount: 1, returningThreatCount: 0 });
  assert.deepEqual(finalizationAudienceThreatCounts({
    survivingWolfShips: [], returningInstanceIds: ['wolf-1'],
  }), { remainingThreatCount: 0, returningThreatCount: 1 });
});
