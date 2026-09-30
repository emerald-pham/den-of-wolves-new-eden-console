import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { hasFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
export interface FleetGroupContext {
  readonly sessionId: string; readonly actorUid: string; readonly groupId: string;
  readonly live: boolean; readonly fresh: boolean; readonly active: boolean;
  readonly gmInstanceId?: string; readonly navigationRevision?: number | undefined;
}
export interface FleetGroupNote { readonly id: string; readonly actorUid: string; readonly text: string; readonly sentAt: string }
export interface FleetGroupNotes { readonly groupId: string; readonly messages: readonly FleetGroupNote[] }
type Transport = (name: string, payload: Record<string, unknown>) => Promise<unknown>;
type Action = 'sendFleetGroupMessage' | 'confirmFleetPartition';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const rejected = new Set(['aborted', 'already-exists', 'failed-precondition', 'invalid-argument', 'not-found',
  'out-of-range', 'permission-denied', 'resource-exhausted', 'unauthenticated', 'unimplemented']);
function sameAudience(left: FleetGroupContext, right: FleetGroupContext) {
  return left.sessionId === right.sessionId && left.actorUid === right.actorUid && left.groupId === right.groupId &&
    left.gmInstanceId === right.gmInstanceId;
}
function requireContext(context: FleetGroupContext) {
  if (!context.sessionId || !context.actorUid || !/^fleet-[1-9][0-9]*$/.test(context.groupId) ||
      !context.live || !context.fresh || !context.active) throw new Error('Wait for the live server session and current fleet group.');
}
export function createFleetGroupActions(getContext: () => FleetGroupContext, transport: Transport,
  requestId: () => string = () => `group-${crypto.randomUUID()}`) {
  const attempts = new Map<Action, { context: FleetGroupContext; text: string | undefined; payload: Record<string, unknown> }>();
  const flights = new Map<Action, Promise<unknown>>();
  const current = () => { const value = getContext(); requireContext(value); return value; };
  const guard = (context: FleetGroupContext) => {
    const next = current(); if (!sameAudience(context, next)) throw new Error('The fleet group or actor changed. Refresh the current group.');
  };
  const invoke = async (action: Action, text?: string) => {
    const context = current();
    if (action === 'confirmFleetPartition' && (!context.gmInstanceId || !Number.isSafeInteger(context.navigationRevision) ||
        (context.navigationRevision ?? -1) < 0)) throw new Error('Fresh facilitator navigation authority is required.');
    const previous = attempts.get(action);
    if (previous && (!sameAudience(previous.context, context) || previous.text !== text)) {
      throw new Error('An uncertain action is pending. Retry its exact note with the same actor and fleet group.');
    }
    if (flights.has(action)) return flights.get(action)!;
    const attempt = previous ?? { context, text, payload: action === 'sendFleetGroupMessage'
      ? { sessionId: context.sessionId, expectedGroupId: context.groupId, text: text!, requestId: requestId() }
      : { sessionId: context.sessionId, instanceId: context.gmInstanceId, expectedNavigationRevision: context.navigationRevision, requestId: requestId() } };
    attempts.set(action, attempt);
    const flight = (async () => {
      let reply: unknown;
      try { reply = await transport(action, attempt.payload); }
      catch (error) {
        const code = record(error) && typeof error.code === 'string' ? error.code.replace(/^functions\//, '') : '';
        if (rejected.has(code)) { attempts.delete(action); throw error instanceof Error ? error : new Error(`Group action rejected: ${code}.`); }
        throw new Error('The group action result is uncertain. Retry the exact action while this live context remains current.');
      }
      const valid = record(reply) && reply.status === 'committed' && (action === 'sendFleetGroupMessage'
        ? reply.groupId === context.groupId && reply.messageId === attempt.payload.requestId
        : Number.isSafeInteger(reply.navigationRevision) && (reply.navigationRevision as number) >= 0 && Array.isArray(reply.groupIds) &&
          reply.groupIds.length > 0 && new Set(reply.groupIds).size === reply.groupIds.length &&
          reply.groupIds.every(id => typeof id === 'string' && /^fleet-[1-9][0-9]*$/.test(id)));
      if (!valid) throw new Error('The group action result is uncertain. Retry the exact action.');
      attempts.delete(action); guard(context); return reply;
    })();
    flights.set(action, flight);
    try { return await flight; } finally { flights.delete(action); }
  };
  return {
    send: async (text: string) => {
      if (!text.trim() || text.length > 240) throw new Error('Enter a group note of 1 to 240 characters.');
      return invoke('sendFleetGroupMessage', text.trim());
    },
    confirmPartition: async () => invoke('confirmFleetPartition'),
    read: async (): Promise<FleetGroupNotes> => {
      const context = current();
      const reply = await transport('readFleetGroupMessages', { sessionId: context.sessionId, expectedGroupId: context.groupId });
      guard(context);
      if (!record(reply) || reply.groupId !== context.groupId || !Array.isArray(reply.messages) || reply.messages.length > 20 ||
          reply.messages.some(note => !record(note) || typeof note.id !== 'string' || typeof note.actorUid !== 'string' ||
            typeof note.text !== 'string' || !note.text.trim() || note.text.length > 240 || typeof note.sentAt !== 'string' ||
            !Number.isFinite(Date.parse(note.sentAt)))) throw new Error('Current group notes are unavailable.');
      return { groupId: context.groupId, messages: reply.messages.map(note => {
        const value = note as FleetGroupNote; return { id: value.id, actorUid: value.actorUid, text: value.text, sentAt: value.sentAt };
      }) };
    },
  };
}
export function createCurrentFleetGroupActions() {
  return createFleetGroupActions(() => {
    const { session, me, connection, gmInstance } = useSessionStore.getState();
    return { sessionId: session?.id ?? '', actorUid: me?.uid ?? '', groupId: me?.fleetGroupId ?? '',
      live: connection === 'live', fresh: hasFreshSessionAuthority(), active: session?.phase === 'active' && me?.sessionId === session.id,
      ...(me?.role === 'gm' && gmInstance && gmInstance.sessionId === session?.id && gmInstance.uid === me.uid
        ? { gmInstanceId: gmInstance.id, navigationRevision: session?.playerDiscovery?.revision } : {}) };
  }, async (name, payload) => (await httpsCallable(functions(), name)(payload)).data);
}
