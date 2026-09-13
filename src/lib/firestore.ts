import {
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  limit,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
  type Firestore,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { app, functions } from './firebase';
import { emulatorPorts, useEmulators } from './firebaseConfig';
import type {
  CommissarPurgeAuthority,
  DamageDraw,
  FacilitatorRuleCall,
  GameSession,
  GmInstance,
  HummingbirdHarvest,
  LoyaltyCensus,
  PopulationAlert,
  Player,
  PrivateLoyalty,
  RoleBrief,
  RoleOwnedCraftRecord,
  Seat,
  SessionSetup,
  SessionChartId,
  SessionExpansionMode,
  SessionEvent,
  SmallShipId,
  SmallShipState,
  ShuttleDocking,
  ShuttleVisit,
  ShipNavigationLogEntry,
  PlayerDiscoveryProjection,
  SystemHistory,
  SystemHistoryEntry,
  SystemHistoryForShip,
  SystemHistoryEvent,
  OrganiserSiteProjection,
  ShipJumpStates,
  ShipJumpTransitions,
  ShipNavigationLogs,
  SetupReceipt,
  UnrestAlert,
  WolfAttackPreparation,
  WolfAttackPreparationModifierId,
  WolfAttackTargetMode,
  WolfAttackPreparationTargetAssignment,
  WolfAttackDeclarationState,
  WolfAttackWindow,
  WolfAssignment,
  WolfCultIntelligence,
  ArbourVision,
  ArbourVisionKind,
  AwayMissionHand,
  AwayMissionHandPhase,
  AwayMissionHandPointer,
  VipCard,
  VipCardId,
  VipCardName,
  VipHand,
} from '@/types/game';
import { isCrisisKind, type CrisisReport, type CrisisStateProjection, type CrisisStateName } from '@/types/crisis';
import { isWireSafeEntityId, type EntityId, type EntityKind } from '@/types/identifiers';
import { DEFAULT_ACTIVE_ROLE_IDS, findConsoleRole } from '@/data/roles';
import { replacementRoleFor } from '@/data/replacementRoles';
import { FIGHTER_WING_IDS } from '@/data/aegisConsoles';
import { ROLE_SEAT_METADATA } from '@/data/seatMetadata';
import {
  normalizeShuttleManifest,
  SHUTTLECRAFT,
} from '@/data/shuttles';
import {
  INITIAL_SHIP_CONSOLE_LOCKS,
  INITIAL_SHIP_GALACTIC_COORDINATES,
  INITIAL_SHIP_JUMP_STATES,
  INITIAL_SHIP_JUMP_TRANSITIONS,
  SMALL_SHIPS,
} from '@/data/ships';
import { RESOURCE_DEFINITIONS, shipResources, shipUnrest } from '@/data/resources';
import { INITIAL_SHIP_SURVIVORS } from '@/data/shipPopulation';
import { normalizePressDispatch } from './pressDispatchState';
import { fleetTickerState } from './fleetTickerState';
import { normalizeDisplayName } from './displayName';
import { turnPhaseState, turnStateForPhaseContext } from './turnPhase';
import { parseMaintenanceEvent } from './maintenanceEvent';
import { useSessionStore } from '@/store/useSessionStore';
import { parseMaintenanceCycle } from './shipStateProjection';
import { entityId, parseEntityId } from '@/types/identifiers';
import {
  acceptServerSessionAuthority,
  createSessionSnapshotAuthority,
  sessionSnapshotAuthorityFor,
  trustedTimestampCursor,
  type ServerAuthorityCursor,
  type SessionSnapshotAuthority,
} from './sessionSnapshotAuthority';

export {
  acceptCallableSessionAuthority,
  createSessionSnapshotAuthority,
  sessionSnapshotAuthorityFor,
  sessionSnapshotAuthorityVersion,
  type SessionSnapshotAuthority,
} from './sessionSnapshotAuthority';

let firestore: Firestore | undefined;

function projectionSessionAuthority(
  sessionId: string,
  supplied: SessionSnapshotAuthority | undefined,
): SessionSnapshotAuthority | undefined {
  if (supplied) return supplied;
  const store = useSessionStore.getState();
  const uid = store.me?.uid ?? store.gmInstance?.uid;
  return uid ? sessionSnapshotAuthorityFor(sessionId, uid) : undefined;
}

function serverAuthorityCursor(
  snapshot: { readonly data: () => DocumentData },
  data: DocumentData,
): ServerAuthorityCursor | undefined {
  const documentSnapshot = snapshot as { readonly updateTime?: unknown; readonly data: () => DocumentData };
  return trustedTimestampCursor(documentSnapshot.updateTime) ??
    trustedTimestampCursor(data.updatedAt);
}

export function db(): Firestore {
  if (!firestore) {
    // The persisted Zustand snapshot and short-lived outbox own offline state;
    // Firestore's listener reconnect supplies fresh server authority.
    firestore = getFirestore(app());
    if (useEmulators) connectFirestoreEmulator(firestore, '127.0.0.1', emulatorPorts.firestore);
  }
  return firestore;
}

const SHUTTLE_CATALOG_IDS: ReadonlySet<string> = new Set(SHUTTLECRAFT.map((shuttle) => shuttle.id));
const VESSEL_CATALOG_IDS: ReadonlySet<string> = new Set(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS));
const CONFETTI_SOURCE_IDS: ReadonlySet<string> = new Set([
  ...Object.keys(INITIAL_SHIP_CONSOLE_LOCKS),
  'snn-press-shuttle',
]);

function iso(value: unknown): string {
  if (
    typeof value === 'object' && value !== null && 'toDate' in value &&
    typeof value.toDate === 'function'
  ) return (value.toDate() as Date).toISOString();
  return new Date().toISOString();
}

function parseEntityIdArray<K extends EntityKind>(kind: K, value: unknown): readonly EntityId<K>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((id) => parseEntityId(kind, id));
  return parsed.every((id): id is EntityId<K> => id !== undefined) ? parsed : undefined;
}

function privateLoyalty(value: unknown, ownerUid?: string): PrivateLoyalty | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const partnerUid = payload.partnerUid === undefined || payload.partnerUid === null
    ? undefined
    : parseEntityId('player', payload.partnerUid);
  const partnerRoleId = payload.partnerRoleId === undefined || payload.partnerRoleId === null
    ? undefined
    : parseEntityId('role', payload.partnerRoleId);
  const proofMarker = payload.proofRevealed;
  if (payload.kind === 'android' && (
    payload.type !== 'loyalty' || payload.suspicion !== null ||
    Object.keys(payload).some((key) => !['type', 'kind', 'suspicion', 'proofRevealed'].includes(key))
  )) return null;
  if (payload.type !== 'loyalty' || typeof payload.kind !== 'string' ||
      (typeof payload.suspicion !== 'number' && payload.suspicion !== null) ||
      (payload.partnerUid !== undefined && payload.partnerUid !== null && !partnerUid) ||
      (payload.partnerRoleId !== undefined && payload.partnerRoleId !== null && !partnerRoleId) ||
      (proofMarker !== undefined && typeof proofMarker !== 'boolean') ||
      (payload.kind === 'android' && proofMarker === false)) return null;
  if (payload.kind === 'friend') {
    if (payload.suspicion !== 0 || !partnerUid || (ownerUid !== undefined && partnerUid === ownerUid)) return null;
    // Legacy Friend cards may predate the role pointer. Keep the card itself
    // visible, but omit the incomplete partner detail rather than exposing a
    // raw UID; complete tuples must name a current core or replacement role.
    if (partnerRoleId && !findConsoleRole(partnerRoleId) && !replacementRoleFor(partnerRoleId)) return null;
  } else if (partnerRoleId !== undefined && partnerRoleId !== null) {
    return null;
  }
  return {
    kind: payload.kind,
    suspicion: payload.suspicion,
    ...(partnerUid ? { partnerUid } : {}),
    ...(payload.kind === 'friend' && partnerRoleId ? { partnerRoleId } : {}),
    ...(payload.kind === 'android' && proofMarker === true ? { proofRevealed: true } : {}),
  };
}

function wolfCultIntelligence(
  value: unknown,
  sessionId: string,
  uid: string,
): WolfCultIntelligence | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const recipientUid = parseEntityId('player', raw.recipientUid);
  const agentUid = parseEntityId('player', raw.agentUid);
  const validCoordinate = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && /^\d{4}$/.test(candidate);
  if (
    raw.type !== 'wolf-cult-intelligence' || raw.sessionId !== sessionId ||
    recipientUid !== uid || agentUid === undefined || agentUid === uid ||
    !Array.isArray(raw.visibleToUids) || raw.visibleToUids.length !== 1 || raw.visibleToUids[0] !== uid ||
    !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
    !validCoordinate(raw.fortressCoordinate) || !validCoordinate(raw.suppliesCoordinate) ||
    typeof raw.codeWord !== 'string' || raw.codeWord.trim().length === 0 || raw.codeWord.length > 80 ||
    raw.label !== 'WOLF INTEL'
  ) return null;
  return {
    sessionId: entityId('session', sessionId),
    recipientUid,
    revision: raw.revision as number,
    fortressCoordinate: raw.fortressCoordinate,
    suppliesCoordinate: raw.suppliesCoordinate,
    agentUid,
    codeWord: raw.codeWord,
    label: 'WOLF INTEL',
  };
}

function gmWolfCultIntelligence(value: unknown, sessionId: string): WolfCultIntelligence | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const recipientUid = parseEntityId('player', raw.recipientUid);
  const agentUid = parseEntityId('player', raw.agentUid);
  const validCoordinate = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && /^\d{4}$/.test(candidate);
  if (
    raw.type !== 'wolf-cult-intelligences' || raw.sessionId !== sessionId || !recipientUid ||
    !agentUid || recipientUid === agentUid || !Number.isSafeInteger(raw.revision) ||
    (raw.revision as number) < 1 || !validCoordinate(raw.fortressCoordinate) ||
    !validCoordinate(raw.suppliesCoordinate) || typeof raw.codeWord !== 'string' ||
    raw.codeWord.trim().length === 0 || raw.codeWord.length > 80 || raw.label !== 'WOLF INTEL'
  ) return null;
  return {
    sessionId: entityId('session', sessionId),
    recipientUid,
    revision: raw.revision as number,
    fortressCoordinate: raw.fortressCoordinate,
    suppliesCoordinate: raw.suppliesCoordinate,
    agentUid,
    codeWord: raw.codeWord,
    label: 'WOLF INTEL',
  };
}

function arbourVision(value: unknown, sessionId: string, uid: string): ArbourVision | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.type !== 'arbour-vision' || raw.sessionId !== sessionId || raw.recipientUid !== uid ||
    !Array.isArray(raw.visibleToUids) || raw.visibleToUids.length !== 1 || raw.visibleToUids[0] !== uid ||
    !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
    (raw.kind !== 'location' && raw.kind !== 'danger' && raw.kind !== 'suspicion') ||
    typeof raw.text !== 'string' || raw.text.trim().length === 0 || raw.text.length > 240 ||
    raw.label !== 'FACILITATOR CALL'
  ) return null;
  return {
    sessionId: entityId('session', sessionId),
    recipientUid: entityId('player', uid),
    revision: raw.revision as number,
    kind: raw.kind as ArbourVisionKind,
    text: raw.text,
    label: 'FACILITATOR CALL',
  };
}

function gmArbourVision(value: unknown, sessionId: string): ArbourVision | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.type !== 'arbour-visions' || raw.sessionId !== sessionId || typeof raw.recipientUid !== 'string' ||
    !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
    (raw.kind !== 'location' && raw.kind !== 'danger' && raw.kind !== 'suspicion') ||
    typeof raw.text !== 'string' || raw.text.trim().length === 0 || raw.text.length > 240 ||
    raw.label !== 'FACILITATOR CALL'
  ) return null;
  const recipientUid = parseEntityId('player', raw.recipientUid);
  return recipientUid ? {
    sessionId: entityId('session', sessionId),
    recipientUid,
    revision: raw.revision as number,
    kind: raw.kind as ArbourVisionKind,
    text: raw.text,
    label: 'FACILITATOR CALL',
  } : null;
}

