import test from 'node:test';
import assert from 'node:assert/strict';

async function selector() {
  return (await import('./pc10-base-range-target-controls.mjs')).selectBaseRangeTargetControls;
}
function fixture({ counts = [1, 1, 1], sources = ['aegis-alpha-wing', 'aegis-alpha-wing', 'aegis-alpha-wing'] } = {}) {
  const view = { choiceStatus: 'targets-required', range: 'short-range',
    contacts: ['one', 'two'].map(contactId => ({ contactId, available: true, requiredCoverageDamage: null })),
    eligibleActions: sources.map((sourceId, index) => ({ sourceId, actionId: `action-${index}` })),
    hitSlots: counts.map((count, index) => ({ actionId: `action-${index}`, count, damagePerHit: 1 })),
  };
  const selections = [], controls = [];
  const names = { 'aegis-alpha-wing': 'Alpha Fighter Wing', 'aegis-missile-launchers': 'Missile launchers' };
  for (let action = 0; action < counts.length; action++) {
    for (let hit = 0; hit < Math.min(counts[action], 2); hit++) {
      const index = controls.length;
      const control = { label: `${names[sources[action]]} hit ${hit + 1}`, visible: true, enabled: true,
        options: ['one', 'two'], isVisible: async () => control.visible, isEnabled: async () => control.enabled,
        getAttribute: async name => { assert.equal(name, 'aria-label'); return control.label; },
        locator: kind => { assert.equal(kind, 'option'); return { evaluateAll: async () => control.options }; },
        selectOption: async value => { selections.push({ index, actionId: `action-${action}`, value }); },
      };
      controls.push(control);
    }
  }
  const panel = { getByRole: role => { assert.equal(role, 'combobox'); return { all: async () => controls }; } };
  return { panel, view, controls, selections, now: () => 0, deadlineAt: 60_000, checkpoint: async () => undefined };
}

test('three actual repeated Alpha hit labels select three distinct rendered fields in current source slot order', async () => {
  const f = fixture(), select = await selector();
  const assignments = await select(f);
  assert.equal(new Set(f.controls.map(control => control.label)).size, 1);
  assert.deepEqual(f.selections.map(row => row.index), [0, 1, 2]);
  assert.deepEqual(f.selections.map(row => row.actionId), assignments.map(row => row.actionId));
});

test('mixed source slots preserve each source hit label, target count and per-action target uniqueness', async () => {
  const f = fixture({ counts: [2, 1], sources: ['aegis-missile-launchers', 'aegis-alpha-wing'] });
  const assignments = await (await selector())(f);
  assert.deepEqual(f.selections.map(row => row.value), assignments.flatMap(row => row.contactIds));
  assert.deepEqual(f.selections.map(row => row.index), [0, 1, 2]);
  assert.equal(new Set(assignments[0].contactIds).size, 2);
});

test('extra or missing rendered target fields fail before any target selection', async () => {
  const select = await selector();
  for (const change of ['extra', 'missing']) {
    const f = fixture();
    if (change === 'extra') f.controls.push(f.controls[0]); else f.controls.pop();
    await assert.rejects(select(f), /rendered target field count/);
    assert.equal(f.selections.length, 0);
  }
});

test('a wrong source label, disabled field or unavailable desired contact cannot select a different field or target', async () => {
  const select = await selector();
  for (const change of ['label', 'disabled', 'contact']) {
    const f = fixture();
    if (change === 'label') f.controls[0].label = 'Bravo Fighter Wing hit 1';
    if (change === 'disabled') f.controls[0].enabled = false;
    if (change === 'contact') f.controls[0].options = ['foreign'];
    await assert.rejects(select(f));
    assert.equal(f.selections.length, 0);
  }
});

test('changed original authority prevents even the first transient target selection', async () => {
  const f = fixture(); f.checkpoint = async () => { throw new Error('original authority changed'); };
  await assert.rejects((await selector())(f), /original authority changed/);
  assert.equal(f.selections.length, 0);
});

test('source target selection retains the existing decision deadline', async () => {
  const f = fixture(); f.now = () => 60_000;
  await assert.rejects((await selector())(f), /decision deadline/);
  assert.equal(f.selections.length, 0);
});
