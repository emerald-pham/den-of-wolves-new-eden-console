import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const memberFields = ['sessionId', 'role', 'fleetGroupId', 'assignedRoleId', 'activeConsoleRoleId',
  'seatId', 'replacementRoleId', 'replacementStatus'];
const observationField = { role: 'playerRole' };
const stableMemberFields = memberFields.filter(key => !['seatId', 'activeConsoleRoleId'].includes(key));
const stableObservationFields = ['documentTimeOrigin', 'uidHash', 'profileRoleId', 'profileSessionId', 'sessionId',
  'meSessionId', 'playerRole', 'assignedRoleId', 'fleetGroupId', 'replacementRoleId', 'replacementStatus', 'escapeLocked'];
const wireId = value => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
const safeId = value => wireId(value) ? value : null;
const safeBoolean = value => typeof value === 'boolean' ? value : null;
const safeGeneration = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const safeError = (error, category) => ({ category, name: ['Error', 'AssertionError', 'SyntaxError', 'TypeError'].includes(error?.name) ? error.name : 'Error' });
function observation(current) {
  const result = {};
  for (const key of ['profileRoleId', 'profileSessionId', 'sessionId', 'meSessionId', 'playerRole', 'assignedRoleId',
    'activeConsoleRoleId', 'fleetGroupId', 'seatId', 'replacementRoleId', 'replacementStatus']) result[key] = safeId(current?.[key]);
  for (const key of ['hasAuth', 'sameActor', 'escapeLocked', 'connected', 'currentMemberBerthPresent',
    'currentMemberBerthMatches', 'currentOwnPlayerConfirmed', 'currentPressMemberMatches', 'currentCanonicalSeatOwned']) result[key] = safeBoolean(current?.[key]);
  result.uidHash = typeof current?.uidHash === 'string' && /^[a-f0-9]{16}$/.test(current.uidHash) ? current.uidHash : null;
  result.documentTimeOrigin = Number.isFinite(current?.documentTimeOrigin) && current.documentTimeOrigin > 0 ? current.documentTimeOrigin : null;
  for (const key of ['connectionGeneration', 'identityHydrationRevision']) result[key] = safeGeneration(current?.[key]);
  result.connection = ['live', 'offline', 'connecting', 'disconnected'].includes(current?.connection) ? current.connection : null;
  result.freshness = ['server', 'cache'].includes(current?.freshness) ? current.freshness : null;
  if (current?.clientAcceptance) result.clientAcceptance = { hasServerAuthority: safeBoolean(current.clientAcceptance.hasServerAuthority), resumePending: safeBoolean(current.clientAcceptance.resumePending) };
  return result;
}
function stationPointersMatch(player, current, roleId) {
  const pointers = ['seatId', 'activeConsoleRoleId'];
  if (!pointers.every(key => [null, roleId].includes(player[key]) && [null, roleId].includes(current[key]) &&
    (player[key] === current[key] || player[key] === null && current[key] === roleId))) return false;
  // A nullable resume pointer is only a phase snapshot. Its later canonical
  // claim must have both the fresh member witness and actual own seat holder.
  return !pointers.some(key => player[key] !== current[key]) ||
    current.seatId === roleId && current.activeConsoleRoleId === roleId && current.currentCanonicalSeatOwned === true;
}
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
  if (!result || body.error || !player || !wireId(player.uid) || !wireId(result.session?.id) ||
      !Number.isSafeInteger(player.connectionGeneration) || player.connectionGeneration < 1 ||
      memberFields.some(key => player[key] != null && !wireId(player[key])) ||
      Object.hasOwn(player, 'connected') && typeof player.connected !== 'boolean') return null;
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
    void persist().catch(error => { (record.writeErrors ??= []).push(safeError(error, 'evidence-write-failed')); });
  }
  const on = (name, callback) => { page.on(name, callback); listeners.push([name, callback]); };
  on('request', request => {
    try {
      const name = endpoint(request); if (!watchedEndpoints.has(name)) return;
      const data = request.postDataJSON()?.data;
      const detail = { kind: 'request', endpoint: name, route: safeRoute(request.url()),
        requestSessionId: safeId(data?.sessionId),
        ...(name === 'refreshPresence' ? { activeConsoleRoleId: safeId(data?.activeConsoleRoleId) } : {}) };
      append(detail);
      if (name === 'resumeSession' && baseline && Date.now() < deadlineAt) {
        requests.set(request, { requestedAt: new Date().toISOString(), baseline: observation(baseline),
          requestSessionId: safeId(data?.sessionId),
          requestMatches: !!data && Object.keys(data).length === 1 && Object.hasOwn(data, 'sessionId') && wireId(data.sessionId),
          endpoint: name });
      }
    } catch (error) { append({ kind: 'request-read-error', error: safeError(error, 'request-read-failed') }); }
  });
  on('response', response => {
    try {
      const request = response.request(), name = endpoint(request); if (!watchedEndpoints.has(name)) return;
      const httpStatus = response.status();
      const safeStatus = Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null;
      append({ kind: 'response', endpoint: name, httpStatus: safeStatus, route: safeRoute(response.url()) });
      const receipt = requests.get(request); if (!receipt) return;
      receipt.httpStatus = safeStatus; receipt.respondedAt = new Date().toISOString();
      receipt.bodyStatus = 'reading';
      receipt.parsed = response.json().then(body => { receipt.reply = resumeReply(body); receipt.bodyStatus = 'parsed'; }).catch(error => {
        receipt.bodyStatus = 'read-failed'; receipt.parseError = safeError(error, 'response-body-read-failed');
      });
    } catch (error) { append({ kind: 'response-read-error', error: safeError(error, 'response-read-failed') }); }
  });
  on('requestfailed', request => {
    try { const name = endpoint(request); if (watchedEndpoints.has(name)) append({ kind: 'requestfailed', endpoint: name }); }
    catch (error) { append({ kind: 'requestfailed-read-error', error: safeError(error, 'requestfailure-read-failed') }); }
  });
  on('framenavigated', frame => append({ kind: 'framenavigated', route: safeRoute(frame.url()),
    mainFrame: typeof page.mainFrame === 'function' ? frame === page.mainFrame() : null }));
  return {
    path,
    sample(current) { record.samples.push({ at: new Date().toISOString(), route: safeRoute(page.url()), current: observation(current) }); },
    bind(current) { baseline = observation(current); record.currentBinding = baseline; },
    async prepare(current) {
      baseline = observation(current); record.originalBinding = baseline; record.currentBinding = baseline;
      record.preparedAt = new Date().toISOString(); record.status = 'bound-before-navigation'; await persist();
    },
    async accept(original, current, readAcceptedCurrent) {
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
        stableMemberFields.every(key => row.reply.player[key] === current[observationField[key] ?? key]) &&
        row.reply.player.role === 'player');
      assert.ok(receipt && current.identityHydrationRevision === original.identityHydrationRevision + 1,
        'Original role navigation epoch changed without its matching normal resume receipt and accepted hydration.');
      // The actual normal DTO omits connected. Current own-player confirmation
      // below supplies that authority; explicit false/malformed reply flags fail.
      // applySession clears the old member envelope. Let the existing feed and
      // SDK finish fence land within the caller's original finite deadline.
      if (current.connection !== 'live' || current.freshness !== 'server' || !current.currentMemberBerthPresent || !current.currentMemberBerthMatches ||
          !current.currentOwnPlayerConfirmed) return false;
      // Reuse the exact post-digest original-member observation. Identity,
      // seat ownership, transaction witness and SDK fence are sampled together
      // after the async yield, inside the caller's original deadline.
      const settled = await beforeDeadline(readAcceptedCurrent(), deadlineAt);
      assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
      for (const key of stableObservationFields) assert.equal(settled[key], original[key],
        `Original resumed ${key} changed during client acceptance observation.`);
      assert.equal(settled.hasAuth, true); assert.equal(settled.sameActor, true);
      assert.equal(settled.connectionGeneration, receipt.reply.connectionGeneration);
      assert.equal(settled.identityHydrationRevision, original.identityHydrationRevision + 1);
      assert.ok(stableMemberFields.every(key => receipt.reply.player[key] === settled[observationField[key] ?? key]),
        'Original resumed member scope changed during client acceptance observation.');
      const accepted = settled.clientAcceptance;
      if (settled.connection !== 'live' || settled.freshness !== 'server' || !settled.currentMemberBerthPresent ||
          !settled.currentMemberBerthMatches || !settled.currentOwnPlayerConfirmed ||
          accepted?.hasServerAuthority !== true || accepted.resumePending !== false) return false;
      assert.ok(stationPointersMatch(receipt.reply.player, settled, roleId),
        'Original resumed station pointers require canonical current ownership.');
      current = settled;
      record.transitions.push({ status: 'accepted-normal-resume-bound', at: new Date().toISOString(),
        before: observation(original), current: observation(current), receipt: {
          requestedAt: receipt.requestedAt, respondedAt: receipt.respondedAt, requestSessionId: receipt.requestSessionId,
          httpStatus: receipt.httpStatus, reply: receipt.reply }, clientAcceptance: observation(current).clientAcceptance });
      baseline = observation(current); record.currentBinding = baseline; await persist(); return current;
    },
    async finish(error) {
      closed = true;
      for (const [name, callback] of listeners) page.off(name, callback);
      // An unfinished body remains explicitly unfinished in the packet. It
      // cannot extend the primary deadline or delay removal of own listeners.
      record.status = error ? 'failed' : 'selected-current-original-member';
      record.receipts = [...requests.values()].map(({ parsed, ...row }) => row);
      if (error) record.originalError = safeError(error, 'original-selection-failed');
      record.closedAt = new Date().toISOString(); await persist();
    },
  };
}
