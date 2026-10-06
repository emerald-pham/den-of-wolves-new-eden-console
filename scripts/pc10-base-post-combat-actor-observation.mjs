import assert from 'node:assert/strict';
import { observeWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';

const safeHash = value => typeof value === 'string' && /^[a-f0-9]{16}$/.test(value);

/** Keep the exact authenticated member, document, role and hydrated identity held across one mission receipt. */
export function assertBasePostCombatActorIdentity(current, original) {
  assert.ok(current && original, 'The original Base mission actor identity is required.');
  assert.ok(original.hasAuth === true && original.sameActor === true && original.connected === true &&
    original.escapeLocked === false && original.connection === 'live' && original.freshness === 'server',
  'The held Base mission actor must begin authenticated, connected, unescaped and live.');
  for (const field of ['uidHash', 'authUidHash', 'memberUidHash', 'memberDocumentIdHash']) {
    assert.ok(safeHash(original[field]), `Original Base mission ${field} evidence is required.`);
    assert.ok(current[field] === original[field], `Original Base mission ${field} changed.`);
  }
  assert.ok(original.authUidHash === original.uidHash && original.memberUidHash === original.uidHash &&
    original.memberDocumentIdHash === original.uidHash,
  'Original Base mission Auth, member and document hashes must identify the same source account.');
  for (const field of ['sessionId', 'meSessionId', 'profileSessionId', 'profileRoleId', 'playerRole',
    'assignedRoleId', 'activeConsoleRoleId', 'fleetGroupId']) {
    const nullableGmField = original.playerRole === 'gm' &&
      ['profileSessionId', 'profileRoleId', 'assignedRoleId', 'activeConsoleRoleId', 'fleetGroupId'].includes(field);
    const present = typeof original[field] === 'string' && original[field].length > 0 ||
      (nullableGmField && original[field] === null);
    assert.ok(present, `Original Base mission ${field} evidence is required.`);
    assert.ok(current[field] === original[field], `Original Base mission ${field} changed.`);
  }
  assert.ok(original.sessionId === original.meSessionId &&
    (original.playerRole === 'gm'
      ? original.profileSessionId === null || original.profileSessionId === original.sessionId
      : original.profileSessionId === original.sessionId),
  'Original Base mission Auth/member/profile session identities must agree.');
  for (const field of ['connectionGeneration', 'identityHydrationRevision']) {
    assert.ok(Number.isSafeInteger(original[field]) && original[field] >= 0,
      `Original Base mission ${field} evidence is required.`);
    assert.ok(current[field] === original[field], `Original Base mission ${field} changed.`);
  }
  assert.ok(Number.isFinite(original.documentTimeOrigin) && original.documentTimeOrigin > 0,
    'Original Base mission documentTimeOrigin evidence is required.');
  assert.ok(Number.isFinite(current.documentTimeOrigin) && current.documentTimeOrigin > 0,
    'Current Base mission documentTimeOrigin evidence is required.');
  assert.equal(current.documentTimeOrigin, original.documentTimeOrigin,
    'Original Base mission documentTimeOrigin changed.');
  assert.ok(current.hasAuth === true && current.sameActor === true && current.connected === true &&
    current.escapeLocked === false && current.connection === 'live' && current.freshness === 'server',
  'The original Base mission actor must remain authenticated, connected, unescaped and live.');
  return current;
}

/** Join the generic authenticated view, established rich observer and exact current member identity. */
export function composeBasePostCombatActorObservation(genericObservation, richObservation, exactMemberRead) {
  const exactDocumentTimeOrigin = exactMemberRead?.documentTimeOrigin;
  const documentTimeOriginMatches = Number.isFinite(genericObservation?.documentTimeOrigin) &&
    genericObservation.documentTimeOrigin > 0 &&
    Number.isFinite(exactDocumentTimeOrigin) && exactDocumentTimeOrigin > 0 &&
    exactDocumentTimeOrigin === genericObservation.documentTimeOrigin &&
    (richObservation?.documentTimeOrigin === undefined ||
      (Number.isFinite(richObservation.documentTimeOrigin) &&
        richObservation.documentTimeOrigin > 0 &&
        richObservation.documentTimeOrigin === exactDocumentTimeOrigin));
  const hashesMatch = safeHash(genericObservation?.uidHash) &&
    exactMemberRead?.authUidHash === genericObservation.uidHash &&
    exactMemberRead?.memberUidHash === genericObservation.uidHash &&
    exactMemberRead?.memberDocumentIdHash === genericObservation.uidHash;
  const rolesMatch = exactMemberRead?.profileRoleId === genericObservation?.profileRoleId &&
    exactMemberRead?.profileSessionId === genericObservation?.profileSessionId &&
    exactMemberRead?.playerRole === genericObservation?.playerRole &&
    exactMemberRead?.assignedRoleId === genericObservation?.assignedRoleId &&
    exactMemberRead?.activeConsoleRoleId === genericObservation?.activeConsoleRoleId;
  const memberViewMatches = exactMemberRead?.fleetGroupId === richObservation?.fleetGroupId &&
    exactMemberRead?.connectionGeneration === richObservation?.connectionGeneration &&
    exactMemberRead?.identityHydrationRevision === richObservation?.identityHydrationRevision;
  const nullableGmField = genericObservation?.playerRole === 'gm';
  const roleValueComplete = value => nullableGmField
    ? value === null || (typeof value === 'string' && value.length > 0)
    : typeof value === 'string' && value.length > 0;
  const profileSessionComplete = nullableGmField
    ? exactMemberRead?.profileSessionId === null ||
      (typeof exactMemberRead?.profileSessionId === 'string' && exactMemberRead.profileSessionId.length > 0)
    : typeof exactMemberRead?.profileSessionId === 'string' && exactMemberRead.profileSessionId.length > 0;
  const identityComplete = typeof exactMemberRead?.sessionId === 'string' && exactMemberRead.sessionId.length > 0 &&
    typeof exactMemberRead?.meSessionId === 'string' && exactMemberRead.meSessionId.length > 0 &&
    profileSessionComplete &&
    typeof exactMemberRead?.playerRole === 'string' && exactMemberRead.playerRole.length > 0 &&
    roleValueComplete(exactMemberRead?.profileRoleId) &&
    roleValueComplete(exactMemberRead?.assignedRoleId) &&
    roleValueComplete(exactMemberRead?.activeConsoleRoleId) &&
    roleValueComplete(exactMemberRead?.fleetGroupId) &&
    Number.isSafeInteger(exactMemberRead?.connectionGeneration) && exactMemberRead.connectionGeneration >= 0 &&
    Number.isSafeInteger(exactMemberRead?.identityHydrationRevision) && exactMemberRead.identityHydrationRevision >= 0 &&
    documentTimeOriginMatches;
  const actorBound = genericObservation?.sessionId === richObservation?.sessionId &&
    genericObservation?.uidHash === richObservation?.uidHash && genericObservation?.sameActor === true &&
    richObservation?.sameActor === true && exactMemberRead?.sameActor === true &&
    exactMemberRead?.sessionId === genericObservation.sessionId &&
    exactMemberRead?.meSessionId === genericObservation.sessionId &&
    hashesMatch && rolesMatch && memberViewMatches && identityComplete && documentTimeOriginMatches;
  return {
    ...genericObservation,
    fleetGroupId: exactMemberRead?.fleetGroupId,
    connectionGeneration: exactMemberRead?.connectionGeneration,
    identityHydrationRevision: exactMemberRead?.identityHydrationRevision,
    replacementRoleId: richObservation?.replacementRoleId,
    replacementStatus: richObservation?.replacementStatus,
    seatId: richObservation?.seatId,
    meSessionId: exactMemberRead?.meSessionId,
    authUidHash: exactMemberRead?.authUidHash,
    memberUidHash: exactMemberRead?.memberUidHash,
    memberDocumentIdHash: exactMemberRead?.memberDocumentIdHash,
    profileSessionId: exactMemberRead?.profileSessionId,
    connected: exactMemberRead?.connected,
    escapeLocked: exactMemberRead?.escapeLocked,
    sameActor: actorBound,
  };
}

export async function observeBasePostCombatActor(surface) {
  const richObservation = await observeWolfChoiceActor(surface);
  const exactMemberRead = await surface.page.evaluate(async moduleUrl => {
    const storeModule = await import(moduleUrl);
    const firebaseModule = await import('/src/lib/firebase.ts');
    const { activeDemoActorProfile } = await import('/src/lib/demoActorContext.ts');
    const snapshot = storeModule.useSessionStore.getState(), me = snapshot.me,
      user = firebaseModule.auth().currentUser;
    const hash = async value => typeof value === 'string' && value.length > 0
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
        .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)
      : null;
    const [authUidHash, memberUidHash] = await Promise.all([hash(user?.uid), hash(me?.uid)]);
    // Keep hashes bound to the identities sampled before hashing, then read
    // the current Auth/member tuple once without yielding again. A change during
    // crypto cannot join the captured hashes to a different current account.
    const currentSnapshot = storeModule.useSessionStore.getState();
    const currentMe = currentSnapshot.me, currentUser = firebaseModule.auth().currentUser;
    const sameActor = !!user && !!currentUser && user.uid === me?.uid &&
      currentUser.uid === user.uid && currentMe?.uid === me?.uid;
    // The listener's document key is me.uid, so its safe document hash is the
    // same hash as the source member identity.
    const memberDocumentIdHash = memberUidHash;
    return {
      sessionId: currentSnapshot.session?.id ?? null,
      meSessionId: currentMe?.sessionId ?? null,
      sameActor,
      authUidHash,
      memberUidHash,
      // The mounted players listener reads sessions/{sessionId}/players/{uid};
      // hash that exact source document key without serializing the raw UID.
      memberDocumentIdHash,
      profileRoleId: activeDemoActorProfile?.roleId ?? null,
      profileSessionId: activeDemoActorProfile?.sessionId ?? null,
      playerRole: currentMe?.role ?? null,
      assignedRoleId: currentMe?.assignedRoleId ?? null,
      activeConsoleRoleId: currentMe?.activeConsoleRoleId ?? null,
      fleetGroupId: currentMe?.fleetGroupId ?? null,
      connectionGeneration: currentMe?.connectionGeneration ?? null,
      identityHydrationRevision: currentSnapshot.identityHydrationRevision ?? null,
      // Missing `connected` stays undefined and therefore cannot satisfy the
      // policy's strict true requirement. No connection default is introduced.
      connected: currentMe?.connected,
      // Player.escapeState is optional in the mounted parser: absence means no
      // current escape record; a parsed record means the actor is escape-locked.
      escapeLocked: currentMe?.escapeState != null,
      documentTimeOrigin: performance.timeOrigin,
    };
  }, surface.storeModuleUrl());
  const genericObservation = await surface.observe();
  return composeBasePostCombatActorObservation(genericObservation, richObservation, exactMemberRead);
}
