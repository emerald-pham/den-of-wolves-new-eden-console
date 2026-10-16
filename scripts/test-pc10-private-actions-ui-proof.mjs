import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const demoPath = new URL('./pc10-explicit-loyalty-demo-proof.mjs', import.meta.url);
const loyaltyUiPath = new URL('../src/components/PrivateLoyaltyPanel.tsx', import.meta.url);
const privateUiProofPath = new URL('./pc10-private-actions-ui-proof.mjs', import.meta.url);

test('optional-loyalty driver routes beacon and intelligence to distinct original Wolf actors', async () => {
  const [demo, loyaltyUi, privateUiProof] = await Promise.all([
    readFile(fileURLToPath(demoPath), 'utf8'),
    readFile(fileURLToPath(loyaltyUiPath), 'utf8'),
    readFile(fileURLToPath(privateUiProofPath), 'utf8'),
  ]);

  assert.match(loyaltyUi, /wolfActionUsedLocally/,
    'The mounted panel disables each Wolf action after one action in the current cycle.');
  assert.match(demo, /buildWolfCycleActionPlan\(mode, actors\)/,
    'The proof must bind each ordinary action to a roster holder instead of chaining two clicks on one selected actor.');
  assert.match(demo, /new Set\(actors\.map\(item => item\.uidHash\)\)\.size === 2/,
    'The saved coverage summary must retain the two-distinct-original-UID assertion.');
  assert.doesNotMatch(demo, /privateFunctions\.wolfBeaconAction = true;\s*privateFunctions\.wolfIntelligenceAction = true/,
    'One actor response cannot be counted as both mutually exclusive actions.');
  assert.match(privateUiProof, /captureCallableResponse\(crew\.page, 'submitWolfSupplySabotage'/,
    'Supply sabotage must begin with the ordinary mounted UI and its actual Firebase SDK response.');
  assert.match(privateUiProof, /crew\.callable\('submitWolfSupplySabotage', committed\.requestData\)/,
    'The original actor must retry the exact request payload after the UI commit.');
  assert.match(privateUiProof, /gm\.callable\('acknowledgeWolfHackingAlert', acknowledged\.requestData\)/,
    'The owned live GM instance must recover the exact acknowledgement receipt.');
  assert.match(privateUiProof, /Original Wolf actor reconnected from server state/,
    'The exact supply receipt must be recovered after an ordinary page reload under the same actor.');
  assert.match(privateUiProof, /assert\.equal\(await control\.count\(\), 1/,
    'The proof must require every current Wolf action control to be mounted after the action.');
  assert.match(privateUiProof, /oneActionControlsDisabled: actionControlStates\.every\(state => state\.disabled\)/,
    'The reported one-action UI state must come from observed disabled controls, not a default claim.');
  assert.match(privateUiProof, /same-UID Wolf action in the same cycle/,
    'A fresh same-UID action attempt must be rejected after reconnect instead of spending a second action.');
  assert.match(privateUiProof, /assert\.equal\(await beaconAfterReload\.isEnabled\(\), true/,
    'A fresh mount must attempt a new action so the server-side one-action fence is actually exercised.');
  assert.doesNotMatch(privateUiProof, /if \(await beaconAfterReload\.isEnabled\(\)\)/,
    'An optional skipped denial would not prove the authenticated server fence after reconnect.');
  assert.match(privateUiProof, /blockedPhysicalConsoleBranch\(\)/,
    'The proof must preserve the real physical-attendance blocker for console visits.');
  assert.doesNotMatch(privateUiProof, /admin\.firestore|setDoc\(|updateDoc\(|writeBatch\(|runTransaction\(/,
    'The proof driver may not substitute direct gameplay writes for the normal UI.');
});
