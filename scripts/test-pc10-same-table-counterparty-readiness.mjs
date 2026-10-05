import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { waitForCounterpartySelector } from './pc10-same-table-trade-ui-proof.mjs';

function rawUidHash(uid) {
  return createHash('sha256').update(new TextEncoder().encode(uid)).digest('hex').slice(0, 16);
}

const SENDER = Object.freeze({
  uid: 'original-sender-uid',
  uidHash: rawUidHash('original-sender-uid'),
  sessionId: 'current-session',
  role: 'player',
  profileRoleId: 'admiral',
  assignedRoleId: 'admiral',
  activeConsoleRoleId: 'admiral',
  tableId: 'aegis',
  fleetGroupId: 'fleet-one',
  sameActor: true,
  connection: 'live',
  freshness: 'server',
  live: true,
});

const RECIPIENT = Object.freeze({
  uid: 'original-recipient-uid',
  uidHash: rawUidHash('original-recipient-uid'),
  displayName: 'DEMO // executive-officer',
});

function sourceSnapshot(options = [], actor = SENDER) {
  return { options, actor };
}

function option(value, label = RECIPIENT.displayName) {
  return { value, label };
}

function harness(readCurrent, overrides = {}) {
  let now = 100;
  const sleeps = [];
  return {
    sleeps,
    run: () => waitForCounterpartySelector({
      readCurrent,
      expectedActor: SENDER,
      expectedRecipient: RECIPIENT,
      now: () => now,
      sleep: async milliseconds => { sleeps.push(milliseconds); now += milliseconds; },
      pollIntervalMs: 10,
      maxWaitMs: 35,
      ...overrides,
    }),
    elapsed: () => now - 100,
  };
}

test('accepts an immediately current recipient option only for the exact original UID and demo name', async () => {
  let reads = 0;
  const runner = harness(async () => {
    reads += 1;
    return sourceSnapshot([
      { value: '', label: 'Choose recipient' },
      option(RECIPIENT.uid),
    ]);
  });

  const result = await runner.run();

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.option, option(RECIPIENT.uid));
  assert.equal(reads, 1);
  assert.equal(runner.elapsed(), 0);
  assert.equal(result.diagnostics.optionCount, 2);
  assert.equal(result.diagnostics.labelMatch, true);
  assert.equal(result.diagnostics.valueHashMatch, true);
  assert.equal(result.diagnostics.authority.sameOriginalAuthenticatedActor, true);
  assert.equal(result.diagnostics.authority.sameSession, true);
  assert.equal(result.diagnostics.authority.sameProfileRole, true);
  assert.equal(result.diagnostics.authority.sameAssignedRole, true);
  assert.equal(result.diagnostics.authority.sameActiveConsoleRole, true);
  assert.equal(result.diagnostics.authority.sameCurrentTable, true);
  assert.equal(result.diagnostics.authority.sameCurrentFleetGroup, true);
  assert.equal(result.diagnostics.authority.liveConnection, true);
  assert.equal(result.diagnostics.authority.serverFreshness, true);
  assert.equal(result.diagnostics.authority.liveServerFresh, true);
  assert.doesNotMatch(JSON.stringify(result.diagnostics), /original-recipient-uid|DEMO \/\//,
    'Persistable diagnostics must not contain a raw UID or participant label.');
});

test('waits within the finite readiness window for the source-projected current option', async () => {
  let reads = 0;
  const runner = harness(async () => {
    reads += 1;
    return sourceSnapshot(reads < 3 ? [] : [
      { value: '', label: 'Choose recipient' },
      option(RECIPIENT.uid),
    ]);
  });

  const result = await runner.run();

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.option, option(RECIPIENT.uid));
  assert.equal(reads, 3);
  assert.equal(runner.elapsed(), 20);
  assert.ok(runner.elapsed() <= 35);
});

test('a visible exact-name option for a different UID fails closed without returning a selectable option', async () => {
  let reads = 0;
  let selectionMutations = 0;
  const runner = harness(async () => {
    reads += 1;
    return sourceSnapshot([option('some-other-player')]);
  });

  const result = await runner.run();

  assert.equal(result.status, 'identity-mismatch');
  assert.equal(result.option, null);
  assert.equal(result.diagnostics.labelMatch, true);
  assert.equal(result.diagnostics.valueHashMatch, false);
  assert.equal(reads, 1, 'A conflicting exact name should fail immediately, not wait or select another actor.');
  assert.equal(selectionMutations, 0);
});

test('the intended UID under a different label is reported and is never used as a fallback', async () => {
  const runner = harness(async () => sourceSnapshot([option(RECIPIENT.uid, 'Different participant label')]));

  const result = await runner.run();

  assert.equal(result.status, 'label-mismatch');
  assert.equal(result.option, null);
  assert.equal(result.diagnostics.labelMatch, false);
  assert.equal(result.diagnostics.valueHashMatch, true);
  assert.equal(result.diagnostics.exactLabelAndUidMatch, false);
});

test('a changed original sender authority aborts readiness before a selector result can be used', async () => {
  let reads = 0;
  const changedActor = { ...SENDER, fleetGroupId: 'other-group' };
  const runner = harness(async () => {
    reads += 1;
    return reads === 1
      ? sourceSnapshot([])
      : sourceSnapshot([option(RECIPIENT.uid)], changedActor);
  });

  const result = await runner.run();

  assert.equal(result.status, 'authority-changed');
  assert.equal(result.option, null);
  assert.equal(result.diagnostics.authority.sameCurrentFleetGroup, false);
  assert.equal(result.diagnostics.authority.liveServerFresh, true);
  assert.equal(reads, 2);
});

test('loss of live connection or server freshness aborts readiness before selecting', async () => {
  const offline = harness(async () => sourceSnapshot([option(RECIPIENT.uid)], {
    ...SENDER, connection: 'offline', live: false,
  }));
  const offlineResult = await offline.run();
  assert.equal(offlineResult.status, 'authority-changed');
  assert.equal(offlineResult.option, null);
  assert.equal(offlineResult.diagnostics.authority.liveConnection, false);
  assert.equal(offlineResult.diagnostics.authority.serverFreshness, true);

  const cached = harness(async () => sourceSnapshot([option(RECIPIENT.uid)], {
    ...SENDER, freshness: 'cache', live: false,
  }));
  const cachedResult = await cached.run();
  assert.equal(cachedResult.status, 'authority-changed');
  assert.equal(cachedResult.option, null);
  assert.equal(cachedResult.diagnostics.authority.liveConnection, true);
  assert.equal(cachedResult.diagnostics.authority.serverFreshness, false);
  assert.equal(cachedResult.diagnostics.authority.liveServerFresh, false);
});

test('an absent option times out at the finite readiness deadline and preserves the final safe observation', async () => {
  let reads = 0;
  const runner = harness(async () => {
    reads += 1;
    return sourceSnapshot([]);
  });

  const result = await runner.run();

  assert.equal(result.status, 'timeout');
  assert.equal(result.option, null);
  assert.ok(reads >= 3);
  assert.equal(runner.elapsed(), 35);
  assert.ok(runner.sleeps.every(milliseconds => milliseconds > 0 && milliseconds <= 10));
  assert.ok(runner.elapsed() <= 35, 'Readiness polling must not exceed its requested finite deadline.');
  assert.equal(result.diagnostics.optionCount, 0);
  assert.equal(result.diagnostics.labelMatch, false);
  assert.equal(result.diagnostics.valueHashMatch, false);
});
