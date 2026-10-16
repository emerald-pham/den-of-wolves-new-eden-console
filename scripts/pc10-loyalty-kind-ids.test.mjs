import assert from 'node:assert/strict';
import test from 'node:test';
import { extractLoyaltyKindIds } from './pc10-loyalty-kind-ids.mjs';

test('extracts string identities from only the canonical LoyaltyKind union', () => {
  const source = `
    type UnrelatedRole = 'not-a-loyalty';
    export type LoyaltyKind = 'fleet-loyalist' | 'wolf-agent' | 'friend';
  `;
  assert.deepEqual(extractLoyaltyKindIds(source), [
    'fleet-loyalist', 'wolf-agent', 'friend',
  ]);
});

test('fails closed when LoyaltyKind is missing or contains non-string members', () => {
  assert.throws(() => extractLoyaltyKindIds("type Other = 'role';"), /LoyaltyKind/);
  assert.throws(() => extractLoyaltyKindIds('type LoyaltyKind = string | \'friend\';'), /string literal/);
});

test('rejects duplicate loyalty identities', () => {
  assert.throws(() => extractLoyaltyKindIds("type LoyaltyKind = 'friend' | 'friend';"), /duplicate/);
});
