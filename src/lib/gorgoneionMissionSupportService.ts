import { doc, getDocFromServer, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import { db } from './firestore';
import { functions } from './firebase';
import {
  captureSessionAuthority,
  hasFreshSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
  type SessionAuthorityCheckpoint,
} from './sessionMutationAuthority';

const ROLE_ID = 'gorgoneion-captain';
const SUPPORT_CARD_COUNT = 5;
const MISSION_CARD_IDS = new Set<string>([
  ...['A', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].flatMap((rank) =>
    ['♥', '♦', '♣'].map((suit) => `${rank}${suit}`)),
]);

type RecordValue = Record<string, unknown>;

export interface GorgoneionMissionSupportProjection {
  readonly sessionId: string;
  readonly actorUid: string;
  readonly hostShipId: string;
  readonly dockingRevision: number;
  readonly dealtCount: 0;
  readonly cardIds: readonly string[];
}

export interface GorgoneionMissionSupportCommandReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly cardCount: typeof SUPPORT_CARD_COUNT;
}

export interface GorgoneionMissionSupportApplyInput {
  readonly projection: GorgoneionMissionSupportProjection;
  readonly topCardIds: readonly string[];
  readonly bottomCardIds: readonly string[];
}

interface MissionSupportAuthority {
  readonly sessionId: string;
  readonly actorUid: string;
  readonly hostShipId: string;
  readonly dockingRevision: number;
  readonly checkpoint: SessionAuthorityCheckpoint;
}

let pendingApply: { readonly key: string; readonly requestId: string } | null = null;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function parseCardIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length !== SUPPORT_CARD_COUNT ||
      value.some((cardId) => typeof cardId !== 'string' || !MISSION_CARD_IDS.has(cardId)) ||
      new Set(value).size !== SUPPORT_CARD_COUNT) return null;
  return [...value];
}

function parseProjection(value: unknown): GorgoneionMissionSupportProjection | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'sessionId', 'actorUid', 'hostShipId', 'dockingRevision', 'dealtCount', 'cardIds',
  ]) || typeof value.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(value.sessionId) ||
      typeof value.actorUid !== 'string' || value.actorUid.length === 0 || value.actorUid.length > 128 ||
      typeof value.hostShipId !== 'string' || !/^[\w-]{1,128}$/.test(value.hostShipId) ||
      !Number.isSafeInteger(value.dockingRevision) || (value.dockingRevision as number) < 1 ||
      value.dealtCount !== 0) return null;
  const cardIds = parseCardIds(value.cardIds);
  if (!cardIds) return null;
  return {
    sessionId: value.sessionId,
    actorUid: value.actorUid,
    hostShipId: value.hostShipId,
    dockingRevision: value.dockingRevision as number,
    dealtCount: 0,
    cardIds,
  };
}

function parseProjectionReply(value: unknown): GorgoneionMissionSupportProjection | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'status', 'sessionId', 'actorUid', 'hostShipId', 'dockingRevision', 'dealtCount', 'cardIds',
  ]) || value.status !== 'available') return null;
  const projection: RecordValue = { ...value };
  delete projection.status;
  return parseProjection(projection);
}

