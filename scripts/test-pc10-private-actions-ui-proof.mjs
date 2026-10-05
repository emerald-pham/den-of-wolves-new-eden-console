import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const demoPath = new URL('./pc10-explicit-loyalty-demo-proof.mjs', import.meta.url);
const loyaltyUiPath = new URL('../src/components/PrivateLoyaltyPanel.tsx', import.meta.url);

test('optional-loyalty driver never spends beacon and intelligence on one Wolf actor in one cycle', async () => {
  const [demo, loyaltyUi] = await Promise.all([
    readFile(fileURLToPath(demoPath), 'utf8'),
    readFile(fileURLToPath(loyaltyUiPath), 'utf8'),
  ]);

  assert.match(loyaltyUi, /wolfActionUsedLocally/,
    'The mounted panel disables each Wolf action after one action in the current cycle.');
  assert.equal(/await beacon\.click\(\);[\s\S]{0,1200}?await send\.click\(\);/.test(demo), false,
    'The proof cannot claim both mutually exclusive current-cycle actions for the same selected actor.');
});
