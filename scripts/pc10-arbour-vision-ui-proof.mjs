import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { observeLifecycleActor } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { assertOriginalActor, assertLateReplyAuthority } from './pc10-member-gm-lifecycle-contracts.mjs';

const TEXT = 'Training exercise // facilitator call; no new location is selected.';
const KIND = 'danger';
const FIELDS = ['sessionId', 'recipientUid', 'revision', 'kind', 'text', 'label'];
const hash = value => typeof value === 'string' ? createHash('sha256').update(value).digest('hex').slice(0, 16) : null;

function assertProjection(value, sessionId) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...FIELDS].sort());
  assert.equal(value.sessionId, sessionId); assert.ok(typeof value.recipientUid === 'string' && value.recipientUid);
  assert.ok(Number.isSafeInteger(value.revision) && value.revision >= 1);
  assert.ok(['location', 'danger', 'suspicion'].includes(value.kind));
  assert.ok(typeof value.text === 'string' && value.text.trim() && value.text.length <= 240);
  assert.equal(value.label, 'FACILITATOR CALL');
}

const projectionOf = receipt => Object.fromEntries(FIELDS.map(key => [key, receipt[key]]));

async function readSource(surface) {
  return surface.page.evaluate(async moduleUrl => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(moduleUrl);
    const state = useSessionStore.getState(), user = auth().currentUser;
    return { authUid: user?.uid, playerUid: state.me?.uid, playerSessionId: state.me?.sessionId,
      connected: state.me?.connected, documentTimeOrigin: performance.timeOrigin,
      census: state.gmLoyaltyCensus, currentCallPresent: Object.hasOwn(state, 'gmArbourVision'),
      currentCall: state.gmArbourVision, recipientCall: state.arbourVision, privateKind: state.privateLoyalty?.kind };
  }, surface.storeModuleUrl());
}

async function assertMounted(control, writable = false) {
  assert.equal(await control.count(), 1); assert.equal(await control.isVisible(), true);
  if (writable) assert.equal(await control.isEnabled(), true);
}

/** Bind one normal private call to the original facilitator and its exact
 * captured seven-field server receipt. Raw identities/text stay in memory.
 */
