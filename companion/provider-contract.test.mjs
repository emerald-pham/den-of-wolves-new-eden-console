import test from 'node:test';
import assert from 'node:assert/strict';
import { CastingService } from './casting.mjs';
import { SyntheticStore } from './transaction-adapter.mjs';
import { createCastingGateway } from './provider-contract.mjs';
const owner = { uid: 'synthetic-owner', workspace: 'alpha' }, player = { uid: 'synthetic-player', workspace: 'alpha' };
const schema = { title: 'Synthetic', description: '', sections: [{ title: 'Player', questions: [{ id: 'name', label: 'Name', type: 'short', required: true }] }] };
function fixture(overrides = {}) {
  const store = new SyntheticStore({ memberships: [{ ...owner, role: 'owner' }, { uid: 'synthetic-beta-owner', workspace: 'beta', role: 'owner' }], directory: [{ ...player, eligible: true }], state: new CastingService({ memberships: [] }).exportSyntheticState() });
  let directoryCalls = 0;
  const identities = { owner: { uid: owner.uid, durable: true, verified: true }, player: { uid: player.uid, durable: true, verified: true }, beta: { uid: 'synthetic-beta-owner', durable: true, verified: true }, anonymous: { uid: owner.uid, durable: false, verified: false }, disabled: { uid: owner.uid, durable: true, verified: true, disabled: true } };
  const gateway = createCastingGateway({ store,
    verifyContext: async context => ({ appVerified: context?.appVerified === true, identity: identities[context?.fixtureIdentity] ?? null }),
    resolveRecipient: async (workspace, entryId) => { directoryCalls++; return workspace === 'alpha' && entryId === 'synthetic-directory-entry' ? player.uid : null; },
    verifySubmissionAttempt: async ({ context, attempt }) => context?.fixtureAttemptVerified ? { nonce: attempt, scope: context.fixtureRespondent } : null,
    ...overrides,
  });
  const call = (operation, payload, identity = 'owner', extra = {}) => gateway.handle({ operation, payload, context: { fixtureIdentity: identity, appVerified: true, ...extra } });
  return { store, call, directoryCalls: () => directoryCalls };
}
test('verified server identity owns authority; payload cannot choose actor or inherit anonymous/game roles', async () => {
  const f = fixture();
  await assert.rejects(f.call('createForm', { workspace: 'alpha', definition: schema, attempt: 'create' }, 'anonymous'), { code: 'unauthenticated' });
  await assert.rejects(f.call('workspace', { workspace: 'alpha' }, 'disabled'), { code: 'unauthenticated' });
  await assert.rejects(f.call('workspace', { workspace: 'alpha', uid: owner.uid }, 'beta'), { code: 'invalid-argument' });
  await assert.rejects(f.call('workspace', { workspace: 'alpha' }, 'beta'), { code: 'permission-denied' });
  await assert.rejects(f.call('workspace', { workspace: 'alpha' }, 'owner', { appVerified: false }), { code: 'failed-precondition' });
  const created = await f.call('createForm', { workspace: 'alpha', definition: schema, attempt: 'create' });
  assert.ok(created.id); await f.store.removeOwnerSynthetic(owner);
  await assert.rejects(f.call('createForm', { workspace: 'alpha', definition: schema, attempt: 'create' }), { code: 'permission-denied' });
});
test('public projection and verified attempt scopes cannot expose private responses or collide between respondents', async () => {
  const f = fixture(); const form = await f.call('createForm', { workspace: 'alpha', definition: schema, attempt: 'create' });
  const pub = await f.call('publish', { workspace: 'alpha', formId: form.id, expectedRevision: 1, attempt: 'publish' });
  const projection = await f.call('publicForm', { handle: pub.handle }, null);
  assert.deepEqual(Object.keys(projection).sort(), ['definition', 'version']);
  const payload = { handle: pub.handle, version: 1, answers: { name: 'Synthetic' }, attempt: 'a'.repeat(32) };
  await assert.rejects(f.call('submit', payload, null), { code: 'invalid-argument' });
  const a = await f.call('submit', payload, null, { fixtureAttemptVerified: true, fixtureRespondent: 'a' });
  const b = await f.call('submit', payload, null, { fixtureAttemptVerified: true, fixtureRespondent: 'b' });
  assert.notEqual(a.id, b.id);
  assert.deepEqual(await f.call('submit', payload, null, { fixtureAttemptVerified: true, fixtureRespondent: 'a' }), a);
  await assert.rejects(f.call('responses', { workspace: 'alpha', formId: form.id }, 'player'), { code: 'permission-denied' });
  await assert.rejects(f.call('exportSyntheticState', {}), { code: 'invalid-argument' });
});
test('verified directory resolution occurs only after ownership; oversized and unsafe envelopes reject', async () => {
  const f = fixture();
  const assignment = { workspace: 'alpha', responseId: 'synthetic-response', instanceId: 'synthetic-instance', recipientId: 'synthetic-directory-entry', expectedResponseRevision: 1, expectedInstanceRevision: 1, attempt: 'assign' };
  await assert.rejects(f.call('assign', assignment, 'beta'), { code: 'permission-denied' }); assert.equal(f.directoryCalls(), 0);
  await assert.rejects(f.call('createForm', { workspace: 'alpha', definition: { ...schema, description: 'x'.repeat(300000) }, attempt: 'large' }), { code: 'invalid-argument' });
  await assert.rejects(f.call('publish', { workspace: 'alpha', formId: 'synthetic-form', expectedRevision: 0, attempt: 'invalid' }), { code: 'invalid-argument' });
});
test('provider assignment publication revoke and directory removal never restore old recipient access', async () => {
  const f = fixture(), form = await f.call('createForm', { workspace: 'alpha', definition: schema, attempt: 'form' });
  const pub = await f.call('publish', { workspace: 'alpha', formId: form.id, expectedRevision: 1, attempt: 'publish' });
  const response = await f.call('submit', { handle: pub.handle, version: 1, answers: { name: 'Synthetic' }, attempt: 'b'.repeat(32) }, null, { fixtureAttemptVerified: true, fixtureRespondent: 'recipient-fixture' });
  const template = await f.call('createTemplate', { workspace: 'alpha', template: { name: 'Pilot', details: 'Synthetic' }, attempt: 'template' });
  const instance = await f.call('createInstance', { workspace: 'alpha', templateId: template.id, details: { playerName: 'Synthetic', characterName: 'Pilot', details: 'Private draft one' }, attempt: 'instance' });
  const assignment = { workspace: 'alpha', responseId: response.id, instanceId: instance.id, recipientId: 'synthetic-directory-entry', expectedResponseRevision: 1, expectedInstanceRevision: 1, attempt: 'assign' };
  const share = await f.call('assign', assignment);
  assert.deepEqual(Object.keys(await f.call('dossier', { workspace: 'alpha', handle: share.handle }, 'player')).sort(), ['characterName', 'details', 'playerName', 'revision']);
  await assert.rejects(f.call('dossier', { workspace: 'alpha', handle: share.handle }, 'beta'), { code: 'not-found' });
  await f.call('updateInstance', { workspace: 'alpha', instanceId: instance.id, expectedRevision: 1, details: { playerName: 'Synthetic', characterName: 'Pilot', details: 'Private draft two' }, attempt: 'edit' });
  assert.equal((await f.call('dossier', { workspace: 'alpha', handle: share.handle }, 'player')).details, 'Private draft one');
  await f.call('publishDossierUpdate', { workspace: 'alpha', responseId: response.id, expectedResponseRevision: 2, expectedInstanceRevision: 2, expectedInstanceId: instance.id, attempt: 'update' });
  assert.equal((await f.call('dossier', { workspace: 'alpha', handle: share.handle }, 'player')).details, 'Private draft two');
  await f.call('revoke', { workspace: 'alpha', responseId: response.id, expectedResponseRevision: 3, attempt: 'revoke' });
  assert.deepEqual(await f.call('assign', assignment), share);
  await assert.rejects(f.call('dossier', { workspace: 'alpha', handle: share.handle }, 'player'), { code: 'not-found' });
  await f.store.removeRecipientSynthetic(owner, player.uid);
  await assert.rejects(f.call('assign', assignment), { code: 'not-found' });
});
test('unexpected provider failures cannot echo arbitrary private error codes', async () => {
  const gateway = createCastingGateway({ store: fixture().store, verifyContext: async () => { throw Object.assign(new Error('synthetic-private-message'), { code: 'synthetic-private-code' }); } });
  await assert.rejects(gateway.handle({ operation: 'workspace', payload: { workspace: 'alpha' }, context: {} }), { code: 'internal' });
});
test('recognized revoked identity errors normalize to the UI clearing contract', async () => {
  const gateway = createCastingGateway({ store: fixture().store, verifyContext: async () => { throw Object.assign(new Error('synthetic revoked token'), { code: 'auth/id-token-revoked' }); } });
  await assert.rejects(gateway.handle({ operation: 'workspace', payload: { workspace: 'alpha' }, context: {} }), { code: 'unauthenticated' });
});
test('owner removed during asynchronous directory resolution cannot commit a grant', async () => {
  const f = fixture({ resolveRecipient: async () => { await f.store.removeOwnerSynthetic(owner); return player.uid; } });
  const form = await f.store.invoke(owner, 'createForm', [schema, 'form']), pub = await f.store.invoke(owner, 'publish', [form.id, 1, 'publish']);
  const response = await f.store.invoke(null, 'submit', [pub.handle, 1, { name: 'Synthetic' }, 'response']);
  const template = await f.store.invoke(owner, 'createTemplate', [{ name: 'Pilot', details: 'Synthetic' }, 'template']);
  const instance = await f.store.invoke(owner, 'createInstance', [template.id, { playerName: 'Synthetic', characterName: 'Pilot', details: 'Synthetic' }, 'instance']);
  await assert.rejects(f.call('assign', { workspace: 'alpha', responseId: response.id, instanceId: instance.id, recipientId: 'synthetic-directory-entry', expectedResponseRevision: 1, expectedInstanceRevision: 1, attempt: 'race' }), { code: 'permission-denied' });
  assert.equal(f.store.checkpointSynthetic().state.shares.length, 0);
});
