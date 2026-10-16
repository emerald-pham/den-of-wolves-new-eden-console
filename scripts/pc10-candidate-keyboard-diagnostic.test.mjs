import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { receptionFixture } from './pc10-candidate-manual-ui-proof.reception.test.mjs';
import { candidateGameplayTools, candidateGeometrySnapshot } from './pc10-candidate-manual-ui-proof.mjs';

// Public callback diagnostic contract only. The existing whole-source React
// fixture supplies the actual component/projection/readiness. Its native focus
// stream is deliberately modeled, not a reproduction of Panel6 or Chrome.
// Actual Chrome/source behavior is checked separately by the existing harness.
async function fixture(t, mode = 'missing') {
  const f = await receptionFixture({ initialNetworkMs: 0, initialComponentMs: 2,
    refreshNetworkMs: 0, refreshComponentMs: 2 });
  t.after(f.dispose); await f.received();
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-keyboard-ledger-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const evaluate = f.panel.evaluate;
  let presses = 0, totalPresses = 0;
  const observed = [], initialKeys = [];
  f.surface.page.setViewportSize = async () => { presses = 0; };
  f.surface.page.keyboard.press = async key => {
    assert.equal(key, 'Tab'); presses++; totalPresses++;
    if (mode === 'actor-loss' && presses === 2) f.store.me.uid = 'foreign-source';
    if (mode === 'target-drift' && presses === 2)
      f.window.document.querySelector('fieldset label').lastChild.textContent = 'Changed research track';
  };
  f.panel.evaluate = async callback => {
    const snapshot = await evaluate(callback);
    if (callback !== candidateGeometrySnapshot) return snapshot;
    if (!initialKeys.length) initialKeys.push(...snapshot.tabStopKeys);
    // The outside-document count and post-Tab focus stream are declared models.
    // No focus(), extra page/DOM read, timer replacement or proof budget change.
    snapshot.documentTabStopCount = presses === 5 ? 49 : 47;
    snapshot.activeTargetKey = presses === 0 ? snapshot.tabStopKeys.at(-1) :
      mode === 'all' ? snapshot.tabStopKeys[(presses - 1) % snapshot.tabStopKeys.length] :
        presses % 7 === 0 ? null : snapshot.tabStopKeys[(presses - 1) % (snapshot.tabStopKeys.length - 1)];
    observed.push({ presses, documentTabStopCount: snapshot.documentTabStopCount,
      activeTargetKey: snapshot.activeTargetKey });
    return snapshot;
  };
  const tools = candidateGameplayTools({ gm: f.surface, crew: f.surface, directory,
    initial: { sessionId: f.store.session.id, joinCode: 'source-join' },
    roster: [{ roleId: 'shepherd-scientist', uidHash: 'source-original-hash' }],
    projectId: 'demo-pc10-source-reception', ports: { functions: 5011 } });
  return { f, directory, initialKeys, observed, totalPresses: () => totalPresses,
    run: () => tools.candidateGeometry(f.surface, 'N', 'research-choice') };
}

test('public failed geometry retains the original missing identity and bounded existing focus/count samples without initial credit', async t => {
  const f = await fixture(t);
  await assert.rejects(f.run(), /Actual candidate choices must fit and be keyboard reachable/);
  const raw = await readFile(resolve(f.directory, 'N-research-choice-geometry-uncredited.json'), 'utf8');
  if (process.env.PC10_CANDIDATE_KEYBOARD_NATIVE_EVIDENCE) {
    await mkdir(process.env.PC10_CANDIDATE_KEYBOARD_NATIVE_EVIDENCE, { recursive: true });
    await writeFile(resolve(process.env.PC10_CANDIDATE_KEYBOARD_NATIVE_EVIDENCE, 'public-uncredited-ledger.json'), raw);
  }
  const failure = JSON.parse(raw);
  assert.equal(failure.status, 'failed-uncredited');
  assert.equal(f.totalPresses(), 144, 'Exactly the unchanged48Tab cap at each of the three viewports.');
  for (const viewport of failure.viewports) {
    assert.equal(viewport.keyboardTraversal.intendedTargetCount, 6);
    assert.equal(viewport.keyboardTraversal.reachedTargetCount, 5);
    assert.equal(viewport.keyboardTraversal.tabPressLimit, 48);
    assert.equal(viewport.keyboardTraversal.tabPresses, 48);
    assert.equal(viewport.keyboardTraversal.allEnabledTargetsReached, false);
    const diagnostic = viewport.keyboardDiagnostic;
    assert.ok(diagnostic, 'Already-existing sampled keys/focus/counts must survive the uncredited catch.');
    assert.equal(diagnostic.targets.length, 6);
    diagnostic.targets.forEach((target, ordinal) => {
      const key = f.initialKeys[ordinal], [tag, type] = key.split('|');
      assert.deepEqual(target, { ordinal, tag, type, keySha256: createHash('sha256').update(key).digest('hex') });
    });
    assert.deepEqual(diagnostic.initial, { activeTargetOrdinal: 5, documentTabStopCount: 47 });
    assert.deepEqual(diagnostic.visitedTargetOrdinals, [0, 1, 2, 3, 4]);
    assert.deepEqual(diagnostic.missingTargetOrdinals, [5], 'The initial focused target cannot receive native Tab credit.');
    assert.equal(diagnostic.pressTrace.length, 48);
    diagnostic.pressTrace.forEach((entry, index) => assert.deepEqual(entry, {
      pressOrdinal: index + 1, activeTargetOrdinal: (index + 1) % 7 === 0 ? null : index % 5,
      documentTabStopCount: index === 4 ? 49 : 47,
    }));
    assert.equal(diagnostic.afterTraversal.sourceCheckpointAccepted, true);
    assert.equal(diagnostic.afterScreenshot.sourceCheckpointAccepted, true);
  }
  assert.equal(raw.includes('source-scientist'), false);
  assert.equal(raw.includes('source-reception-session'), false);
  assert.equal(raw.includes('source-join'), false);
  assert.equal(raw.includes('Refresh candidate operations'), false, 'No raw target label is retained.');
  assert.equal(raw.includes('Reactor'), false);
  assert.equal((await readdir(f.directory)).some(name => name.endsWith('-geometry.json')), false);
});

test('public complete traversal remains accepted without publishing the failure-only ledger', async t => {
  const f = await fixture(t, 'all');
  await f.run();
  const values = JSON.parse(await readFile(resolve(f.directory, 'N-research-choice-geometry.json'), 'utf8'));
  assert.equal(f.totalPresses(), 18);
  assert.equal(values.length, 3);
  for (const value of values) {
    assert.equal(value.keyboardTraversal.allEnabledTargetsReached, true);
    assert.equal(Object.hasOwn(value, 'keyboardDiagnostic'), false);
  }
  assert.equal((await readdir(f.directory)).some(name => name.includes('uncredited')), false);
});

test('original actor loss still fails the existing source guard before any completed viewport ledger', async t => {
  const f = await fixture(t, 'actor-loss');
  await assert.rejects(f.run(), /original actor uidHash changed/);
  assert.equal(f.totalPresses(), 48, 'No retry, additional Tab or deadline reset is introduced.');
  assert.deepEqual(await readdir(f.directory), [], 'Unobserved accepted checkpoints cannot be fabricated.');
});

test('changed semantic target set still fails immediately without skipping the target or adding a Tab', async t => {
  const f = await fixture(t, 'target-drift');
  await assert.rejects(f.run(), /current enabled panel tab stops must stay stable/);
  assert.equal(f.totalPresses(), 2);
  assert.deepEqual(await readdir(f.directory), []);
});
