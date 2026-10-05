import assert from 'node:assert/strict';
import test from 'node:test';
import { REVIEWS as endings } from './pc10-action-review-source-endings.mjs';
import { REVIEWS as workspaces } from './pc10-action-review-source-workspaces.mjs';
import { REVIEWS as demo } from './pc10-action-review-source-demo.mjs';
import { REVIEWS as productDeltas } from './pc10-action-review-source-product-deltas.mjs';

const shards = [endings, workspaces, demo];

test('three source shards cover the 206 callable rows without duplicate exports', () => {
  assert.deepEqual(shards.map(rows => rows.length), [68, 69, 69]);
  const names = shards.flatMap(rows => rows.map(row => row.exportName));
  assert.equal(names.length, 206);
  assert.equal(new Set(names).size, names.length);
  for (const row of shards.flat()) {
    assert.ok(row.classification, row.exportName);
    assert.ok(row.productPath?.sourceAnchorIds?.length, row.exportName);
    assert.ok(row.actor?.family && row.actor?.sourceAnchorIds?.length, row.exportName);
    for (const field of ['requirements', 'costs', 'consequences', 'blockers', 'nextActor', 'guidance']) {
      assert.ok(row[field]?.summary && row[field].sourceAnchorIds?.length, `${row.exportName} ${field}`);
    }
  }
});

test('new current-source callable is separately described without changing the frozen matrix', () => {
  assert.equal(productDeltas.length, 1);
  const row = productDeltas[0];
  assert.equal(row.exportName, 'transferWarriorCargo');
  assert.equal(row.classification, 'served-ui-path');
  assert.ok(row.productPath?.sourceAnchorIds?.includes('delta.warriorCargo.export'));
  assert.ok(row.productPath?.sourceAnchorIds?.includes('delta.warriorCargo.ui'));
  assert.ok(row.actor?.identities?.includes('warrior-captain'));
});
