import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const memberFields = ['sessionId', 'role', 'fleetGroupId', 'assignedRoleId', 'activeConsoleRoleId',
  'seatId', 'replacementRoleId', 'replacementStatus'];
const observationField = { role: 'playerRole' };
const watchedEndpoints = new Set(['resumeSession', 'getCurrentMemberSession', 'refreshPresence']);
async function beforeDeadline(promise, deadlineAt) {
  assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Original role navigation deadline expired.')),
        Math.max(1, deadlineAt - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}
const safeRoute = value => { const url = new URL(value); return { origin: url.origin, pathname: url.pathname, hash: url.hash }; };
function endpoint(request) {
  const url = new URL(request.url());
  return request.method() === 'POST' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    ? url.pathname.match(/^\/[^/]+\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1] : undefined;
}
function resumeReply(body) {
  const result = body?.result, player = result?.player;
  if (!result || body.error || !player || typeof player.uid !== 'string') return null;
  // The full callable reply remains private to this parser. Never retain raw
  // UIDs, Auth headers/tokens, private role data, or the session payload.
  return { sessionId: result.session?.id,
    uidHash: createHash('sha256').update(player.uid).digest('hex').slice(0, 16),
    player: Object.fromEntries(memberFields.map(key => [key, player[key] ?? null])),
    connectionGeneration: player.connectionGeneration,
    connectedFieldPresent: Object.hasOwn(player, 'connected'),
    connected: Object.hasOwn(player, 'connected') ? player.connected : null,
    escapeLocked: player.escapeState != null };
}

/** Passive, operation-local evidence from the ordinary route's real SDK.
 * No forced resume, command, store setter, interception, or deadline extension. */
export function createMemberNavigationResumeObserver(page, { directory, roleId, deadlineAt }) {
  if (typeof page?.on !== 'function' || typeof page?.off !== 'function') return null;
  const id = randomUUID(), folder = resolve(directory, 'member-navigation'), path = resolve(folder, `${id}.json`);
  const record = { schemaVersion: 1, operationId: id, roleId, deadlineAt,
    createdAt: new Date().toISOString(), status: 'observer-armed', initialRoute: safeRoute(page.url()),
    samples: [], events: [], transitions: [], noSdkOrGameplayActionIssued: true };
  const requests = new Map(), listeners = [];
  let baseline, closed = false, writes = Promise.resolve();
  function persist() {
    const bytes = JSON.stringify(record, null, 2) + '\n';
    writes = writes.catch(() => undefined).then(async () => {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const temporary = resolve(folder, `.${id}-${randomUUID()}.tmp`);
      await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' }); await rename(temporary, path);
    });
    return writes;
  }
  function append(event) {
    if (closed) return;
    record.events.push({ at: new Date().toISOString(), ...event });
    void persist().catch(error => { (record.writeErrors ??= []).push({ name: error.name, message: error.message }); });
  }
  const on = (name, callback) => { page.on(name, callback); listeners.push([name, callback]); };
  on('request', request => {
    try {
      const name = endpoint(request); if (!watchedEndpoints.has(name)) return;
      const data = request.postDataJSON()?.data;
      const detail = { kind: 'request', endpoint: name, route: safeRoute(request.url()),
        requestSessionId: data?.sessionId ?? null,
        ...(name === 'refreshPresence' ? { activeConsoleRoleId: data?.activeConsoleRoleId ?? null } : {}) };
      append(detail);
      if (name === 'resumeSession' && baseline && Date.now() < deadlineAt) {
        requests.set(request, { requestedAt: new Date().toISOString(), baseline: { ...baseline },
          requestSessionId: data?.sessionId,
          requestMatches: !!data && Object.keys(data).length === 1 && Object.hasOwn(data, 'sessionId'),
          endpoint: name });
      }
    } catch (error) { append({ kind: 'request-read-error', name: error.name, message: error.message }); }
  });
  on('response', response => {
    try {
      const request = response.request(), name = endpoint(request); if (!watchedEndpoints.has(name)) return;
      append({ kind: 'response', endpoint: name, httpStatus: response.status(), route: safeRoute(response.url()) });
      const receipt = requests.get(request); if (!receipt) return;
      receipt.httpStatus = response.status(); receipt.respondedAt = new Date().toISOString();
      receipt.bodyStatus = 'reading';
      receipt.parsed = response.json().then(body => { receipt.reply = resumeReply(body); receipt.bodyStatus = 'parsed'; }).catch(error => {
        receipt.bodyStatus = 'read-failed'; receipt.parseError = { name: error.name, message: error.message };
      });
    } catch (error) { append({ kind: 'response-read-error', name: error.name, message: error.message }); }
  });
  on('requestfailed', request => {
    try { const name = endpoint(request); if (watchedEndpoints.has(name)) append({ kind: 'requestfailed', endpoint: name }); }
    catch (error) { append({ kind: 'requestfailed-read-error', message: error.message }); }
  });
  on('framenavigated', frame => append({ kind: 'framenavigated', route: safeRoute(frame.url()),
    mainFrame: typeof page.mainFrame === 'function' ? frame === page.mainFrame() : null }));
  return {
    path,
    sample(current) { record.samples.push({ at: new Date().toISOString(), route: safeRoute(page.url()), current: { ...current } }); },
    bind(current) { baseline = { ...current }; record.currentBinding = baseline; },
    async prepare(current) {
      baseline = { ...current }; record.originalBinding = baseline; record.currentBinding = baseline;
      record.preparedAt = new Date().toISOString(); record.status = 'bound-before-navigation'; await persist();
    },
    async accept(original, current, storeModuleUrl) {
      assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
      const candidates = [...requests.values()].filter(row => row.baseline.documentTimeOrigin === original.documentTimeOrigin &&
        row.baseline.uidHash === original.uidHash && row.baseline.sessionId === original.sessionId &&
        row.baseline.connectionGeneration === original.connectionGeneration &&
        row.baseline.identityHydrationRevision === original.identityHydrationRevision);
      await beforeDeadline(Promise.all(candidates.map(row => row.parsed)), deadlineAt);
      assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
      const receipt = candidates.find(row => row.requestMatches && row.requestSessionId === original.sessionId &&
        row.httpStatus === 200 && row.reply?.sessionId === original.sessionId && row.reply.uidHash === original.uidHash &&
        row.reply.connectionGeneration === original.connectionGeneration + 1 &&
        row.reply.connectionGeneration === current.connectionGeneration &&
        (row.reply.connected === true || !row.reply.connectedFieldPresent && row.reply.connected === null) && !row.reply.escapeLocked &&
        memberFields.every(key => row.reply.player[key] === current[observationField[key] ?? key]) &&
        row.reply.player.role === 'player');
      assert.ok(receipt && current.identityHydrationRevision === original.identityHydrationRevision + 1,
        'Original role navigation epoch changed without its matching normal resume receipt and accepted hydration.');
      // The actual normal DTO omits connected. Current own-player confirmation
      // below supplies that authority; explicit false/malformed reply flags fail.
      // applySession clears the old member envelope. Let the existing feed and
      // SDK finish fence land within the caller's original finite deadline.
      if (current.connection !== 'live' || current.freshness !== 'server' || !current.currentMemberBerthPresent || !current.currentMemberBerthMatches ||
          !current.currentOwnPlayerConfirmed) return false;
      const accepted = await page.evaluate(async ({ moduleUrl, expected }) => {
        const { useSessionStore } = await import(moduleUrl);
        const { auth } = await import('/src/lib/firebase.ts');
        const { sessionSnapshotAuthorityFor, memberSessionResumeBlocksFreshness } = await import('/src/lib/sessionSnapshotAuthority.ts');
        const uid = auth().currentUser?.uid;
        const uidHash = uid ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
          new TextEncoder().encode(uid)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
        const state = useSessionStore.getState(), me = state.me;
        const identityMatches = auth().currentUser?.uid === uid && uidHash === expected.uidHash && me?.uid === uid &&
          state.session?.id === expected.sessionId && me?.sessionId === expected.meSessionId && me?.role === expected.playerRole &&
          performance.timeOrigin === expected.documentTimeOrigin &&
          me?.connectionGeneration === expected.connectionGeneration && state.identityHydrationRevision === expected.identityHydrationRevision &&
          me?.fleetGroupId === expected.fleetGroupId && (me?.assignedRoleId ?? null) === expected.assignedRoleId &&
          (me?.activeConsoleRoleId ?? null) === expected.activeConsoleRoleId && (me?.seatId ?? null) === expected.seatId &&
          (me?.replacementRoleId ?? null) === expected.replacementRoleId && (me?.replacementStatus ?? null) === expected.replacementStatus &&
          (me?.escapeState != null) === expected.escapeLocked && me?.connected === true &&
          state.connection === 'live' && state.sessionSnapshotFreshness === 'server';
        const authority = uid && state.session?.id ? sessionSnapshotAuthorityFor(state.session.id, uid) : null;
        return { identityMatches, hasServerAuthority: authority?.hasServerSessionAuthority === true,
          resumePending: authority ? memberSessionResumeBlocksFreshness(authority) : true };
      }, { moduleUrl: storeModuleUrl, expected: current });
      assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
      assert.equal(accepted.identityMatches, true, 'Original resumed identity changed during client acceptance observation.');
      if (!accepted.hasServerAuthority || accepted.resumePending) return false;
      record.transitions.push({ status: 'accepted-normal-resume-bound', at: new Date().toISOString(),
        before: { ...original }, current: { ...current }, receipt: {
          requestedAt: receipt.requestedAt, respondedAt: receipt.respondedAt, requestSessionId: receipt.requestSessionId,
          httpStatus: receipt.httpStatus, reply: receipt.reply }, clientAcceptance: accepted });
      baseline = { ...current }; record.currentBinding = baseline; await persist(); return true;
    },
    async finish(error) {
      closed = true;
      for (const [name, callback] of listeners) page.off(name, callback);
      // An unfinished body remains explicitly unfinished in the packet. It
      // cannot extend the primary deadline or delay removal of own listeners.
      record.status = error ? 'failed' : 'selected-current-original-member';
      record.receipts = [...requests.values()].map(({ parsed, ...row }) => row);
      if (error) record.originalError = { name: error.name, message: error.message, stack: error.stack };
      record.closedAt = new Date().toISOString(); await persist();
    },
  };
}