function commissarPurgeAuthority(
  value: unknown,
  sessionId: string,
): CommissarPurgeAuthority | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== 'commissar-purge-authority' || raw.sessionId !== sessionId ||
      (raw.role !== 'captain' && raw.role !== 'commissar') ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0) return null;
  const shipId = raw.shipId === undefined ? undefined : parseEntityId('vessel', raw.shipId);
  if (raw.role === 'captain' && !shipId) return null;
  const captainRoleId = raw.captainRoleId === undefined ? undefined : parseEntityId('role', raw.captainRoleId);
  if (raw.role === 'captain' && !captainRoleId) return null;
  const turn = raw.consentTurn === undefined ? undefined : nonNegativeInteger(raw.consentTurn);
  const vesselRevision = raw.consentVesselRevision === undefined
    ? undefined : nonNegativeInteger(raw.consentVesselRevision);
  const usedThisTurn = raw.usedThisTurn === undefined ? undefined : raw.usedThisTurn === true;
  const parseMap = (valueToParse: unknown, ledger: boolean) => {
    const stored = recordValue(valueToParse);
    if (!stored) return undefined;
    const entries = Object.entries(stored).flatMap(([id, entry]) => {
      const parsedId = parseEntityId('vessel', id);
      const item = recordValue(entry);
      const entryTurn = nonNegativeInteger(item?.turn);
      const entryRevision = nonNegativeInteger(item?.[ledger ? 'revision' : 'vesselRevision']);
      const captainRoleId = ledger ? undefined : parseEntityId('role', item?.captainRoleId);
      if (!parsedId || entryTurn === undefined || entryTurn < 1 || entryRevision === undefined ||
          (!ledger && !captainRoleId)) return [];
      return [[parsedId, ledger
        ? { turn: entryTurn, revision: entryRevision }
        : { turn: entryTurn, captainRoleId, vesselRevision: entryRevision }]];
    });
    return entries.length === Object.keys(stored).length ? Object.fromEntries(entries) : undefined;
  };
  if (raw.role === 'captain' && (raw.consented !== undefined && typeof raw.consented !== 'boolean' ||
      (raw.consentTurn !== undefined && turn === undefined) ||
      (raw.consentVesselRevision !== undefined && vesselRevision === undefined) ||
      (raw.usedThisTurn !== undefined && typeof raw.usedThisTurn !== 'boolean'))) return null;
  const consents = parseMap(raw.consents, false);
  const ledger = parseMap(raw.ledger, true);
  if (raw.role === 'commissar' && (raw.consents !== undefined && !consents || raw.ledger !== undefined && !ledger)) return null;
  return {
    sessionId: entityId('session', sessionId),
    role: raw.role,
    revision: raw.revision as number,
    ...(captainRoleId ? { captainRoleId } : {}),
    ...(shipId ? { shipId } : {}),
    ...(typeof raw.consented === 'boolean' ? { consented: raw.consented } : {}),
    ...(turn !== undefined ? { consentTurn: turn } : {}),
    ...(vesselRevision !== undefined ? { consentVesselRevision: vesselRevision } : {}),
    ...(usedThisTurn !== undefined ? { usedThisTurn } : {}),
    ...(consents ? { consents } : {}),
    ...(ledger ? { ledger } : {}),
  };
}
const VIP_CARD_NAMES: Readonly<Record<VipCardId, VipCardName>> = {
  'party-deck': 'Party Deck', 'spa-deck': 'Spa Deck', 'gaming-deck': 'Gaming Deck',
  'casino-deck': 'Casino Deck', 'theatre-deck': 'Theatre Deck',
  'restaurant-deck': 'Restaurant Deck', 'art-deck': 'Art Deck',
  'family-fun-deck': 'Family Fun Deck', 'theme-park-deck': 'Theme Park Deck',
};

function vipHand(value: unknown, sessionId: string, uid: string): VipHand | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const ownerUid = parseEntityId('player', raw.ownerUid);
  const revision = raw.revision;
  if (raw.sessionId !== sessionId || ownerUid !== uid ||
      !Number.isSafeInteger(revision) || (revision as number) < 0 || !Array.isArray(raw.cards)) return null;
  const cards = raw.cards.flatMap((entry): VipCard[] => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const id = candidate.id as VipCardId;
    if (!Object.hasOwn(VIP_CARD_NAMES, id) ||
        candidate.name !== VIP_CARD_NAMES[id] ||
        (candidate.status !== 'available' && candidate.status !== 'spent')) return [];
    return [{ id, name: VIP_CARD_NAMES[id], status: candidate.status }];
  });
  if (cards.length !== raw.cards.length || new Set(cards.map((card) => card.id)).size !== cards.length) return null;
  return { sessionId: entityId('session', sessionId), ownerUid, revision: revision as number, cards };
}

const AWAY_MISSION_HAND_PHASES: ReadonlySet<string> = new Set([
  'awaiting-card-selection', 'discarding', 'assignment-ready',
]);

function awayMissionHandPointer(
  value: unknown,
  sessionId: string,
  uid?: string,
): AwayMissionHandPointer | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const participantUid = parseEntityId('player', raw.participantUid);
  const phase = raw.phase as AwayMissionHandPhase;
  if (
    raw.type !== 'away-mission-hand-pointer' || raw.sessionId !== sessionId ||
    !participantUid || (uid !== undefined && participantUid !== uid) ||
    !isWireSafeEntityId(raw.missionId) || !isWireSafeEntityId(raw.handId) ||
    !AWAY_MISSION_HAND_PHASES.has(phase) ||
    !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
    typeof raw.discarded !== 'boolean'
  ) return null;
  return {
    sessionId: entityId('session', sessionId),
    participantUid,
    missionId: raw.missionId,
    handId: raw.handId,
    phase,
    revision: raw.revision as number,
    discarded: raw.discarded,
  };
}

function awayMissionHand(value: unknown, sessionId: string, uid: string): AwayMissionHand | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const participantUid = parseEntityId('player', raw.participantUid);
  const suit = raw.suit;
  if (
    raw.type !== 'away-mission-hand' || raw.sessionId !== sessionId || participantUid !== uid ||
    !participantUid || !isWireSafeEntityId(raw.missionId) || !isWireSafeEntityId(raw.handId) ||
    typeof raw.cardId !== 'string' || raw.cardId.length === 0 || raw.cardId.length > 16 ||
    typeof raw.rank !== 'string' || raw.rank.length === 0 ||
    (suit !== 'hearts' && suit !== 'diamonds' && suit !== 'clubs') ||
    typeof raw.value !== 'number' || !Number.isFinite(raw.value) ||
    (raw.discarded !== undefined && typeof raw.discarded !== 'boolean')
  ) return null;
  return {
    sessionId: entityId('session', sessionId),
    participantUid,
    missionId: raw.missionId,
    handId: raw.handId,
    cardId: raw.cardId,
    rank: raw.rank,
    suit,
    value: raw.value,
    discarded: raw.discarded === true,
  };
}

function roleBrief(value: unknown, sessionId: string, uid: string): RoleBrief | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const assignmentUid = parseEntityId('player', raw.assignmentUid);
  const roleId = parseEntityId('role', raw.roleId);
  const ownedCraftIds = raw.ownedCraftIds === undefined
    ? undefined
    : parseEntityIdArray('shuttle', raw.ownedCraftIds);
  if (
    raw.type !== 'role-brief' || assignmentUid !== uid ||
    raw.sessionId !== sessionId || !roleId ||
    typeof raw.roleName !== 'string' || raw.roleName.trim().length === 0 ||
    typeof raw.vesselName !== 'string' || raw.vesselName.trim().length === 0 ||
    typeof raw.text !== 'string' || raw.text.trim().length === 0 ||
    typeof raw.commonRules !== 'string' || raw.commonRules.trim().length === 0 ||
    typeof raw.setupRevision !== 'number' ||
    !Number.isSafeInteger(raw.setupRevision) || raw.setupRevision < 0 ||
    (raw.ownedCraftIds !== undefined && !ownedCraftIds)
  ) return null;
  return {
    assignmentUid,
    roleId,
    roleName: raw.roleName,
    vesselName: raw.vesselName,
    text: raw.text,
    commonRules: raw.commonRules,
    ...(ownedCraftIds ? { ownedCraftIds } : {}),
    setupRevision: raw.setupRevision,
  };
}

function facilitatorRuleCall(
  value: unknown,
  sessionId: string,
  recipientUid?: string,
): FacilitatorRuleCall | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.type !== 'facilitator-rule-call' || raw.sessionId !== sessionId ||
    typeof raw.callId !== 'string' || raw.callId.length === 0 || raw.callId.length > 120 ||
    !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
    typeof raw.ambiguity !== 'string' || raw.ambiguity.trim().length === 0 || raw.ambiguity.length > 240 ||
    typeof raw.source !== 'string' || raw.source.trim().length === 0 || raw.source.length > 240 ||
    typeof raw.decision !== 'string' || raw.decision.trim().length === 0 || raw.decision.length > 500 ||
    (raw.audience !== 'gm-only' && raw.audience !== 'selected-player') ||
    raw.label !== 'FACILITATOR RULE CALL'
  ) return null;
  const parsedRecipientUid = raw.recipientUid === undefined
    ? undefined : parseEntityId('player', raw.recipientUid);
  if (raw.audience === 'selected-player' && !parsedRecipientUid) return null;
  if (recipientUid !== undefined && parsedRecipientUid !== recipientUid) return null;
  if (raw.audience === 'gm-only' && (raw.recipientUid !== undefined || recipientUid !== undefined)) return null;
  const actorUid = raw.actorUid === undefined ? undefined : parseEntityId('player', raw.actorUid);
  if (raw.actorUid !== undefined && !actorUid) return null;
  const supersedesCallId = raw.supersedesCallId === undefined ? undefined
    : typeof raw.supersedesCallId === 'string' && raw.supersedesCallId.length > 0 ? raw.supersedesCallId : null;
  const supersededByCallId = raw.supersededByCallId === undefined ? undefined
    : typeof raw.supersededByCallId === 'string' && raw.supersededByCallId.length > 0 ? raw.supersededByCallId : null;
  if (supersedesCallId === null || supersededByCallId === null) return null;
  return {
    sessionId: entityId('session', sessionId),
    callId: raw.callId,
    revision: raw.revision as number,
    ambiguity: raw.ambiguity,
    source: raw.source,
    decision: raw.decision,
    audience: raw.audience,
    ...(parsedRecipientUid ? { recipientUid: parsedRecipientUid } : {}),
    ...(actorUid ? { actorUid } : {}),
    createdAt: iso(raw.createdAt),
    ...(supersedesCallId ? { supersedesCallId } : {}),
    ...(supersededByCallId ? { supersededByCallId } : {}),
    label: 'FACILITATOR RULE CALL',
  };
}

function roleOwnedCraft(value: unknown): readonly RoleOwnedCraftRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
    const raw = entry as Record<string, unknown>;
    const id = parseEntityId('shuttle', raw.id);
    const ownerRoleId = parseEntityId('role', raw.ownerRoleId);
    if (!id || !ownerRoleId || (raw.kind !== 'shuttle' && raw.kind !== 'fighter-wing')) return undefined;
    return { id, ownerRoleId, kind: raw.kind } as RoleOwnedCraftRecord;
  });
  return parsed.every((entry): entry is RoleOwnedCraftRecord => entry !== undefined) ? parsed : undefined;
}

function loyaltyCensus(value: unknown): LoyaltyCensus | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== 'loyalty-census' ||
      typeof raw.revision !== 'number' || !Number.isSafeInteger(raw.revision) || raw.revision < 0 ||
      !Array.isArray(raw.entries)) return null;
  const entries = raw.entries.flatMap((entry): LoyaltyCensus['entries'][number][] => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const uid = parseEntityId('player', candidate.uid);
    if (!uid || typeof candidate.kind !== 'string' ||
        (typeof candidate.suspicion !== 'number' && candidate.suspicion !== null) ||
        (candidate.note !== undefined && typeof candidate.note !== 'string')) return [];
    return [{
      uid,
      kind: candidate.kind,
      suspicion: candidate.suspicion,
      ...(typeof candidate.note === 'string' && candidate.note.trim() ? { note: candidate.note.trim() } : {}),
    }];
  });
  if (entries.length !== raw.entries.length ||
      new Set(entries.map((entry) => entry.uid)).size !== entries.length) return null;
  return { revision: raw.revision, entries };
}

function wolfAssignment(value: unknown): WolfAssignment | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const roleIds = parseEntityIdArray('role', raw.roleIds);
  if (raw.type !== 'wolf-assignment' || !roleIds || roleIds.length < 1 || roleIds.length > 2 ||
      new Set(roleIds).size !== roleIds.length) return null;
  return { roleIds };
}

/**
 * Keep a revisioned projection monotonic for the lifetime of one listener.
 * Equal revisions still flow through so an equivalent server callback can
 * refresh its current payload; deletion or malformed state clears the view
 * without resetting the cursor, because a document revision does not restart
 * while the subscription remains active.
 */
function createMonotonicRevisionGate() {
  let latestRevision: number | undefined;
  return (revision: number): boolean => {
    if (latestRevision !== undefined && revision < latestRevision) return false;
    latestRevision = revision;
    return true;
  };
}

function setupReceipt(value: unknown): SetupReceipt | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rosterIds = parseEntityIdArray('role', raw.rosterIds);
  const selectedWolfRoleIds = parseEntityIdArray('role', raw.selectedWolfRoleIds);
  const eligibleRoleIds = parseEntityIdArray('role', raw.eligibleRoleIds);
  const parsedRoleOwnedCraft = raw.roleOwnedCraft === undefined
    ? undefined
    : roleOwnedCraft(raw.roleOwnedCraft);
  const actorUid = parseEntityId('player', raw.actorUid);
  if (
    typeof raw.source !== 'string' ||
    typeof raw.playerCount !== 'number' || !rosterIds ||
    typeof raw.wolfCount !== 'number' || (raw.wolfCount !== 1 && raw.wolfCount !== 2) ||
    !selectedWolfRoleIds || !eligibleRoleIds ||
    typeof raw.resultCount !== 'number' ||
    (raw.loyaltySource !== 'automatic-default' && raw.loyaltySource !== 'explicit-preserved') ||
    typeof raw.expectedSetupRevision !== 'number' || typeof raw.committedSetupRevision !== 'number' ||
    !actorUid || typeof raw.serverTime !== 'string' || typeof raw.event !== 'string' ||
    (raw.roleOwnedCraft !== undefined && !parsedRoleOwnedCraft)
  ) return null;
  return {
    ...raw,
    rosterIds,
    selectedWolfRoleIds,
    eligibleRoleIds,
    actorUid,
    ...(parsedRoleOwnedCraft ? { roleOwnedCraft: parsedRoleOwnedCraft } : {}),
  } as unknown as SetupReceipt;
}

