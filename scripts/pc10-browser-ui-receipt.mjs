import { createUiReceiptDiagnostic } from './pc10-ui-receipt-diagnostics.mjs';
import { rememberProofFailure } from './pc10-proof-failure-evidence.mjs';
export { attachUiReceiptDiagnostics, retainUiReceiptContext } from './pc10-ui-receipt-diagnostics.mjs';

/** Arm the original response observer before the UI action. Registered
 * diagnostics persist the consumed state before the action, without changing
 * the caller's predicate, timeout, request, authority checks or action count. */
export async function observeUiReceipt({ waitForResponse, choose, page, diagnostics, consumed }) {
  const diagnostic = createUiReceiptDiagnostic(page, diagnostics, consumed);
  let choiceCompleted = false;
  try {
    const observed = waitForResponse().then(
      response => ({ response }),
      error => ({ error }),
    );
    diagnostic?.observerArmed();
    if (diagnostic) await diagnostic.prepare();
    diagnostic?.choiceStarted();
    await choose();
    choiceCompleted = true; diagnostic?.choiceCompleted();
    const result = await observed;
    if ('error' in result) throw result.error;
    diagnostic?.responseObserved(result.response);
    if (diagnostic) await diagnostic.finish('response-observed');
    return result.response;
  } catch (error) {
    rememberProofFailure(error, { operation: 'observeUiReceipt', consumed,
      choiceCompleted, diagnosticPath: diagnostic?.path });
    if (diagnostic) await diagnostic.finish(choiceCompleted ? 'response-observer-failed' : 'choice-failed', error);
    throw error;
  }
}
