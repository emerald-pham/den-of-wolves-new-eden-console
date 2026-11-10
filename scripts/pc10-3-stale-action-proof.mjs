// PC10.3 T1 stale-action proof helpers (#102: T1.1 #250, T1.2 #251; prompt P620).
//
// Reusable, side-effect-free module. It races ordinary authenticated Firebase
// Web SDK clients (Auth anonymous sign-in, callable `httpsCallable`, rules-
// enforced Firestore listeners) against the compiled production callables on
// the local Auth/Functions/Firestore emulators of this worktree's claimed row.
//
// Run the T1 proof with
//   npm run emulators:configure -- auto       # once per worktree
//   node scripts/test-pc10-3-stale-actions.emulator.mjs
// The runner builds Functions, reserves the configured row and starts the
// emulators through `firebase emulators:exec`, then imports this module.
//
// A later slice (T2: stale recovery after station loss, roster change and
// reconnect) imports the same pieces from a runner of its own that is executed
// the same way:
//   createStaleActionFixture()  - local 8-player session with chosen SDK clients
//   openCivilUnrestCrisis()     - facilitator opens a Civil Unrest crisis
//   openCoordinationPhase()     - Wing Commander opens Coordination
//   proveGrievanceStaleRace()   - generic `stale-revision` surface (T1.1 + T1.2)
//   proveCargoStaleRace()       - request-bound stale envelope surface (T1.1 + T1.2)
//   documentState()/assertNoWrite() - admin-side "nothing was written" checks
// Each prove* function returns a JSON-safe evidence record; it never contains
// tokens or private text beyond the proof's own fixture strings.
//
// Evidence class: local emulator, compiled callables, local fixture actors.
// This is not deployed gameplay and not owner-Chrome browser evidence.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectFirestoreEmulator, doc, initializeFirestore, onSnapshot, terminate,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

/** The exact stale-envelope keys `src/lib/shuttleCargoService.ts` accepts. */
export const CARGO_STALE_ENVELOPE_KEYS = Object.freeze([
  'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'resourceId',
  'direction', 'amount', 'expectedControlRevision', 'currentControlRevision',
]);

/** Emulator ports for the configured row, read from the generated local env. */
export async function emulatorEndpoints(envPath = '.env.emulators.local') {
  const env = Object.fromEntries((await readFile(envPath, 'utf8')).trim().split('\n')
    .map(line => line.split('=')));
  const project = process.env.VITE_FIREBASE_PROJECT_ID;
  assert.match(project ?? '', /^demo-[a-z0-9-]+$/, 'An explicit demo emulator project is required.');
  return {
    project,
    authPort: Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT),
    functionsPort: Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT),
    firestorePort: Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT),
  };
}

/** Normalize a Web SDK callable outcome without hiding the server's classification. */
function outcome(promise) {
  return promise.then(
    response => ({ ok: true, data: response.data }),
    error => ({
      ok: false,
      code: String(error?.code ?? 'unknown').replace(/^functions\//, ''),
      kind: error?.details?.commandError ?? null,
      message: String(error?.message ?? ''),
    }),
  );
}

/**
 * One ordinary player client: its own Firebase app, anonymous Auth identity,
 * callable transport and rules-enforced Firestore listener connection.
 */
export async function createSdkClient(endpoints, label) {
  const app = initializeApp({
    apiKey: 'demo-api-key', projectId: endpoints.project, appId: `pc10-3-${label}`,
    authDomain: `${endpoints.project}.firebaseapp.com`,
  }, `pc10-3-${label}-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${endpoints.authPort}`, { disableWarnings: true });
  const firestore = initializeFirestore(app, { experimentalForceLongPolling: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', endpoints.firestorePort);
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, '127.0.0.1', endpoints.functionsPort);
  const credential = await signInAnonymously(auth);
  const uid = credential.user.uid;
  const unsubscribers = new Set();
  return {
    label,
    uid,
    async actor() { return { localId: uid, idToken: await auth.currentUser.getIdToken() }; },
    call(name, data) { return outcome(httpsCallable(functions, name)(data)); },
    /**
     * A live document listener with the app's semantics: cache-only events are
     * ignored, and a rules denial terminates the listener (the SDK does not
     * resubscribe by itself).
     */
    listen(path) {
      const state = { value: undefined, error: null, waiters: new Set() };
      const settle = () => {
        for (const waiter of [...state.waiters]) waiter();
      };
      const unsubscribe = onSnapshot(doc(firestore, path), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache) return;
        state.value = snapshot.exists() ? snapshot.data() : null;
        settle();
      }, error => { state.error = error; settle(); });
      unsubscribers.add(unsubscribe);
      const waitFor = (ready, timeoutMs = 20_000) => new Promise((resolve, reject) => {
        const check = () => {
          if (state.error) { done(); reject(state.error); return; }
          if (state.value !== undefined && ready(state.value)) { done(); resolve(state.value); }
        };
        const timer = setTimeout(() => {
          done(); reject(new Error(`${label} did not observe ${path} in time.`));
        }, timeoutMs);
        const done = () => { clearTimeout(timer); state.waiters.delete(check); };
        state.waiters.add(check);
        check();
      });
      return {
        waitFor,
        /** First server value or rules denial, mapped the way the app maps it. */
        async rendered(timeoutMs = 20_000) {
          try { return { value: await waitFor(() => true, timeoutMs), denied: null }; }
          catch (error) {
            if (error?.code !== 'permission-denied') throw error;
            return { value: null, denied: error.code };
          }
        },
        terminatedBy() { return state.error?.code ?? null; },
        close() { unsubscribe(); unsubscribers.delete(unsubscribe); },
      };
    },
    async close() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      await terminate(firestore).catch(() => undefined);
      await deleteApp(app).catch(() => undefined);
    },
  };
}