function turnStartAnnouncement(value: unknown): GameSession['turnStartAnnouncement'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const announcement = value as Readonly<Record<string, unknown>>;
  const turn = announcement.turn;
  const survivorPopulation = announcement.survivorPopulation;
  const revision = announcement.revision;
  if (
    typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 1 ||
    typeof survivorPopulation !== 'number' || !Number.isSafeInteger(survivorPopulation) ||
    survivorPopulation < 0 ||
    (revision !== undefined &&
      (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0))
  ) return undefined;
  return {
    turn,
    survivorPopulation,
    ...(revision === undefined ? {} : { revision }),
  };
}

function debriefMode(value: unknown): NonNullable<GameSession['debriefMode']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { active: false, revision: 0 };
  }
  const state = value as Readonly<Record<string, unknown>>;
  if (
    typeof state.active !== 'boolean' ||
    typeof state.revision !== 'number' || !Number.isSafeInteger(state.revision) ||
    state.revision < 0
  ) return { active: false, revision: 0 };
  return { active: state.active, revision: state.revision };
}

function wolfAttackWindow(value: unknown): WolfAttackWindow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const state = value as Readonly<Record<string, unknown>>;
  if (
    (state.status !== 'due' && state.status !== 'resolved' && state.status !== 'deferred') ||
    typeof state.turn !== 'number' || !Number.isSafeInteger(state.turn) || state.turn < 1 ||
    typeof state.revision !== 'number' || !Number.isSafeInteger(state.revision) || state.revision < 0
  ) return null;
  return {
    status: state.status,
    turn: state.turn,
    revision: state.revision,
  };
}

const WOLF_ATTACK_PREPARATION_MODIFIERS: ReadonlySet<string> = new Set([
  'wolf-commander-target-reroll',
  'aegis-command-and-control',
  'gorgoneion-force-field-projector',
  'enriched-warheads',
  'pallas-boarding-rerolls',
  'chepu-boarding-support',
  'engineering-service-shuttle-support',
  'aegis-boarding-rerolls',
  'rosal-militia-leader',
  'wolf-commander-boarding-lead',
]);

function wolfAttackPreparation(value: unknown): WolfAttackPreparation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  const targetAssignments = Array.isArray(state.targetAssignments)
    ? state.targetAssignments.flatMap((assignment): WolfAttackPreparationTargetAssignment[] => {
      if (typeof assignment !== 'object' || assignment === null || Array.isArray(assignment)) return [];
      const candidate = assignment as Record<string, unknown>;
      return typeof candidate.cardIndex === 'number' && Number.isSafeInteger(candidate.cardIndex) &&
        candidate.cardIndex >= 0 && typeof candidate.targetShipId === 'string'
        ? [{ cardIndex: candidate.cardIndex, targetShipId: candidate.targetShipId }]
        : [];
    })
    : [];
  const shipIds = Array.isArray(state.shipIds)
    ? state.shipIds.filter((id): id is string => typeof id === 'string')
    : [];
  const modifiers = Array.isArray(state.modifiers)
    ? state.modifiers.filter((modifier): modifier is WolfAttackPreparationModifierId =>
      typeof modifier === 'string' && WOLF_ATTACK_PREPARATION_MODIFIERS.has(modifier))
    : [];
  if (
    !Number.isSafeInteger(state.turn) || (state.turn as number) < 1 ||
    !Number.isSafeInteger(state.revision) || (state.revision as number) < 0 ||
    (state.targetMode !== 'manual' && state.targetMode !== 'pre-rolled') ||
    typeof state.notes !== 'string' || !Array.isArray(state.shipIds) || shipIds.length !== state.shipIds.length ||
    !Array.isArray(state.targetAssignments) || targetAssignments.length !== state.targetAssignments.length ||
    !Array.isArray(state.modifiers) || modifiers.length !== state.modifiers.length
  ) return null;
  return {
    turn: state.turn as number,
    revision: state.revision as number,
    shipIds,
    targetMode: state.targetMode as WolfAttackTargetMode,
    targetAssignments,
    modifiers,
    notes: state.notes,
  };
}

function wolfAttackDeclarationState(value: unknown): WolfAttackDeclarationState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  const parkedCraftIds = Array.isArray(state.parkedCraftIds)
    ? state.parkedCraftIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (
    state.status !== 'declared' || state.currentStep !== 'targeting' || state.airspaceLocked !== true ||
    !Number.isSafeInteger(state.turn) || (state.turn as number) < 1 ||
    !Number.isSafeInteger(state.revision) || (state.revision as number) < 1 ||
    !Number.isSafeInteger(state.preparationRevision) || (state.preparationRevision as number) < 1 ||
    typeof state.deadlineAt !== 'string' || !state.deadlineAt ||
    !Array.isArray(state.parkedCraftIds) || parkedCraftIds.length !== state.parkedCraftIds.length
  ) return null;
  return {
    status: 'declared',
    turn: state.turn as number,
    revision: state.revision as number,
    preparationRevision: state.preparationRevision as number,
    currentStep: 'targeting',
    deadlineAt: state.deadlineAt,
    airspaceLocked: true,
    parkedCraftIds,
  };
}

function shipNavigationLogs(value: unknown): ShipNavigationLogs {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS).map((shipId) => [
    shipId,
    Array.isArray(stored[shipId])
      ? stored[shipId].flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
        const raw = entry as Record<string, unknown>;
        const id = parseEntityId('event', raw.id);
        const entryShipId = parseEntityId('vessel', raw.shipId);
        const subjectShipId = raw.subjectShipId === undefined
          ? undefined
          : parseEntityId('vessel', raw.subjectShipId);
        const occurredAtValue = raw.occurredAt;
        const occurredAt = occurredAtValue && typeof (occurredAtValue as { toDate?: unknown }).toDate === 'function'
          ? iso(occurredAtValue)
          : typeof occurredAtValue === 'string' ? occurredAtValue : undefined;
        if (!id || !entryShipId || entryShipId !== shipId ||
            (raw.subjectShipId !== undefined && !subjectShipId) ||
            (raw.type !== 'self-jump' && raw.type !== 'ship-jump-away' && raw.type !== 'ship-jump-arrival') ||
            typeof raw.origin !== 'string' || typeof raw.destination !== 'string' ||
            !occurredAt || typeof raw.stardate !== 'string') return [];
        return [{
          id,
          shipId: entryShipId,
          type: raw.type,
          origin: raw.origin,
          destination: raw.destination,
          ...(subjectShipId ? { subjectShipId } : {}),
          ...(typeof raw.subjectShipName === 'string' ? { subjectShipName: raw.subjectShipName } : {}),
          ...(typeof raw.navigationalError === 'boolean' ? { navigationalError: raw.navigationalError } : {}),
          occurredAt,
          stardate: raw.stardate,
        } satisfies ShipNavigationLogEntry];
      })
      : [],
  ])) as ShipNavigationLogs;
}

function systemHistoryEvent(value: unknown): SystemHistoryEvent | undefined {
  const raw = recordValue(value);
  const occurredAtValue = raw?.occurredAt;
  const occurredAt = occurredAtValue && typeof (occurredAtValue as { toDate?: unknown }).toDate === 'function'
    ? iso(occurredAtValue)
    : typeof occurredAtValue === 'string' ? occurredAtValue : undefined;
  if (!raw || typeof raw.id !== 'string' || !raw.id || !occurredAt) return undefined;
  return { id: raw.id, occurredAt };
}

function systemHistoryEvents(value: unknown): readonly SystemHistoryEvent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    const event = systemHistoryEvent(candidate);
    if (!event || seen.has(event.id)) return [];
    seen.add(event.id);
    return [event];
  });
}

function systemHistoryEntry(value: unknown, coordinate: string): SystemHistoryEntry | undefined {
  const raw = recordValue(value);
  if (!raw || raw.coordinate !== coordinate || !/^\d{4}$/.test(coordinate)) return undefined;
  const discovery = raw.discovery === undefined ? undefined : systemHistoryEvent(raw.discovery);
  if (raw.discovery !== undefined && !discovery) return undefined;
  return {
    coordinate,
    ...(discovery ? { discovery } : {}),
    attempts: systemHistoryEvents(raw.attempts),
    hazards: systemHistoryEvents(raw.hazards),
    rewards: systemHistoryEvents(raw.rewards),
    clearedThreats: systemHistoryEvents(raw.clearedThreats),
    candidateProgress: systemHistoryEvents(raw.candidateProgress),
  };
}

function systemHistoryForShip(value: unknown): SystemHistoryForShip | undefined {
  const raw = recordValue(value);
  if (!raw) return undefined;
  const entries = Object.fromEntries(Object.entries(raw).flatMap(([coordinate, candidate]) => {
    const parsed = systemHistoryEntry(candidate, coordinate);
    return parsed ? [[coordinate, parsed]] : [];
  }));
  return Object.keys(entries).length > 0 ? entries : undefined;
}

function systemHistory(value: unknown): SystemHistory | undefined {
  const raw = recordValue(value);
  if (!raw) return undefined;
  const histories = Object.fromEntries(Object.entries(raw).flatMap(([shipId, candidate]) => {
    const parsed = systemHistoryForShip(candidate);
    return parsed ? [[shipId, parsed]] : [];
  }));
  return Object.keys(histories).length > 0 ? histories : undefined;
}

function playerDiscoveryProjection(value: unknown): PlayerDiscoveryProjection | undefined {
  const raw = recordValue(value);
  const groupId = parseEntityId('group', raw?.groupId);
  const shipId = raw?.shipId === undefined ? undefined : parseEntityId('vessel', raw.shipId);
  const revision = nonNegativeInteger(raw?.revision);
  const currentCoordinate = typeof raw?.currentCoordinate === 'string' ? raw.currentCoordinate : undefined;
  const knownCoordinates = Array.isArray(raw?.knownCoordinates)
    ? raw.knownCoordinates.filter((coordinate): coordinate is string => typeof coordinate === 'string')
    : [];
  const knownSystemsRaw = recordValue(raw?.knownSystems);
  const knownSystems = Object.fromEntries(Object.entries(knownSystemsRaw ?? {}).flatMap(([systemId, coordinate]) =>
    typeof coordinate === 'string' ? [[systemId, coordinate]] : []));
  if (!groupId || revision === undefined || (raw?.shipId !== undefined && !shipId)) return undefined;
  const logs = shipNavigationLogs(raw?.navigationLogs === undefined
    ? {}
    : { [shipId ?? 'unknown']: raw.navigationLogs });
  const ownHistory = systemHistoryForShip(raw?.systemHistory);
  return {
    groupId,
    ...(shipId ? { shipId } : {}),
    ...(currentCoordinate ? { currentCoordinate } : {}),
    knownCoordinates,
    knownSystems,
    pursuitDistance: nonNegativeInteger(raw?.pursuitDistance) ?? 0,
    navigationLogs: shipId ? logs[shipId] ?? [] : [],
    ...(ownHistory ? { systemHistory: ownHistory } : {}),
    revision,
  };
}

function organiserSiteProjection(value: unknown): OrganiserSiteProjection | undefined {
  const raw = recordValue(value);
  if (!raw || typeof raw.code !== 'string' || typeof raw.name !== 'string' ||
      typeof raw.candidate !== 'boolean' || typeof raw.summary !== 'string') return undefined;
  return { code: raw.code, name: raw.name, candidate: raw.candidate, summary: raw.summary };
}

function gmDiscoveryProjection(value: unknown): Pick<GameSession, 'shipGalacticCoordinates' | 'shipNavigationLogs' | 'organiserSites' | 'organiserSystems' | 'organiserSystemHistory' | 'pursuitDistances'> | undefined {
  const raw = recordValue(value);
  if (!raw) return undefined;
  const parsedSystemHistory = systemHistory(raw.systemHistory);
  const sitesRaw = recordValue(raw.organiserSites);
  const organiserSites = Object.fromEntries(Object.entries(sitesRaw ?? {}).flatMap(([coordinate, site]) => {
    const parsed = organiserSiteProjection(site);
    return parsed ? [[coordinate, parsed]] : [];
  }));
  return {
    shipGalacticCoordinates: shipGalacticCoordinates(raw.shipGalacticCoordinates),
    shipNavigationLogs: shipNavigationLogs(raw.shipNavigationLogs),
    organiserSites,
    organiserSystems: Object.fromEntries(Object.entries(recordValue(raw.knownSystems) ?? {}).flatMap(([systemId, coordinate]) =>
      typeof coordinate === 'string' ? [[systemId, coordinate]] : [])),
    ...(parsedSystemHistory ? { organiserSystemHistory: parsedSystemHistory } : {}),
    pursuitDistances: Object.fromEntries(Object.entries(recordValue(raw.pursuitDistances) ?? {}).flatMap(([shipId, distance]) => {
      const parsed = nonNegativeInteger(distance);
      return parsed === undefined ? [] : [[shipId, parsed]];
    })),
  };
}

