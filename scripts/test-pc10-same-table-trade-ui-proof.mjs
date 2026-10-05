import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdtemp, readFile as readEvidence } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createSameTableTradeUiProof,
  selectionMatchesOriginalIdentity,
  validateActorPair,
  validateTrainingScenario,
} from './pc10-same-table-trade-ui-proof.mjs';

const BALANCES = Object.freeze({
  ore: 2,
  fuel: 1,
  food: 1,
  water: 0,
  materials: 0,
  securityTeams: 0,
});

const SCENARIO = Object.freeze({
  mode: 'virtual-training-only',
  humanPhysicalProof: false,
  senderRoleId: 'admiral',
  recipientRoleId: 'executive-officer',
  baselines: Object.freeze({
    admiral: BALANCES,
    'executive-officer': Object.freeze({
      ore: 1,
      fuel: 0,
      food: 0,
      water: 1,
      materials: 0,
      securityTeams: 0,
    }),
  }),
  transfer: Object.freeze({ resource: 'ore', amount: 1 }),
});

function actor(overrides = {}) {
  return {
    sessionId: 'session-one',
    uidHash: 'a'.repeat(16),
    role: 'player',
    profileRoleId: 'admiral',
    assignedRoleId: 'admiral',
    activeConsoleRoleId: 'admiral',
    tableId: 'aegis',
    fleetGroupId: 'fleet-one',
    live: true,
    replacement: false,
    ...overrides,
  };
}

test('training baselines are explicit virtual choices and never human physical proof', () => {
  assert.deepEqual(validateTrainingScenario(SCENARIO), SCENARIO);
  assert.throws(() => validateTrainingScenario({ ...SCENARIO, humanPhysicalProof: true }), /must be false/i);
  assert.throws(() => validateTrainingScenario({ ...SCENARIO, mode: 'observed-tabletop' }), /virtual-training-only/i);
  assert.throws(() => validateTrainingScenario({
    ...SCENARIO,
    baselines: { ...SCENARIO.baselines, admiral: { ...BALANCES, ore: -1 } },
  }), /safe non-negative whole counts/i);
  assert.throws(() => validateTrainingScenario({
    ...SCENARIO,
    transfer: { resource: 'ore', amount: 3 },
  }), /exceeds the sender's chosen training balance/i);
});

test('trade actors need distinct original player identities with live same-table and same-group authority', () => {
  const sender = actor();
  const recipient = actor({
    uidHash: 'b'.repeat(16),
    profileRoleId: 'executive-officer',
    assignedRoleId: 'executive-officer',
    activeConsoleRoleId: 'executive-officer',
  });
  assert.deepEqual(validateActorPair(sender, recipient, 'session-one'), { eligible: true });
  assert.equal(validateActorPair(sender, { ...recipient, tableId: 'dione' }, 'session-one').eligible, false);
  assert.equal(validateActorPair(sender, { ...recipient, fleetGroupId: 'fleet-two' }, 'session-one').eligible, false);
  assert.equal(validateActorPair(sender, { ...recipient, uidHash: sender.uidHash }, 'session-one').eligible, false);
  assert.equal(validateActorPair(sender, { ...recipient, live: false }, 'session-one').eligible, false);
  assert.equal(validateActorPair(sender, { ...recipient, replacement: true }, 'session-one').eligible, false);
});

test('baseline and recipient selectors match the full-demo raw-UID fingerprint against the original actor UID', () => {
  const originalUid = 'actual-original-player-uid';
  const actorIdentity = {
    uid: originalUid,
    uidHash: createHash('sha256').update(new TextEncoder().encode(originalUid)).digest('hex').slice(0, 16),
  };
  const jsonWrappedUidHash = createHash('sha256').update(JSON.stringify(originalUid)).digest('hex').slice(0, 16);
  assert.notEqual(actorIdentity.uidHash, jsonWrappedUidHash,
    'This fixture distinguishes the full-demo TextEncoder(raw UID) fingerprint from JSON-wrapped request hashes.');
  assert.equal(selectionMatchesOriginalIdentity(originalUid, actorIdentity), true,
    'The exact selected original UID must pass both ordinary UI selector guards.');
  assert.equal(selectionMatchesOriginalIdentity('different-selected-actor', actorIdentity), false,
    'A selector that names another account must be rejected before the UI action is submitted.');
});

test('omitting physical observations blocks before creating a browser adapter or submitting counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-same-table-trade-blocked-'));
  let driverCalls = 0;
  const proof = createSameTableTradeUiProof({
    createTwoBrowserGameplay() { driverCalls += 1; throw new Error('must not prepare or mutate without explicit training counts'); },
  });
  const result = await proof.onStarted({ directory, initial: { sessionId: 'session-one' } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.humanPhysicalProof, false);
  assert.match(result.reason, /physical token counts are not available/i);
  assert.equal(driverCalls, 0);
  const evidence = JSON.parse(await readEvidence(join(directory, 'same-table-trade-ui-proof.json'), 'utf8'));
  assert.equal(evidence.status, 'blocked');
  assert.equal(evidence.mutationsAttempted, false);
});

test('the callback remains inert until the full-demo onStarted hook and uses current trade UI endpoints', async () => {
  const source = await readFile(new URL('./pc10-same-table-trade-ui-proof.mjs', import.meta.url), 'utf8');
  assert.match(source, /export function createSameTableTradeUiProof/);
  assert.match(source, /onStarted/);
  assert.match(source, /Physical tabletop baseline/);
  assert.match(source, /Record tabletop counts/);
  assert.match(source, /Send exact offer/);
  assert.match(source, /Accept exact offer/);
  assert.match(source, /attestPlayerHeldTokenBaseline/);
  assert.match(source, /createSameTableTradeOffer/);
  assert.match(source, /acceptSameTableTradeOffer/);
  assert.match(source, /waitForResponse/);
  assert.doesNotMatch(source, /page\.route\(|route\.fetch\(|firebase-admin|setDoc\(|updateDoc\(/);
});
