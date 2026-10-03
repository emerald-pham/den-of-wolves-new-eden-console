import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { hasFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export interface FleetGroupContext {
  readonly sessionId: string; readonly actorUid: string; readonly groupId: string;
  readonly live: boolean; readonly fresh: boolean; readonly active: boolean;
  readonly role?: 'player' | 'gm'; readonly fleetPartitionRevision?: number;
  readonly gmInstanceId?: string; readonly navigationRevision?: number | undefined;
  readonly currentCycle?: number | undefined; readonly shuttleControlRevisions?: Readonly<Record<string, number>>;
}
export interface FleetGroupNote { readonly id: string; readonly actorUid: string; readonly text: string; readonly sentAt: string }
export interface FleetGroupNotes { readonly groupId: string; readonly messages: readonly FleetGroupNote[] }
export interface FleetKnownSystemShareReply {
  readonly status: 'committed'; readonly requestId: string; readonly groupId: string;
  readonly coordinate: string; readonly recipientShipIds: readonly string[]; readonly navigationRevision: number;
}
export type FleetTaxiTransferReply =
  | { readonly status: 'committed' | 'replayed'; readonly requestId: string; readonly shuttleId: FleetTaxiShuttleId;
      readonly kind: 'players'; readonly sourceGroupId: string; readonly targetShipId: string; readonly cycle: number;
      readonly playerUids: readonly string[] }
  | { readonly status: 'committed' | 'replayed'; readonly requestId: string; readonly shuttleId: FleetTaxiShuttleId;
      readonly kind: 'fuel'; readonly sourceGroupId: string; readonly targetShipId: string; readonly cycle: number;
      readonly units: 1 | 2; readonly sourceFuelRemaining: number };
export interface FleetGroupNavigationProjection {
  readonly groupId: string;
  readonly navigationRevision: number;
  readonly fleetPartitionRevision: number;
  readonly sampledAt: string;
  readonly ships: readonly { readonly shipId: string; readonly fleetGroupId: string; readonly coordinate: string }[];
  readonly transits: readonly { readonly shuttleId: string; readonly fleetGroupId: string;
    readonly currentPosition: Readonly<{ x: number; y: number; z: number }>;
    readonly sampledAt: string; readonly destinationShipId: string; readonly arrivesAt: string }[];
}
type Transport = (name: string, payload: Record<string, unknown>) => Promise<unknown>;
export type FleetTaxiPayload = Readonly<{ kind: 'players'; playerUids: readonly string[] }> | Readonly<{ kind: 'fuel'; units: 1 | 2 }>;
export type FleetTaxiShuttleId = 'starlight' | 'hummingbird';
type Action = 'sendFleetGroupMessage' | 'confirmFleetPartition' | 'shareKnownSystemDetails' | 'sendScoutTaxiTransfer';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const rejected = new Set(['aborted', 'already-exists', 'failed-precondition', 'invalid-argument', 'not-found',
  'out-of-range', 'permission-denied', 'resource-exhausted', 'unauthenticated', 'unimplemented']);

function sameAudience(left: FleetGroupContext, right: FleetGroupContext) {
  return left.sessionId === right.sessionId && left.actorUid === right.actorUid && left.groupId === right.groupId &&
    left.role === right.role && left.gmInstanceId === right.gmInstanceId;
}
function requireContext(context: FleetGroupContext) {
  if (!context.sessionId || !context.actorUid ||
      (context.role !== 'gm' && !/^fleet-[1-9][0-9]*$/.test(context.groupId)) ||
      (context.role === 'gm' && !context.gmInstanceId) ||
      !context.live || !context.fresh || !context.active) throw new Error('Wait for the live server session and current fleet group.');
}
function strictFleetGroupNavigationProjection(value: unknown): FleetGroupNavigationProjection {
  const point = (candidate: unknown): candidate is { x: number; y: number; z: number } => record(candidate) &&
    Object.keys(candidate).length === 3 && ['x', 'y', 'z'].every(key => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]));
  if (!record(value) || Object.keys(value).some(key => !['groupId', 'navigationRevision', 'fleetPartitionRevision', 'sampledAt', 'ships', 'transits'].includes(key)) ||
      typeof value.groupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(value.groupId) ||
      !Number.isSafeInteger(value.navigationRevision) || (value.navigationRevision as number) < 0 ||
      !Number.isSafeInteger(value.fleetPartitionRevision) || (value.fleetPartitionRevision as number) < 0 ||
      typeof value.sampledAt !== 'string' || !Number.isFinite(Date.parse(value.sampledAt as string)) ||
      !Array.isArray(value.ships) || value.ships.length < 1 ||
      !Array.isArray(value.transits) || value.transits.length > 32) throw new Error('Current fleet navigation is unavailable.');
  const ships = value.ships.map(ship => {
    if (!record(ship) || Object.keys(ship).some(key => !['shipId', 'fleetGroupId', 'coordinate'].includes(key)) ||
        typeof ship.shipId !== 'string' || typeof ship.fleetGroupId !== 'string' || ship.fleetGroupId !== value.groupId ||
        typeof ship.coordinate !== 'string' || !/^\d{4}$/.test(ship.coordinate)) throw new Error('Current fleet navigation is malformed.');
    return { shipId: ship.shipId, fleetGroupId: ship.fleetGroupId, coordinate: ship.coordinate };
  });
  if (new Set(ships.map(ship => ship.shipId)).size !== ships.length) throw new Error('Current fleet navigation has duplicate ships.');
  const shipIds = new Set(ships.map(ship => ship.shipId));
  const transits = value.transits.map(transit => {
    if (!record(transit) || Object.keys(transit).some(key => !['shuttleId', 'fleetGroupId', 'currentPosition', 'sampledAt', 'destinationShipId', 'arrivesAt'].includes(key)) ||
        typeof transit.shuttleId !== 'string' || typeof transit.fleetGroupId !== 'string' || transit.fleetGroupId !== value.groupId ||
        !point(transit.currentPosition) || transit.sampledAt !== value.sampledAt || !Number.isFinite(Date.parse(transit.sampledAt as string)) ||
        typeof transit.destinationShipId !== 'string' || !shipIds.has(transit.destinationShipId) ||
        typeof transit.arrivesAt !== 'string' || !Number.isFinite(Date.parse(transit.arrivesAt))) throw new Error('Current shuttle transit is malformed.');
      return { shuttleId: transit.shuttleId as string, fleetGroupId: transit.fleetGroupId as string,
        currentPosition: { x: transit.currentPosition.x, y: transit.currentPosition.y, z: transit.currentPosition.z },
      sampledAt: transit.sampledAt as string, destinationShipId: transit.destinationShipId as string,
      arrivesAt: transit.arrivesAt as string };
  });
  if (new Set(transits.map(transit => transit.shuttleId)).size !== transits.length) throw new Error('Current shuttle transits are duplicated.');
  return { groupId: value.groupId, navigationRevision: value.navigationRevision as number,
    fleetPartitionRevision: value.fleetPartitionRevision as number, sampledAt: value.sampledAt, ships, transits };
}