/**
 * Create a local 8-player session through ordinary Auth/HTTP setup and seat
 * the named printed roles with Web SDK clients instead of REST-only actors.
 */
export async function createStaleActionFixture({ name = 'PC10.3 stale actions', sdkRoles, playerCount = 8 } = {}) {
  assert.ok(Array.isArray(sdkRoles) && sdkRoles.length > 0, 'Name the printed roles held by SDK clients.');
  const endpoints = await emulatorEndpoints();
  const clients = {};
  const joinBrowserPlayers = Object.fromEntries(sdkRoles.map(roleId => [roleId, async joinCode => {
    const client = await createSdkClient(endpoints, roleId);
    const joined = await client.call('joinSession', { joinCode, displayName: `SDK ${roleId}` });
    assert.ok(joined.ok, `${roleId} join: ${joined.message}`);
    clients[roleId] = client;
    return client.actor();
  }]));
  const f = await createPc07AuthenticatedSession(name, playerCount, { joinBrowserPlayers });
  return {
    f, clients, endpoints,
    async cleanup() {
      await Promise.all(Object.values(clients).map(client => client.close()));
      await f.cleanup();
    },
  };
}

/** Admin-side document state used only to prove that a rejected attempt wrote nothing. */
export async function documentState(db, paths) {
  const snapshots = await Promise.all(paths.map(path => db.doc(path).get()));
  return Object.fromEntries(snapshots.map((snapshot, index) => [paths[index], {
    exists: snapshot.exists,
    updateTime: snapshot.updateTime?.toMillis?.() ?? null,
    data: snapshot.exists ? JSON.parse(JSON.stringify(snapshot.data())) : null,
  }]));
}

export async function assertNoWrite(db, before, label) {
  const after = await documentState(db, Object.keys(before));
  assert.deepEqual(after, before, `${label} must not write any watched document.`);
}

async function collectionSize(db, path) {
  return (await db.collection(path).count().get()).data().count;
}

function gmRequest(f, data) { return { sessionId: f.sessionId, instanceId: f.instanceId, ...data }; }

/** Facilitator opens a Civil Unrest crisis through draft, delivered and debated. */
export async function openCivilUnrestCrisis(f, crisisId = `pc10-3-unrest-${randomUUID().slice(0, 8)}`) {
  const base = { crisisId, crisisKind: 'civil-unrest', title: 'Civil unrest',
    details: 'Teams may submit grievances and the facilitator will record a response.' };
  const transition = async (state, expectedRevision, extra = {}) => f.ok(await f.call(f.gm, 'transitionCrisis',
    gmRequest(f, { requestId: randomUUID(), expectedRevision, state, ...base, ...extra })), `crisis ${state}`);
  const current = (await f.db.doc(`sessions/${f.sessionId}/crisisState/current`).get()).data();
  const draft = await transition('draft', Number.isSafeInteger(current?.revision) ? current.revision : 0);
  const delivered = await transition('delivered', draft.revision, { deliveryPressure: 'hold' });
  const debated = await transition('debated', delivered.revision);
  assert.equal(debated.state, 'debated');
  return { crisisId, crisisRevision: debated.revision };
}

