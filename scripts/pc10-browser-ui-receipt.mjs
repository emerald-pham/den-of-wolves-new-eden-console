/** Arm the real browser response observer before choosing the UI control.
 * The observer's rejection is retained for the gate, and already handled if
 * the control fails first, so diagnostics and cleanup can preserve that failure.
 */
export async function observeUiReceipt({ waitForResponse, choose }) {
  const observed = waitForResponse().then(
    response => ({ response }),
    error => ({ error }),
  );
  await choose();
  const result = await observed;
  if ('error' in result) throw result.error;
  return result.response;
}