export function createFleetGroupActions(getContext: () => FleetGroupContext, transport: Transport,
  requestId: () => string = () => `group-${crypto.randomUUID()}`) {
  const attempts = new Map<Action, { context: FleetGroupContext; text: string | undefined; payload: Record<string, unknown> }>();
  const flights = new Map<Action, Promise<unknown>>();
  const current = () => { const value = getContext(); requireContext(value); return value; };
  const guard = (context: FleetGroupContext) => {
    const next = current(); if (!sameAudience(context, next)) throw new Error('The fleet group or actor changed. Refresh the current group.');
  };
  const invoke = async (action: Action, text?: string, extra?: Record<string, unknown>) => {
    const context = current();
    if (action === 'confirmFleetPartition' && (!context.gmInstanceId || !Number.isSafeInteger(context.navigationRevision) ||
        (context.navigationRevision ?? -1) < 0)) throw new Error('Fresh facilitator navigation authority is required.');
    if (action === 'shareKnownSystemDetails' && (!Number.isSafeInteger(context.navigationRevision) ||
        (context.navigationRevision ?? -1) < 0)) throw new Error('Fresh ship knowledge is required before sharing.');
    if (action === 'sendScoutTaxiTransfer' && (!Number.isSafeInteger(context.navigationRevision) ||
        (context.navigationRevision ?? -1) < 0 || !Number.isSafeInteger(context.fleetPartitionRevision) ||
        (context.fleetPartitionRevision ?? -1) < 0 || !Number.isSafeInteger(context.currentCycle) ||
        (context.currentCycle ?? 0) < 1)) throw new Error('Fresh cycle, navigation, and fleet membership authority is required for taxi transfer.');
    const previous = attempts.get(action);
    if (previous && (!sameAudience(previous.context, context) || previous.text !== text)) {
      throw new Error('An uncertain action is pending. Retry the exact action with the same actor and fleet group.');
    }
    if (flights.has(action)) return flights.get(action)!;
    const basePayload: Record<string, unknown> = action === 'sendFleetGroupMessage'
      ? { sessionId: context.sessionId, expectedGroupId: context.groupId, text: text!, requestId: requestId() }
      : action === 'shareKnownSystemDetails'
        ? { ...extra, sessionId: context.sessionId, expectedGroupId: context.groupId,
          expectedNavigationRevision: context.navigationRevision, requestId: requestId() }
        : action === 'sendScoutTaxiTransfer'
          ? { ...extra, sessionId: context.sessionId, expectedGroupId: context.groupId,
            expectedNavigationRevision: context.navigationRevision,
            expectedFleetPartitionRevision: context.fleetPartitionRevision, requestId: requestId() }
        : { sessionId: context.sessionId, instanceId: context.gmInstanceId,
          expectedNavigationRevision: context.navigationRevision, requestId: requestId() };
    const attempt = previous ?? { context, text, payload: basePayload };
    attempts.set(action, attempt);
    const flight = (async () => {
      let reply: unknown;
      try { reply = await transport(action, attempt.payload); }
      catch (error) {
        const code = record(error) && typeof error.code === 'string' ? error.code.replace(/^functions\//, '') : '';
        if (rejected.has(code)) { attempts.delete(action); throw error instanceof Error ? error : new Error(`Group action rejected: ${code}.`); }
        throw new Error('The group action result is uncertain. Retry the exact action while this live context remains current.');
      }
      const valid = record(reply) && (reply.status === 'committed' || (action === 'sendScoutTaxiTransfer' && reply.status === 'replayed')) && (action === 'sendFleetGroupMessage'
        ? reply.groupId === context.groupId && reply.messageId === attempt.payload.requestId
        : action === 'shareKnownSystemDetails'
          ? reply.groupId === context.groupId && reply.requestId === attempt.payload.requestId &&
            reply.coordinate === attempt.payload.coordinate && Array.isArray(reply.recipientShipIds) &&
            reply.recipientShipIds.length > 0 && new Set(reply.recipientShipIds).size === reply.recipientShipIds.length &&
            reply.recipientShipIds.every(id => typeof id === 'string') &&
            Number.isSafeInteger(reply.navigationRevision) && (reply.navigationRevision as number) >= (context.navigationRevision ?? 0)
          : action === 'sendScoutTaxiTransfer'
            ? reply.requestId === attempt.payload.requestId && reply.shuttleId === attempt.payload.shuttleId &&
              reply.sourceGroupId === context.groupId && reply.targetShipId === attempt.payload.targetShipId &&
              reply.kind === (attempt.payload.payload as Record<string, unknown>)?.kind &&
              (reply.kind === 'fuel' ? reply.units === (attempt.payload.payload as Record<string, unknown>)?.units &&
                Number.isSafeInteger(reply.sourceFuelRemaining) && (reply.sourceFuelRemaining as number) >= 0
                : Array.isArray(reply.playerUids) && isDeepEqualStrings(reply.playerUids, (attempt.payload.payload as Record<string, unknown>)?.playerUids))
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
    share: async (coordinate: string, recipientShipIds: 'all' | readonly string[]) => {
      if (!/^\d{4}$/.test(coordinate) || (recipientShipIds !== 'all' &&
          (!recipientShipIds.length || new Set(recipientShipIds).size !== recipientShipIds.length ||
            recipientShipIds.some(id => typeof id !== 'string')))) {
        throw new Error('Choose a known system and one or more current group ships.');
      }
      return await invoke('shareKnownSystemDetails', JSON.stringify({ coordinate, recipientShipIds }), { coordinate, recipientShipIds }) as FleetKnownSystemShareReply;
    },
    transferTaxi: async (input: Readonly<{ shuttleId: FleetTaxiShuttleId; targetShipId: string; payload: FleetTaxiPayload }>) => {
      if ((input.shuttleId !== 'starlight' && input.shuttleId !== 'hummingbird') ||
          !/^[a-z][a-z0-9-]{0,31}$/.test(input.targetShipId) ||
          (input.payload.kind === 'fuel' ? input.payload.units !== 1 && input.payload.units !== 2
            : input.payload.kind !== 'players' || input.payload.playerUids.length < 1 || input.payload.playerUids.length > 2 ||
              new Set(input.payload.playerUids).size !== input.payload.playerUids.length ||
              input.payload.playerUids.some(id => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)))) {
        throw new Error('Choose one legal shuttle destination and up to two current taxi passengers or two fuel units.');
      }
      const context = current();
      const shuttleControlRevision = context.shuttleControlRevisions?.[input.shuttleId];
      if (!Number.isSafeInteger(shuttleControlRevision) || (shuttleControlRevision ?? -1) < 0) {
        throw new Error('Current shuttle control authority is unavailable.');
      }
      const data = { shuttleId: input.shuttleId, targetShipId: input.targetShipId,
        expectedCycle: context.currentCycle, expectedControlRevision: shuttleControlRevision, payload: input.payload };
      return await invoke('sendScoutTaxiTransfer', JSON.stringify(data), data) as FleetTaxiTransferReply;
    },
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
    readNavigation: async (viewerShipId?: string): Promise<FleetGroupNavigationProjection> => {
      const context = current();
      if ((context.role === 'gm') !== (viewerShipId !== undefined)) {
        throw new Error(context.role === 'gm' ? 'Choose a current ship for the facilitator plot.' : 'Players cannot choose another fleet group.');
      }
      if (!Number.isSafeInteger(context.navigationRevision) || (context.navigationRevision ?? -1) < 0 ||
          !Number.isSafeInteger(context.fleetPartitionRevision) || (context.fleetPartitionRevision ?? -1) < 0) {
        throw new Error('Fresh navigation and fleet membership revisions are required.');
      }
      const payload = { sessionId: context.sessionId, requestId: requestId(),
        expectedNavigationRevision: context.navigationRevision,
        expectedFleetPartitionRevision: context.fleetPartitionRevision,
        ...(viewerShipId ? { viewerShipId, instanceId: context.gmInstanceId } : { expectedGroupId: context.groupId }) };
      const reply = await transport('readFleetGroupNavigation', payload);
      guard(context);
      const projection = strictFleetGroupNavigationProjection(reply);
      if (context.role !== 'gm' && projection.groupId !== context.groupId) {
        throw new Error('The server returned a different fleet group. Refresh before using the plot.');
      }
      return projection;
    },
  };
}
export function createCurrentFleetGroupActions() {
  return createFleetGroupActions(() => {
    const { session, me, connection, gmInstance } = useSessionStore.getState();
  const sessionFields: Record<string, unknown> = record(session) ? session : {};
    const navigationRevision = me?.role === 'gm'
      ? (Number.isSafeInteger(session?.gmNavigationRevision) ? session!.gmNavigationRevision : undefined)
      : (Number.isSafeInteger(session?.playerDiscovery?.revision) ? session!.playerDiscovery!.revision : undefined);
    const fleetPartitionRevision = Number.isSafeInteger(sessionFields.fleetPartitionRevision)
      ? sessionFields.fleetPartitionRevision as number : 0;
    const shuttleControlRevisions = record(session?.shuttleControl)
      ? Object.fromEntries(Object.entries(session!.shuttleControl).flatMap(([id, control]) =>
        record(control) && Number.isSafeInteger(control.revision) ? [[id, control.revision as number]] : []))
      : {};
    return { sessionId: session?.id ?? '', actorUid: me?.uid ?? '', groupId: me?.fleetGroupId ?? '',
      live: connection === 'live', fresh: hasFreshSessionAuthority(), active: session?.phase === 'active' && me?.sessionId === session.id,
      role: me?.role === 'gm' ? 'gm' as const : 'player' as const,
      fleetPartitionRevision, navigationRevision, shuttleControlRevisions,
      ...(typeof session?.currentTurn === 'number' ? { currentCycle: session.currentTurn } : {}),
      ...(me?.role === 'gm' && gmInstance && gmInstance.sessionId === session?.id && gmInstance.uid === me.uid
        ? { gmInstanceId: gmInstance.id } : {}) };
  }, async (name, payload) => (await httpsCallable(functions(), name)(payload)).data);
}

export async function readFleetGroupNavigation(viewerShipId?: string): Promise<FleetGroupNavigationProjection> {
  return createCurrentFleetGroupActions().readNavigation(viewerShipId);
}

function isDeepEqualStrings(value: unknown, expected: unknown): boolean {
  return Array.isArray(value) && Array.isArray(expected) && value.length === expected.length &&
    value.every((entry, index) => typeof entry === 'string' && entry === expected[index]);
}
