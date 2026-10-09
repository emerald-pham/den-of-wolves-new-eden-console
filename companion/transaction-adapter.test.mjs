import test from 'node:test';
import assert from 'node:assert/strict';
import { SyntheticStore } from './transaction-adapter.mjs';
import { CastingService } from './casting.mjs';
const owner = { uid: 'synthetic-owner', workspace: 'alpha' };
const player = { uid: 'synthetic-player', workspace: 'alpha' };
const schema = { title: 'Synthetic', description: '', sections: [] };
function fixture() {
  return new SyntheticStore({ memberships: [{ ...owner, role: 'owner' }], directory: [{ ...player, eligible: true }], state: new CastingService({ memberships: [] }).exportSyntheticState() });
}
test('interrupted commit changes nothing; lost acknowledgement retries reconstruct once', async () => {
  const store = fixture();
  await assert.rejects(store.invoke(owner, 'createForm', [schema, 'attempt'], { interrupt: 'beforeCommit' }), /interrupted/);
  assert.equal((await store.invoke(owner, 'workspace', [])).forms.length, 0);
  await assert.rejects(store.invoke(owner, 'createForm', [schema, 'attempt'], { interrupt: 'afterCommit' }), /acknowledgement/);
  const restored = new SyntheticStore(store.checkpointSynthetic());
  const replay = await restored.invoke(owner, 'createForm', [schema, 'attempt']);
  assert.equal((await restored.invoke(owner, 'workspace', [])).forms[0].id, replay.id);
  assert.equal((await restored.invoke(owner, 'workspace', [])).forms.length, 1);
  await restored.removeOwnerSynthetic(owner);
  await assert.rejects(restored.invoke(owner, 'createForm', [schema, 'attempt']), /forbidden/);
  await assert.rejects(restored.invoke(owner, 'exportSyntheticState', []), /unsupported/);
});
test('concurrent instance allocation serializes to three and verified recipient removal revokes reads', async () => {
  const store = fixture();
  const template = await store.invoke(owner, 'createTemplate', [{ name: 'Pilot', details: 'Synthetic' }, 'template']);
  const results = await Promise.allSettled([1, 2, 3, 4].map(n => store.invoke(owner, 'createInstance', [template.id, { playerName: `Fixture ${n}`, characterName: 'Pilot', details: 'Synthetic secret' }, `instance-${n}`])));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  const instance = results.find(r => r.status === 'fulfilled').value;
  const form = await store.invoke(owner, 'createForm', [schema, 'form']);
  const pub = await store.invoke(owner, 'publish', [form.id, 1, 'publish']);
  const response = await store.invoke(null, 'submit', [pub.handle, 1, {}, 'random-attempt']);
  await assert.rejects(store.invoke(owner, 'assign', [response.id, instance.id, 'unknown-person', 1, 'wrong', 1]), /recipient/);
  const share = await store.invoke(owner, 'assign', [response.id, instance.id, player.uid, 1, 'assign', 1]);
  assert.equal((await store.invoke(player, 'dossier', [share.handle])).details, 'Synthetic secret');
  await store.removeRecipientSynthetic(owner, player.uid);
  await assert.rejects(store.invoke(player, 'dossier', [share.handle]), /unavailable/);
  await assert.rejects(store.invoke(owner, 'assign', [response.id, instance.id, player.uid, 1, 'assign', 1]), /recipient/);
});
test('protected directory and publication checks authorize owner before inspecting private state', async () => {
  const store = fixture(), wrong = { uid: 'foreign-owner', workspace: 'alpha' };
  await assert.rejects(store.invoke(wrong, 'assign', ['unknown-response', 'unknown-instance', 'unknown-person', 1, 'attempt', 1]), /forbidden/);
  await assert.rejects(store.invoke(wrong, 'publishDossierUpdate', ['unknown-response', 1, 1, 'attempt']), /forbidden/);
});
test('queued unpublication rejects following submission while an earlier committed response remains', async () => {
  const store = fixture(), form = await store.invoke(owner, 'createForm', [schema, 'form']);
  const pub = await store.invoke(owner, 'publish', [form.id, 1, 'publish']);
  await store.invoke(null, 'submit', [pub.handle, 1, {}, 'before']);
  const [unpublished, rejected] = await Promise.allSettled([
    store.invoke(owner, 'unpublish', [form.id, 2, 'unpublish']),
    store.invoke(null, 'submit', [pub.handle, 1, {}, 'after']),
  ]);
  assert.equal(unpublished.status, 'fulfilled'); assert.equal(rejected.status, 'rejected'); assert.match(rejected.reason.message, /unavailable/);
  assert.equal((await store.invoke(owner, 'responses', [form.id])).length, 1);
});