/**
 * The facilitator's ordinary mid-game role change: an eligibility decision,
 * then a source-defined replacement role. Returns the committed assignment.
 */
export async function moveToReplacementRole(f, client, replacementRoleId) {
  const eligibility = f.ok(await f.call(f.gm, 'setReplacementEligibility', gmRequest(f, {
    requestId: randomUUID(), targetUid: client.uid, reason: 'removed', expectedRevision: 0,
    expectedSetupRevision: (await f.session.get()).get('setupRevision'),
  })), `eligibility for ${client.label}`);
  assert.equal(eligibility.status, 'committed');
  const assigned = f.ok(await f.call(f.gm, 'assignReplacementRole', gmRequest(f, {
    requestId: randomUUID(), targetUid: client.uid, replacementRoleId,
    expectedRevision: eligibility.revision, expectedSetupRevision: eligibility.setupRevision,
  })), `replacement role for ${client.label}`);
  assert.equal(assigned.status, 'committed');
  return assigned;
}

/**
 * The Wing Commander opens Coordination for the current cycle, as in normal
 * play. Disclosed fixture step: only this disposable session's Team Phase
 * deadline is moved into the past (the established PC07/PC09 clock
 * acceleration); every game effect still goes through callables.
 */
export async function openCoordinationPhase(f) {
  const current = (await f.session.get()).data();
  await f.session.update({ turnPhase: { ...current.turnPhase,
    teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString() } });
  f.ok(await f.call(f.byRole('wing-commander'), 'beginOpenAirspacePhase',
    { sessionId: f.sessionId, expectedTurn: current.currentTurn }), 'open Coordination');
  return { clockAcceleration: 'Team Phase deadline moved to the past by the fixture before beginOpenAirspacePhase.' };
}

/**
 * Generic `stale-revision` surface: two entitled members of one affected team
 * race `submitCivilUnrestGrievance` against the same grievance revision.
 *
 * T1.1: exactly one commits; the loser gets the classified stale error and
 * writes nothing; its rules-enforced live listener refreshes to the winner's
 * revision; an explicit retry of the same input with a fresh request ID and the
 * observed revision commits.
 * T1.2: an exact replay of that committed retry returns the original result and
 * writes nothing; another member replaying its request ID is refused; after the
 * facilitator removes the loser's role, its stale retry is refused server-side.
 */
