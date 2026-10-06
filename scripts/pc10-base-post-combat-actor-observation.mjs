import { observeWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';

/** Join the generic authenticated view to the established rich member observer
 * and the three exact member-state fields that observer does not expose. */
export function composeBasePostCombatActorObservation(genericObservation, richObservation, exactMemberRead) {
  const actorBound = genericObservation?.sessionId === richObservation?.sessionId &&
    genericObservation?.uidHash === richObservation?.uidHash && genericObservation?.sameActor === true &&
    richObservation?.sameActor === true && exactMemberRead?.sameActor === true &&
    exactMemberRead?.sessionId === genericObservation.sessionId &&
    exactMemberRead?.meSessionId === genericObservation.sessionId;
  return {
    ...genericObservation,
    fleetGroupId: richObservation?.fleetGroupId,
    connectionGeneration: richObservation?.connectionGeneration,
    identityHydrationRevision: richObservation?.identityHydrationRevision,
    replacementRoleId: richObservation?.replacementRoleId,
    replacementStatus: richObservation?.replacementStatus,
    seatId: richObservation?.seatId,
    meSessionId: exactMemberRead?.meSessionId,
    connected: exactMemberRead?.connected,
    escapeLocked: exactMemberRead?.escapeLocked,
    sameActor: actorBound,
  };
}

export async function observeBasePostCombatActor(surface) {
  const richObservation = await observeWolfChoiceActor(surface);
  const exactMemberRead = await surface.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const { auth } = await import('/src/lib/firebase.ts');
    const snapshot = useSessionStore.getState(), me = snapshot.me, user = auth().currentUser;
    return {
      sessionId: snapshot.session?.id ?? null,
      meSessionId: me?.sessionId ?? null,
      sameActor: !!user && user.uid === me?.uid,
      // Missing `connected` stays undefined and therefore cannot satisfy the
      // policy's strict true requirement. No connection default is introduced.
      connected: me?.connected,
      // Player.escapeState is optional in the mounted parser: absence means no
      // current escape record; a parsed record means the actor is escape-locked.
      escapeLocked: me?.escapeState != null,
    };
  }, surface.storeModuleUrl());
  const genericObservation = await surface.observe();
  return composeBasePostCombatActorObservation(genericObservation, richObservation, exactMemberRead);
}
