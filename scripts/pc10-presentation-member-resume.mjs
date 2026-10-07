import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Passive account-recovery evidence. The original core station observer and
// its exact Icebreaker epoch/seat contract are unchanged.
export function createPresentationMemberResumeObserver(page, { sessionId, deadlineAt, knownRoleIds }) {
  if (typeof page.on !== 'function' || typeof page.off !== 'function') return null;
  const requests = new Map(), roles = new Set(knownRoleIds), listeners = [];
  const identityKeys = ['documentTimeOrigin', 'uidHash', 'profileRoleId', 'profileSessionId', 'sessionId',
    'meSessionId', 'playerRole', 'fleetGroupId', 'assignedRoleId', 'replacementRoleId', 'replacementStatus', 'escapeLocked'];
  let baseline, closed = false, accepted = 0;
  const projection = value => Object.fromEntries([...identityKeys, 'activeConsoleRoleId', 'seatId',
    'connectionGeneration', 'identityHydrationRevision'].map(key => [key, value[key]]));
  const safeReply = body => {
    const reply = body?.result, player = reply?.player;
    const nullableRole = value => value == null || typeof value === 'string' && roles.has(value);
    if (!reply || body.error || !player || typeof player.uid !== 'string' || player.uid.length < 1 || player.uid.length > 128 ||
        player.sessionId !== sessionId || reply.session?.id !== sessionId || player.role !== 'player' ||
        typeof player.fleetGroupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(player.fleetGroupId) ||
        !Number.isSafeInteger(player.connectionGeneration) || player.connectionGeneration < 1 ||
        ['assignedRoleId', 'activeConsoleRoleId', 'seatId', 'replacementRoleId'].some(key => !nullableRole(player[key])) ||
        player.replacementStatus != null || player.escapeState != null ||
        Object.hasOwn(player, 'connected') && typeof player.connected !== 'boolean') return null;
    return { uidHash: createHash('sha256').update(player.uid).digest('hex').slice(0, 16), sessionId,
      playerRole: 'player', fleetGroupId: player.fleetGroupId, connectionGeneration: player.connectionGeneration,
      assignedRoleId: player.assignedRoleId ?? null, activeConsoleRoleId: player.activeConsoleRoleId ?? null,
      seatId: player.seatId ?? null, replacementRoleId: player.replacementRoleId ?? null, replacementStatus: null,
      connectedFieldPresent: Object.hasOwn(player, 'connected'), connected: player.connected ?? null };
  };
  const on = (name, listener) => { page.on(name, listener); listeners.push([name, listener]); };
  on('request', request => {
    try {
      const url = new URL(request.url());
      if (request.method() !== 'POST' || url.protocol !== 'http:' ||
          !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/[^/]+\/us-central1\/resumeSession$/.test(url.pathname)) return;
      const data = request.postDataJSON()?.data;
      requests.set(request, { baseline: baseline ? projection(baseline) : null,
        requestMatches: !!data && Object.keys(data).length === 1 && data.sessionId === sessionId,
        status: 'request-observed', httpStatus: null, reply: null });
    } catch { /* Invalid transport metadata grants no receipt. */ }
  });
  on('response', response => {
    const row = requests.get(response.request()); if (!row || closed) return;
    row.httpStatus = Number.isSafeInteger(response.status()) ? response.status() : null;
    row.parsed = Promise.resolve().then(() => response.json()).then(body => {
      if (closed) return; row.reply = safeReply(body); row.status = row.reply ? 'typed-reply-observed' : 'invalid-reply';
    }).catch(() => { if (!closed) row.status = 'reply-read-failed'; });
  });
  const snapshot = () => ({ purpose: 'presentation-account-normal-resume', acceptedTransitions: accepted,
    noSdkNavigationOrGameplayActionIssued: true, closed,
    requests: [...requests.values()].map(({ parsed, ...row }) => row) });
  async function bounded(promise) {
    assert.ok(Date.now() < deadlineAt, 'Original presentation start readiness deadline expired.'); let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Original presentation start readiness deadline expired.')), Math.max(1, deadlineAt - Date.now()));
    })]); } finally { clearTimeout(timer); }
  }
  return {
    bind: current => { baseline = projection(current); }, snapshot,
    async accept(original, current, readAcceptedCurrent) {
      const candidates = [...requests.values()].filter(row => row.baseline &&
        identityKeys.every(key => row.baseline[key] === original[key]));
      await bounded(Promise.all(candidates.map(row => row.parsed)));
      const receipt = candidates.find(row => row.requestMatches && row.httpStatus === 200 && row.reply &&
        row.reply.uidHash === original.uidHash && row.reply.sessionId === original.sessionId &&
        row.reply.connectionGeneration > row.baseline.connectionGeneration && row.reply.connectionGeneration === current.connectionGeneration &&
        current.identityHydrationRevision === row.baseline.identityHydrationRevision + 1 &&
        row.baseline.identityHydrationRevision >= original.identityHydrationRevision &&
        row.reply.connected !== false && ['playerRole', 'fleetGroupId', 'assignedRoleId', 'replacementRoleId', 'replacementStatus',
          'activeConsoleRoleId', 'seatId'].every(key => row.reply[key] === current[key]));
      assert.ok(receipt, 'Presentation epoch changed without this document matching normal resume receipt and accepted hydration.');
      const settled = await bounded(readAcceptedCurrent());
      for (const key of identityKeys) assert.equal(settled[key], original[key], `Original resumed presentation ${key} changed.`);
      assert.deepEqual(settled.invalidFields, []);
      assert.equal(settled.hasAuth, true); assert.equal(settled.sameActor, true);
      assert.equal(settled.connectionGeneration, receipt.reply.connectionGeneration);
      assert.equal(settled.identityHydrationRevision, receipt.baseline.identityHydrationRevision + 1);
      for (const key of ['activeConsoleRoleId', 'seatId']) assert.equal(settled[key], receipt.reply[key]);
      if (settled.connection !== 'live' || settled.freshness !== 'server' || !settled.currentOwnPlayerConfirmed ||
          !settled.sdkHasServerAuthority || settled.sdkResumePending) return null;
      if (settled.profileRoleId === 'press-officer' && (!settled.currentMemberBerthPresent ||
          !settled.currentMemberBerthNull || !settled.memberScopeMatches)) return null;
      accepted++; return settled;
    },
    close() { if (closed) return; closed = true; for (const [name, listener] of listeners) page.off(name, listener); },
  };
}