function crisisStateProjection(value: unknown, sessionId: string): CrisisStateProjection | null {
  const raw = recordValue(value);
  const parsedSessionId = parseEntityId('session', raw?.sessionId ?? sessionId);
  const crisisSessionId = parseEntityId('session', sessionId);
  const revision = nonNegativeInteger(raw?.revision);
  if (!raw || !parsedSessionId || !crisisSessionId || parsedSessionId !== crisisSessionId ||
      typeof raw.crisisId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw.crisisId) || raw.crisisId.length > 80 ||
      !isCrisisStateName(raw.state) || revision === undefined ||
      typeof raw.title !== 'string' || raw.title.length === 0 || raw.title.length > 160 ||
      typeof raw.details !== 'string' || raw.details.length > 2_000 ||
      (raw.crisisKind !== undefined && !isCrisisKind(raw.crisisKind)) ||
      (raw.configurationOverride !== undefined && (typeof raw.configurationOverride !== 'string' || raw.configurationOverride.length > 1000))) return null;
  return {
    sessionId: parsedSessionId,
    crisisId: raw.crisisId,
    state: raw.state,
    revision,
    title: raw.title,
    details: raw.details,
    crisisKind: isCrisisKind(raw.crisisKind) ? raw.crisisKind : (isCrisisKind(raw.crisisId) ? raw.crisisId : 'custom'),
    configurationOverride: typeof raw.configurationOverride === 'string' ? raw.configurationOverride : '',
    ...(raw.updatedAt === undefined ? {} : { updatedAt: iso(raw.updatedAt) }),
  };
}

function isCrisisStateName(value: unknown): value is CrisisStateName {
  return typeof value === 'string' && (
    value === 'draft' || value === 'delivered' || value === 'debated' ||
    value === 'resolved' || value === 'escalated' || value === 'announced' || value === 'closed'
  );
}

function alertMap<T extends UnrestAlert | PopulationAlert>(value: unknown, population: boolean): Readonly<Record<string, T>> {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.entries(stored).flatMap(([key, value]) => {
    const wireKey = parseEntityId('vessel', key);
    if (!wireKey || typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const raw = value as Record<string, unknown>;
    const shipId = parseEntityId('vessel', raw.shipId);
    if (!shipId || shipId !== wireKey || typeof raw.shipName !== 'string' ||
        !Array.isArray(raw.targetGmInstanceIds) ||
        raw.targetGmInstanceIds.some((id) => typeof id !== 'string') ||
        (population && typeof raw.population !== 'number')) return [];
    const createdAt = timestampString(raw.createdAt);
    if (!createdAt) return [];
    const alert = {
      shipId,
      shipName: raw.shipName,
      targetGmInstanceIds: [...raw.targetGmInstanceIds] as string[],
      createdAt,
      ...(population ? { population: raw.population as number } : {}),
    } as unknown as T;
    return [[key, alert]];
  })) as Readonly<Record<string, T>>;
}

type RecordValue = Readonly<Record<string, unknown>>;

function recordValue(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function timestampString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value &&
      typeof value.toDate === 'function') return iso(value);
  return undefined;
}

function maintenanceCycles(value: unknown): NonNullable<GameSession['maintenanceCycles']> {
  const stored = recordValue(value);
  if (!stored) return {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS).flatMap((shipId) => {
    const cycle = parseMaintenanceCycle(stored[shipId]);
    return cycle ? [[shipId, cycle]] : [];
  }));
}

const SMALL_SHIP_IDS: readonly SmallShipId[] = ['gorgoneion', 'capybara-small', 'warrior', 'vulcan'];

function smallShipStates(value: unknown): NonNullable<GameSession['smallShipStates']> {
  const stored = recordValue(value);
  if (!stored) return {};
  return Object.fromEntries(SMALL_SHIP_IDS.flatMap((id) => {
    const raw = recordValue(stored[id]);
    const cycle = recordValue(raw?.cycle);
    const results = recordValue(cycle?.results);
    const charges = cycle?.charges;
    const population = raw?.population;
    const unrest = raw?.unrest;
    const hostShipId = raw?.hostShipId === null ? null : parseEntityId('vessel', raw?.hostShipId);
    const dockingRevision = nonNegativeInteger(raw?.dockingRevision);
    const parsedPopulation = nonNegativeInteger(population);
    const parsedUnrest = nonNegativeInteger(unrest);
    const parsedStep = nonNegativeInteger(cycle?.step);
    const parsedRevision = nonNegativeInteger(cycle?.revision);
    if (!raw || (raw.hostShipId !== null && typeof raw.hostShipId !== 'string') ||
        (raw.hostShipId !== null && hostShipId === undefined) ||
        dockingRevision === undefined || parsedPopulation === undefined ||
        parsedPopulation > (SMALL_SHIPS.find((ship) => ship.id === id)?.printedStatistics.population ?? 0) ||
        parsedUnrest === undefined || parsedUnrest > 10 || !cycle ||
        parsedStep === undefined || parsedStep > 5 || parsedRevision === undefined ||
        !results || !Array.isArray(charges) || charges.some((charge) => typeof charge !== 'string')) return [];
    if (cycle.turn !== undefined && !nonNegativeInteger(cycle.turn)) return [];
    if (cycle.rationBonus !== undefined && (typeof cycle.rationBonus !== 'number' || !Number.isFinite(cycle.rationBonus))) return [];
    if (cycle.chargingSkipped !== undefined && typeof cycle.chargingSkipped !== 'boolean') return [];
    const parsedResults = Object.fromEntries(Object.entries(results).flatMap(([key, result]) =>
      /^[1-5]$/.test(key) && typeof result === 'string' ? [[key, result]] : []));
    const startedAt = cycle.startedAt === undefined ? undefined : timestampString(cycle.startedAt);
    const completedAt = cycle.completedAt === undefined ? undefined : timestampString(cycle.completedAt);
    if ((cycle.startedAt !== undefined && !startedAt) || (cycle.completedAt !== undefined && !completedAt)) return [];
    const parsed: SmallShipState = {
      id,
      hostShipId: hostShipId ?? null,
      dockingRevision,
      population: parsedPopulation,
      unrest: parsedUnrest,
      cycle: {
        step: parsedStep,
        revision: parsedRevision,
        results: parsedResults,
        charges: charges as string[],
        ...(cycle.turn === undefined ? {} : { turn: cycle.turn as number }),
        ...(cycle.rationBonus === undefined ? {} : { rationBonus: cycle.rationBonus as number }),
        ...(cycle.chargingSkipped === undefined ? {} : { chargingSkipped: cycle.chargingSkipped as boolean }),
        ...(startedAt === undefined ? {} : { startedAt }),
        ...(completedAt === undefined ? {} : { completedAt }),
      },
    };
    return [[id, parsed]];
  })) as NonNullable<GameSession['smallShipStates']>;
}

function shuttleCargo(value: unknown): NonNullable<GameSession['shuttleCargo']> {
  const stored = recordValue(value);
  if (!stored) return {};
  const knownShuttleIds = new Set(SHUTTLECRAFT.map((shuttle) => shuttle.id));
  const knownResourceIds = new Set<string>(RESOURCE_DEFINITIONS.map((resource) => resource.id));
  return Object.fromEntries(Object.entries(stored).flatMap(([shuttleId, cargo]) => {
    if (!knownShuttleIds.has(shuttleId)) return [];
    const rawCargo = recordValue(cargo);
    if (!rawCargo) return [];
    const parsedCargo = Object.fromEntries(Object.entries(rawCargo).flatMap(([resourceId, amount]) =>
      knownResourceIds.has(resourceId) && typeof amount === 'number' && Number.isFinite(amount)
        ? [[resourceId, amount]] : []));
    return [[shuttleId, parsedCargo]];
  }));
}

function shuttleFuelled(value: unknown): NonNullable<GameSession['shuttleFuelled']> {
  const stored = recordValue(value);
  if (!stored) return {};
  const knownShuttleIds = new Set(SHUTTLECRAFT.map((shuttle) => shuttle.id));
  return Object.fromEntries(Object.entries(stored).flatMap(([shuttleId, fuelled]) =>
    knownShuttleIds.has(shuttleId) && typeof fuelled === 'boolean' ? [[shuttleId, fuelled]] : []));
}

function shipUpgrades(value: unknown): NonNullable<GameSession['shipUpgrades']> {
  const stored = recordValue(value);
  if (!stored) return {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS).flatMap((shipId) =>
    Array.isArray(stored[shipId]) ? [[shipId, stringArray(stored[shipId])]] : []));
}

function shipDamage(value: unknown): NonNullable<GameSession['shipDamage']> {
  const stored = recordValue(value);
  if (!stored) return {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS).flatMap((shipId) => {
    const raw = recordValue(stored[shipId]);
    if (!raw || typeof raw.destroyed !== 'boolean' || !Array.isArray(raw.damagedSystemIds)) return [];
    return [[shipId, {
      damagedSystemIds: stringArray(raw.damagedSystemIds),
      destroyed: raw.destroyed,
    }]];
  }));
}

function fighterWingCounts(value: unknown): NonNullable<GameSession['fighterWingCounts']> {
  const stored = recordValue(value);
  if (!stored) return {};
  return Object.fromEntries(FIGHTER_WING_IDS.flatMap((wingId) => {
    const raw = recordValue(stored[wingId]);
    if (!raw || typeof raw.count !== 'number' || !Number.isSafeInteger(raw.count) ||
      raw.count < 0 || raw.count > 6 || typeof raw.revision !== 'number' ||
      !Number.isSafeInteger(raw.revision) || raw.revision < 0) return [];
    return [[wingId, { count: raw.count, revision: raw.revision }]];
  })) as NonNullable<GameSession['fighterWingCounts']>;
}

function shipSurvivors(value: unknown): NonNullable<GameSession['shipSurvivors']> {
  const stored = recordValue(value);
  if (!stored) return INITIAL_SHIP_SURVIVORS;
  return Object.fromEntries(Object.keys(INITIAL_SHIP_SURVIVORS).flatMap((shipId) =>
    typeof stored[shipId] === 'number' && Number.isFinite(stored[shipId])
      ? [[shipId, stored[shipId] as number]] : []));
}

function shipGalacticCoordinates(value: unknown): Record<string, string> {
  const stored = recordValue(value);
  return Object.fromEntries(Object.keys(INITIAL_SHIP_GALACTIC_COORDINATES).map((shipId) => [
    shipId,
    typeof stored?.[shipId] === 'string' ? stored[shipId] as string : INITIAL_SHIP_GALACTIC_COORDINATES[shipId] ?? '0000',
  ]));
}

function fleetRedAlert(value: unknown): NonNullable<GameSession['fleetRedAlert']> {
  const raw = recordValue(value);
  const active = raw?.active === true;
  const revision = nonNegativeInteger(raw?.revision) ?? 0;
  const text = typeof raw?.text === 'string' ? raw.text : undefined;
  const raisedAt = timestampString(raw?.raisedAt);
  return {
    active,
    revision,
    ...(text === undefined ? {} : { text }),
    ...(raisedAt === undefined ? {} : { raisedAt }),
  };
}

function shipConsoleLocks(value: unknown): NonNullable<GameSession['shipConsoleLocks']> {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_CONSOLE_LOCKS).map((shipId) => [
    shipId,
    stored[shipId] === true,
  ]));
}

function vesselActionRevisions(value: unknown): NonNullable<GameSession['vesselActionRevisions']> {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(stored).flatMap(([vesselId, revision]) =>
    typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0
      ? [[vesselId, revision]] : []));
}

function shipJumpStates(value: unknown): ShipJumpStates {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_JUMP_STATES).map((shipId) => {
    const state = stored[shipId];
    if (typeof state !== 'object' || state === null || Array.isArray(state)) return [shipId, {}];
    const raw = state as Record<string, unknown>;
    const lock = raw.integrityLockedUntil;
    const integrityLockedUntil = lock && typeof (lock as { toDate?: unknown }).toDate === 'function'
      ? iso(lock)
      : typeof lock === 'string' ? lock : undefined;
    return [shipId, {
      ...(typeof raw.lastJumpTurn === 'number' && Number.isSafeInteger(raw.lastJumpTurn) && raw.lastJumpTurn >= 1
        ? { lastJumpTurn: raw.lastJumpTurn }
        : {}),
      ...(integrityLockedUntil ? { integrityLockedUntil } : {}),
    }];
  })) as ShipJumpStates;
}

function shipJumpTransitions(value: unknown): ShipJumpTransitions {
  const stored = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.keys(INITIAL_SHIP_JUMP_TRANSITIONS).flatMap((shipIdKey) => {
    const transition = stored[shipIdKey];
    if (typeof transition !== 'object' || transition === null || Array.isArray(transition)) return [];
    const raw = transition as Record<string, unknown>;
    const occurredAtValue = raw.occurredAt;
    const occurredAt = occurredAtValue && typeof (occurredAtValue as { toDate?: unknown }).toDate === 'function'
      ? iso(occurredAtValue)
      : typeof occurredAtValue === 'string' ? occurredAtValue : undefined;
    const id = parseEntityId('event', raw.id);
    const shipId = parseEntityId('vessel', raw.shipId);
    if (
      !id || !shipId ||
      typeof raw.origin !== 'string' || typeof raw.destination !== 'string' || !occurredAt
    ) return [];
    return [[shipIdKey, {
      id,
      shipId,
      origin: raw.origin,
      destination: raw.destination,
      occurredAt,
    }]];
  })) as ShipJumpTransitions;
}

function pursuitGroups(value: unknown): Readonly<Record<string, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [group, amount] of Object.entries(value as Record<string, unknown>)) {
    if (group === 'fleet' && typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0) {
      result[group] = amount;
    }
  }
  return result;
}

