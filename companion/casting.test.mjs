import test from 'node:test';
import assert from 'node:assert/strict';
import { CastingService } from './casting.mjs';

const owner = { uid: 'synthetic-owner', workspace: 'alpha' };
const recipient = { uid: 'synthetic-player', workspace: 'alpha' };
const stranger = { uid: 'foreign', workspace: 'alpha' };
const foreignOwner = { uid: owner.uid, workspace: 'beta' };
const definition = { title: 'Synthetic casting', description: 'Fixture only', sections: [{ title: 'Player', questions: [
  { id: 'name', label: 'Name', type: 'short', required: true },
  { id: 'role', label: 'Role', type: 'single', options: ['Pilot', 'Engineer'], required: true },
] }] };
function fixture() {
  const service = new CastingService({ memberships: [{ workspace: 'alpha', uid: owner.uid, role: 'owner' }] });
  const form = service.createForm(owner, definition, 'create');
  const published = service.publish(owner, form.id, form.revision, 'publish');
  return { service, form, published };
}
const answers = { name: 'Synthetic Player', role: 'Pilot' };
test('published projection hides owner metadata; draft updates preserve submitted version', () => {
  const { service, form, published } = fixture();
  assert.deepEqual(Object.keys(service.publicForm(published.handle)).sort(), ['definition', 'version']);
  const response = service.submit(published.handle, published.version, answers, 'submission');
  service.updateForm(owner, form.id, published.revision, { ...definition, title: 'Changed draft' }, 'edit');
  assert.equal(service.publicForm(published.handle).definition.title, definition.title);
  assert.equal(service.responses(owner, form.id)[0].version, response.version);
  assert.throws(() => service.responses(stranger, form.id), /forbidden/);
  assert.throws(() => service.responses(foreignOwner, form.id), /forbidden/);
});
test('validation, retry identity, stale publication and revocation are enforced', () => {
  const { service, form, published } = fixture();
  assert.throws(() => service.submit(published.handle, published.version, { name: '', role: 'Pilot' }, 'bad'), /required/);
  assert.throws(() => service.submit(published.handle, published.version, { ...answers, role: 'Secret' }, 'bad'), /choice/);
  assert.throws(() => service.submit(published.handle, published.version + 1, answers, 'bad'), /stale/);
  const first = service.submit(published.handle, published.version, answers, 'retry');
  assert.deepEqual(service.submit(published.handle, published.version, answers, 'retry'), first);
  assert.throws(() => service.submit(published.handle, published.version, { ...answers, name: 'Other' }, 'retry'), /conflict/);
  service.unpublish(owner, form.id, published.revision, 'unpublish');
  assert.throws(() => service.publicForm(published.handle), /unavailable/);
  assert.throws(() => service.submit(published.handle, published.version, answers, 'later'), /unavailable/);
  assert.equal(service.responses(owner, form.id).length, 1);
  assert.throws(() => service.publish(owner, form.id, published.revision, 'stale'), /stale/);
});
test('three instances have independent identity; retries cannot allocate a fourth', () => {
  const { service } = fixture();
  const template = service.createTemplate(owner, { name: 'Synthetic pilot', details: 'New fixture' }, 'template');
  const instances = [1, 2, 3].map(n => service.createInstance(owner, template.id, { playerName: `Player ${n}`, characterName: 'Pilot', details: 'Custom' }, `instance-${n}`));
  assert.equal(new Set(instances.map(x => x.id)).size, 3);
  assert.deepEqual(service.createInstance(owner, template.id, { playerName: 'Player 1', characterName: 'Pilot', details: 'Custom' }, 'instance-1'), instances[0]);
  assert.throws(() => service.createInstance(owner, template.id, { playerName: 'Fourth', characterName: 'Pilot', details: '' }, 'fourth'), /limit/);
  service.updateInstance(owner, instances[0].id, 1, { playerName: 'Renamed', characterName: 'Changed', details: 'Updated' }, 'rename');
  assert.equal(service.instance(owner, instances[1].id).playerName, 'Player 2');
  assert.throws(() => service.updateInstance(owner, instances[0].id, 1, { playerName: 'Stale', characterName: 'Pilot', details: '' }, 'stale'), /stale/);
});
test('explicit assignment binds recipient, reassign revokes old handle, update and revoke are live', () => {
  const { service, form, published } = fixture();
  const response = service.submit(published.handle, 1, answers, 'response');
  const template = service.createTemplate(owner, { name: 'Pilot', details: 'Synthetic' }, 'template');
  const a = service.createInstance(owner, template.id, { playerName: 'One', characterName: 'Pilot', details: 'Secret A' }, 'a');
  const b = service.createInstance(owner, template.id, { playerName: 'Two', characterName: 'Pilot', details: 'Secret B' }, 'b');
  const share = service.assign(owner, response.id, a.id, recipient.uid, 1, 'assign', 1);
  assert.deepEqual(service.assign(owner, response.id, a.id, recipient.uid, 1, 'assign', 1), share);
  assert.equal(service.dossier(recipient, share.handle).details, 'Secret A');
  assert.throws(() => service.dossier(stranger, share.handle), /unavailable/);
  assert.throws(() => service.dossier({ ...recipient, workspace: 'beta' }, share.handle), /unavailable/);
  service.updateInstance(owner, a.id, 1, { playerName: 'One', characterName: 'Pilot', details: 'Changed' }, 'update');
  assert.equal(service.dossier(recipient, share.handle).details, 'Secret A');
  service.publishDossierUpdate(owner, response.id, 2, 2, 'publish-update', a.id);
  assert.equal(service.dossier(recipient, share.handle).details, 'Changed');
  const next = service.assign(owner, response.id, b.id, recipient.uid, 3, 'reassign', 1);
  assert.throws(() => service.dossier(recipient, share.handle), /unavailable/);
  assert.equal(service.dossier(recipient, next.handle).details, 'Secret B');
  assert.equal(service.responses(owner, form.id)[0].instanceId, b.id);
  service.revoke(owner, response.id, 4, 'revoke');
  assert.throws(() => service.dossier(recipient, next.handle), /unavailable/);
  assert.throws(() => service.assign(stranger, response.id, a.id, stranger.uid, 5, 'steal', 1), /forbidden/);
});

