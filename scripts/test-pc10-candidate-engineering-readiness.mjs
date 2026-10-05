import assert from 'node:assert/strict';
import test from 'node:test';
import * as helpers from './pc10-candidate-proof-helpers.mjs';

function selectFixture(options, { absent = false } = {}) {
  const calls = []; let visible = false;
  return { calls, select: {
    async waitFor(settings) {
      calls.push(['waitFor', settings]);
      if (absent) throw new Error('The real Engineering Shuttle selector is not offered.');
      visible = true;
    },
    locator(name) {
      assert.equal(name, 'option');
      return { async evaluateAll(evaluate) { calls.push(['read-options']); return evaluate(visible ? options : []); } };
    },
    async selectOption(value) { calls.push(['selectOption', value]); },
  } };
}

test('Ring preparation waits for the refreshed actual selector before enumerating its choices', async () => {
  const f = selectFixture([{ value: 'philia', disabled: false }]);
  const chosen = await helpers.chooseOfferedRingEngineeringShuttle(f.select);
  assert.equal(chosen, 'philia');
  assert.deepEqual(f.calls, [['waitFor', { state: 'visible', timeout: 60_000 }], ['read-options'], ['selectOption', 'philia']]);
});

test('Ring preparation chooses only an actually enabled nonempty option', async () => {
  const f = selectFixture([{ value: '', disabled: false }, { value: 'unavailable', disabled: true },
    { value: 'blacksmith', disabled: false }]);
  assert.equal(await helpers.chooseOfferedRingEngineeringShuttle(f.select), 'blacksmith');
  assert.deepEqual(f.calls.at(-1), ['selectOption', 'blacksmith']);
});

test('Ring preparation preserves a real no-eligible-craft blocker without selecting or committing', async () => {
  const f = selectFixture([{ value: '', disabled: false }, { value: 'philia', disabled: true }]);
  await assert.rejects(helpers.chooseOfferedRingEngineeringShuttle(f.select), /genuine available Engineering Shuttle/);
  assert.ok(!f.calls.some(([name]) => name === 'selectOption'));
});

test('Ring preparation propagates missing-control timeout without an option read or selection retry', async () => {
  const f = selectFixture([], { absent: true });
  await assert.rejects(helpers.chooseOfferedRingEngineeringShuttle(f.select), /not offered/);
  assert.deepEqual(f.calls, [['waitFor', { state: 'visible', timeout: 60_000 }]]);
});