function parseApplyReply(value: unknown, sessionId: string, requestId: string): GorgoneionMissionSupportCommandReply | null {
  if (!isRecord(value) || !hasExactKeys(value, ['status', 'sessionId', 'requestId', 'cardCount']) ||
      (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== sessionId || value.requestId !== requestId ||
      value.cardCount !== SUPPORT_CARD_COUNT) return null;
  return {
    status: value.status,
    sessionId,
    requestId,
    cardCount: SUPPORT_CARD_COUNT,
  };
}

function captureMissionSupportAuthority(): MissionSupportAuthority {
  const { session, me } = useSessionStore.getState();
  if (!session || !me || me.role !== 'player' || me.sessionId !== session.id || !me.uid ||
      me.replacementRoleId !== ROLE_ID || me.replacementStatus != null ||
      me.activeConsoleRoleId !== null || me.seatId !== null) {
    throw new Error('Only the current Gorgoneion Captain may inspect mission support.');
  }
  requireFreshSessionAuthority();
  const smallShip = session.smallShipStates?.gorgoneion;
  const hostShipId = smallShip?.hostShipId;
  const dockingRevision = smallShip?.dockingRevision;
  if (session.phase !== 'active' || typeof hostShipId !== 'string' ||
      !session.activeVesselIds?.includes(hostShipId) ||
      !Number.isSafeInteger(dockingRevision) || (dockingRevision as number) < 1) {
    throw new Error('Gorgoneion mission support requires active gameplay and a current docked host.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect to the current Gorgoneion Captain session.');
  return { sessionId: session.id, actorUid: me.uid, hostShipId, dockingRevision: dockingRevision as number, checkpoint };
}

function authorityIsCurrent(expected: MissionSupportAuthority): boolean {
  if (!isCurrentSessionAuthority(expected.checkpoint)) return false;
  try {
    const current = captureMissionSupportAuthority();
    return current.sessionId === expected.sessionId && current.actorUid === expected.actorUid &&
      current.hostShipId === expected.hostShipId && current.dockingRevision === expected.dockingRevision;
  } catch {
    return false;
  }
}

function projectionMatchesAuthority(
  projection: GorgoneionMissionSupportProjection,
  authority: MissionSupportAuthority,
): boolean {
  return projection.sessionId === authority.sessionId && projection.actorUid === authority.actorUid &&
    projection.hostShipId === authority.hostShipId &&
    projection.dockingRevision === authority.dockingRevision && projection.dealtCount === 0;
}

function exactSourceOrderPartition(
  projection: GorgoneionMissionSupportProjection,
  topCardIds: readonly string[],
  bottomCardIds: readonly string[],
): boolean {
  if (!Array.isArray(topCardIds) || !Array.isArray(bottomCardIds) ||
      topCardIds.length + bottomCardIds.length !== SUPPORT_CARD_COUNT) return false;
  const partition = [...topCardIds, ...bottomCardIds];
  if (new Set(partition).size !== SUPPORT_CARD_COUNT ||
      partition.some((cardId) => !projection.cardIds.includes(cardId))) return false;
  const topSet = new Set(topCardIds);
  const bottomSet = new Set(bottomCardIds);
  const expectedTop = projection.cardIds.filter((cardId) => topSet.has(cardId));
  const expectedBottom = projection.cardIds.filter((cardId) => bottomSet.has(cardId));
  return expectedTop.every((cardId, index) => cardId === topCardIds[index]) &&
    expectedBottom.every((cardId, index) => cardId === bottomCardIds[index]);
}

export async function getGorgoneionMissionSupportProjection(): Promise<GorgoneionMissionSupportProjection> {
  const authority = captureMissionSupportAuthority();
  const callable = httpsCallable(functions(), 'getGorgoneionMissionSupportProjection');
  const response = await callable({ sessionId: authority.sessionId });
  if (!authorityIsCurrent(authority)) {
    throw new Error('Gorgoneion Captain or docking authority changed while loading mission support.');
  }
  const projection = parseProjectionReply(isRecord(response) ? response.data : undefined);
  if (!projection || !projectionMatchesAuthority(projection, authority)) {
    throw new Error('The mission-support projection was malformed or no longer matches current authority.');
  }
  const serverView = await getDocFromServer(doc(
    db(), `sessions/${authority.sessionId}/gorgoneionMissionSupportViews/${authority.actorUid}`,
  ));
  if (!authorityIsCurrent(authority)) {
    throw new Error('Gorgoneion Captain or docking authority changed while confirming mission support.');
  }
  const currentView = serverView.exists() ? parseProjection(serverView.data()) : null;
  if (!currentView || !projectionMatchesAuthority(currentView, authority) ||
      JSON.stringify(currentView) !== JSON.stringify(projection)) {
    throw new Error('The private mission-support view expired before it could be displayed.');
  }
  return currentView;
}

export async function applyGorgoneionMissionSupport(
  input: GorgoneionMissionSupportApplyInput,
): Promise<GorgoneionMissionSupportCommandReply> {
  const authority = captureMissionSupportAuthority();
  const projection = parseProjection(input.projection);
  if (!projection || !projectionMatchesAuthority(projection, authority) ||
      !exactSourceOrderPartition(projection, input.topCardIds, input.bottomCardIds)) {
    throw new Error('Refresh the exact inspected five-card partition before applying mission support.');
  }
  const key = JSON.stringify([
    projection.sessionId, projection.actorUid, projection.hostShipId, projection.dockingRevision,
    projection.cardIds, input.topCardIds, input.bottomCardIds,
  ]);
  const requestId = pendingApply?.key === key ? pendingApply.requestId : window.crypto.randomUUID();
  pendingApply = { key, requestId };
  const callable = httpsCallable(functions(), 'applyGorgoneionMissionSupport');
  const response = await callable({
    sessionId: projection.sessionId,
    requestId,
    actorUid: projection.actorUid,
    hostShipId: projection.hostShipId,
    dockingRevision: projection.dockingRevision,
    dealtCount: projection.dealtCount,
    cardIds: [...projection.cardIds],
    topCardIds: [...input.topCardIds],
    bottomCardIds: [...input.bottomCardIds],
  });
  if (!authorityIsCurrent(authority)) {
    throw new Error('Gorgoneion Captain or docking authority changed while applying mission support.');
  }
  const result = parseApplyReply(isRecord(response) ? response.data : undefined, projection.sessionId, requestId);
  if (!result) throw new Error('The mission-support receipt was malformed. Retry the unchanged partition.');
  pendingApply = null;
  return result;
}

export function subscribeGorgoneionMissionSupportProjection(
  sessionId: string,
  actorUid: string,
  onProjection: (projection: GorgoneionMissionSupportProjection | null) => void,
): Unsubscribe {
  let subscribed = true;
  let authority: MissionSupportAuthority;
  try {
    authority = captureMissionSupportAuthority();
  } catch {
    onProjection(null);
    return () => { subscribed = false; };
  }
  if (authority.sessionId !== sessionId || authority.actorUid !== actorUid) {
    onProjection(null);
    return () => { subscribed = false; };
  }

  const projectionRef = doc(
    db(), `sessions/${sessionId}/gorgoneionMissionSupportViews/${actorUid}`,
  );
  const unsubscribe = onSnapshot(projectionRef, { includeMetadataChanges: true }, (snapshot) => {
    if (!subscribed) return;
    if (snapshot.metadata.fromCache) return;
    if (!authorityIsCurrent(authority) || !snapshot.exists()) {
      onProjection(null);
      return;
    }
    const projection = parseProjection(snapshot.data());
    onProjection(projection && projectionMatchesAuthority(projection, authority) ? projection : null);
  }, () => {
    if (subscribed) onProjection(null);
  });
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

export function hasCurrentGorgoneionMissionSupportAuthority(): boolean {
  if (!hasFreshSessionAuthority()) return false;
  try {
    captureMissionSupportAuthority();
    return true;
  } catch {
    return false;
  }
}