export async function proveGrievanceStaleRace({
  f, first, second, shipId, crisis, replacementRoleId = 'rosal-militia-leader',
}) {
  const sessionId = f.sessionId;
  const grievancePath = `sessions/${sessionId}/civilUnrestGrievances/${shipId}`;
  const auditPath = `${grievancePath}/audit`;
  const publicPath = `sessions/${sessionId}/civilUnrestPublic/current`;
  const receiptPath = requestId => `sessions/${sessionId}/commandReceipts/${requestId}`;
  const evidence = { surface: 'submitCivilUnrestGrievance', replyClass: 'generic stale-revision + live listener',
    sessionId, shipId, actors: { first: first.label, second: second.label } };

  // Both members render the same live team grievance before either submits.
  // Rules deny a member read of the absent grievance, which the app renders
  // as "no grievance" (`subscribeCivilUnrestGrievance` maps the error to null)
  // and which terminates that first listener.
  const initialListeners = new Map([first, second].map(client => [client, client.listen(grievancePath)]));
  const rendered = await Promise.all([...initialListeners.values()].map(listener => listener.rendered()));
  assert.deepEqual(rendered.map(entry => entry.value), [null, null],
    'Both members start from the empty team grievance.');

  const drafts = new Map([
    [first, { text: `${first.label} draft: fair rotation for the night crews.`, visibility: 'private' }],
    [second, { text: `${second.label} draft: medical leave before double shifts.`, visibility: 'private' }],
  ]);
  const request = (client, expectedGrievanceRevision, requestId = randomUUID()) => ({
    sessionId, requestId, crisisId: crisis.crisisId, expectedCrisisRevision: crisis.crisisRevision,
    expectedGrievanceRevision, affectedShipId: shipId, ...drafts.get(client),
  });
  const firstRequest = request(first, 0);
  const secondRequest = request(second, 0);
  const raced = await Promise.all([
    first.call('submitCivilUnrestGrievance', firstRequest),
    second.call('submitCivilUnrestGrievance', secondRequest),
  ]);
  assert.equal(raced.filter(reply => reply.ok).length, 1, 'Exactly one racing grievance commits.');
  const winnerIndex = raced.findIndex(reply => reply.ok);
  const [winner, loser] = winnerIndex === 0 ? [first, second] : [second, first];
  const [winnerRequest, loserRequest] = winnerIndex === 0
    ? [firstRequest, secondRequest] : [secondRequest, firstRequest];
  const won = raced[winnerIndex].data;
  const lost = raced[1 - winnerIndex];
  assert.equal(won.status, 'committed');
  assert.equal(won.revision, 1);
  assert.deepEqual({ code: lost.code, kind: lost.kind }, { code: 'failed-precondition', kind: 'stale-revision' },
    'The loser receives the classified stale-revision rejection.');
  const committed = (await f.db.doc(grievancePath).get()).data();
  assert.equal(committed.text, drafts.get(winner).text, 'Only the winner text was written.');
  assert.equal(committed.revision, 1);
  assert.equal(await collectionSize(f.db, auditPath), 1, 'Only the winner wrote an audit entry.');
  assert.equal((await f.db.doc(receiptPath(loserRequest.requestId)).get()).exists, false,
    'The stale loser holds no command receipt.');

  // The first listener cannot deliver the winner's revision once rules ended
  // it, so the loser re-establishes its live listener after the stale reply
  // (as CivilUnrestGrievancePanel does) and receives the current revision.
  const initialLoserListenerTerminatedBy = initialListeners.get(loser).terminatedBy();
  for (const listener of initialListeners.values()) listener.close();
  const loserListener = loser.listen(grievancePath);
  const refreshed = await loserListener.waitFor(value => value?.revision === 1);
  assert.equal(refreshed.text, drafts.get(winner).text);
  const winnerListener = winner.listen(grievancePath);
  await winnerListener.waitFor(value => value?.revision === 1);

  // Explicit retry: same retained input, fresh request ID, observed revision.
  const retryRequest = { ...loserRequest, requestId: randomUUID(), expectedGrievanceRevision: refreshed.revision };
  assert.notEqual(retryRequest.requestId, loserRequest.requestId);
  const retried = await loser.call('submitCivilUnrestGrievance', retryRequest);
  assert.ok(retried.ok, `retry: ${retried.message}`);
  assert.equal(retried.data.status, 'committed');
  assert.equal(retried.data.revision, 2);
  assert.equal((await f.db.doc(grievancePath).get()).get('text'), drafts.get(loser).text);
  await winnerListener.waitFor(value => value?.revision === 2);
  evidence.t1_1 = { winner: winner.label, loser: loser.label, loserReply: { code: lost.code, kind: lost.kind },
    loserWroteNothing: true, initialLoserListenerTerminatedBy,
    liveListenerRevision: refreshed.revision, retryUsedFreshRequestId: true,
    retryCommittedRevision: retried.data.revision, winnerObservedRetry: true };
  loserListener.close();
  winnerListener.close();

  // T1.2 (a): exact replay of the committed retry returns the original result.
  const beforeReplay = await documentState(f.db, [grievancePath, publicPath, receiptPath(retryRequest.requestId)]);
  const replay = await loser.call('submitCivilUnrestGrievance', retryRequest);
  assert.ok(replay.ok, `exact replay: ${replay.message}`);
  assert.deepEqual(replay.data, retried.data, 'An exact replay returns the original committed result.');
  await assertNoWrite(f.db, beforeReplay, 'An exact grievance replay');
  assert.equal(await collectionSize(f.db, auditPath), 2, 'An exact replay adds no audit entry.');

  // T1.2 (b): another entitled member cannot adopt the committed request ID.
  const foreign = await winner.call('submitCivilUnrestGrievance', { ...retryRequest, ...drafts.get(winner) });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, 'permission-denied', 'A foreign replay of a committed request is refused.');
  await assertNoWrite(f.db, beforeReplay, 'A foreign grievance replay');

  // T1.2 (c): the first member revises again, so the second member's view is
  // stale; the facilitator then moves the second member to a replacement role
  // on another team before it retries. The server refuses the retry.
  const staleActor = second;
  const staleActorRequest = staleActor === winner ? winnerRequest : loserRequest;
  const viewed = (await f.db.doc(grievancePath).get()).get('revision');
  const revised = await first.call('submitCivilUnrestGrievance', {
    ...(first === winner ? winnerRequest : loserRequest), requestId: randomUUID(),
    expectedGrievanceRevision: viewed });
  assert.ok(revised.ok, `revision by ${first.label}: ${revised.message}`);
  const staleAgain = await staleActor.call('submitCivilUnrestGrievance',
    { ...staleActorRequest, requestId: randomUUID(), expectedGrievanceRevision: viewed });
  assert.deepEqual({ code: staleAgain.code, kind: staleAgain.kind },
    { code: 'failed-precondition', kind: 'stale-revision' });
  await moveToReplacementRole(f, staleActor, replacementRoleId);
  const beforeUnauthorized = await documentState(f.db, [grievancePath, publicPath]);
  const current = (await f.db.doc(grievancePath).get()).get('revision');
  const unauthorizedRetryId = randomUUID();
  const unauthorized = await staleActor.call('submitCivilUnrestGrievance',
    { ...staleActorRequest, requestId: unauthorizedRetryId, expectedGrievanceRevision: current });
  assert.deepEqual({ ok: unauthorized.ok, code: unauthorized.code, kind: unauthorized.kind },
    { ok: false, code: 'permission-denied', kind: 'unauthorized' },
    'A retry after the actor loses its team role is refused server-side.');
  await assertNoWrite(f.db, beforeUnauthorized, 'An unauthorized stale retry');
  assert.equal((await f.db.doc(receiptPath(unauthorizedRetryId)).get()).exists, false);
  evidence.t1_2 = { exactReplayReturnedOriginal: true, exactReplayWroteNothing: true,
    foreignReplayRefused: foreign.code, staleAfterNewerRevision: staleAgain.kind,
    roleLoss: { actor: staleActor.label, replacementRoleId },
    retryAfterRoleLossRefused: { code: unauthorized.code, kind: unauthorized.kind }, retryAfterRoleLossWroteNothing: true };
  return evidence;
}