function sessionSetup(value: unknown): SessionSetup | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const playerCount = raw.playerCount;
  const chartId = raw.chartId;
  const expansion = raw.expansion;
  const turnLimit = raw.turnLimit;
  const activeRoleIds = raw.activeRoleIds;
  const activeVesselIds = raw.activeVesselIds;
  const parsedRoleIds = parseEntityIdArray('role', activeRoleIds);
  const parsedVesselIds = parseEntityIdArray('vessel', activeVesselIds);
  if (
    typeof playerCount !== 'number' || !Number.isSafeInteger(playerCount) || playerCount < 8 || playerCount > 20 ||
    !(['A', 'B', 'C'] as readonly string[]).includes(String(chartId)) ||
    !(['base', 'capybara', 'none'] as readonly string[]).includes(String(expansion)) ||
    !([6, 7, 8] as readonly number[]).includes(Number(turnLimit)) ||
    typeof raw.dioneEnabled !== 'boolean' || typeof raw.capybaraEnabled !== 'boolean' ||
    (raw.universalArbourEnabled !== undefined && typeof raw.universalArbourEnabled !== 'boolean') ||
    (raw.wolfCultEnabled !== undefined && typeof raw.wolfCultEnabled !== 'boolean') ||
    !parsedRoleIds || !parsedVesselIds
  ) return undefined;
  return {
    playerCount,
    chartId: chartId as SessionChartId,
    expansion: expansion as SessionExpansionMode,
    turnLimit: turnLimit as SessionSetup['turnLimit'],
    dioneEnabled: raw.dioneEnabled,
    capybaraEnabled: raw.capybaraEnabled,
    universalArbourEnabled: raw.universalArbourEnabled === true,
    wolfCultEnabled: raw.wolfCultEnabled === true,
    activeRoleIds: parsedRoleIds,
    activeVesselIds: parsedVesselIds,
  };
}

function shuttleDocking(value: unknown): ShuttleDocking | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const shuttleId = parseEntityId('shuttle', raw.shuttleId);
  const shipId = parseEntityId('vessel', raw.shipId);
  if (!shuttleId || !SHUTTLE_CATALOG_IDS.has(shuttleId) || !shipId ||
      !VESSEL_CATALOG_IDS.has(shipId) || typeof raw.dockedAt !== 'string') return undefined;
  return { shuttleId, shipId, dockedAt: raw.dockedAt };
}

function shuttleVisit(value: unknown): ShuttleVisit | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const id = parseEntityId('event', raw.id);
  const shuttleId = parseEntityId('shuttle', raw.shuttleId);
  const shipId = parseEntityId('vessel', raw.shipId);
  if (!id || !shuttleId || !SHUTTLE_CATALOG_IDS.has(shuttleId) || !shipId ||
      !VESSEL_CATALOG_IDS.has(shipId) ||
      (raw.action !== 'docked' && raw.action !== 'departed') || typeof raw.occurredAt !== 'string') {
    return undefined;
  }
  return { id, shuttleId, shipId, action: raw.action, occurredAt: raw.occurredAt };
}

function hummingbirdHarvest(value: unknown, sessionId: string, uid: string): HummingbirdHarvest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const ownerUid = parseEntityId('player', raw.ownerUid);
  const hostShipId = parseEntityId('vessel', raw.hostShipId);
  const turn = raw.turn;
  const revision = raw.revision;
  const rolls = Array.isArray(raw.rolls) && raw.rolls.length === 2 ? raw.rolls : undefined;
  const foodDieIndex = raw.foodDieIndex === 0 || raw.foodDieIndex === 1 ? raw.foodDieIndex : undefined;
  const food = raw.food;
  const water = raw.water;
  if (
    raw.sessionId !== sessionId || ownerUid !== uid || !hostShipId ||
    !Number.isSafeInteger(turn) || (turn as number) < 0 ||
    !Number.isSafeInteger(revision) || (revision as number) < 0 ||
    !rolls || rolls.some((die) => !Number.isSafeInteger(die) || (die as number) < 1 || (die as number) > 6) ||
    (raw.status !== 'pending' && raw.status !== 'resolved') ||
    typeof raw.requestId !== 'string' || typeof raw.createdAt !== 'string'
  ) return null;
  if (raw.status === 'pending' && (foodDieIndex !== undefined || food !== undefined || water !== undefined)) return null;
  if (raw.status === 'resolved' && (
    foodDieIndex === undefined || !Number.isSafeInteger(food) || (food as number) < 0 ||
    !Number.isSafeInteger(water) || (water as number) < 0 || typeof raw.resolvedAt !== 'string' ||
    food !== rolls[foodDieIndex] || water !== rolls[foodDieIndex === 0 ? 1 : 0]
  )) return null;
  return {
    sessionId: entityId('session', sessionId), ownerUid, turn: turn as number,
    hostShipId, revision: revision as number, status: raw.status,
    rolls: [rolls[0] as number, rolls[1] as number],
    ...(foodDieIndex === undefined ? {} : { foodDieIndex }),
    ...(food === undefined ? {} : { food: food as number }),
    ...(water === undefined ? {} : { water: water as number }),
    requestId: raw.requestId, createdAt: raw.createdAt,
    ...(typeof raw.resolvedAt === 'string' ? { resolvedAt: raw.resolvedAt } : {}),
  };
}

