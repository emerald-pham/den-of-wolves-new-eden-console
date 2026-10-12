import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pc11MemberReadiness } from './qualification/pc11-normal-start-adapter.mjs';

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
function observation(current, includeCasting = false) {
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
  if (includeCasting) {
    result.phase = ['lobby', 'casting', 'briefing', 'active', 'debrief', 'closed'].includes(current?.phase) ? current.phase : null;
    result.cycle = safeGeneration(current?.cycle);
    for (const key of ['setupConfirmed', 'memberScopeMatches', 'currentMemberBerthNull', 'currentCanonicalSeatOwned'])
      result[key] = safeBoolean(current?.[key]);
  }
  if (current?.clientAcceptance) result.clientAcceptance = {
    hasServerAuthority: safeBoolean(current.clientAcceptance.hasServerAuthority),
    resumePending: safeBoolean(current.clientAcceptance.resumePending),
  };
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
export function createMemberNavigationResumeObserver(page, { directory, roleId, deadlineAt,
  memberContract = 'current-berth', documentReload = false, transition = 'station-navigation',
  expectedGmUidHash, expectedGmInstanceId, onCastingResumeRequest, proofProfile = 'starlight' }) {
  assert.ok(proofProfile === 'starlight' || proofProfile === 'wing-bays',
    'Use an explicitly supported ordinary-actor proof profile.');
  assert.ok(['current-berth', 'pc11-live-base'].includes(memberContract), 'Use an explicit supported member contract.');
  assert.equal(typeof documentReload, 'boolean', 'Use an explicit document reload contract.');
  assert.ok(['station-navigation', 'casting-assignment'].includes(transition), 'Use an explicit member navigation transition.');
  assert.ok(!documentReload || transition === 'station-navigation', 'Casting assignment cannot change documents.');
  if (transition === 'casting-assignment') {
    assert.ok(typeof expectedGmUidHash === 'string' && /^[a-f0-9]{16}$/.test(expectedGmUidHash),
      'Casting assignment requires the original GM Auth identity hash.');
    assert.ok(wireId(expectedGmInstanceId), 'Casting assignment requires the original GM instance.');
  }
  if (typeof page?.on !== 'function' || typeof page?.off !== 'function') return null;
  const id = randomUUID(), folder = resolve(directory, 'member-navigation'), path = resolve(folder, `${id}.json`);
  const record = { schemaVersion: 1, operationId: id, roleId, deadlineAt,
    createdAt: new Date().toISOString(), status: 'observer-armed', initialRoute: safeRoute(page.url()), documentReload,
    samples: [], events: [], transitions: [], ...(transition === 'station-navigation' ? {} : { transition }),
    noSdkOrGameplayActionIssued: true };
  const requests = new Map(), listeners = [];
  let baseline, closed = false, writes = Promise.resolve();
  const safeObservation = current => observation(current, transition === 'casting-assignment');
  const cleanReady = (value, original) => pc11MemberReadiness(value, {
    sessionId: original.sessionId, uidHash: original.uidHash, roleId, stage: 'station',
  }) && value.memberScopeMatches === true && value.fleetGroupId === original.fleetGroupId &&
    (value.phase === 'casting' || value.currentOwnBerthConfirmed === true);
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
        const receipt = { requestedAt: new Date().toISOString(), baseline: safeObservation(baseline),
          requestSessionId: safeId(data?.sessionId),
          requestMatches: !!data && Object.keys(data).length === 1 && Object.hasOwn(data, 'sessionId') && wireId(data.sessionId),
          endpoint: name };
        requests.set(request, receipt);
        if (transition === 'casting-assignment' && receipt.requestMatches &&
            receipt.requestSessionId === receipt.baseline.sessionId) {
          try {
            const noted = onCastingResumeRequest?.({ sessionId: receipt.requestSessionId,
            uidHash: receipt.baseline.uidHash, documentTimeOrigin: receipt.baseline.documentTimeOrigin,
            connectionGeneration: receipt.baseline.connectionGeneration,
            identityHydrationRevision: receipt.baseline.identityHydrationRevision });
            if (noted && typeof noted.catch === 'function') noted.catch(error => append({
              kind: 'resume-guard-notification-error', error: safeError(error, 'guard-notification-failed') }));
          }
          catch (error) { append({ kind: 'resume-guard-notification-error', error: safeError(error, 'guard-notification-failed') }); }
        }
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
    try {
      const name = endpoint(request);
      if (watchedEndpoints.has(name)) append({ kind: 'requestfailed', endpoint: name });
      const receipt = requests.get(request); if (receipt) receipt.requestFailed = true;
    }
    catch (error) { append({ kind: 'requestfailed-read-error', error: safeError(error, 'requestfailure-read-failed') }); }
  });
  on('framenavigated', frame => append({ kind: 'framenavigated', route: safeRoute(frame.url()),
    mainFrame: typeof page.mainFrame === 'function' ? frame === page.mainFrame() : null }));
  async function acceptCastingAssignment(original, current, readAcceptedCurrent, assignment) {
    assert.equal(documentReload, false, 'Casting assignment must remain in the original document.');
    assert.equal(original.documentTimeOrigin, current.documentTimeOrigin,
      'Original casting assignment documentTimeOrigin changed.');
    assert.ok(original.hasAuth === true && original.sameActor === true &&
      typeof original.uidHash === 'string' && typeof original.sessionId === 'string' &&
      original.meSessionId === original.sessionId && original.profileRoleId == null &&
      original.profileSessionId == null && original.playerRole === 'player' && original.assignedRoleId == null &&
      original.activeConsoleRoleId == null && original.seatId == null && original.connected === true &&
      original.kicked === false && original.escapeLocked === false && original.replacementRoleId == null &&
      original.replacementStatus == null && original.connection === 'live' && original.freshness === 'server' &&
      original.currentOwnPlayerConfirmed === true && original.sdkHasServerAuthority === true &&
      original.sdkResumePending === false && original.currentCanonicalSeatOwned === false &&
      original.memberScopeMatches === true &&
      (original.currentMemberBerthPresent === false || original.currentMemberBerthNull === true ||
        original.currentMemberBerthMatches === true) &&
      ['lobby', 'casting'].includes(original.phase) && original.cycle === 0 && original.setupConfirmed === true &&
      Number.isSafeInteger(original.connectionGeneration) && original.connectionGeneration >= 1 &&
      Number.isSafeInteger(original.identityHydrationRevision) && original.identityHydrationRevision >= 1,
    'Casting assignment requires the original fresh, unseated member in lobby/casting Cycle 0.');
    assert.ok(roleId === 'wing-commander' || proofProfile === 'wing-bays' && roleId === 'admiral',
      'P181 accepts only the original station role declared by its casting profile.');
    assert.ok(assignment && assignment.endpoint === 'assignRole' && assignment.httpStatus === 200 &&
      assignment.before?.sessionId === original.sessionId && assignment.before?.playerRole === 'gm' &&
      assignment.before?.uidHash === expectedGmUidHash && assignment.before?.gmInstanceOwned === true &&
      assignment.before?.instanceId === expectedGmInstanceId && assignment.before?.instanceId === assignment.data?.instanceId &&
      assignment.data?.sessionId === original.sessionId && typeof assignment.data?.targetUid === 'string' &&
      createHash('sha256').update(assignment.data.targetUid).digest('hex').slice(0, 16) === original.uidHash &&
      assignment.data?.roleId === roleId && Number.isSafeInteger(assignment.before?.setupRevision) &&
      (assignment.data?.expectedSetupRevision === undefined ||
        assignment.data.expectedSetupRevision === assignment.before.setupRevision) &&
      (!Object.hasOwn(assignment.result ?? {}, 'status') || ['committed', 'applied'].includes(assignment.result.status)) &&
      assignment.result?.sessionId === original.sessionId &&
      assignment.result?.setupRevision === assignment.before.setupRevision + 1,
    'Casting resume requires the successful original GM assignRole target/role receipt.');

    const candidates = [...requests.values()].filter(row => row.baseline.documentTimeOrigin === original.documentTimeOrigin &&
      row.baseline.uidHash === original.uidHash && row.baseline.sessionId === original.sessionId &&
      row.baseline.connectionGeneration === original.connectionGeneration &&
      row.baseline.identityHydrationRevision === original.identityHydrationRevision);
    await beforeDeadline(Promise.all(candidates.map(row => row.parsed ?? Promise.resolve())), deadlineAt);
    assert.ok(Date.now() < deadlineAt, 'Original casting assignment deadline expired.');
    assert.ok(candidates.length <= 1, 'Original casting assignment observed multiple normal resume requests.');
    const candidate = candidates[0];
    if (candidate) {
      assert.ok(!candidate.requestFailed && candidate.requestMatches && candidate.requestSessionId === original.sessionId,
        'Original casting assignment observed a mismatched normal resume request.');
      if (candidate.respondedAt === undefined || candidate.bodyStatus === 'reading') return false;
      assert.equal(candidate.httpStatus, 200, 'Original casting assignment normal resume must return HTTP 200.');
      assert.ok(candidate.reply && candidate.reply.sessionId === original.sessionId &&
        candidate.reply.uidHash === original.uidHash && candidate.reply.connectionGeneration === original.connectionGeneration + 1 &&
        (candidate.reply.connected === true || !candidate.reply.connectedFieldPresent && candidate.reply.connected === null) &&
        candidate.reply.player.role === 'player' && candidate.reply.player.fleetGroupId === original.fleetGroupId &&
        candidate.reply.player.assignedRoleId === roleId && candidate.reply.player.activeConsoleRoleId === null &&
        candidate.reply.player.seatId === null && candidate.reply.player.replacementRoleId === null &&
        candidate.reply.player.replacementStatus === null && !candidate.reply.escapeLocked,
      'Original casting assignment normal resume receipt changed its actor, role, fleet, lease or seat scope.');
    }
    const epochChanged = current.connectionGeneration !== original.connectionGeneration ||
      current.identityHydrationRevision !== original.identityHydrationRevision;
    if (epochChanged) {
      assert.equal(current.connectionGeneration, original.connectionGeneration + 1,
        'Original casting assignment changed more than one normal member lease.');
      assert.equal(current.identityHydrationRevision, original.identityHydrationRevision + 1,
        'Original casting assignment changed more than one mounted hydration revision.');
      assert.ok(candidate, 'Original casting assignment epoch changed without its captured normal resume receipt.');
      assert.equal(candidate.reply.connectionGeneration, current.connectionGeneration,
        'Original casting assignment lease does not match its normal resume receipt.');
    } else {
      assert.ok(current.connectionGeneration === original.connectionGeneration &&
        current.identityHydrationRevision === original.identityHydrationRevision,
      'Original casting assignment changed its member epoch unexpectedly.');
      assert.equal(candidate, undefined,
        'Original casting assignment observed a normal resume without its matching new member epoch.');
    }
    const ready = value => memberContract === 'pc11-live-base' && pc11MemberReadiness(value, {
      sessionId: original.sessionId, uidHash: original.uidHash, roleId, stage: 'casting',
    }) && value.phase === 'casting' && value.cycle === 0 && value.setupConfirmed === true &&
      value.sdkResumePending === false && value.memberScopeMatches === true &&
      value.currentCanonicalSeatOwned === false && value.seatId == null && value.activeConsoleRoleId == null &&
      value.currentOwnPlayerConfirmed === true && value.currentMemberBerthPresent === true &&
      value.currentMemberBerthNull === false && value.currentMemberBerthMatches === true;
    const connectedWitnessPending = current.currentOwnPlayerConfirmed === false && current.currentMemberBerthNull === false;
    const berthWitnessPending = current.currentMemberBerthPresent === false && current.currentMemberBerthNull === false &&
      current.currentMemberBerthMatches === false;
    const ordinaryResumeDtoGap = epochChanged && candidate && candidate.reply.connectedFieldPresent === false &&
      current.hasAuth === true && current.sameActor === true && current.uidHash === original.uidHash &&
      current.sessionId === original.sessionId && current.meSessionId === original.sessionId &&
      current.playerRole === 'player' && current.assignedRoleId === roleId && current.fleetGroupId === original.fleetGroupId &&
      current.connected === true && (connectedWitnessPending || berthWitnessPending) && current.currentMemberBerthNull === false &&
      current.kicked === false && current.escapeLocked === false &&
      current.replacementRoleId == null && current.replacementStatus == null && current.phase === 'casting' &&
      current.cycle === 0 && current.setupConfirmed === true && current.memberScopeMatches === true &&
      current.currentCanonicalSeatOwned === false && current.seatId == null && current.activeConsoleRoleId == null &&
      current.sdkHasServerAuthority === true;
    // The ordinary SessionReply can omit either current-member witness while
    // the App publishes its connected and berth feeds separately. Hold only
    // this exact captured +1 lease/hydration at readiness false until both are
    // current; explicit false, null, mismatch, or any other transition fails.
    if (ordinaryResumeDtoGap) return false;
    assert.ok(ready(current), 'Original casting assignment must reach fresh, current, unseated casting readiness.');
    if (candidate) assert.ok(stableMemberFields.every(key => candidate.reply.player[key] === current[observationField[key] ?? key]),
      'Original casting assignment resume reply changed the current member scope.');
    const settled = await beforeDeadline(readAcceptedCurrent(), deadlineAt);
    assert.ok(Date.now() < deadlineAt, 'Original casting assignment SDK acceptance arrived after its deadline.');
    for (const key of stableObservationFields.filter(key => key !== 'assignedRoleId'))
      assert.equal(settled[key], original[key], `Original casting assignment ${key} changed during client acceptance.`);
    assert.equal(settled.assignedRoleId, roleId, 'Original casting assignment must publish only its exact selected role.');
    assert.equal(settled.connectionGeneration, current.connectionGeneration);
    assert.equal(settled.identityHydrationRevision, current.identityHydrationRevision);
    assert.ok(ready(settled) && settled.sdkResumePending === false,
      'Original casting assignment SDK hydration or own-member readiness changed during acceptance.');
    current = settled;
    const finalCandidates = [...requests.values()].filter(row => row.baseline.documentTimeOrigin === original.documentTimeOrigin &&
      row.baseline.uidHash === original.uidHash && row.baseline.sessionId === original.sessionId &&
      row.baseline.connectionGeneration === original.connectionGeneration &&
      row.baseline.identityHydrationRevision === original.identityHydrationRevision);
    assert.equal(finalCandidates.length, candidates.length,
      'Original casting assignment received a late normal resume outside the selected member epoch.');
    record.transitions.push({ status: epochChanged ? 'accepted-casting-normal-resume-bound' : 'accepted-casting-same-epoch',
      at: new Date().toISOString(), before: safeObservation(original), current: safeObservation(current),
      assignment: { endpoint: assignment.endpoint, httpStatus: assignment.httpStatus,
        sessionId: assignment.data.sessionId, targetUidHash: original.uidHash, roleId: assignment.data.roleId,
        setupRevision: assignment.result.setupRevision },
      ...(candidate ? { receipt: { requestedAt: candidate.requestedAt, respondedAt: candidate.respondedAt,
        requestSessionId: candidate.requestSessionId, httpStatus: candidate.httpStatus, reply: candidate.reply } } : {}) });
    baseline = safeObservation(current); record.currentBinding = baseline;
    await beforeDeadline(persist(), deadlineAt); return current;
  }
  return {
    path,
    sample(current) { record.samples.push({ at: new Date().toISOString(), route: safeRoute(page.url()), current: safeObservation(current) }); },
    bind(current) { baseline = safeObservation(current); record.currentBinding = baseline; },
    async prepare(current) {
      baseline = safeObservation(current); record.originalBinding = baseline; record.currentBinding = baseline;
      record.preparedAt = new Date().toISOString(); record.status = 'bound-before-navigation'; await persist();
    },
    async accept(original, current, readAcceptedCurrent, assignment) {
      assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
      if (transition === 'casting-assignment')
        return acceptCastingAssignment(original, current, readAcceptedCurrent, assignment);
      if (documentReload) assert.ok(Number.isFinite(current.documentTimeOrigin) &&
        current.documentTimeOrigin > original.documentTimeOrigin,
        'Original reload must publish a new document before accepting its SDK resume.');
      const candidates = [...requests.values()].filter(row => row.baseline.documentTimeOrigin === original.documentTimeOrigin &&
        row.baseline.uidHash === original.uidHash && row.baseline.sessionId === original.sessionId &&
        row.baseline.connectionGeneration === original.connectionGeneration &&
        row.baseline.identityHydrationRevision === original.identityHydrationRevision);
      await beforeDeadline(Promise.all(candidates.map(row => row.parsed)), deadlineAt);
      assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
      const originalRequests = candidates.filter(row => !row.requestFailed && row.requestMatches && row.requestSessionId === original.sessionId);
      const receipt = originalRequests.find(row =>
        row.httpStatus === 200 && row.reply?.sessionId === original.sessionId && row.reply.uidHash === original.uidHash &&
        row.reply.connectionGeneration === original.connectionGeneration + 1 &&
        row.reply.connectionGeneration === current.connectionGeneration &&
        (row.reply.connected === true || !row.reply.connectedFieldPresent && row.reply.connected === null) && !row.reply.escapeLocked &&
        stableMemberFields.every(key => row.reply.player[key] === current[observationField[key] ?? key]) &&
        row.reply.player.role === 'player');
      // The own-player feed may publish the new lease before HTTP delivery or
      // SDK applySession. Only that exact captured ordinary request may wait;
      // no authority is accepted until the receipt and hydration checks below.
      // HTTP200 body parsing can also begin during the await above.
      if (current.connectionGeneration === original.connectionGeneration + 1 &&
          current.identityHydrationRevision === (documentReload ? 0 : original.identityHydrationRevision) &&
          current.hasAuth === true && current.sameActor === true &&
          stableObservationFields.every(key => (documentReload && key === 'documentTimeOrigin') ||
            current[key] === original[key]) &&
          originalRequests.some(row => row.respondedAt === undefined || row === receipt ||
            row.httpStatus === 200 && row.bodyStatus === 'reading')) return false;
      // A new document initializes its local Zustand hydration counter to0;
      // only the server lease spans documents. Bind positive local hydration
      // to this captured ordinary receipt and the settled SDK fence below.
      const hydrated = documentReload ? Number.isSafeInteger(current.identityHydrationRevision) &&
        current.identityHydrationRevision >= 1 :
        current.identityHydrationRevision === original.identityHydrationRevision + 1;
      assert.ok(receipt && hydrated,
        'Original role navigation epoch changed without its matching normal resume receipt and accepted hydration.');
      // The actual normal DTO omits connected. Current own-player confirmation
      // below supplies that authority; explicit false/malformed reply flags fail.
      // applySession clears the old member envelope. Let the existing feed and
      // SDK finish fence land within the caller's original finite deadline.
      const currentReady = memberContract === 'pc11-live-base' ? cleanReady(current, original) :
        current.connection === 'live' && current.freshness === 'server' && current.currentMemberBerthPresent &&
        current.currentMemberBerthMatches && current.currentOwnPlayerConfirmed;
      if (!currentReady) return false;
      // Reuse the exact post-digest original-member observation. Identity,
      // seat ownership, transaction witness and SDK fence are sampled together
      // after the async yield, inside the caller's original deadline.
      const observed = await beforeDeadline(readAcceptedCurrent(), deadlineAt);
      // Both readers observe the same mounted SDK authority after the digest.
      // Preserve an explicit clientAcceptance object; the presentation reader
      // exposes the same two booleans as sdkHasServerAuthority/sdkResumePending.
      const accepted = Object.hasOwn(observed, 'clientAcceptance') ? observed.clientAcceptance : {
        hasServerAuthority: observed.sdkHasServerAuthority, resumePending: observed.sdkResumePending,
      };
      const settled = { ...observed, clientAcceptance: accepted };
      assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
      for (const key of stableObservationFields) assert.equal(settled[key],
        documentReload && key === 'documentTimeOrigin' ? current[key] : original[key],
        `Original resumed ${key} changed during client acceptance observation.`);
      assert.equal(settled.hasAuth, true); assert.equal(settled.sameActor, true);
      assert.equal(settled.connectionGeneration, receipt.reply.connectionGeneration);
      assert.equal(settled.identityHydrationRevision, current.identityHydrationRevision,
        'Original resumed local hydration changed during client acceptance observation.');
      assert.ok(stableMemberFields.every(key => receipt.reply.player[key] === settled[observationField[key] ?? key]),
        'Original resumed member scope changed during client acceptance observation.');
      const settledReady = memberContract === 'pc11-live-base' ? cleanReady(settled, original) :
        settled.connection === 'live' && settled.freshness === 'server' && settled.currentMemberBerthPresent &&
        settled.currentMemberBerthMatches && settled.currentOwnPlayerConfirmed;
      // Either projection contract still needs the actual mounted SDK's accepted
      // authority and completed resume fence after the asynchronous observation.
      if (!settledReady || accepted?.hasServerAuthority !== true || accepted.resumePending !== false) return false;
      assert.ok(stationPointersMatch(receipt.reply.player, settled, roleId),
        'Original resumed station pointers require canonical current ownership.');
      current = settled;
      record.transitions.push({ status: 'accepted-normal-resume-bound', at: new Date().toISOString(),
        before: safeObservation(original), current: safeObservation(current), receipt: {
          requestedAt: receipt.requestedAt, respondedAt: receipt.respondedAt, requestSessionId: receipt.requestSessionId,
          httpStatus: receipt.httpStatus, reply: receipt.reply }, clientAcceptance: safeObservation(current).clientAcceptance });
      baseline = safeObservation(current); record.currentBinding = baseline; await persist(); return current;
    },
    async finish(error) {
      closed = true;
      for (const [name, callback] of listeners) page.off(name, callback);
      // An unfinished body remains explicitly unfinished in the packet. It
      // cannot extend the primary deadline or delay removal of own listeners.
      record.status = error ? 'failed' : 'selected-current-original-member';
      record.receipts = [...requests.values()].map(({ parsed, ...row }) => { void parsed; return row; });
      if (error) record.originalError = safeError(error, 'original-selection-failed');
      record.closedAt = new Date().toISOString(); await persist();
    },
  };
}