async function memberShuttleView(client, sessionId, shuttleId) {
  const read = await client.call('getCurrentMemberSession', { sessionId });
  assert.ok(read.ok, `${client.label} member read: ${read.message}`);
  const session = read.data.session;
  const control = session.shuttleControl?.[shuttleId] ?? null;
  const docking = (session.shuttleDockings ?? []).filter(entry => entry.shuttleId === shuttleId);
  return { control, hostShipId: docking.length === 1 ? docking[0].shipId : null };
}

/**
 * Request-bound stale envelope surface: `transferShuttleCargoCommand`.
 *
 * The printed owner (one client) moves shuttle control while the holder (a
 * second client) still shows an older control revision. Ordering is controlled
 * (the owner's commits land before the holder's submission) so the stale branch
 * is exercised every run; the concurrency itself is the server transaction's.
 */
export async function proveCargoStaleRace({ f, owner, holder, shuttleId, resourceId = 'food', amount = 1 }) {
  const sessionId = f.sessionId;
  const sessionPath = `sessions/${sessionId}`;
  const receiptPath = requestId => `sessions/${sessionId}/commandReceipts/${requestId}`;
  const evidence = { surface: 'transferShuttleCargoCommand', replyClass: 'request-bound stale envelope',
    sessionId, shuttleId, actors: { owner: owner.label, holder: holder.label } };
  const control = async (client, action, expectedRevision) => {
    const reply = await client.call('transferShuttleControlCommand', {
      sessionId, requestId: randomUUID(), shuttleId, action, expectedRevision,
      ...(action === 'handoff' ? { targetUid: holder.uid } : {}),
    });
    assert.ok(reply.ok, `${action}: ${reply.message}`);
    return reply.data;
  };
  const cargoState = async () => {
    const session = (await f.session.get()).data();
    return { ship: session.shipResources, shuttle: session.shuttleCargo?.[shuttleId] ?? {} };
  };

  const initial = await memberShuttleView(owner, sessionId, shuttleId);
  const lent = await control(owner, 'handoff', initial.control?.revision ?? 0);
  const holderView = await memberShuttleView(holder, sessionId, shuttleId);
  assert.equal(holderView.control.holderUid, holder.uid);
  assert.equal(holderView.control.revision, lent.revision);
  // The holder's retained draft, captured against the revision it rendered.
  const draft = { resourceId, direction: 'load', amount, expectedControlRevision: holderView.control.revision };
  const submit = (client, input, requestId = randomUUID()) => client.call('transferShuttleCargoCommand',
    { sessionId, requestId, shuttleId, resourceId: input.resourceId, direction: input.direction,
      amount: input.amount, expectedControlRevision: input.expectedControlRevision });

  // T1.2: the owner reclaims first; the holder's attempt is refused as a lost holder.
  const reclaimed = await control(owner, 'reclaim', lent.revision);
  const beforeLostHolder = await documentState(f.db, [sessionPath]);
  const lostHolderId = randomUUID();
  const lostHolder = await submit(holder, draft, lostHolderId);
  assert.deepEqual({ ok: lostHolder.ok, code: lostHolder.code, kind: lostHolder.kind },
    { ok: false, code: 'failed-precondition', kind: 'conflict' },
    'A stale cargo attempt after the actor lost the holder is refused server-side.');
  await assertNoWrite(f.db, beforeLostHolder, 'A lost-holder cargo attempt');
  assert.equal((await f.db.doc(receiptPath(lostHolderId)).get()).exists, false);

  // T1.1: the owner lends the shuttle again; the holder's view is still stale.
  const relent = await control(owner, 'handoff', reclaimed.revision);
  const beforeStale = await documentState(f.db, [sessionPath]);
  const staleId = randomUUID();
  const stale = await submit(holder, draft, staleId);
  assert.ok(stale.ok, `stale submission: ${stale.message}`);
  assert.deepEqual(Object.keys(stale.data).sort(), [...CARGO_STALE_ENVELOPE_KEYS].sort(),
    'The stale envelope has exactly the shape the client parser accepts.');
  assert.deepEqual({ ...stale.data }, {
    status: 'stale', sessionId, requestId: staleId, shuttleId, hostShipId: stale.data.hostShipId,
    resourceId: draft.resourceId, direction: draft.direction, amount: draft.amount,
    expectedControlRevision: draft.expectedControlRevision, currentControlRevision: relent.revision,
  }, 'The envelope echoes the retained input and carries the current revision.');
  await assertNoWrite(f.db, beforeStale, 'A stale cargo attempt');
  assert.equal((await f.db.doc(receiptPath(staleId)).get()).exists, false);

  // The holder's ordinary member read refreshes to the envelope's state.
  const refreshed = await memberShuttleView(holder, sessionId, shuttleId);
  assert.equal(refreshed.control.revision, stale.data.currentControlRevision);
  assert.equal(refreshed.control.holderUid, holder.uid);
  assert.equal(refreshed.hostShipId, stale.data.hostShipId);

  // Explicit retry: same retained input, fresh request ID, current revision.
  const before = await cargoState();
  const retryId = randomUUID();
  const retryInput = { ...draft, expectedControlRevision: refreshed.control.revision };
  const retried = await submit(holder, retryInput, retryId);
  assert.ok(retried.ok, `retry: ${retried.message}`);
  assert.equal(retried.data.status, 'committed');
  const after = await cargoState();
  const host = retried.data.hostShipId;
  assert.equal(host, stale.data.hostShipId);
  assert.equal(after.ship[host][resourceId], before.ship[host][resourceId] - amount);
  assert.equal(after.shuttle[resourceId] ?? 0, (before.shuttle[resourceId] ?? 0) + amount);
  evidence.t1_1 = { controlRevisions: { rendered: draft.expectedControlRevision, current: relent.revision },
    staleEnvelope: { keys: CARGO_STALE_ENVELOPE_KEYS.length, hostShipId: stale.data.hostShipId,
      currentControlRevision: stale.data.currentControlRevision }, staleWroteNothing: true,
    memberReadRefreshed: true, retryUsedFreshRequestId: retryId !== staleId, retryCommitted: true,
    cargoMoved: { resourceId, amount, hostShipId: host } };

  // T1.2: exact replay returns the original result and writes nothing.
  const beforeReplay = await documentState(f.db, [sessionPath, receiptPath(retryId)]);
  const replay = await submit(holder, retryInput, retryId);
  assert.ok(replay.ok, `exact replay: ${replay.message}`);
  assert.deepEqual(replay.data, { ...retried.data, status: 'replayed' },
    'An exact cargo replay returns the original committed result.');
  await assertNoWrite(f.db, beforeReplay, 'An exact cargo replay');

  // T1.2: the printed owner cannot adopt the holder's committed request ID.
  const foreign = await submit(owner, retryInput, retryId);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, 'permission-denied', 'A foreign replay of a committed cargo request is refused.');
  await assertNoWrite(f.db, beforeReplay, 'A foreign cargo replay');
  evidence.t1_2 = { lostHolderRefused: { code: lostHolder.code, kind: lostHolder.kind },
    lostHolderWroteNothing: true, exactReplayStatus: replay.data.status, exactReplayWroteNothing: true,
    foreignReplayRefused: foreign.code };
  return evidence;
}