export function sessionFrom(id: string, data: DocumentData): GameSession {
  const sessionId = entityId('session', id);
  const dradisContactTriggeredAt = data.dradisContactTriggeredAt;
  const announcement = turnStartAnnouncement(data.turnStartAnnouncement);
  const phaseClock = turnPhaseState(data.turnPhase);
  const playerCount = Number.isSafeInteger(data.playerCount) && data.playerCount >= 8 && data.playerCount <= 20
    ? data.playerCount as number
    : undefined;
  const setup = sessionSetup(data.setup);
  const currentTurn = Number.isSafeInteger(data.currentTurn) && data.currentTurn >= 0
    ? data.currentTurn as number
    : 1;
  const maxTurn = data.turnLimit === 6 || data.turnLimit === 7 || data.turnLimit === 8
    ? data.turnLimit
    : setup?.turnLimit;
  const turnState = turnStateForPhaseContext(data.turnState, phaseClock, currentTurn, maxTurn);
  const storedRoleIds = parseEntityIdArray('role', data.activeRoleIds);
  const storedVesselIds = parseEntityIdArray('vessel', data.activeVesselIds);
  const hasStoredRoleIds = Array.isArray(data.activeRoleIds);
  // Preserve the distinction between an absent legacy field and a present,
  // malformed canonical field. A malformed canonical roster must fail closed
  // instead of widening back to role-derived ship access.
  const hasStoredVesselIds = Object.hasOwn(data, 'activeVesselIds');
  const hasActiveRoleIds = hasStoredRoleIds || Boolean(setup);
  const activeRoleIds = hasStoredRoleIds
    ? storedRoleIds ?? []
    : setup?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const activeVesselIds = setup?.activeVesselIds ?? (
    hasStoredVesselIds ? storedVesselIds ?? [] : undefined
  );
  const storedDockings = Array.isArray(data.shuttleDockings)
    ? data.shuttleDockings.map(shuttleDocking).filter((docking): docking is ShuttleDocking => docking !== undefined)
    : undefined;
  const storedVisits = Array.isArray(data.shuttleVisitLog)
    ? data.shuttleVisitLog.map(shuttleVisit).filter((visit): visit is ShuttleVisit => visit !== undefined)
    : undefined;
  const activeVessels = activeVesselIds ? new Set(activeVesselIds) : undefined;
  const visibleDockings = storedDockings?.filter((docking) =>
    activeVessels === undefined || activeVessels.has(docking.shipId));
  const visibleShuttles = visibleDockings ? new Set(visibleDockings.map((docking) => docking.shuttleId)) : undefined;
  const visibleVisits = storedVisits?.filter((visit) =>
    (activeVessels === undefined || activeVessels.has(visit.shipId)) &&
    (visibleShuttles === undefined || visibleShuttles.has(visit.shuttleId)));
  const ownerUid = parseEntityId('player', data.ownerUid);
  const shuttleManifest = normalizeShuttleManifest(
    visibleDockings,
    visibleVisits,
    hasActiveRoleIds ? activeRoleIds : undefined,
    playerCount,
  );
  return {
    id: sessionId,
    name: data.name as string,
    joinCode: data.joinCode as string,
    phase: data.phase as GameSession['phase'],
    currentTurn,
    ...(playerCount === undefined ? {} : { playerCount }),
    ...(data.chartId === 'A' || data.chartId === 'B' || data.chartId === 'C'
      ? { chartId: data.chartId } : {}),
    ...(data.expansion === 'base' || data.expansion === 'capybara' || data.expansion === 'none'
      ? { expansion: data.expansion } : {}),
    ...(data.turnLimit === 6 || data.turnLimit === 7 || data.turnLimit === 8
      ? { turnLimit: data.turnLimit } : {}),
    ...(typeof data.chartSelectionLocked === 'boolean'
      ? { chartSelectionLocked: data.chartSelectionLocked } : {}),
    ...(typeof data.configurationLocked === 'boolean'
      ? { configurationLocked: data.configurationLocked } : {}),
    ...(Number.isSafeInteger(data.setupRevision) && data.setupRevision >= 0
      ? { setupRevision: data.setupRevision as number } : {}),
    ...(setup ? { setup, activeVesselIds: [...setup.activeVesselIds] } :
      activeVesselIds !== undefined ? { activeVesselIds: [...activeVesselIds] } : {}),
    ...(announcement ? { turnStartAnnouncement: announcement } : {}),
    ...(phaseClock ? { turnPhase: phaseClock } : {}),
    ...(turnState ? { turnState } : {}),
    capybaraEnabled: data.capybaraEnabled !== false,
    dioneEnabled: data.dioneEnabled !== false,
    universalArbourEnabled: data.universalArbourEnabled === true,
    wolfCultEnabled: data.wolfCultEnabled === true,
    pressEnabled: data.pressEnabled !== false,
    pressAvailabilityRevision:
      Number.isSafeInteger(data.pressAvailabilityRevision) && data.pressAvailabilityRevision >= 0
        ? data.pressAvailabilityRevision as number
        : 0,
    // Navigation and discovery are audience-scoped subcollection projections;
    // the member-readable session document never hydrates these fields.
    shipConsoleLocks: shipConsoleLocks(data.shipConsoleLocks),
    vesselActionRevisions: vesselActionRevisions(data.vesselActionRevisions),
    shipJumpStates: shipJumpStates(data.shipJumpStates),
    shipJumpTransitions: shipJumpTransitions(data.shipJumpTransitions),
    pursuitGroups: pursuitGroups(data.pursuitGroups),
    fleetRedAlert: fleetRedAlert(data.fleetRedAlert),
    debriefMode: debriefMode(data.debriefMode),
    pressDispatch: normalizePressDispatch(data.pressDispatch),
    fleetTicker: fleetTickerState(data.fleetTicker),
    maintenanceCycles: maintenanceCycles(data.maintenanceCycles),
    smallShipStates: smallShipStates(data.smallShipStates),
    shuttleCargo: shuttleCargo(data.shuttleCargo),
    shuttleFuelled: shuttleFuelled(data.shuttleFuelled),
    shipUpgrades: shipUpgrades(data.shipUpgrades),
    shipResources: shipResources(data.shipResources),
    shipDamage: shipDamage(data.shipDamage),
    fighterWingCounts: fighterWingCounts(data.fighterWingCounts),
    shipUnrest: shipUnrest(data.shipUnrest),
    shipSurvivors: shipSurvivors(data.shipSurvivors),
    populationAlerts: alertMap<PopulationAlert>(data.populationAlerts, true),
    unrestAlerts: alertMap<UnrestAlert>(data.unrestAlerts, false),
    gmControlsLocked: data.gmControlsLocked === true,
    activeRoleIds,
    shuttleDockings: shuttleManifest.dockings,
    shuttleVisitLog: shuttleManifest.visits,
    confettiUsedShipIds: Array.isArray(data.confettiUsedShipIds)
      ? data.confettiUsedShipIds
        .filter((shipId: unknown) => typeof shipId === 'string' && CONFETTI_SOURCE_IDS.has(shipId))
        .map((shipId: unknown) => parseEntityId('vessel', shipId))
        .filter((shipId): shipId is NonNullable<typeof shipId> => shipId !== undefined)
      : [],
    ...(dradisContactTriggeredAt && typeof dradisContactTriggeredAt.toDate === 'function'
      ? { dradisContactTriggeredAt: iso(dradisContactTriggeredAt) }
      : {}),
    ...(ownerUid ? { ownerUid } : {}),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function playerFrom(sessionId: string, uid: string, data: DocumentData): Player {
  const parsedSeatId = data.seatId === null || data.seatId === undefined
    ? null
    : parseEntityId('seat', data.seatId) ?? null;
  const parsedRoleId = data.assignedRoleId === null || data.assignedRoleId === undefined
    ? null
    : parseEntityId('role', data.assignedRoleId);
  const parsedReplacementRoleId = data.replacementRoleId === null || data.replacementRoleId === undefined
    ? null
    : parseEntityId('role', data.replacementRoleId);
  const parsedVesselId = data.shipPreferenceId === null || data.shipPreferenceId === undefined
    ? null
    : parseEntityId('vessel', data.shipPreferenceId);
  const parsedConsoleId = data.activeConsoleRoleId === null || data.activeConsoleRoleId === undefined
    ? null
    : parseEntityId('role', data.activeConsoleRoleId);
  const parsedFleetGroupId = data.fleetGroupId === null || data.fleetGroupId === undefined
    ? null
    : parseEntityId('group', data.fleetGroupId);
  return {
    uid: entityId('player', uid),
    sessionId: entityId('session', sessionId),
    displayName: normalizeDisplayName(data.displayName),
    role: data.role as Player['role'],
    seatId: parsedSeatId,
    ...(parsedRoleId !== undefined ? { assignedRoleId: parsedRoleId } : {}),
    ...(parsedReplacementRoleId !== undefined ? { replacementRoleId: parsedReplacementRoleId } : {}),
    ...(parsedVesselId !== undefined ? { shipPreferenceId: parsedVesselId } : {}),
    ...(parsedConsoleId !== undefined ? { activeConsoleRoleId: parsedConsoleId } : {}),
    ...(parsedFleetGroupId !== undefined ? { fleetGroupId: parsedFleetGroupId } : {}),
    ...(typeof data.connected === 'boolean' ? { connected: data.connected } : {}),
    joinedAt: iso(data.joinedAt),
  };
}

function seatFrom(sessionId: string, id: string, data: DocumentData): Seat {
  const roleId = parseEntityId('role', data.roleId) ?? entityId('role', id);
  const seatId = entityId('seat', id);
  const parsedFactionId = data.factionId === null || data.factionId === undefined
    ? null
    : parseEntityId('vessel', data.factionId);
  const parsedHolderUid = data.holderUid === null || data.holderUid === undefined
    ? null
    : parseEntityId('player', data.holderUid) ?? null;
  const metadata = ROLE_SEAT_METADATA[roleId];
  return {
    id: seatId,
    sessionId: entityId('session', sessionId),
    roleId,
    label: typeof data.label === 'string' ? data.label : metadata?.label ?? roleId,
    factionId: parsedFactionId ?? (metadata?.factionId ? entityId('vessel', metadata.factionId) : null),
    status: data.status as Seat['status'],
    holderUid: parsedHolderUid,
    claimedAt: data.claimedAt ? iso(data.claimedAt) : null,
  };
}

export interface SessionStateHandlers {
  readonly onSession: (session: GameSession) => void;
  /** Audience-scoped navigation/discovery projection for this member. */
  readonly onPlayerDiscovery?: (projection: PlayerDiscoveryProjection | null) => void;
  /** Facilitator-only organiser navigation/chart projection. */
  readonly onGmDiscovery?: (projection: Pick<GameSession, 'shipGalacticCoordinates' | 'shipNavigationLogs' | 'organiserSites' | 'organiserSystems' | 'organiserSystemHistory' | 'pursuitDistances'> | null) => void;
  /** Whether the accepted session snapshot is backed by server authority. */
  readonly onSessionFreshness?: (fresh: boolean) => void;
  /** Retain accepted server authority when an equivalent listener is restarted. */
  readonly sessionSnapshotAuthority?: SessionSnapshotAuthority;
  readonly onPlayer: (player: Player) => void;
  readonly onKicked: () => void;
  readonly onSeats: (seats: readonly Seat[]) => void;
  readonly onPrivateLoyalty?: (loyalty: PrivateLoyalty | null) => void;
  readonly onWolfCultIntelligence?: (intelligence: WolfCultIntelligence | null) => void;
  readonly onArbourVision?: (vision: ArbourVision | null) => void;
  readonly onRoleBrief?: (brief: RoleBrief | null) => void;
  readonly onAwayMissionHandPointer?: (pointer: AwayMissionHandPointer | null) => void;
  readonly onAwayMissionHand?: (hand: AwayMissionHand | null) => void;
  readonly onAwayMissionHandPointers?: (pointers: readonly AwayMissionHandPointer[]) => void;
  readonly onAwayMissionHands?: (hands: readonly AwayMissionHand[]) => void;
  readonly onGmAwayMissionHandPointers?: (pointers: readonly AwayMissionHandPointer[]) => void;
  readonly onCommissarPurgeAuthority?: (authority: CommissarPurgeAuthority | null) => void;
  readonly onFacilitatorRuleCall?: (call: FacilitatorRuleCall | null) => void;
  /** Whether the accepted player projection came from the server. */
  readonly onPlayerFreshness?: (fresh: boolean) => void;
  readonly onSetupReceipt?: (receipt: SetupReceipt | null) => void;
  readonly onError: () => void;
}

// App owns one session identity at a time. Keep a generation so an older
// listener's cleanup cannot clear private state that a replacement listener
// has already hydrated.
let currentSessionSubscriptionToken: symbol | undefined;

/** Keep the local snapshot current while Firestore handles reconnect/cache replay. */
export function subscribeSessionState(
  sessionId: string,
  uid: string,
  handlers: SessionStateHandlers,
): Unsubscribe {
  const database = db();
  let subscribed = true;
  const subscriptionToken = Symbol('session-subscription');
  let gmDiscoveryTerminated = false;
  currentSessionSubscriptionToken = subscriptionToken;
  const sessionSnapshotAuthority =
    handlers.sessionSnapshotAuthority ?? createSessionSnapshotAuthority();
  let acceptsWolfCultRevision = createMonotonicRevisionGate();
  let acceptsArbourVisionRevision = createMonotonicRevisionGate();
  let unsubscribeWolfCult: Unsubscribe = () => undefined;
  let unsubscribeArbourVision: Unsubscribe = () => undefined;
  let unsubscribePrivateLoyalty: Unsubscribe = () => undefined;
  let wolfCultListenerGeneration = 0;
  let arbourVisionListenerGeneration = 0;
  let privateLoyaltyListenerGeneration = 1;
  let privateLoyaltyListenerBroken = false;
  let lastPrivateLoyaltyKind: string | null = null;
  let startWolfCultListener: (resetRevision: boolean) => void = () => undefined;
  let startArbourVisionListener: (resetRevision: boolean) => void = () => undefined;
  let startPrivateLoyaltyListener: () => void = () => undefined;
  let unsubscribeAwayMissionHands: Unsubscribe[] = [];
  let awayMissionHandListenerGeneration = 0;
  const onError = () => {
    if (subscribed && currentSessionSubscriptionToken === subscriptionToken) handlers.onError();
  };
  const startAwayMissionHandListeners = (pointers: readonly AwayMissionHandPointer[]) => {
    unsubscribeAwayMissionHands.forEach((unsubscribe) => unsubscribe());
    unsubscribeAwayMissionHands = [];
    const generation = ++awayMissionHandListenerGeneration;
    if (pointers.length === 0 || (!handlers.onAwayMissionHand && !handlers.onAwayMissionHands)) {
      handlers.onAwayMissionHand?.(null);
      handlers.onAwayMissionHands?.([]);
      return;
    }
    const hands = new Map<string, AwayMissionHand>();
    const publishHands = () => {
      const next = pointers.flatMap((pointer) => {
        const hand = hands.get(pointer.handId);
        return hand ? [hand] : [];
      });
      handlers.onAwayMissionHands?.(next);
      handlers.onAwayMissionHand?.(next[0] ?? null);
    };
    pointers.forEach((pointer) => {
      const unsubscribe = onSnapshot(
        doc(database, `sessions/${sessionId}/awayMissionHands/${pointer.handId}`),
        (snapshot) => {
          if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken ||
              generation !== awayMissionHandListenerGeneration) return;
          if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
          const hand = snapshot.exists() ? awayMissionHand(snapshot.data(), sessionId, uid) : null;
          if (hand) hands.set(pointer.handId, hand);
          else hands.delete(pointer.handId);
          publishHands();
        },
        (error: { readonly code?: string }) => {
          if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken ||
              generation !== awayMissionHandListenerGeneration) return;
          if (error.code === 'permission-denied' || error.code === 'not-found') {
            hands.delete(pointer.handId);
            publishHands();
            return;
          }
          onError();
        },
      );
      unsubscribeAwayMissionHands.push(unsubscribe);
    });
  };
  const unsubscribes = [
    onSnapshot(doc(database, `sessions/${sessionId}`), (snapshot) => {
      if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
      if (snapshot.exists()) {
        const fromCache = snapshot.metadata?.fromCache === true;
        // A cache callback can arrive after Firestore has delivered a newer
        // server snapshot. It remains useful for the first render, but never
        // gets to roll back accepted authority or its freshness signal.
        if (fromCache && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        const data = snapshot.data();
        const session = sessionFrom(snapshot.id, data);
        if (!fromCache && !acceptServerSessionAuthority(
          sessionSnapshotAuthority,
          session,
          serverAuthorityCursor(snapshot, data),
        )) return;
        handlers.onSession(session);
        if (fromCache) {
          handlers.onSessionFreshness?.(false);
        } else {
          handlers.onSessionFreshness?.(true);
        }
      }
      else onError();
    }, onError),
    onSnapshot(doc(database, `sessions/${sessionId}/players/${uid}`), (snapshot) => {
      if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      // Player role/seat projections are part of the same reconnect identity.
      // Once the session cursor is server-authoritative, a delayed cached
      // projection must not replace the role or seat used by the UI.
      if (fromCache && sessionSnapshotAuthority.hasServerSessionAuthority) return;
      // A cached kickedAt is not enough to tear down the persisted identity;
      // wait for the server projection to confirm that terminal decision.
      if (snapshot.exists() && snapshot.get('kickedAt') && !fromCache) {
        handlers.onKicked();
      } else if (snapshot.exists() && snapshot.get('connected') === true) {
        handlers.onPlayer(playerFrom(sessionId, uid, snapshot.data()));
        handlers.onPlayerFreshness?.(!fromCache);
        // A legacy listener can terminate while the document is absent. A
        // same-UID assignment updates this player projection atomically with
        // its private card, giving us a safe point to rebind that listener.
        startPrivateLoyaltyListener();
      } else onError();
    }, onError),
    ...(handlers.onPlayerDiscovery ? [onSnapshot(
      doc(database, `sessions/${sessionId}/playerDiscoveries/${uid}`),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        handlers.onPlayerDiscovery?.(snapshot.exists() ? playerDiscoveryProjection(snapshot.data()) ?? null : null);
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (error.code !== 'permission-denied' && error.code !== 'not-found') onError();
      },
    )] : []),
    ...(handlers.onGmDiscovery ? [onSnapshot(
      doc(database, `sessions/${sessionId}/gmDiscovery/current`),
      (snapshot) => {
        if (!subscribed || gmDiscoveryTerminated || currentSessionSubscriptionToken !== subscriptionToken) return;
        // The full chart is privileged. A remembered GM role is insufficient
        // to expose a cached chart before this read is authorized again.
        if (snapshot.metadata?.fromCache === true) return;
        handlers.onGmDiscovery?.(snapshot.exists() ? gmDiscoveryProjection(snapshot.data()) ?? null : null);
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          gmDiscoveryTerminated = true;
          handlers.onGmDiscovery?.(null);
          return;
        }
        onError();
      },
    )] : []),
    onSnapshot(collection(database, `sessions/${sessionId}/seats`), (snapshot) => {
      if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
      if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
      handlers.onSeats(snapshot.docs
        .map((seat) => seatFrom(sessionId, seat.id, seat.data()))
        .filter((seat) => seat.roleId !== 'press-officer'));
    }, onError),
    ...(handlers.onPrivateLoyalty ? [unsubscribePrivateLoyalty = onSnapshot(
      doc(database, `sessions/${sessionId}/secrets/loyalty-${uid}`),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (privateLoyaltyListenerGeneration !== 1) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        privateLoyaltyListenerBroken = false;
        const next = snapshot.exists() ? privateLoyalty(snapshot.get('payload'), uid) : null;
        const nextKind = next?.kind ?? null;
        if (nextKind !== lastPrivateLoyaltyKind) {
          if (nextKind === 'wolf-cult') startWolfCultListener(true);
          else {
            unsubscribeWolfCult();
            wolfCultListenerGeneration += 1;
            handlers.onWolfCultIntelligence?.(null);
          }
          if (nextKind === 'universal-arbour') startArbourVisionListener(true);
          else {
            unsubscribeArbourVision();
            arbourVisionListenerGeneration += 1;
            handlers.onArbourVision?.(null);
          }
          lastPrivateLoyaltyKind = nextKind;
        }
        handlers.onPrivateLoyalty?.(next);
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          privateLoyaltyListenerBroken = true;
          unsubscribeWolfCult();
          unsubscribeArbourVision();
          wolfCultListenerGeneration += 1;
          arbourVisionListenerGeneration += 1;
          lastPrivateLoyaltyKind = null;
          handlers.onWolfCultIntelligence?.(null);
          handlers.onArbourVision?.(null);
          handlers.onPrivateLoyalty?.(null);
          return;
        }
        onError();
      },
    )] : []),
    ...(handlers.onRoleBrief ? [onSnapshot(
      doc(database, `sessions/${sessionId}/roleBriefs/${uid}`),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        handlers.onRoleBrief?.(
          snapshot.exists() ? roleBrief(snapshot.data(), sessionId, uid) : null,
        );
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          handlers.onRoleBrief?.(null);
        }
        onError();
      },
    )] : []),
    ...(handlers.onCommissarPurgeAuthority ? [onSnapshot(
      doc(database, `sessions/${sessionId}/commissarPurgeAuthority/${uid}`),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        handlers.onCommissarPurgeAuthority?.(
          snapshot.exists() ? commissarPurgeAuthority(snapshot.data(), sessionId) : null,
        );
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          handlers.onCommissarPurgeAuthority?.(null);
          return;
        }
        onError();
      },
    )] : []),
    ...(handlers.onFacilitatorRuleCall ? [onSnapshot(
      doc(database, `sessions/${sessionId}/facilitatorRuleCalls/recipient-${uid}`),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        handlers.onFacilitatorRuleCall?.(
          snapshot.exists() ? facilitatorRuleCall(snapshot.data(), sessionId, uid) : null,
        );
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          handlers.onFacilitatorRuleCall?.(null);
          return;
        }
        onError();
      },
    )] : []),
    ...((handlers.onAwayMissionHandPointer || handlers.onAwayMissionHand ||
      handlers.onAwayMissionHandPointers || handlers.onAwayMissionHands) ? [onSnapshot(
      query(
        collection(database, `sessions/${sessionId}/awayMissionHandPointers`),
        where('sessionId', '==', sessionId),
        where('participantUid', '==', uid),
      ),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        const pointers = snapshot.docs
          .map((entry) => awayMissionHandPointer(entry.data(), sessionId, uid))
          .filter((pointer): pointer is AwayMissionHandPointer => pointer !== null);
        handlers.onAwayMissionHandPointers?.(pointers);
        handlers.onAwayMissionHandPointer?.(pointers[0] ?? null);
        startAwayMissionHandListeners(pointers);
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          handlers.onAwayMissionHandPointers?.([]);
          handlers.onAwayMissionHandPointer?.(null);
          startAwayMissionHandListeners([]);
          return;
        }
        onError();
      },
    )] : []),
    ...(handlers.onGmAwayMissionHandPointers ? [onSnapshot(
      query(
        collection(database, `sessions/${sessionId}/awayMissionHandPointers`),
        where('sessionId', '==', sessionId),
      ),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        handlers.onGmAwayMissionHandPointers?.(
          snapshot.docs
            .map((entry) => awayMissionHandPointer(entry.data(), sessionId))
            .filter((pointer): pointer is AwayMissionHandPointer => pointer !== null),
        );
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          handlers.onGmAwayMissionHandPointers?.([]);
          return;
        }
        onError();
      },
    )] : []),
    ...(handlers.onSetupReceipt ? [onSnapshot(
      query(
        collection(database, `sessions/${sessionId}/secrets`),
        where('visibleToUids', 'array-contains', uid),
      ),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        const latest = snapshot.docs
          .map((secret) => setupReceipt(secret.get('payload')))
          .filter((receipt): receipt is SetupReceipt => receipt !== null)
          .sort((left, right) => left.committedSetupRevision - right.committedSetupRevision)
          .at(-1) ?? null;
        handlers.onSetupReceipt?.(latest);
      },
      onError,
    )] : []),
  ];
  startWolfCultListener = (resetRevision: boolean) => {
    unsubscribeWolfCult();
    const generation = ++wolfCultListenerGeneration;
    if (resetRevision) acceptsWolfCultRevision = createMonotonicRevisionGate();
    if (!handlers.onWolfCultIntelligence) return;
    unsubscribeWolfCult = onSnapshot(
      doc(database, `sessions/${sessionId}/wolfCultIntelligence/${uid}`),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken ||
            generation !== wolfCultListenerGeneration) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        const intelligence = snapshot.exists()
          ? wolfCultIntelligence(snapshot.data(), sessionId, uid)
          : null;
        if (intelligence && !acceptsWolfCultRevision(intelligence.revision)) return;
        handlers.onWolfCultIntelligence?.(intelligence);
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken ||
            generation !== wolfCultListenerGeneration) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          handlers.onWolfCultIntelligence?.(null);
          return;
        }
        onError();
      },
    );
  };
  startArbourVisionListener = (resetRevision: boolean) => {
    unsubscribeArbourVision();
    const generation = ++arbourVisionListenerGeneration;
    if (resetRevision) acceptsArbourVisionRevision = createMonotonicRevisionGate();
    if (!handlers.onArbourVision) return;
    unsubscribeArbourVision = onSnapshot(
      doc(database, `sessions/${sessionId}/arbourVisions/${uid}`),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken ||
            generation !== arbourVisionListenerGeneration) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        const vision = snapshot.exists() ? arbourVision(snapshot.data(), sessionId, uid) : null;
        if (vision && !acceptsArbourVisionRevision(vision.revision)) return;
        handlers.onArbourVision?.(vision);
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken ||
            generation !== arbourVisionListenerGeneration) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          handlers.onArbourVision?.(null);
          return;
        }
        onError();
      },
    );
  };
  startPrivateLoyaltyListener = () => {
    if (!privateLoyaltyListenerBroken || !handlers.onPrivateLoyalty) return;
    unsubscribePrivateLoyalty();
    const generation = ++privateLoyaltyListenerGeneration;
    privateLoyaltyListenerBroken = false;
    unsubscribePrivateLoyalty = onSnapshot(
      doc(database, `sessions/${sessionId}/secrets/loyalty-${uid}`),
      (snapshot) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken ||
            generation !== privateLoyaltyListenerGeneration) return;
        if (snapshot.metadata?.fromCache === true && sessionSnapshotAuthority.hasServerSessionAuthority) return;
        const next = snapshot.exists() ? privateLoyalty(snapshot.get('payload'), uid) : null;
        const nextKind = next?.kind ?? null;
        if (nextKind !== lastPrivateLoyaltyKind) {
          if (nextKind === 'wolf-cult') startWolfCultListener(true);
          else {
            unsubscribeWolfCult();
            wolfCultListenerGeneration += 1;
            handlers.onWolfCultIntelligence?.(null);
          }
          if (nextKind === 'universal-arbour') startArbourVisionListener(true);
          else {
            unsubscribeArbourVision();
            arbourVisionListenerGeneration += 1;
            handlers.onArbourVision?.(null);
          }
          lastPrivateLoyaltyKind = nextKind;
        }
        handlers.onPrivateLoyalty?.(next);
      },
      (error: { readonly code?: string }) => {
        if (!subscribed || currentSessionSubscriptionToken !== subscriptionToken ||
            generation !== privateLoyaltyListenerGeneration) return;
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          privateLoyaltyListenerBroken = true;
          unsubscribeWolfCult();
          unsubscribeArbourVision();
          wolfCultListenerGeneration += 1;
          arbourVisionListenerGeneration += 1;
          lastPrivateLoyaltyKind = null;
          handlers.onWolfCultIntelligence?.(null);
          handlers.onArbourVision?.(null);
          handlers.onPrivateLoyalty?.(null);
          return;
        }
        onError();
      },
    );
  };
  startWolfCultListener(false);
  startArbourVisionListener(false);
  return () => {
    subscribed = false;
    unsubscribePrivateLoyalty();
    privateLoyaltyListenerGeneration += 1;
    unsubscribeWolfCult();
    unsubscribeArbourVision();
    unsubscribeAwayMissionHands.forEach((unsubscribe) => unsubscribe());
    unsubscribeAwayMissionHands = [];
    awayMissionHandListenerGeneration += 1;
    wolfCultListenerGeneration += 1;
    arbourVisionListenerGeneration += 1;
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    if (currentSessionSubscriptionToken === subscriptionToken) {
      currentSessionSubscriptionToken = undefined;
      // Private projections belong to this exact session/UID listener. Clear
      // them before a replacement subscription can hydrate a different
      // assignment, so the old player's loyalty or setup receipt cannot remain
      // visible during reconnect or identity replacement. An older cleanup
      // leaves a newer listener's private state intact.
      handlers.onPrivateLoyalty?.(null);
      handlers.onWolfCultIntelligence?.(null);
      handlers.onArbourVision?.(null);
      handlers.onRoleBrief?.(null);
      handlers.onAwayMissionHandPointer?.(null);
      handlers.onAwayMissionHand?.(null);
      handlers.onAwayMissionHandPointers?.([]);
      handlers.onAwayMissionHands?.([]);
      handlers.onGmAwayMissionHandPointers?.([]);
      handlers.onCommissarPurgeAuthority?.(null);
      handlers.onFacilitatorRuleCall?.(null);
      handlers.onSetupReceipt?.(null);
    }
  };
}