test('sharing rejects a dossier changed since owner preview', () => {
  const { service, published } = fixture();
  const response = service.submit(published.handle, 1, answers, 'response');
  const template = service.createTemplate(owner, { name: 'Pilot', details: 'Synthetic' }, 'template');
  const instance = service.createInstance(owner, template.id, { playerName: 'One', characterName: 'Pilot', details: 'Previewed' }, 'instance');
  service.updateInstance(owner, instance.id, 1, { playerName: 'One', characterName: 'Pilot', details: 'Unseen change' }, 'edit');
  assert.throws(() => service.assign(owner, response.id, instance.id, recipient.uid, 1, 'assign', 1), /stale/);
});
test('aggregate response size is bounded despite individually valid answers', () => {
  const { service } = fixture();
  const large = { title: 'Synthetic', description: '', sections: Array.from({ length: 4 }, (_, s) => ({ title: 'Section', questions: Array.from({ length: 50 }, (_, q) => ({ id: `q${s}-${q}`, label: 'Text', type: 'long', required: true })) })) };
  const form = service.createForm(owner, large, 'large');
  const published = service.publish(owner, form.id, 1, 'publish-large');
  const oversized = Object.fromEntries(large.sections.flatMap(s => s.questions).map(q => [q.id, 'x'.repeat(10000)]));
  assert.throws(() => service.submit(published.handle, 1, oversized, 'oversized'), /size/);
});

test('response access is owner-only even when a synthetic admin membership exists', () => {
  const service = new CastingService({ memberships: [{ workspace: 'alpha', uid: stranger.uid, role: 'admin' }] });
  assert.throws(() => service.createForm(stranger, definition, 'create'), /forbidden/);
});
test('synthetic state reconstructs committed receipts and protects retries after lost acknowledgement', () => {
  const { service, published } = fixture();
  const first = service.submit(published.handle, 1, answers, 'stable-attempt');
  const restored = new CastingService({ memberships: [{ workspace: 'alpha', uid: owner.uid, role: 'owner' }], state: service.exportSyntheticState() });
  assert.deepEqual(restored.submit(published.handle, 1, answers, 'stable-attempt'), first);
});

test('publishing an update binds the exact instance identity as well as revision', () => {
  const { service, published } = fixture(); const response = service.submit(published.handle, 1, answers, 'response');
  const template = service.createTemplate(owner, { name: 'Pilot', details: 'Synthetic' }, 'template');
  const details = { playerName: 'Fixture', characterName: 'Pilot', details: 'Synthetic' };
  const a = service.createInstance(owner, template.id, details, 'a'), b = service.createInstance(owner, template.id, details, 'b');
  service.assign(owner, response.id, a.id, recipient.uid, 1, 'assign', 1);
  assert.throws(() => service.publishDossierUpdate(owner, response.id, 2, 1, 'wrong-instance', b.id), /instance mismatch/);
});
test('response CSV is owner-only and neutralizes participant formula prefixes', () => {
  const { service, published, form } = fixture(); service.submit(published.handle, 1, { ...answers, name: '=HYPERLINK("https://synthetic.invalid")' }, 'export-response');
  const csv = service.exportResponses(owner, form.id); assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes('response_id'));
  assert.throws(() => service.exportResponses(stranger, form.id), /forbidden/);
});