export async function authorArbourVisionUi({ gm, initial, started, roster }) {
  const deadlineAt = Date.now() + 60_000;
  const remaining = maximum => {
    assert.ok(Date.now() < deadlineAt, 'The original Arbour authoring deadline is exhausted.');
    return Math.max(1, Math.min(maximum, deadlineAt - Date.now()));
  };
  const original = await observeLifecycleActor(gm, initial.sessionId);
  assertOriginalActor(original, original, { gm: true });
  assert.equal(original.uidHash, initial.uidHash); assert.equal(original.uidHash, started.uidHash);
  assert.equal(original.instanceId, started.instanceId);
  assert.ok(typeof original.claimedAt === 'string' && Number.isFinite(Date.parse(original.claimedAt)));
  assert.ok(Number.isSafeInteger(original.hydrationRevision) && original.hydrationRevision >= 1);
  assert.ok(Number.isFinite(started.documentTimeOrigin) && started.documentTimeOrigin > 0);
  assert.equal(started.documentTimeOrigin, initial.documentTimeOrigin);
  async function hold() {
    remaining(60_000);
    const actor = await observeLifecycleActor(gm, initial.sessionId);
    assertLateReplyAuthority(original, actor);
    assert.equal(actor.cycle, 1); assert.equal(actor.phase, 'active');
    assert.deepEqual(actor.fullGameDemo, { status: 'active', progression: 'manual' });
    assert.equal(actor.phaseProgression, 'manual');
    assert.equal(new URL(gm.page.url()).hash, '#/gm');
    const source = await readSource(gm);
    assert.equal(hash(source.authUid), original.uidHash); assert.equal(source.playerUid, source.authUid);
    assert.equal(source.playerSessionId, initial.sessionId); assert.notEqual(source.connected, false);
    assert.equal(source.documentTimeOrigin, started.documentTimeOrigin);
    assertLateReplyAuthority(original, await observeLifecycleActor(gm, initial.sessionId));
    remaining(60_000); return source;
  }
  const before = await hold();
  assert.equal(before.currentCallPresent, true, 'Read the actual current GM projection; absence of a property is not revision zero.');
  if (before.currentCall !== null) assertProjection(before.currentCall, initial.sessionId);
  assert.ok(before.census && Number.isSafeInteger(before.census.revision) && before.census.revision >= 1);
  assert.ok(Array.isArray(before.census.entries));
  const holders = before.census.entries.filter(entry => entry.kind === 'universal-arbour');
  assert.equal(holders.length, 1); const targetUid = holders[0].uid;
  assert.ok(typeof targetUid === 'string' && targetUid);
  // The unchanged optional plan assigns Arbour to the first core roster actor.
  const originalHolder = roster.find(actor => actor.roleId !== 'press-officer');
  assert.ok(originalHolder); assert.equal(hash(targetUid), originalHolder.uidHash);
  const form = gm.page.getByRole('region', { name: 'Universal Arbour facilitator call', exact: true });
  await form.waitFor({ state: 'visible', timeout: remaining(35_000) });
  await hold(); await assertMounted(form);
  const recipient = form.locator('#arbour-vision-recipient'), kind = form.locator('#arbour-vision-kind');
  const text = form.locator('#arbour-vision-text');
  for (const input of [recipient, kind, text]) await assertMounted(input, true);
  assert.equal(await recipient.inputValue(), targetUid);
  await kind.selectOption(KIND, { timeout: remaining(35_000) }); await hold();
  await text.fill(TEXT, { timeout: remaining(35_000) }); await hold();
  const publish = form.getByRole('button', { name: 'Publish private call', exact: true });
  async function readyToClick() {
    const current = await hold();
    assert.deepEqual(current.currentCall, before.currentCall, 'The source revision cannot change during input.');
    assert.deepEqual(current.census, before.census, 'The entitled holder cannot change during input.');
    await assertMounted(form);
    for (const input of [recipient, kind, text]) await assertMounted(input, true);
    assert.equal(await recipient.inputValue(), targetUid); assert.equal(await kind.inputValue(), KIND);
    assert.equal(await text.inputValue(), TEXT); await assertMounted(publish, true);
  }
  const response = await observeUiReceipt({
    waitForResponse: () => gm.page.waitForResponse(response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/us-central1/authorArbourVision'), { timeout: remaining(60_000) }),
    choose: async () => { await readyToClick(); await publish.click({ timeout: remaining(35_000) }); },
  });
  await hold(); assert.equal(response.status(), 200);
  const data = response.request().postDataJSON()?.data, body = await response.json();
  assert.ok(data && typeof data === 'object' && !Array.isArray(data));
  assert.deepEqual(Object.keys(data).sort(), ['sessionId', 'instanceId', 'requestId', 'expectedRevision', 'targetUid', 'kind', 'text'].sort());
  assert.equal(data.sessionId, initial.sessionId); assert.equal(data.instanceId, original.instanceId);
  assert.equal(data.targetUid, targetUid); assert.equal(data.kind, KIND); assert.equal(data.text, TEXT);
  assert.ok(typeof data.requestId === 'string' && data.requestId.length <= 128 && /^[A-Za-z0-9_-]+$/.test(data.requestId));
  assert.ok(Number.isSafeInteger(data.expectedRevision) && data.expectedRevision >= 0);
  // Explicit null is the source adapter's absent-current-call branch, not a
  // missing or malformed projection fallback. Present revisions are preserved.
  assert.equal(data.expectedRevision, before.currentCall === null ? 0 : before.currentCall.revision);
  assert.ok(body && typeof body === 'object' && !body.error && Object.hasOwn(body, 'result'));
  const receipt = body.result;
  assert.ok(receipt && typeof receipt === 'object' && !Array.isArray(receipt));
  assert.deepEqual(Object.keys(receipt).sort(), ['status', ...FIELDS].sort());
  assert.equal(receipt.status, 'committed'); assertProjection(projectionOf(receipt), initial.sessionId);
  assert.equal(receipt.recipientUid, data.targetUid); assert.equal(receipt.kind, data.kind); assert.equal(receipt.text, data.text);
  assert.equal(receipt.revision, data.expectedRevision + 1);
  await form.getByRole('status').filter({ hasText: 'FACILITATOR CALL' }).waitFor({ state: 'visible', timeout: remaining(35_000) });
  assert.deepEqual((await hold()).currentCall, projectionOf(receipt));
  const replay = await gm.callable('authorArbourVision', data);
  assert.equal(replay.status, 'committed'); assert.deepEqual(replay.result, receipt,
    'The unchanged handler returns the stored seven-field committed receipt for exact replay.');
  assert.deepEqual((await hold()).currentCall, projectionOf(receipt));
  return { receipt, evidence: { actualUiRequestAndReplyCaptured: true, fullPublishedDtoBound: true,
    exactOriginalSdkReplay: true, originalGmClaimDocumentAndAudienceHeld: true, currentGmProjectionBound: true,
    privateTextOrIdentityRecorded: false } };
}

/** The already-required normal entitled actor read must be this published call. */
export async function assertArbourRecipientReceipt({ crew, actor, sessionId, receipt }) {
  assert.ok(receipt && receipt.status === 'committed'); assertProjection(projectionOf(receipt), sessionId);
  const original = await observeLifecycleActor(crew, sessionId);
  assertOriginalActor(original, original); assert.equal(original.uidHash, actor.uidHash);
  assert.equal(original.playerRole, 'player'); assert.equal(original.profileRoleId, actor.roleId);
  assert.ok(Number.isSafeInteger(original.hydrationRevision) && original.hydrationRevision >= 1);
  assert.equal(original.cycle, 1); assert.equal(original.phase, 'active');
  const source = await readSource(crew);
  assert.equal(hash(source.authUid), actor.uidHash); assert.equal(source.authUid, receipt.recipientUid);
  assert.equal(source.playerUid, source.authUid); assert.equal(source.playerSessionId, sessionId);
  assert.notEqual(source.connected, false); assert.equal(source.privateKind, 'universal-arbour');
  assert.ok(Number.isFinite(source.documentTimeOrigin) && source.documentTimeOrigin > 0);
  assertProjection(source.recipientCall, sessionId); assert.deepEqual(source.recipientCall, projectionOf(receipt));
  assertLateReplyAuthority(original, await observeLifecycleActor(crew, sessionId));
  assert.equal((await readSource(crew)).documentTimeOrigin, source.documentTimeOrigin);
  return true;
}
