import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
// Released Firebase transport baseline; security consumer tests precede repair.
export function castingCallableTransport(handler: (request: CallableRequest) => Promise<unknown>) {
  return onCall(handler);
}
