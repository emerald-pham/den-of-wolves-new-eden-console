/** Additive proof helpers; no gameplay mutation or identity substitution. */
export async function completeBeforeStart(context, prepare, start) {
  await prepare?.(context);
  return start();
}
