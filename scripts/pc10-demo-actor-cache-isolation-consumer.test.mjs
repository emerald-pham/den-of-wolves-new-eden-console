import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const consumer = await readFile(new URL('./pc10-full-game-demo-ui-proof.mjs', import.meta.url), 'utf8');
const guardStart = consumer.indexOf('          assert.equal(isolated.otherActorPendingCount, 0);');
const guardEnd = consumer.indexOf('\n          evidence.inactiveClientCacheProbe', guardStart);
assert.ok(guardStart >= 0 && guardEnd > guardStart, 'Bind the actual selected-actor isolation assertions.');
const guard = consumer.slice(guardStart, guardEnd);
const checkActualConsumer = new vm.Script(`(isolated => {\n${guard}\n})`, {
  filename: 'actual-full-game-inactive-actor-isolation-guard',
}).runInNewContext({ assert });

test('inactive cache probe absence is not a gameplay failure or committed-request recovery check', () => {
  const inactiveEnvelope = { state: { pendingCommands: [] } };
  const isolated = {
    otherActorPendingCount: 0,
    otherActorPrivateProbeVisible: false,
    originalActorOutboxRetained: inactiveEnvelope.state.pendingCommands.some(
      command => command.id === 'pc10-inactive-actor-probe',
    ),
  };
  assert.equal(isolated.originalActorOutboxRetained, false,
    'The deliberately untrusted synthetic entry is absent from this envelope.');
  assert.doesNotThrow(() => checkActualConsumer(isolated),
    'The real consumer must judge active-actor isolation, not retention of the synthetic entry.');
});

test('the consumer still rejects an inactive actor pending command leaking into the selected actor', () => {
  assert.throws(() => checkActualConsumer({
    otherActorPendingCount: 1,
    otherActorPrivateProbeVisible: false,
    originalActorOutboxRetained: false,
  }), /1 !== 0/);
});

test('the consumer still rejects inactive private data leaking into the selected actor', () => {
  assert.throws(() => checkActualConsumer({
    otherActorPendingCount: 0,
    otherActorPrivateProbeVisible: true,
    originalActorOutboxRetained: false,
  }), /true !== false/);
});
