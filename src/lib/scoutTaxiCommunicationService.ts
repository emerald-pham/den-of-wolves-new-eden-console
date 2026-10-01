import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface ScoutTaxiCommunicationContext {
  readonly sessionId: string; readonly actorUid: string; readonly groupId: string;
  readonly shuttleId: 'starlight' | 'hummingbird'; readonly cycle: number;
  readonly controlRevision: number; readonly navigationRevision: number; readonly ready: boolean;
}
export interface ScoutTaxiCommunicationReply {
  readonly status: 'committed' | 'replayed'; readonly requestId: string;
  readonly shuttleId: string; readonly targetShipId: string; readonly cycle: number;
}
type Transport = (payload: Record<string, unknown>) => Promise<unknown>;
const definitive = new Set(['aborted', 'already-exists', 'failed-precondition', 'invalid-argument',
  'not-found', 'out-of-range', 'permission-denied', 'resource-exhausted', 'unauthenticated', 'unimplemented']);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Retain uncertain requests exactly; never publish a result into a changed audience. */
export function createScoutTaxiCommunicationActions(getContext: () => ScoutTaxiCommunicationContext,
  transport: Transport = async payload => (await httpsCallable(functions(), 'sendScoutTaxiCourier')(payload)).data,
  requestId: () => string = () => `taxi-${crypto.randomUUID()}`) {
  let pending: { key: string; audience: string; target: string; text: string; payload: Record<string, unknown> } | null = null;
  let flight: Promise<ScoutTaxiCommunicationReply> | null = null;
  const current = () => {
    const context = getContext();
    if (!context.ready || !context.sessionId || !context.actorUid || !/^fleet-[1-9][0-9]*$/.test(context.groupId) ||
        !Number.isSafeInteger(context.cycle) || context.cycle < 1 ||
        !Number.isSafeInteger(context.controlRevision) || context.controlRevision < 0 ||
        !Number.isSafeInteger(context.navigationRevision) || context.navigationRevision < 0) {
      throw new Error('Wait for the live courier holder, cycle and navigation authority.');
    }
    return { context, key: JSON.stringify(context) };
  };
  return { send: async (targetShipId: string, rawText: string): Promise<ScoutTaxiCommunicationReply> => {
    const text = rawText.trim();
    if (!text || rawText.length > 200) throw new Error('Enter a courier note of 1 to 200 characters.');
    if (!/^[\w-]{1,128}$/.test(targetShipId)) throw new Error('Choose a courier destination ship.');
    const { context, key } = current();
    const audience = JSON.stringify([context.sessionId, context.actorUid, context.groupId, context.shuttleId]);
    if (pending && (pending.audience !== audience || pending.target !== targetShipId || pending.text !== text)) {
      throw new Error('An uncertain courier trip is pending. Retry the exact note and destination with the same authority.');
    }
    if (flight) return flight;
    const attempt = pending ?? { key, audience, target: targetShipId, text, payload: {
      sessionId: context.sessionId, requestId: requestId(), shuttleId: context.shuttleId,
      targetShipId, text, expectedCycle: context.cycle, expectedControlRevision: context.controlRevision,
      expectedNavigationRevision: context.navigationRevision,
    } };
    const reconciling = attempt.key !== key;
    pending = attempt;
    flight = (async () => {
      let reply: unknown;
      try { reply = await transport(reconciling ? { ...attempt.payload, reconcileOnly: true } : attempt.payload); }
      catch (error) {
        const code = record(error) && typeof error.code === 'string' ? error.code.replace(/^functions\//, '') : '';
        if (definitive.has(code) && !reconciling) {
          pending = null;
          throw error instanceof Error ? error : new Error(`Courier trip rejected: ${code}. Refresh the current state.`);
        }
        throw new Error('The courier result is uncertain. Retry the exact note and destination.');
      }
      if (!record(reply) || Object.keys(reply).some(k => !['status', 'requestId', 'shuttleId', 'targetShipId', 'cycle'].includes(k)) ||
          !(reconciling ? ['replayed', 'not-delivered'] : ['committed', 'replayed']).includes(String(reply.status)) || reply.requestId !== attempt.payload.requestId ||
          reply.shuttleId !== context.shuttleId || reply.targetShipId !== targetShipId || reply.cycle !== attempt.payload.expectedCycle) {
        throw new Error('The courier result is uncertain. Retry the exact note and destination.');
      }
      if (current().key !== key) throw new Error('Courier authority changed. Refresh your current group.');
      pending = null;
      if (reply.status === 'not-delivered') throw new Error('Previous courier was not delivered. Your draft is preserved. Send again with current authority.');
      return reply as unknown as ScoutTaxiCommunicationReply;
    })();
    try { return await flight; } finally { flight = null; }
  } };
}