/** Subscribe to one server-owned VIP hand; card identity never enters the shared session snapshot. */
export function subscribeVipCards(
  sessionId: string,
  uid: string,
  onCards: (hand: VipHand | null) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const authority = suppliedAuthority ?? projectionSessionAuthority(sessionId, undefined);
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/vipHands/${uid}`),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (hasServerSnapshot || authority?.hasServerSessionAuthority)) return;
      if (!fromCache) hasServerSnapshot = true;
      onCards(snapshot.exists() ? vipHand(snapshot.data(), sessionId, uid) : null);
    },
    (error: { readonly code?: string }) => {
      if (!subscribed) return;
      if (error.code === 'permission-denied' || error.code === 'not-found') {
        onCards(null);
        return;
      }
      onError();
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onCards(null);
  };
}

/** Subscribe to the current Quellon Explorer's private Hummingbird receipt. */
export function subscribeHummingbirdHarvest(
  sessionId: string,
  uid: string,
  onHarvest: (harvest: HummingbirdHarvest | null) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const authority = suppliedAuthority ?? projectionSessionAuthority(sessionId, undefined);
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/hummingbirdHarvests/${uid}`),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (hasServerSnapshot || authority?.hasServerSessionAuthority)) return;
      if (!fromCache) hasServerSnapshot = true;
      onHarvest(snapshot.exists() ? hummingbirdHarvest(snapshot.data(), sessionId, uid) : null);
    },
    (error: { readonly code?: string }) => {
      if (!subscribed) return;
      if (error.code === 'permission-denied' || error.code === 'not-found') {
        onHarvest(null);
        return;
      }
      onError();
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onHarvest(null);
  };
}

/**
 * Subscribe to the facilitator-only census only after the caller has an
 * authoritative GM projection. A denied read is an expected authorization
 * race during demotion and must not turn the session transport red.
 */
export function subscribeLoyaltyCensus(
  sessionId: string,
  onCensus: (census: LoyaltyCensus | null) => void,
): Unsubscribe {
  let subscribed = true;
  const acceptsRevision = createMonotonicRevisionGate();
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/loyaltyCensus/current`),
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      const census = snapshot.exists() ? loyaltyCensus(snapshot.data()) : null;
      if (census && !acceptsRevision(census.revision)) return;
      onCensus(census);
    },
    () => {
      if (!subscribed) return;
      onCensus(null);
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onCensus(null);
  };
}

/** Subscribe to the facilitator-only current Wolf Cult intelligence call. */
export function subscribeGmWolfCultIntelligence(
  sessionId: string,
  onIntelligence: (intelligence: WolfCultIntelligence | null) => void,
): Unsubscribe {
  let subscribed = true;
  const acceptsRevision = createMonotonicRevisionGate();
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/wolfCultIntelligence/current`),
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      const intelligence = snapshot.exists() ? gmWolfCultIntelligence(snapshot.data(), sessionId) : null;
      if (intelligence && !acceptsRevision(intelligence.revision)) return;
      onIntelligence(intelligence);
    },
    (error: { readonly code?: string }) => {
      if (!subscribed) return;
      if (error.code === 'permission-denied' || error.code === 'not-found') {
        onIntelligence(null);
        return;
      }
      onIntelligence(null);
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onIntelligence(null);
  };
}

/** Subscribe to the facilitator-only current Universal Arbour call. */
export function subscribeGmArbourVision(
  sessionId: string,
  onVision: (vision: ArbourVision | null) => void,
): Unsubscribe {
  let subscribed = true;
  const acceptsRevision = createMonotonicRevisionGate();
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/arbourVisions/current`),
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      const vision = snapshot.exists() ? gmArbourVision(snapshot.data(), sessionId) : null;
      if (vision && !acceptsRevision(vision.revision)) return;
      onVision(vision);
    },
    (error: { readonly code?: string }) => {
      if (!subscribed) return;
      if (error.code === 'permission-denied' || error.code === 'not-found') {
        onVision(null);
        return;
      }
      onVision(null);
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onVision(null);
  };
}

/** Subscribe to the facilitator-only current rule call. */
export function subscribeGmFacilitatorRuleCall(
  sessionId: string,
  onCall: (call: FacilitatorRuleCall | null) => void,
): Unsubscribe {
  let subscribed = true;
  const acceptsRevision = createMonotonicRevisionGate();
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/facilitatorRuleCalls/gm-current`),
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      const call = snapshot.exists() ? facilitatorRuleCall(snapshot.data(), sessionId) : null;
      if (call && !acceptsRevision(call.revision)) return;
      onCall(call);
    },
    () => {
      if (!subscribed) return;
      onCall(null);
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onCall(null);
  };
}

/** Subscribe to the facilitator-only first Wolf-attack timing marker. */
export function subscribeGmWolfAttackWindow(
  sessionId: string,
  onWindow: (window: WolfAttackWindow | null) => void,
): Unsubscribe {
  let subscribed = true;
  const acceptsRevision = createMonotonicRevisionGate();
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/wolfAttackWindow/current`),
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      const window = snapshot.exists() ? wolfAttackWindow(snapshot.data()) : null;
      if (window && !acceptsRevision(window.revision)) return;
      onWindow(window);
    },
    () => {
      if (!subscribed) return;
      onWindow(null);
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onWindow(null);
  };
}

/** Subscribe to the facilitator-only private Wolf preparation draft. */
export function subscribeGmWolfAttackPreparation(
  sessionId: string,
  onPreparation: (preparation: WolfAttackPreparation | null) => void,
): Unsubscribe {
  let subscribed = true;
  const acceptsRevision = createMonotonicRevisionGate();
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/wolfAttackPreparation/current`),
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      const preparation = snapshot.exists() ? wolfAttackPreparation(snapshot.data()) : null;
      if (preparation && !acceptsRevision(preparation.revision)) return;
      onPreparation(preparation);
    },
    () => {
      if (subscribed) onPreparation(null);
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onPreparation(null);
  };
}

/** Subscribe to the facilitator-only declaration summary. The parser omits
 * the private preparation, target samples, and calculation receipt. */
