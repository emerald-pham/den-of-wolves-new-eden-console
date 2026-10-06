/** Baseline API for the test-first mounted actor-observation regression. */
export function composeBasePostCombatActorObservation(genericObservation) {
  return { ...genericObservation };
}

export async function observeBasePostCombatActor(surface) {
  return surface.observe();
}