export function subscribeGmWolfAttackState(
  sessionId: string,
  onState: (state: WolfAttackDeclarationState | null) => void,
): Unsubscribe {
  let subscribed = true;
  const acceptsRevision = createMonotonicRevisionGate();
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/wolfAttackState/current`),
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      const state = snapshot.exists() ? wolfAttackDeclarationState(snapshot.data()) : null;
      if (state && !acceptsRevision(state.revision)) return;
      onState(state);
    },
    () => {
      if (subscribed) onState(null);
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onState(null);
  };
}

/** Subscribe to the existing setup secret that lists the hidden Wolf roles. */
export function subscribeGmWolfAssignment(
  sessionId: string,
  onAssignment: (assignment: WolfAssignment | null) => void,
): Unsubscribe {
  let subscribed = true;
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/secrets/wolf-assignment`),
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      onAssignment(snapshot.exists() ? wolfAssignment(snapshot.get('payload')) : null);
    },
    () => {
      if (subscribed) onAssignment(null);
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onAssignment(null);
  };
}

export function subscribeGmInstances(
  sessionId: string,
  onInstances: (instances: readonly GmInstance[]) => void,
  onError: () => void,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let denied = false;
  let hasServerSnapshot = false;
  let refreshInFlight: Promise<void> | undefined;
  let refreshQueued = false;
  let listenerFailed = false;
  let listenerGeneration = 0;
  let retryDelay = 1_000;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopListener: Unsubscribe = () => undefined;
  const alive = () => subscribed && !denied;
  const clearRetry = () => {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
  };
  const fail = (error: unknown) => {
    if (!alive()) return;
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code).replace(/^(?:firestore|functions)\//, '') : '';
    // Revoked access or a deleted session cannot be repaired by polling.
    if (code === 'permission-denied' || code === 'not-found') {
      denied = true;
      listenerGeneration += 1;
      stopListener();
      clearRetry();
      refreshQueued = false;
    } else if (retryTimer === undefined) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        recover();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    }
    onError();
  };
  const publishServerProjection = async (): Promise<void> => {
    if (!alive()) return;
    if (refreshInFlight) {
      refreshQueued = true;
      return refreshInFlight;
    }
    refreshInFlight = httpsCallable<{ sessionId: string }, { instances: GmInstance[] }>(
      functions(), 'listGmInstances',
    )({ sessionId }).then((response) => {
      if (!alive()) return;
      onInstances(response.data.instances);
      if (!listenerFailed) {
        clearRetry();
        retryDelay = 1_000;
      }
    }).catch(fail).finally(() => {
      refreshInFlight = undefined;
      if (refreshQueued) {
        refreshQueued = false;
        void publishServerProjection();
      }
    });
    return refreshInFlight;
  };
  const attachListener = () => {
    if (!alive()) return;
    stopListener();
    const generation = ++listenerGeneration;
    listenerFailed = false;
    const stop = onSnapshot(
      query(collection(db(), `sessions/${sessionId}/gmInstances`), orderBy('claimedAt', 'asc')),
      (snapshot) => {
        if (!alive() || generation !== listenerGeneration) return;
        const fromCache = snapshot.metadata?.fromCache === true;
        if (fromCache && (
          hasServerSnapshot ||
          projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
        )) return;
        if (!fromCache) hasServerSnapshot = true;
        // Never publish raw claims: only the callable can verify player liveness.
        void publishServerProjection();
      },
      (error) => {
        if (!alive() || generation !== listenerGeneration) return;
        listenerFailed = true;
        listenerGeneration += 1;
        stopListener();
        fail(error);
      },
    );
    // A synchronous failure must not retain its newly returned listener.
    if (!alive() || generation !== listenerGeneration) stop();
    else stopListener = stop;
  };
  function recover(): void {
    if (!alive()) return;
    clearRetry();
    if (listenerFailed) attachListener();
    void publishServerProjection();
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') recover();
  };
  attachListener();
  const refreshTimer = setInterval(() => {
    if (retryTimer === undefined) recover();
  }, 15_000);
  window.addEventListener('online', recover);
  window.addEventListener('focus', recover);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    subscribed = false;
    listenerGeneration += 1;
    stopListener();
    clearRetry();
    clearInterval(refreshTimer);
    window.removeEventListener('online', recover);
    window.removeEventListener('focus', recover);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function subscribeConnectedPlayers(
  sessionId: string,
  onPlayers: (players: readonly Player[]) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  // A new group or role projection invalidates the previous roster before the
  // replacement listener has delivered its first server snapshot.
  onPlayers([]);
  const viewer = useSessionStore.getState();
  const facilitator = viewer.me?.role === 'gm';
  const fleetGroupId = viewer.me?.fleetGroupId;
  // A member cannot safely subscribe until the callable projection has
  // supplied its server-owned group pointer. Do not fall back to a fleetwide
  // query while that identity is still loading.
  if (!facilitator && (typeof fleetGroupId !== 'string' || fleetGroupId.length === 0)) {
    return () => { subscribed = false; };
  }
  const playersQuery = facilitator
    ? query(
      collection(db(), `sessions/${sessionId}/players`),
      where('connected', '==', true),
    )
    : query(
      collection(db(), `sessions/${sessionId}/players`),
      where('connected', '==', true),
      where('fleetGroupId', '==', fleetGroupId),
    );
  const unsubscribe = onSnapshot(
    playersQuery,
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      onPlayers(snapshot.docs.map((player) =>
        playerFrom(sessionId, player.id, player.data())));
    },
    () => {
      if (!subscribed) return;
      // Group changes, demotion, and session teardown can invalidate the
      // listener. Clear the prior projection before reporting the failure so
      // a stale callback cannot leave old-group data on screen.
      onPlayers([]);
      onError();
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

/** GM-only roster projection, including players whose connection ended after an adjudication. */
export function subscribeSessionPlayers(
  sessionId: string,
  onPlayers: (players: readonly Player[]) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const unsubscribe = onSnapshot(
    collection(db(), `sessions/${sessionId}/players`),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && hasServerSnapshot) return;
      if (!fromCache) hasServerSnapshot = true;
      onPlayers(snapshot.docs.map((player) => playerFrom(sessionId, player.id, player.data())));
    },
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

export function subscribeShipConfetti(
  sessionId: string,
  shipId: string,
  onPop: (sourceShipId: string, actorRoleName?: string, actorName?: string) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let initial = true;
  let subscribed = true;
  let hasServerSnapshot = false;
  let lastSignal: string | null = null;
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/shipConfetti/${shipId}`),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      const signal = snapshot.exists() ? iso(snapshot.get('createdAt')) : null;
      const sourceShipId = snapshot.exists() ? String(snapshot.get('shipId')) : shipId;
      const actorRoleName = snapshot.exists() ? String(snapshot.get('actorRoleName')) : '';
      const actorName = snapshot.exists() ? String(snapshot.get('actorName')) : '';
      if (initial) {
        initial = false;
        lastSignal = signal;
        if (signal && Date.now() - Date.parse(signal) < 5_000) {
          onPop(sourceShipId, actorRoleName, actorName);
        }
        return;
      }
      if (signal && signal !== lastSignal) onPop(sourceShipId, actorRoleName, actorName);
      lastSignal = signal;
    },
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

export function subscribeSessionEvents(
  sessionId: string,
  onEvents: (events: readonly SessionEvent[]) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const unsubscribe = onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/events`),
      orderBy('createdAt', 'desc'),
      limit(30),
    ),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      onEvents(snapshot.docs.flatMap<SessionEvent>((event) => {
        const data = event.data();
        const eventId = parseEntityId('event', event.id);
        const eventSessionId = parseEntityId('session', sessionId);
        if (!eventId || !eventSessionId) return [];
        if (data.type === 'fullscreen-alert') return [{
          id: eventId,
          sessionId: eventSessionId,
          type: 'fullscreen-alert' as const,
          sourceRoleName: data.sourceRoleName as string,
          message: data.message as string,
          createdAt: iso(data.createdAt),
        }];
        if (data.type === 'maintenance') {
          const maintenance = parseMaintenanceEvent(eventId, eventSessionId, data, iso(data.createdAt));
          return maintenance ? [maintenance] : [];
        }
        if (
          data.type === 'timer-pause' &&
          (data.action === 'paused' || data.action === 'resumed') &&
          (data.window === 'restricted' || data.window === 'open') &&
          typeof data.turn === 'number' && Number.isSafeInteger(data.turn) && data.turn >= 1
        ) return [{
          id: eventId,
          sessionId: eventSessionId,
          type: 'timer-pause' as const,
          ...(data.reason === 'empty-session' ? { reason: data.reason } : {}),
          action: data.action,
          turn: data.turn,
          window: data.window,
          actorName: typeof data.actorName === 'string' ? data.actorName : 'GM',
          createdAt: iso(data.createdAt),
        }];
        if (data.type === 'android-proof-disclosed') {
          const actorUid = parseEntityId('player', data.actorUid);
          if (!actorUid) return [];
          return [{
            id: eventId,
            sessionId: eventSessionId,
            type: 'android-proof-disclosed' as const,
            actorUid,
            createdAt: iso(data.createdAt),
          }];
        }
        if (
          data.type === 'crisis-state' && typeof data.crisisId === 'string' &&
          /^[A-Za-z0-9_-]+$/.test(data.crisisId) && data.crisisId.length <= 80 &&
          isCrisisStateName(data.state) && typeof data.title === 'string' && data.title.length > 0
        ) return [{
          id: eventId,
          sessionId: eventSessionId,
          type: 'crisis-state' as const,
          crisisId: data.crisisId,
          state: data.state,
          title: data.title,
          createdAt: iso(data.createdAt),
        }];
        if (data.type !== 'ship-confetti') return [];
        const shipId = parseEntityId('vessel', data.shipId);
        if (!shipId) return [];
        return [{
          id: eventId,
          sessionId: eventSessionId,
          type: 'ship-confetti' as const,
          shipId,
          shipName: data.shipName as string,
          actorName: data.actorName as string,
          actorRoleName: data.actorRoleName as string,
          createdAt: iso(data.createdAt),
        }];
      }));
    },
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}

/** Read only the server-published report, never the private crisis document. */
export function subscribeCrisisReport(
  sessionId: string,
  onReport: (report: CrisisReport | null) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  let subscribed = true;
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/crisisReports/current`),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!subscribed || snapshot.metadata?.fromCache === true) return;
      const raw = snapshot.exists() ? recordValue(snapshot.data()) : undefined;
      const revision = nonNegativeInteger(raw?.revision);
      if (!raw || raw.sessionId !== sessionId || typeof raw.crisisId !== 'string' ||
          !/^[A-Za-z0-9_-]{1,80}$/.test(raw.crisisId) || !isCrisisStateName(raw.state) || raw.state === 'draft' ||
          revision === undefined || typeof raw.title !== 'string' || !raw.title || raw.title.length > 160 ||
          typeof raw.body !== 'string' || !raw.body || raw.body.length > 4000) {
        onReport(null);
        return;
      }
      onReport({ sessionId, crisisId: raw.crisisId, state: raw.state, revision, title: raw.title, body: raw.body });
    },
    () => { if (subscribed) { onReport(null); onError(); } },
  );
  return () => { subscribed = false; unsubscribe(); };
}

/** Subscribe to the facilitator-only durable crisis projection. */
export function subscribeGmCrisisState(
  sessionId: string,
  onState: (state: CrisisStateProjection | null) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/crisisState/current`),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      onState(snapshot.exists() ? crisisStateProjection(snapshot.data(), sessionId) : null);
    },
    () => {
      if (!subscribed) return;
      onState(null);
      onError();
    },
  );
  return () => {
    subscribed = false;
    unsubscribe();
    onState(null);
  };
}

export function subscribeDamageDraws(
  sessionId: string,
  onDraws: (draws: readonly DamageDraw[]) => void,
  onError: () => void = () => undefined,
  suppliedAuthority?: SessionSnapshotAuthority,
): Unsubscribe {
  let subscribed = true;
  let hasServerSnapshot = false;
  const unsubscribe = onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/damageDraws`),
      orderBy('createdAt', 'desc'),
      limit(30),
    ),
    (snapshot) => {
      if (!subscribed) return;
      const fromCache = snapshot.metadata?.fromCache === true;
      if (fromCache && (
        hasServerSnapshot ||
        projectionSessionAuthority(sessionId, suppliedAuthority)?.hasServerSessionAuthority
      )) return;
      if (!fromCache) hasServerSnapshot = true;
      onDraws(snapshot.docs.flatMap<DamageDraw>((draw) => {
        const data = draw.data();
        const drawId = parseEntityId('event', draw.id);
        const drawSessionId = parseEntityId('session', sessionId);
        const drawShipId = parseEntityId('vessel', data.shipId);
        if (!drawId || !drawSessionId || !drawShipId) return [];
        if (data.type === 'ship-destroyed') {
          const podCapacity = typeof data.podCapacity === 'number' &&
            Number.isSafeInteger(data.podCapacity) && data.podCapacity > 0
            ? data.podCapacity : undefined;
          return [{
          id: drawId,
          sessionId: drawSessionId,
          type: 'ship-destroyed' as const,
          shipId: drawShipId,
          createdAt: iso(data.createdAt),
          ...(podCapacity === undefined ? {} : { podCapacity }),
          }];
        }
        if (data.type !== 'ship-damage') return [];
        return [{
          id: drawId,
          sessionId: drawSessionId,
          type: 'ship-damage' as const,
          shipId: drawShipId,
          card: data.card as string,
          systemId: data.systemId as string,
          systemName: data.systemName as string,
          recycled: data.recycled === true,
          createdAt: iso(data.createdAt),
        }];
      }));
    },
    () => { if (subscribed) onError(); },
  );
  return () => {
    subscribed = false;
    unsubscribe();
  };
}
