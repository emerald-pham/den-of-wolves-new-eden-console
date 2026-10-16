import { createHash } from 'node:crypto';
import {
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { shipForRole } from './crewAccess';
import {
  ROLE_OWNED_CRAFT_CATALOG,
  shuttleDockingsAreKnownAndUnique,
  shuttleHostIsAllowed,
} from './craftOwnership';
import { isPresenceStale } from './sessionLifecycle';
import { isResourceShipId, type ShipResourceInventory } from './resources';
import { ROLE_IDS } from './roleConfiguration';
import { parseShuttleControl } from './shuttleControl';
import { replacementRoleFor } from './replacementRoles';
import { serviceRechargeDamageState, serviceRechargeResourceState } from './serviceShuttleRecharge';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import { writeStandardActionAudit } from './actionAudit';
import { requireCandidateCraftAvailable, requireCandidateVesselsAvailable } from './candidateAvailability';
import { parseMacawRepairLedger, recordMacawSalvageUse } from './macawRepair';
import { turnPhaseDeadlinePassed, turnPhaseState } from './turnZero';
import {
  ENGINEERING_DISMANTLING_CRAFT_IDS,
  MACAW_CONSENTED_DISMANTLING_SCRAP_GAIN,
  MACAW_SCRAP_DISMANTLING_CRAFT_ID,
  PERMISSIONED_DISMANTLING_MATERIAL_GAIN,
  resolvePermissionedDismantling,
  type PermissionedDismantlingCraftId,
  type PermissionedDismantlingProposal,
} from './permissionedDismantling';

type Data = Record<string, unknown>;

/**
 * The factory accepts the Admin Firestore surface so the release owner can
 * wrap each returned handler in onCall from the Functions entrypoint later.
 * Clients supply only IDs and expected revisions; actor UIDs, permissions,
 * proposal/consent records, receipts, and target revisions are server-owned.
 *
 * Exact handler requests:
 * - proposePermissionedDismantling:
 *   { sessionId, proposalId, craftId, targetShipId, targetConsoleId,
 *     expectedTargetRevision, expectedControlRevision }
 * - consentToPermissionedDismantling:
 *   { sessionId, proposalId, consentId, expectedTargetRevision }
 * - declinePermissionedDismantling:
 *   { sessionId, proposalId }
 * - revokePermissionedDismantlingConsent:
 *   { sessionId, proposalId, consentId }
 * - applyPermissionedDismantling:
 *   { sessionId, requestId, proposalId, consentId, expectedTargetRevision }
 *
 * The matching reply interfaces below are the exact result contracts. A stale
 * proposal/apply returns current revisions without writing; a successful apply
 * returns the next target revision and materials balance. The release owner
 * should keep the four private subcollections server-write-only when wiring UI.
 */
export interface PermissionedDismantlingCallableRequest {
  readonly auth?: { readonly uid?: string } | null;
  readonly data?: unknown;
}

/** Minimal Firestore seam keeps the transaction behavior directly testable. */
export interface PermissionedDismantlingCallableDatabase {
  doc(path: string): unknown;
  runTransaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T>;
}

export interface PermissionedDismantlingCallableDependencies {
  readonly db: PermissionedDismantlingCallableDatabase;
  readonly serverTimestamp: () => unknown;
  readonly now: () => Date;
}

export interface PermissionedDismantlingProposalReply {
  readonly status: 'proposed' | 'replayed';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly craftId: string;
  readonly targetShipId: string;
  readonly targetConsoleId: string;
  readonly targetRevision: number;
  readonly controlRevision: number;
  readonly materialGain?: number;
  readonly scrapGain?: number;
}

export interface PermissionedDismantlingStaleProposalReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly expectedTargetRevision: number;
  readonly currentTargetRevision: number;
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
}

export interface PermissionedDismantlingConsentReply {
  readonly status: 'consented' | 'replayed';
  readonly consentStatus: 'granted' | 'revoked' | 'consumed';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly targetRevision: number;
}

export interface PermissionedDismantlingRevokeReply {
  readonly status: 'revoked' | 'replayed';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly consentId: string;
}

export interface PermissionedDismantlingDeclineReply {
  readonly status: 'declined' | 'replayed';
  readonly sessionId: string;
  readonly proposalId: string;
}

export interface PermissionedDismantlingApplyReply {
  readonly status: 'applied' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly targetShipId: string;
  readonly targetConsoleId: string;
  readonly targetRevision: number;
  readonly materialGain?: number;
  readonly materialsAfter?: number;
  readonly scrapGain?: number;
  readonly scrapAfter?: number;
}

export interface PermissionedDismantlingStaleApplyReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly expectedTargetRevision: number;
  readonly currentTargetRevision: number;
}

interface ProposalCommand {
  readonly sessionId: string;
  readonly proposalId: string;
  readonly craftId: PermissionedDismantlingCraftId;
  readonly targetShipId: string;
  readonly targetConsoleId: string;
  readonly expectedTargetRevision?: number;
  readonly expectedControlRevision: number;
}

interface ConsentCommand {
  readonly sessionId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly expectedTargetRevision: number;
}

interface RevokeCommand {
  readonly sessionId: string;
  readonly proposalId: string;
  readonly consentId: string;
}

interface DeclineCommand {
  readonly sessionId: string;
  readonly proposalId: string;
}

interface ApplyCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly expectedTargetRevision: number;
}

interface StoredProposal extends PermissionedDismantlingProposal {
  readonly type: 'permissioned-dismantling-proposal';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly proposerUid: string;
  readonly controlRevision: number;
  readonly targetFingerprint: string;
  readonly materialGain?: number;
  readonly scrapGain?: number;
  readonly status: 'pending' | 'declined' | 'applied';
  readonly createdAt: unknown;
  readonly declinedAt?: unknown;
  readonly declinedByUid?: string;
  readonly appliedAt?: unknown;
  readonly appliedByUid?: string;
  readonly consumedConsentId?: string;
}

interface StoredConsent extends PermissionedDismantlingProposal {
  readonly type: 'permissioned-dismantling-consent';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly controlRevision: number;
  readonly materialGain?: number;
  readonly scrapGain?: number;
  readonly actorUid: string;
  readonly status: 'granted' | 'revoked' | 'consumed';
  readonly createdAt: unknown;
  readonly revokedAt?: unknown;
  readonly consumedAt?: unknown;
  readonly consumedByUid?: string;
}

interface StoredTargetState {
  readonly type: 'permissioned-dismantling-target-state';
  readonly sessionId: string;
  readonly targetShipId: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly observedSessionUpdatedAt: unknown;
  readonly updatedAt: unknown;
}

/**
 * This callable's private revision is paired with a fingerprint of the target
 * damage and resource ledgers and the session's updatedAt version. The
 * fingerprint catches changed target values; updatedAt also catches a target
 * change that is later reverted before apply. Session mutations must continue
 * to advance updatedAt, as the existing server callables do.
 */
interface CurrentTargetState {
  readonly damage: ShipDamageState;
  readonly resources: ShipResourceInventory;
  readonly revision: number;
  readonly fingerprint: string;
  readonly observedSessionUpdatedAt: unknown;
  readonly stateExists: boolean;
  readonly stateNeedsRefresh: boolean;
}

interface StoredApplyReceipt {
  readonly type: 'permissioned-dismantling-receipt';
  readonly sessionId: string;
  readonly requestId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly actorUid: string;
  readonly requestFingerprint: string;
  readonly result: PermissionedDismantlingApplyReply;
  readonly createdAt: unknown;
}

type PermissionedDismantlingInboxStatus = 'pending' | 'consented' | 'declined' | 'revoked' | 'applied';

interface StoredPermissionedDismantlingInbox {
  readonly type: 'permissioned-dismantling-inbox';
  readonly sessionId: string;
  readonly targetShipId: string;
  readonly proposalId: string;
  readonly proposerUid: string;
  readonly craftId: string;
  readonly targetConsoleId: string;
  readonly targetRevision: number;
  readonly materialGain?: number;
  readonly scrapGain?: number;
  readonly status: PermissionedDismantlingInboxStatus;
  readonly consentId: string | null;
  readonly materialsAfter: number | null;
  readonly scrapAfter?: number | null;
  readonly updatedAt: unknown;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PROPOSAL_CORE_KEYS = [
  'type', 'sessionId', 'proposalId', 'proposerUid', 'craftId', 'targetShipId',
  'targetConsoleId', 'targetRevision', 'controlRevision',
  'targetFingerprint', 'status', 'createdAt',
] as const;
const CONSENT_CORE_KEYS = [
  'type', 'sessionId', 'proposalId', 'consentId', 'actorUid', 'craftId',
  'targetShipId', 'targetConsoleId', 'targetRevision',
  'controlRevision', 'status', 'createdAt',
] as const;
const TARGET_STATE_KEYS = [
  'type', 'sessionId', 'targetShipId', 'revision', 'fingerprint',
  'observedSessionUpdatedAt', 'updatedAt',
] as const;
const APPLY_REPLY_CORE_KEYS = [
  'status', 'sessionId', 'requestId', 'proposalId', 'consentId', 'targetShipId',
  'targetConsoleId', 'targetRevision',
] as const;
const APPLY_RECEIPT_KEYS = [
  'type', 'sessionId', 'requestId', 'proposalId', 'consentId', 'actorUid',
  'requestFingerprint', 'result', 'createdAt',
] as const;
const DISMANTLING_INBOX_CORE_KEYS = [
  'type', 'sessionId', 'targetShipId', 'proposalId', 'proposerUid', 'craftId', 'targetConsoleId',
  'targetRevision', 'status', 'consentId', 'materialsAfter', 'updatedAt',
] as const;

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Data, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isPermissionedDismantlingCraftId(value: string): value is PermissionedDismantlingCraftId {
  return value === MACAW_SCRAP_DISMANTLING_CRAFT_ID ||
    (ENGINEERING_DISMANTLING_CRAFT_IDS as readonly string[]).includes(value);
}

function isMacawScrapProposal(value: Readonly<{ craftId: string }>): boolean {
  return value.craftId === MACAW_SCRAP_DISMANTLING_CRAFT_ID;
}

function rewardFieldKeys(craftId: string): readonly string[] {
  return isMacawScrapProposal({ craftId }) ? ['scrapGain'] : ['materialGain'];
}

function rewardFieldIsValid(value: Data, craftId: string): boolean {
  return isMacawScrapProposal({ craftId })
    ? value.scrapGain === MACAW_CONSENTED_DISMANTLING_SCRAP_GAIN && !Object.hasOwn(value, 'materialGain')
    : value.materialGain === PERMISSIONED_DISMANTLING_MATERIAL_GAIN && !Object.hasOwn(value, 'scrapGain');
}

function storedProposalKeys(craftId: string, status: unknown): readonly string[] {
  const base = [...PROPOSAL_CORE_KEYS, ...rewardFieldKeys(craftId)];
  return status === 'pending' ? base : status === 'applied'
    ? [...base, 'appliedAt', 'appliedByUid', 'consumedConsentId']
    : status === 'declined' ? [...base, 'declinedAt', 'declinedByUid'] : [];
}

function storedConsentKeys(craftId: string, status: unknown): readonly string[] {
  const base = [...CONSENT_CORE_KEYS, ...rewardFieldKeys(craftId)];
  const extra = status === 'granted' ? [] : status === 'revoked' ? ['revokedAt']
    : status === 'consumed' ? ['consumedAt', 'consumedByUid'] : null;
  return extra === null ? [] : [...base, ...extra];
}

function applyReplyKeys(craftId: string): readonly string[] {
  return [...APPLY_REPLY_CORE_KEYS, ...rewardFieldKeys(craftId),
    ...(isMacawScrapProposal({ craftId }) ? ['scrapAfter'] : ['materialsAfter'])];
}

function inboxKeys(craftId: string): readonly string[] {
  return [...DISMANTLING_INBOX_CORE_KEYS, ...rewardFieldKeys(craftId),
    ...(isMacawScrapProposal({ craftId }) ? ['scrapAfter'] : [])];
}

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function denied(message: string): never {
  throw new HttpsError('permission-denied', message);
}

function precondition(message: string): never {
  throw new HttpsError('failed-precondition', message);
}

function requireUid(auth: PermissionedDismantlingCallableRequest['auth']): string {
  if (!auth || typeof auth.uid !== 'string' || auth.uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Sign in before requesting permissioned dismantling.');
  }
  return auth.uid;
}

function requireRequest(value: unknown, keys: readonly string[]): Data {
  if (!isRecord(value) || !exactKeys(value, keys)) {
    return invalid('The permissioned dismantling request is malformed.');
  }
  return value;
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value) || value.trim() !== value) {
    return invalid(label + ' is invalid.');
  }
  return value;
}

function requireRevision(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return invalid(label + ' must be a safe, non-negative revision.');
  }
  return value as number;
}

function requireProposalCommand(value: unknown): ProposalCommand {
  const requiredKeys = [
    'sessionId', 'proposalId', 'craftId', 'targetShipId', 'targetConsoleId',
    'expectedControlRevision',
  ];
  if (!isRecord(value) || (!exactKeys(value, [...requiredKeys, 'expectedTargetRevision']) &&
      !exactKeys(value, requiredKeys))) {
    return invalid('The permissioned dismantling request is malformed.');
  }
  const data = value;
  const sessionId = requireId(data.sessionId, 'sessionId');
  const proposalId = requireId(data.proposalId, 'proposalId');
  const craftId = requireId(data.craftId, 'craftId');
  const targetShipId = requireId(data.targetShipId, 'targetShipId');
  const targetConsoleId = requireId(data.targetConsoleId, 'targetConsoleId');
  if (!isPermissionedDismantlingCraftId(craftId)) {
    return invalid('That craft has no printed permissioned-dismantling action.');
  }
  if (!isResourceShipId(targetShipId) || !Object.hasOwn(SHIP_DAMAGE_DECKS, targetShipId)) {
    return invalid('The target ship is invalid for permissioned dismantling.');
  }
  return {
    sessionId,
    proposalId,
    craftId,
    targetShipId,
    targetConsoleId,
    ...(Object.hasOwn(data, 'expectedTargetRevision') ? {
      expectedTargetRevision: requireRevision(data.expectedTargetRevision, 'expectedTargetRevision'),
    } : {}),
    expectedControlRevision: requireRevision(data.expectedControlRevision, 'expectedControlRevision'),
  };
}

function requireConsentCommand(value: unknown): ConsentCommand {
  const data = requireRequest(value, [
    'sessionId', 'proposalId', 'consentId', 'expectedTargetRevision',
  ]);
  return {
    sessionId: requireId(data.sessionId, 'sessionId'),
    proposalId: requireId(data.proposalId, 'proposalId'),
    consentId: requireId(data.consentId, 'consentId'),
    expectedTargetRevision: requireRevision(data.expectedTargetRevision, 'expectedTargetRevision'),
  };
}

function requireRevokeCommand(value: unknown): RevokeCommand {
  const data = requireRequest(value, ['sessionId', 'proposalId', 'consentId']);
  return {
    sessionId: requireId(data.sessionId, 'sessionId'),
    proposalId: requireId(data.proposalId, 'proposalId'),
    consentId: requireId(data.consentId, 'consentId'),
  };
}

function requireDeclineCommand(value: unknown): DeclineCommand {
  const data = requireRequest(value, ['sessionId', 'proposalId']);
  return {
    sessionId: requireId(data.sessionId, 'sessionId'),
    proposalId: requireId(data.proposalId, 'proposalId'),
  };
}

function requireApplyCommand(value: unknown): ApplyCommand {
  const data = requireRequest(value, [
    'sessionId', 'requestId', 'proposalId', 'consentId', 'expectedTargetRevision',
  ]);
  return {
    sessionId: requireId(data.sessionId, 'sessionId'),
    requestId: requireId(data.requestId, 'requestId'),
    proposalId: requireId(data.proposalId, 'proposalId'),
    consentId: requireId(data.consentId, 'consentId'),
    expectedTargetRevision: requireRevision(data.expectedTargetRevision, 'expectedTargetRevision'),
  };
}

function activePlayer(player: DocumentSnapshot, now: Date): boolean {
  if (!player.exists || player.get('role') !== 'player' || player.get('connected') !== true ||
      player.get('kickedAt') !== undefined && player.get('kickedAt') !== null ||
      player.get('escapeState') !== undefined && player.get('escapeState') !== null) return false;
  const lastSeenAt = player.get('lastSeenAt');
  if (lastSeenAt === undefined) return true;
  return lastSeenAt instanceof Timestamp && !isPresenceStale(lastSeenAt.toDate(), now);
}

function currentTargetShipId(
  player: DocumentSnapshot,
  activeRoleIds: readonly string[],
): string | undefined {
  if (player.get('replacementStatus') != null) return undefined;
  const replacementRoleId = player.get('replacementRoleId');
  if (replacementRoleId !== undefined && replacementRoleId !== null) {
    if (typeof replacementRoleId !== 'string' || replacementRoleId.length === 0) {
      return undefined;
    }
    return replacementRoleFor(replacementRoleId)?.vesselId;
  }
  const assignedRoleId = player.get('assignedRoleId');
  if (typeof assignedRoleId !== 'string' || !activeRoleIds.includes(assignedRoleId)) return undefined;
  return shipForRole(assignedRoleId);
}

function currentActiveRoleIds(session: DocumentSnapshot): readonly string[] | null {
  const value = session.get('activeRoleIds');
  if (!Array.isArray(value) || value.some((roleId) =>
    typeof roleId !== 'string' || !ROLE_IDS.includes(roleId as typeof ROLE_IDS[number])) ||
      new Set(value).size !== value.length) return null;
  return value as string[];
}

function currentTargetPlayer(
  player: DocumentSnapshot,
  targetShipId: string,
  activeRoleIds: readonly string[],
  now: Date,
): boolean {
  if (!activePlayer(player, now)) return false;
  return currentTargetShipId(player, activeRoleIds) === targetShipId;
}

function requireActiveSession(session: DocumentSnapshot): void {
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  if (session.get('phase') !== 'active') {
    precondition('Permissioned dismantling is available only during active gameplay.');
  }
}

function requireActiveRoleList(session: DocumentSnapshot): readonly string[] {
  const roleIds = currentActiveRoleIds(session);
  if (!roleIds) precondition('The authoritative active role list is unavailable.');
  return roleIds;
}

function requireActiveVesselIds(session: DocumentSnapshot, targetShipId: string): readonly string[] {
  const value = session.get('activeVesselIds');
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((shipId) => typeof shipId !== 'string' || !isResourceShipId(shipId)) ||
      new Set(value).size !== value.length || !value.includes(targetShipId)) {
    precondition('The target ship is not in the authoritative active vessel set.');
  }
  return value as string[];
}

function currentCraftControlRevision(input: Readonly<{
  session: DocumentSnapshot;
  actor: DocumentSnapshot;
  actorUid: string;
  craftId: string;
  targetShipId: string;
  activeRoleIds: readonly string[];
  now: Date;
}>): number {
  const { session, actor, actorUid, craftId, targetShipId, activeRoleIds, now } = input;
  if (!activePlayer(actor, now)) denied('A connected active player is required to operate this engineering craft.');
  const craft = ROLE_OWNED_CRAFT_CATALOG.find((entry) =>
    entry.id === craftId && entry.kind === 'shuttle');
  if (!craft || !isPermissionedDismantlingCraftId(craftId) ||
      !activeRoleIds.includes(craft.ownerRoleId)) {
    denied('This permissioned-dismantling craft is not enabled for the current session.');
  }
  const controls = parseShuttleControl(session.get('shuttleControl'));
  const control = controls?.[craftId];
  if (!control || control.shuttleId !== craftId || control.ownerRoleId !== craft.ownerRoleId) {
    precondition('The authoritative engineering-craft control state is unavailable.');
  }
  if (control.holderUid !== actorUid) {
    denied('Only the current holder of this craft may propose or apply dismantling.');
  }
  if (!shuttleHostIsAllowed(craftId, targetShipId)) {
    precondition('This engineering craft cannot operate at the requested target ship.');
  }
  const activeVesselIds = requireActiveVesselIds(session, targetShipId);
  const rawDockings = session.get('shuttleDockings');
  if (!Array.isArray(rawDockings) ||
      !shuttleDockingsAreKnownAndUnique(rawDockings as { shuttleId: string; shipId: string }[])) {
    precondition('The authoritative shuttle docking list is unavailable.');
  }
  const dockings = rawDockings as Data[];
  const craftDockings = dockings.filter((docking) => docking.shuttleId === craftId);
  const docking = craftDockings[0];
  if (craftDockings.length !== 1 || docking?.shipId !== targetShipId ||
      !activeVesselIds.includes(targetShipId) ||
      typeof docking.dockedAt !== 'string' || docking.dockedAt.trim().length === 0 ||
      docking.inTransit === true || docking.transit === true ||
      docking.status === 'in-transit' || docking.state === 'in-transit' ||
      docking.dockingState === 'in-transit') {
    precondition('The craft must remain docked at the exact target ship.');
  }
  return control.revision;
}

function targetFingerprint(damage: ShipDamageState, resources: ShipResourceInventory): string {
  const canonical = {
    damagedSystemIds: [...damage.damagedSystemIds],
    destroyed: damage.destroyed,
    resources: {
      ore: resources.ore,
      fuel: resources.fuel,
      food: resources.food,
      water: resources.water,
      materials: resources.materials,
      securityTeams: resources.securityTeams,
      ...(resources.scrap === undefined ? {} : { scrap: resources.scrap }),
    },
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function isSessionVersion(value: unknown): boolean {
  return typeof value === 'string' || value instanceof Timestamp || value instanceof Date;
}

function sameSessionVersion(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' && typeof right === 'string') return left === right;
  if (left instanceof Timestamp && right instanceof Timestamp) return left.isEqual(right);
  return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
}

function parseStoredTargetState(
  value: unknown,
  sessionId: string,
  targetShipId: string,
): StoredTargetState {
  if (!isRecord(value) || !exactKeys(value, TARGET_STATE_KEYS) ||
      value.type !== 'permissioned-dismantling-target-state' ||
      value.sessionId !== sessionId || value.targetShipId !== targetShipId ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !isHash(value.fingerprint) || !isSessionVersion(value.observedSessionUpdatedAt)) {
    precondition('The private permissioned-dismantling target revision is malformed.');
  }
  return value as unknown as StoredTargetState;
}

function readCurrentTargetState(
  session: DocumentSnapshot,
  stateSnapshot: DocumentSnapshot,
  sessionId: string,
  targetShipId: string,
): CurrentTargetState {
  const damage = serviceRechargeDamageState(session.get('shipDamage'), targetShipId);
  const resources = serviceRechargeResourceState(session.get('shipResources'), targetShipId);
  if (!damage || !resources) {
    precondition('The target damage or resource state is unavailable or malformed.');
  }
  const observedSessionUpdatedAt = session.get('updatedAt');
  if (!isSessionVersion(observedSessionUpdatedAt)) {
    precondition('The active session revision is unavailable or malformed.');
  }
  const fingerprint = targetFingerprint(damage, resources);
  if (!stateSnapshot.exists) {
    return {
      damage, resources, fingerprint, revision: 0, observedSessionUpdatedAt,
      stateExists: false, stateNeedsRefresh: true,
    };
  }
  const stored = parseStoredTargetState(stateSnapshot.data(), sessionId, targetShipId);
  const changed = stored.fingerprint !== fingerprint ||
    !sameSessionVersion(stored.observedSessionUpdatedAt, observedSessionUpdatedAt);
  if (changed && stored.revision === Number.MAX_SAFE_INTEGER) {
    precondition('The target ship revision cannot advance safely.');
  }
  return {
    damage,
    resources,
    fingerprint,
    observedSessionUpdatedAt,
    revision: changed ? stored.revision + 1 : stored.revision,
    stateExists: true,
    stateNeedsRefresh: changed,
  };
}

function syncTargetState(
  tx: Transaction,
  stateRef: DocumentReference,
  current: CurrentTargetState,
  sessionId: string,
  targetShipId: string,
  serverTimestamp: () => unknown,
): void {
  if (!current.stateNeedsRefresh) return;
  const value: StoredTargetState = {
    type: 'permissioned-dismantling-target-state',
    sessionId,
    targetShipId,
    revision: current.revision,
    fingerprint: current.fingerprint,
    observedSessionUpdatedAt: current.observedSessionUpdatedAt,
    updatedAt: serverTimestamp(),
  };
  if (current.stateExists) tx.set(stateRef, value);
  else tx.create(stateRef, value);
}

function proposalRecord(value: Data): StoredProposal {
  const status = value.status;
  const keys = typeof value.craftId === 'string' ? storedProposalKeys(value.craftId, status) : [];
  if (keys.length === 0 || !exactKeys(value, keys) ||
      value.type !== 'permissioned-dismantling-proposal' ||
      typeof value.sessionId !== 'string' || !ID_PATTERN.test(value.sessionId) ||
      typeof value.proposalId !== 'string' || !ID_PATTERN.test(value.proposalId) ||
      typeof value.proposerUid !== 'string' || value.proposerUid.length === 0 ||
      typeof value.craftId !== 'string' || !isPermissionedDismantlingCraftId(value.craftId) ||
      typeof value.targetShipId !== 'string' || !isResourceShipId(value.targetShipId) ||
      typeof value.targetConsoleId !== 'string' || !ID_PATTERN.test(value.targetConsoleId) ||
      !Number.isSafeInteger(value.targetRevision) || (value.targetRevision as number) < 0 ||
      !rewardFieldIsValid(value, value.craftId) ||
      !Number.isSafeInteger(value.controlRevision) || (value.controlRevision as number) < 0 ||
      !isHash(value.targetFingerprint) ||
      status !== 'pending' && status !== 'declined' && status !== 'applied' ||
      status === 'declined' && (typeof value.declinedByUid !== 'string' ||
        value.declinedByUid.length === 0) ||
      status === 'applied' && (typeof value.appliedByUid !== 'string' ||
        value.appliedByUid.length === 0 || typeof value.consumedConsentId !== 'string' ||
        !ID_PATTERN.test(value.consumedConsentId))) {
    precondition('The stored permissioned-dismantling proposal is malformed.');
  }
  return value as unknown as StoredProposal;
}

function consentRecord(value: Data): StoredConsent {
  const status = value.status;
  if (typeof value.craftId !== 'string' ||
      !isPermissionedDismantlingCraftId(value.craftId) ||
      !exactKeys(value, storedConsentKeys(value.craftId, status)) ||
      value.type !== 'permissioned-dismantling-consent' ||
      typeof value.sessionId !== 'string' || !ID_PATTERN.test(value.sessionId) ||
      typeof value.proposalId !== 'string' || !ID_PATTERN.test(value.proposalId) ||
      typeof value.consentId !== 'string' || !ID_PATTERN.test(value.consentId) ||
      typeof value.actorUid !== 'string' || value.actorUid.length === 0 ||
      typeof value.craftId !== 'string' || !isPermissionedDismantlingCraftId(value.craftId) ||
      typeof value.targetShipId !== 'string' || !isResourceShipId(value.targetShipId) ||
      typeof value.targetConsoleId !== 'string' || !ID_PATTERN.test(value.targetConsoleId) ||
      !Number.isSafeInteger(value.targetRevision) || (value.targetRevision as number) < 0 ||
      !rewardFieldIsValid(value, value.craftId) ||
      !Number.isSafeInteger(value.controlRevision) || (value.controlRevision as number) < 0 ||
      status !== 'granted' && status !== 'revoked' && status !== 'consumed' ||
      status === 'consumed' && (typeof value.consumedByUid !== 'string' ||
        value.consumedByUid.length === 0)) {
    precondition('The stored permissioned-dismantling consent is malformed.');
  }
  return value as unknown as StoredConsent;
}

function proposalCore(proposal: StoredProposal): PermissionedDismantlingProposal {
  return {
    craftId: proposal.craftId,
    targetShipId: proposal.targetShipId,
    targetConsoleId: proposal.targetConsoleId,
    targetRevision: proposal.targetRevision,
    ...(isMacawScrapProposal(proposal)
      ? { scrapGain: proposal.scrapGain }
      : { materialGain: proposal.materialGain }),
  };
}

function consentMatchesProposal(consent: StoredConsent, proposal: StoredProposal): boolean {
  return consent.sessionId === proposal.sessionId &&
    consent.proposalId === proposal.proposalId &&
    consent.craftId === proposal.craftId &&
    consent.targetShipId === proposal.targetShipId &&
    consent.targetConsoleId === proposal.targetConsoleId &&
    consent.targetRevision === proposal.targetRevision &&
    (isMacawScrapProposal(proposal)
      ? consent.scrapGain === proposal.scrapGain
      : consent.materialGain === proposal.materialGain) &&
    consent.controlRevision === proposal.controlRevision;
}

function targetConsoleIsEligible(
  craftId: string,
  targetShipId: string,
  targetConsoleId: string,
  damage: ShipDamageState,
  resources: ShipResourceInventory,
  macawScrap?: number,
): void {
  const deck = SHIP_DAMAGE_DECKS[targetShipId];
  if (!deck || damage.destroyed) {
    precondition('A destroyed or unavailable target ship cannot be dismantled.');
  }
  if (!deck.some(({ systemId }) => systemId === targetConsoleId) ||
      damage.damagedSystemIds.includes(targetConsoleId)) {
    precondition('Choose one eligible, undamaged console on the target ship.');
  }
  if (isMacawScrapProposal({ craftId })) {
    if (!Number.isSafeInteger(macawScrap) || (macawScrap as number) < 0 ||
        (macawScrap as number) > Number.MAX_SAFE_INTEGER - MACAW_CONSENTED_DISMANTLING_SCRAP_GAIN) {
      precondition('The Capybara Scrap ledger is unavailable or cannot safely receive the printed Scrap gain.');
    }
  } else if (resources.materials > Number.MAX_SAFE_INTEGER - PERMISSIONED_DISMANTLING_MATERIAL_GAIN) {
    precondition('The target ship cannot safely receive the printed materials gain.');
  }
}

function currentCapybaraScrap(session: DocumentSnapshot): number {
  const resources = serviceRechargeResourceState(session.get('shipResources'), 'capybara');
  if (!resources || !Number.isSafeInteger(resources.scrap) || (resources.scrap as number) < 0) {
    precondition('The authoritative Capybara Scrap ledger is unavailable or malformed.');
  }
  return resources.scrap as number;
}

function requireMacawSourceAvailable(session: DocumentSnapshot, actor: DocumentSnapshot): void {
  if (actor.get('candidateDisposition') != null) {
    precondition('The Capybara Captain has reached a candidate disposition and cannot start a new Macaw action.');
  }
  requireActiveVesselIds(session, 'capybara');
  requireCandidateVesselsAvailable(session, ['capybara']);
  currentCapybaraScrap(session);
}

function requireMacawCoordinationCycle(session: DocumentSnapshot, timestamp: Date): number {
  const cycle = session.get('currentTurn');
  const phase = turnPhaseState(session.get('turnPhase'));
  if (!Number.isSafeInteger(cycle) || (cycle as number) < 1 ||
      !phase || phase.turn !== cycle || phase.airspace.state !== 'lifted' ||
      phase.timerPause !== undefined || turnPhaseDeadlinePassed(phase, 'open', timestamp.getTime())) {
    precondition('Macaw salvage is available only during the live Coordination cycle.');
  }
  return cycle as number;
}

function exactProposalRequestMatches(
  proposal: StoredProposal,
  command: ProposalCommand,
  actorUid: string,
): boolean {
  return proposal.sessionId === command.sessionId &&
    proposal.proposalId === command.proposalId &&
    proposal.proposerUid === actorUid &&
    proposal.craftId === command.craftId &&
    proposal.targetShipId === command.targetShipId &&
    proposal.targetConsoleId === command.targetConsoleId &&
    (command.expectedTargetRevision === undefined ||
      proposal.targetRevision === command.expectedTargetRevision) &&
    proposal.controlRevision === command.expectedControlRevision &&
    (isMacawScrapProposal(proposal)
      ? proposal.scrapGain === MACAW_CONSENTED_DISMANTLING_SCRAP_GAIN
      : proposal.materialGain === PERMISSIONED_DISMANTLING_MATERIAL_GAIN);
}

function applicationRequestFingerprint(
  actorUid: string,
  command: ApplyCommand,
  proposal: StoredProposal,
): string {
  return createHash('sha256').update(JSON.stringify({
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid,
    proposalId: command.proposalId,
    consentId: command.consentId,
    expectedTargetRevision: command.expectedTargetRevision,
    craftId: proposal.craftId,
    targetShipId: proposal.targetShipId,
    targetConsoleId: proposal.targetConsoleId,
    controlRevision: proposal.controlRevision,
    ...(isMacawScrapProposal(proposal)
      ? { scrapGain: proposal.scrapGain }
      : { materialGain: proposal.materialGain }),
  })).digest('hex');
}

function applyReply(value: unknown): PermissionedDismantlingApplyReply {
  const scrapReply = isRecord(value) && Object.hasOwn(value, 'scrapGain');
  const craftId = scrapReply ? MACAW_SCRAP_DISMANTLING_CRAFT_ID : 'philia';
  const afterKey = scrapReply ? 'scrapAfter' : 'materialsAfter';
  if (!isRecord(value) || !exactKeys(value, applyReplyKeys(craftId)) ||
      (value.status !== 'applied' && value.status !== 'replayed') ||
      typeof value.sessionId !== 'string' || !ID_PATTERN.test(value.sessionId) ||
      typeof value.requestId !== 'string' || !ID_PATTERN.test(value.requestId) ||
      typeof value.proposalId !== 'string' || !ID_PATTERN.test(value.proposalId) ||
      typeof value.consentId !== 'string' || !ID_PATTERN.test(value.consentId) ||
      typeof value.targetShipId !== 'string' || !isResourceShipId(value.targetShipId) ||
      typeof value.targetConsoleId !== 'string' || !ID_PATTERN.test(value.targetConsoleId) ||
      !Number.isSafeInteger(value.targetRevision) || (value.targetRevision as number) < 1 ||
      !rewardFieldIsValid(value, craftId) ||
      !Number.isSafeInteger(value[afterKey]) || (value[afterKey] as number) < 0) {
    precondition('The stored permissioned-dismantling result is malformed.');
  }
  return value as unknown as PermissionedDismantlingApplyReply;
}

function parseApplyReceipt(value: unknown): StoredApplyReceipt {
  if (!isRecord(value) || !exactKeys(value, APPLY_RECEIPT_KEYS) ||
      value.type !== 'permissioned-dismantling-receipt' ||
      typeof value.sessionId !== 'string' || !ID_PATTERN.test(value.sessionId) ||
      typeof value.requestId !== 'string' || !ID_PATTERN.test(value.requestId) ||
      typeof value.proposalId !== 'string' || !ID_PATTERN.test(value.proposalId) ||
      typeof value.consentId !== 'string' || !ID_PATTERN.test(value.consentId) ||
      typeof value.actorUid !== 'string' || value.actorUid.length === 0 ||
      !isHash(value.requestFingerprint)) {
    precondition('The permissioned-dismantling replay receipt is malformed.');
  }
  return {
    ...(value as unknown as Omit<StoredApplyReceipt, 'result'>),
    result: applyReply(value.result),
  };
}

function parseDismantlingInbox(
  value: unknown,
  sessionId: string,
  targetShipId: string,
): StoredPermissionedDismantlingInbox {
  if (!isRecord(value) || typeof value.craftId !== 'string' ||
      !isPermissionedDismantlingCraftId(value.craftId) || !exactKeys(value, inboxKeys(value.craftId)) ||
      value.type !== 'permissioned-dismantling-inbox' || value.sessionId !== sessionId ||
      value.targetShipId !== targetShipId || typeof value.proposalId !== 'string' ||
      !ID_PATTERN.test(value.proposalId) ||
      typeof value.proposerUid !== 'string' || value.proposerUid.length === 0 ||
      value.proposerUid.length > 128 ||
      typeof value.targetConsoleId !== 'string' || !ID_PATTERN.test(value.targetConsoleId) ||
      !Number.isSafeInteger(value.targetRevision) || (value.targetRevision as number) < 0 ||
      !rewardFieldIsValid(value, value.craftId) ||
      !['pending', 'consented', 'declined', 'revoked', 'applied'].includes(String(value.status)) ||
      (value.consentId !== null &&
        (typeof value.consentId !== 'string' || !ID_PATTERN.test(value.consentId))) ||
      (value.materialsAfter !== null &&
        (!Number.isSafeInteger(value.materialsAfter) || (value.materialsAfter as number) < 0)) ||
      (isMacawScrapProposal({ craftId: value.craftId }) &&
        (value.materialsAfter !== null || (value.scrapAfter !== null &&
          (!Number.isSafeInteger(value.scrapAfter) || (value.scrapAfter as number) < 0))))) {
    precondition('The permissioned-dismantling target inbox is malformed.');
  }
  return value as unknown as StoredPermissionedDismantlingInbox;
}

function dismantlingInboxValue(input: Readonly<{
  sessionId: string;
  targetShipId: string;
  proposalId: string;
  proposerUid: string;
  craftId: string;
  targetConsoleId: string;
  targetRevision: number;
  status: PermissionedDismantlingInboxStatus;
  consentId?: string | null;
  materialsAfter?: number | null;
  scrapAfter?: number | null;
  updatedAt: unknown;
}>): StoredPermissionedDismantlingInbox {
  const scrap = isMacawScrapProposal(input);
  return {
    type: 'permissioned-dismantling-inbox',
    sessionId: input.sessionId,
    targetShipId: input.targetShipId,
    proposalId: input.proposalId,
    proposerUid: input.proposerUid,
    craftId: input.craftId,
    targetConsoleId: input.targetConsoleId,
    targetRevision: input.targetRevision,
    ...(scrap
      ? { scrapGain: MACAW_CONSENTED_DISMANTLING_SCRAP_GAIN }
      : { materialGain: PERMISSIONED_DISMANTLING_MATERIAL_GAIN }),
    status: input.status,
    consentId: input.consentId ?? null,
    materialsAfter: scrap ? null : input.materialsAfter ?? null,
    ...(scrap ? { scrapAfter: input.scrapAfter ?? null } : {}),
    updatedAt: input.updatedAt,
  };
}

function proposalPath(sessionId: string, proposalId: string): string {
  return 'sessions/' + sessionId + '/permissionedDismantlingProposals/' + proposalId;
}

function consentPath(sessionId: string, consentId: string): string {
  return 'sessions/' + sessionId + '/permissionedDismantlingConsents/' + consentId;
}

function targetStatePath(sessionId: string, targetShipId: string): string {
  return 'sessions/' + sessionId + '/permissionedDismantlingTargetStates/' + targetShipId;
}

function receiptPath(sessionId: string, requestId: string): string {
  return 'sessions/' + sessionId + '/permissionedDismantlingReceipts/' + requestId;
}

function dismantlingInboxPath(sessionId: string, targetShipId: string): string {
  return 'sessions/' + sessionId + '/permissionedDismantlingInboxes/' + targetShipId;
}

function doc(db: PermissionedDismantlingCallableDatabase, path: string): DocumentReference {
  return db.doc(path) as DocumentReference;
}

/**
 * Only these Admin transactions mutate the private proposal, consent, revision,
 * and receipt collections. The integration must leave client writes to those
 * records denied in Firestore rules.
 */
export function createPermissionedDismantlingCallables(
  dependencies: PermissionedDismantlingCallableDependencies,
) {
  const { db, serverTimestamp, now } = dependencies;

  const proposePermissionedDismantling = async (
    request: PermissionedDismantlingCallableRequest,
  ): Promise<PermissionedDismantlingProposalReply | PermissionedDismantlingStaleProposalReply> => {
    const actorUid = requireUid(request.auth);
    const command = requireProposalCommand(request.data);
    const sessionRef = doc(db, 'sessions/' + command.sessionId);
    const actorRef = doc(db, 'sessions/' + command.sessionId + '/players/' + actorUid);
    const proposalRef = doc(db, proposalPath(command.sessionId, command.proposalId));
    const targetStateRef = doc(db, targetStatePath(command.sessionId, command.targetShipId));
    const inboxRef = doc(db, dismantlingInboxPath(command.sessionId, command.targetShipId));
    return db.runTransaction(async (rawTx) => {
      const tx = rawTx as Transaction;
      const [session, actor, proposalSnapshot, targetStateSnapshot, inboxSnapshot] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(proposalRef), tx.get(targetStateRef), tx.get(inboxRef),
      ]);
      requireActiveSession(session);
      const timestamp = now();
      if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
        precondition('The server clock is unavailable.');
      }
      const activeRoleIds = requireActiveRoleList(session);
      const controlRevision = currentCraftControlRevision({
        session, actor, actorUid, craftId: command.craftId,
        targetShipId: command.targetShipId, activeRoleIds, now: timestamp,
      });
      const target = readCurrentTargetState(
        session, targetStateSnapshot, command.sessionId, command.targetShipId,
      );
      if (controlRevision !== command.expectedControlRevision ||
          (command.expectedTargetRevision !== undefined &&
            target.revision !== command.expectedTargetRevision)) {
        return {
          status: 'stale',
          sessionId: command.sessionId,
          proposalId: command.proposalId,
          expectedTargetRevision: command.expectedTargetRevision ?? target.revision,
          currentTargetRevision: target.revision,
          expectedControlRevision: command.expectedControlRevision,
          currentControlRevision: controlRevision,
        };
      }
      targetConsoleIsEligible(
        command.craftId,
        command.targetShipId,
        command.targetConsoleId,
        target.damage,
        target.resources,
        isMacawScrapProposal(command) ? currentCapybaraScrap(session) : undefined,
      );
      if (proposalSnapshot.exists) {
        const existing = proposalRecord(proposalSnapshot.data() ?? {});
        if (!exactProposalRequestMatches(existing, command, actorUid) ||
            existing.targetFingerprint !== target.fingerprint || existing.status !== 'pending') {
          precondition('This proposal ID is already bound to a different or completed action.');
        }
        return {
          status: 'replayed',
          sessionId: existing.sessionId,
          proposalId: existing.proposalId,
          craftId: existing.craftId,
          targetShipId: existing.targetShipId,
          targetConsoleId: existing.targetConsoleId,
          targetRevision: existing.targetRevision,
          controlRevision: existing.controlRevision,
          ...(isMacawScrapProposal(existing)
            ? { scrapGain: existing.scrapGain }
            : { materialGain: existing.materialGain }),
        };
      }
      requireCandidateVesselsAvailable(session, [command.targetShipId]);
      requireCandidateCraftAvailable(session, [command.craftId]);
      if (inboxSnapshot.exists) {
        const inbox = parseDismantlingInbox(
          inboxSnapshot.data(), command.sessionId, command.targetShipId,
        );
        if ((inbox.status === 'pending' || inbox.status === 'consented') &&
            inbox.targetRevision === target.revision) {
          precondition('The target ship already has an active dismantling consent request.');
        }
      }
      const stored: StoredProposal = {
        type: 'permissioned-dismantling-proposal',
        sessionId: command.sessionId,
        proposalId: command.proposalId,
        proposerUid: actorUid,
        craftId: command.craftId,
        targetShipId: command.targetShipId,
        targetConsoleId: command.targetConsoleId,
        targetRevision: target.revision,
        ...(isMacawScrapProposal(command)
          ? { scrapGain: MACAW_CONSENTED_DISMANTLING_SCRAP_GAIN }
          : { materialGain: PERMISSIONED_DISMANTLING_MATERIAL_GAIN }),
        controlRevision,
        targetFingerprint: target.fingerprint,
        status: 'pending',
        createdAt: serverTimestamp(),
      };
      syncTargetState(
        tx, targetStateRef, target, command.sessionId, command.targetShipId, serverTimestamp,
      );
      tx.create(proposalRef, stored);
      tx.set(inboxRef, dismantlingInboxValue({
        sessionId: command.sessionId,
        targetShipId: command.targetShipId,
        proposalId: command.proposalId,
        proposerUid: actorUid,
        craftId: command.craftId,
        targetConsoleId: command.targetConsoleId,
        targetRevision: target.revision,
        status: 'pending',
        updatedAt: serverTimestamp(),
      }));
      return {
        status: 'proposed',
        sessionId: command.sessionId,
        proposalId: command.proposalId,
        craftId: command.craftId,
        targetShipId: command.targetShipId,
        targetConsoleId: command.targetConsoleId,
        targetRevision: target.revision,
        controlRevision,
        ...(isMacawScrapProposal(command)
          ? { scrapGain: MACAW_CONSENTED_DISMANTLING_SCRAP_GAIN }
          : { materialGain: PERMISSIONED_DISMANTLING_MATERIAL_GAIN }),
      };
    });
  };

  const consentToPermissionedDismantling = async (
    request: PermissionedDismantlingCallableRequest,
  ): Promise<PermissionedDismantlingConsentReply> => {
    const actorUid = requireUid(request.auth);
    const command = requireConsentCommand(request.data);
    const sessionRef = doc(db, 'sessions/' + command.sessionId);
    const actorRef = doc(db, 'sessions/' + command.sessionId + '/players/' + actorUid);
    const proposalRef = doc(db, proposalPath(command.sessionId, command.proposalId));
    const consentRef = doc(db, consentPath(command.sessionId, command.consentId));
    return db.runTransaction(async (rawTx) => {
      const tx = rawTx as Transaction;
      const [session, actor, proposalSnapshot, consentSnapshot] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(proposalRef), tx.get(consentRef),
      ]);
      requireActiveSession(session);
      const timestamp = now();
      if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
        precondition('The server clock is unavailable.');
      }
      const proposal = proposalRecord(proposalSnapshot.data() ?? {});
      if (proposal.sessionId !== command.sessionId || proposal.proposalId !== command.proposalId) {
        precondition('The requested dismantling proposal is unavailable.');
      }
      const inboxRef = doc(db, dismantlingInboxPath(command.sessionId, proposal.targetShipId));
      const inboxSnapshot = await tx.get(inboxRef);
      const inbox = parseDismantlingInbox(
        inboxSnapshot.data(), command.sessionId, proposal.targetShipId,
      );
      if (inbox.proposalId !== command.proposalId) {
        precondition('The dismantling request has been replaced by a newer target-ship request.');
      }
      const activeRoleIds = requireActiveRoleList(session);
      if (actorUid === proposal.proposerUid ||
          !currentTargetPlayer(actor, proposal.targetShipId, activeRoleIds, timestamp)) {
        denied('Only a different active player currently assigned to the target ship may consent.');
      }
      if (command.expectedTargetRevision !== proposal.targetRevision) {
        precondition('The consent request does not match the proposal target revision.');
      }
      if (proposal.status !== 'pending') {
        precondition('Only a pending dismantling proposal can receive consent.');
      }
      const proposerRef = doc(db, 'sessions/' + command.sessionId + '/players/' + proposal.proposerUid);
      const targetStateRef = doc(db, targetStatePath(command.sessionId, proposal.targetShipId));
      const [proposer, targetStateSnapshot] = await Promise.all([
        tx.get(proposerRef), tx.get(targetStateRef),
      ]);
      const controlRevision = currentCraftControlRevision({
        session, actor: proposer, actorUid: proposal.proposerUid,
        craftId: proposal.craftId, targetShipId: proposal.targetShipId,
        activeRoleIds, now: timestamp,
      });
      if (controlRevision !== proposal.controlRevision) {
        precondition('The engineering-craft control changed after the proposal.');
      }
      if (!targetStateSnapshot.exists) precondition('The private target revision record is unavailable.');
      const target = readCurrentTargetState(
        session, targetStateSnapshot, command.sessionId, proposal.targetShipId,
      );
      if (target.revision !== proposal.targetRevision ||
          target.fingerprint !== proposal.targetFingerprint) {
        precondition('The target ship changed after the proposal. Refresh before consenting.');
      }
      targetConsoleIsEligible(
        proposal.craftId,
        proposal.targetShipId,
        proposal.targetConsoleId,
        target.damage,
        target.resources,
        isMacawScrapProposal(proposal) ? currentCapybaraScrap(session) : undefined,
      );
      if (consentSnapshot.exists) {
        const existing = consentRecord(consentSnapshot.data() ?? {});
        if (!consentMatchesProposal(existing, proposal) || existing.consentId !== command.consentId ||
            existing.actorUid !== actorUid) {
          precondition('This consent ID is already bound to a different actor or proposal.');
        }
        if ((existing.status === 'granted' &&
              (inbox.status !== 'consented' || inbox.consentId !== command.consentId)) ||
            (existing.status === 'revoked' &&
              (inbox.status !== 'revoked' || inbox.consentId !== command.consentId))) {
          precondition('The target-ship consent inbox does not match this decision.');
        }
        return {
          status: 'replayed',
          consentStatus: existing.status,
          sessionId: command.sessionId,
          proposalId: command.proposalId,
          consentId: command.consentId,
          targetRevision: proposal.targetRevision,
        };
      }
      requireCandidateVesselsAvailable(session, [proposal.targetShipId]);
      requireCandidateCraftAvailable(session, [proposal.craftId]);
      if (inbox.status !== 'pending') {
        precondition('A revoked dismantling request is closed; the craft holder must submit a new request.');
      }
      const consent: StoredConsent = {
        type: 'permissioned-dismantling-consent',
        sessionId: command.sessionId,
        proposalId: command.proposalId,
        consentId: command.consentId,
        actorUid,
        craftId: proposal.craftId,
        targetShipId: proposal.targetShipId,
        targetConsoleId: proposal.targetConsoleId,
        targetRevision: proposal.targetRevision,
        ...(isMacawScrapProposal(proposal)
          ? { scrapGain: proposal.scrapGain }
          : { materialGain: proposal.materialGain }),
        controlRevision: proposal.controlRevision,
        status: 'granted',
        createdAt: serverTimestamp(),
      };
      tx.create(consentRef, consent);
      tx.update(inboxRef, {
        status: 'consented',
        consentId: command.consentId,
        updatedAt: serverTimestamp(),
      });
      return {
        status: 'consented',
        consentStatus: 'granted',
        sessionId: command.sessionId,
        proposalId: command.proposalId,
        consentId: command.consentId,
        targetRevision: proposal.targetRevision,
      };
    });
  };

  const declinePermissionedDismantling = async (
    request: PermissionedDismantlingCallableRequest,
  ): Promise<PermissionedDismantlingDeclineReply> => {
    const actorUid = requireUid(request.auth);
    const command = requireDeclineCommand(request.data);
    const sessionRef = doc(db, 'sessions/' + command.sessionId);
    const actorRef = doc(db, 'sessions/' + command.sessionId + '/players/' + actorUid);
    const proposalRef = doc(db, proposalPath(command.sessionId, command.proposalId));
    return db.runTransaction(async (rawTx) => {
      const tx = rawTx as Transaction;
      const [session, actor, proposalSnapshot] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(proposalRef),
      ]);
      requireActiveSession(session);
      const timestamp = now();
      if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
        precondition('The server clock is unavailable.');
      }
      const proposal = proposalRecord(proposalSnapshot.data() ?? {});
      if (proposal.sessionId !== command.sessionId || proposal.proposalId !== command.proposalId) {
        precondition('The requested dismantling proposal is unavailable.');
      }
      const inboxRef = doc(db, dismantlingInboxPath(command.sessionId, proposal.targetShipId));
      const inboxSnapshot = await tx.get(inboxRef);
      const inbox = parseDismantlingInbox(
        inboxSnapshot.data(), command.sessionId, proposal.targetShipId,
      );
      if (inbox.proposalId !== command.proposalId) {
        precondition('The dismantling request has been replaced by a newer target-ship request.');
      }
      const activeRoleIds = requireActiveRoleList(session);
      if (actorUid === proposal.proposerUid ||
          !currentTargetPlayer(actor, proposal.targetShipId, activeRoleIds, timestamp)) {
        denied('Only a different active player currently assigned to the target ship may decline.');
      }
      if (proposal.status === 'declined') {
        if (proposal.declinedByUid !== actorUid || inbox.status !== 'declined') {
          precondition('This dismantling request has already been declined.');
        }
        return {
          status: 'replayed',
          sessionId: command.sessionId,
          proposalId: command.proposalId,
        };
      }
      if (proposal.status !== 'pending' || inbox.status !== 'pending') {
        precondition('Only a pending dismantling request can be declined.');
      }
      tx.update(proposalRef, {
        status: 'declined',
        declinedAt: serverTimestamp(),
        declinedByUid: actorUid,
      });
      tx.update(inboxRef, {
        status: 'declined',
        consentId: null,
        updatedAt: serverTimestamp(),
      });
      return {
        status: 'declined',
        sessionId: command.sessionId,
        proposalId: command.proposalId,
      };
    });
  };

  const revokePermissionedDismantlingConsent = async (
    request: PermissionedDismantlingCallableRequest,
  ): Promise<PermissionedDismantlingRevokeReply> => {
    const actorUid = requireUid(request.auth);
    const command = requireRevokeCommand(request.data);
    const sessionRef = doc(db, 'sessions/' + command.sessionId);
    const proposalRef = doc(db, proposalPath(command.sessionId, command.proposalId));
    const consentRef = doc(db, consentPath(command.sessionId, command.consentId));
    return db.runTransaction(async (rawTx) => {
      const tx = rawTx as Transaction;
      const [session, proposalSnapshot, consentSnapshot] = await Promise.all([
        tx.get(sessionRef), tx.get(proposalRef), tx.get(consentRef),
      ]);
      requireActiveSession(session);
      const proposal = proposalRecord(proposalSnapshot.data() ?? {});
      const consent = consentRecord(consentSnapshot.data() ?? {});
      if (proposal.sessionId !== command.sessionId || proposal.proposalId !== command.proposalId ||
          consent.sessionId !== command.sessionId || consent.proposalId !== command.proposalId ||
          consent.consentId !== command.consentId || !consentMatchesProposal(consent, proposal)) {
        precondition('The requested dismantling consent is unavailable.');
      }
      const inboxRef = doc(db, dismantlingInboxPath(command.sessionId, proposal.targetShipId));
      const inboxSnapshot = await tx.get(inboxRef);
      const inbox = parseDismantlingInbox(
        inboxSnapshot.data(), command.sessionId, proposal.targetShipId,
      );
      if (inbox.proposalId !== command.proposalId || inbox.consentId !== command.consentId) {
        precondition('The target-ship inbox no longer shows this consent request.');
      }
      if (consent.actorUid !== actorUid) denied('Only the player who granted this consent may revoke it.');
      if (consent.status === 'revoked') {
        if (inbox.status !== 'revoked') precondition('The target-ship inbox does not record this revocation.');
        return {
          status: 'replayed',
          sessionId: command.sessionId,
          proposalId: command.proposalId,
          consentId: command.consentId,
        };
      }
      if (inbox.status !== 'consented') {
        precondition('The target-ship inbox does not show an active consent to revoke.');
      }
      if (proposal.status !== 'pending' || consent.status !== 'granted') {
        precondition('Only a current, unused consent on a pending proposal may be revoked.');
      }
      tx.update(consentRef, { status: 'revoked', revokedAt: serverTimestamp() });
      tx.update(inboxRef, { status: 'revoked', updatedAt: serverTimestamp() });
      return {
        status: 'revoked',
        sessionId: command.sessionId,
        proposalId: command.proposalId,
        consentId: command.consentId,
      };
    });
  };

  const applyPermissionedDismantling = async (
    request: PermissionedDismantlingCallableRequest,
  ): Promise<PermissionedDismantlingApplyReply | PermissionedDismantlingStaleApplyReply> => {
    const actorUid = requireUid(request.auth);
    const command = requireApplyCommand(request.data);
    const sessionRef = doc(db, 'sessions/' + command.sessionId);
    const proposerRef = doc(db, 'sessions/' + command.sessionId + '/players/' + actorUid);
    const proposalRef = doc(db, proposalPath(command.sessionId, command.proposalId));
    const consentRef = doc(db, consentPath(command.sessionId, command.consentId));
    const receiptRef = doc(db, receiptPath(command.sessionId, command.requestId));
    return db.runTransaction(async (rawTx) => {
      const tx = rawTx as Transaction;
      const [session, proposer, proposalSnapshot, consentSnapshot, receiptSnapshot] = await Promise.all([
        tx.get(sessionRef), tx.get(proposerRef), tx.get(proposalRef),
        tx.get(consentRef), tx.get(receiptRef),
      ]);
      const proposal = proposalRecord(proposalSnapshot.data() ?? {});
      if (proposal.proposerUid !== actorUid || proposal.sessionId !== command.sessionId ||
          proposal.proposalId !== command.proposalId) {
        denied('Only the original engineering-craft proposer may apply this dismantling.');
      }
      const inboxRef = doc(db, dismantlingInboxPath(command.sessionId, proposal.targetShipId));
      const inboxSnapshot = await tx.get(inboxRef);
      const inbox = parseDismantlingInbox(
        inboxSnapshot.data(), command.sessionId, proposal.targetShipId,
      );
      if (inbox.proposalId !== command.proposalId || inbox.consentId !== command.consentId) {
        precondition('The target-ship inbox no longer shows this consent request.');
      }
      const consent = consentRecord(consentSnapshot.data() ?? {});
      if (consent.sessionId !== command.sessionId || consent.proposalId !== command.proposalId ||
          consent.consentId !== command.consentId || !consentMatchesProposal(consent, proposal)) {
        precondition('The requested consent is not bound to this exact proposal.');
      }
      const fingerprint = applicationRequestFingerprint(actorUid, command, proposal);
      if (receiptSnapshot.exists) {
        const receipt = parseApplyReceipt(receiptSnapshot.data());
        if (receipt.sessionId !== command.sessionId || receipt.requestId !== command.requestId ||
            receipt.proposalId !== command.proposalId || receipt.consentId !== command.consentId ||
            receipt.actorUid !== actorUid || receipt.requestFingerprint !== fingerprint) {
          precondition('This dismantling request ID is already bound to another action.');
        }
        if (proposal.status !== 'applied' || proposal.consumedConsentId !== command.consentId ||
            consent.status !== 'consumed' || consent.consumedByUid !== actorUid ||
            inbox.status !== 'applied' || (isMacawScrapProposal(proposal)
              ? inbox.scrapAfter !== receipt.result.scrapAfter
              : inbox.materialsAfter !== receipt.result.materialsAfter)) {
          precondition('This dismantling replay receipt is not bound to the consumed proposal and consent.');
        }
        return { ...receipt.result, status: 'replayed' };
      }
      requireActiveSession(session);
      const timestamp = now();
      if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
        precondition('The server clock is unavailable.');
      }
      const activeRoleIds = requireActiveRoleList(session);
      const controlRevision = currentCraftControlRevision({
        session, actor: proposer, actorUid,
        craftId: proposal.craftId, targetShipId: proposal.targetShipId,
        activeRoleIds, now: timestamp,
      });
      if (controlRevision !== proposal.controlRevision) {
        precondition('The engineering-craft control changed after the proposal.');
      }
      requireCandidateVesselsAvailable(session, [proposal.targetShipId]);
      requireCandidateCraftAvailable(session, [proposal.craftId]);
      if (proposal.status !== 'pending') {
        precondition('This dismantling proposal has already been consumed.');
      }
      if (consent.status !== 'granted') {
        precondition(consent.status === 'revoked'
          ? 'The target-ship player revoked this dismantling consent.'
          : 'This dismantling consent has already been consumed.');
      }
      if (inbox.status !== 'consented') {
        precondition('The target-ship inbox does not show an active consent.');
      }
      if (command.expectedTargetRevision !== proposal.targetRevision) {
        precondition('The apply request does not match the proposal target revision.');
      }
      if (consent.actorUid === actorUid) {
        denied('The proposer cannot supply their own target-ship consent.');
      }

      const targetPlayerRef = doc(db, 'sessions/' + command.sessionId + '/players/' + consent.actorUid);
      const targetStateRef = doc(db, targetStatePath(command.sessionId, proposal.targetShipId));
      const [targetPlayer, targetStateSnapshot] = await Promise.all([
        tx.get(targetPlayerRef), tx.get(targetStateRef),
      ]);
      if (!currentTargetPlayer(targetPlayer, proposal.targetShipId, activeRoleIds, timestamp)) {
        denied('The consenting player is no longer active on the target ship.');
      }
      if (!targetStateSnapshot.exists) precondition('The private target revision record is unavailable.');
      const target = readCurrentTargetState(
        session, targetStateSnapshot, command.sessionId, proposal.targetShipId,
      );
      if (target.revision !== proposal.targetRevision ||
          target.fingerprint !== proposal.targetFingerprint ||
          target.revision !== command.expectedTargetRevision) {
        return {
          status: 'stale',
          sessionId: command.sessionId,
          requestId: command.requestId,
          proposalId: command.proposalId,
          consentId: command.consentId,
          expectedTargetRevision: command.expectedTargetRevision,
          currentTargetRevision: target.revision,
        };
      }

      let macawRepairLedger: ReturnType<typeof recordMacawSalvageUse> | undefined;
      let macawCycle: number | undefined;
      if (isMacawScrapProposal(proposal)) {
        requireMacawSourceAvailable(session, proposer);
        macawCycle = requireMacawCoordinationCycle(session, timestamp);
        const currentLedger = parseMacawRepairLedger(session.get('macawRepairs'));
        if (!currentLedger) precondition('The authoritative Macaw repair and salvage allowance is unavailable.');
        try {
          macawRepairLedger = recordMacawSalvageUse({
            currentCycle: macawCycle,
            hostShipId: proposal.targetShipId,
            systemId: proposal.targetConsoleId,
            fuelled: isRecord(session.get('shuttleFuelled')) &&
              (session.get('shuttleFuelled') as Data).macaw === true,
            ledger: currentLedger,
          });
        } catch (cause) {
          precondition(cause instanceof Error
            ? cause.message : 'Macaw salvage exceeds its shared repair allowance.');
        }
      }

      let result: ReturnType<typeof resolvePermissionedDismantling>;
      try {
        result = resolvePermissionedDismantling({
          proposal: proposalCore(proposal),
          consent: {
            ...proposalCore(proposal),
            id: consent.consentId,
            status: consent.status,
            actorUid: consent.actorUid,
          },
          activeTargetShipPlayerUids: [consent.actorUid],
          currentTargetRevision: target.revision,
          targetDamage: target.damage,
          targetResources: target.resources,
          ...(isMacawScrapProposal(proposal) ? { macawScrap: currentCapybaraScrap(session) } : {}),
        });
      } catch (cause) {
        precondition(cause instanceof Error
          ? cause.message : 'Permissioned dismantling was rejected.');
      }
      if (target.revision === Number.MAX_SAFE_INTEGER) {
        precondition('The target ship revision cannot advance safely.');
      }
      const macawHostTarget = isMacawScrapProposal(proposal) && proposal.targetShipId === 'capybara';
      let nextTargetResources = result.targetResources;
      if (macawHostTarget) {
        const scrapAfter = result.macawScrapAfter;
        if (typeof scrapAfter !== 'number' || !Number.isSafeInteger(scrapAfter) || scrapAfter < 0) {
          precondition('The Macaw Scrap result is unavailable or invalid.');
        }
        nextTargetResources = { ...result.targetResources, scrap: scrapAfter };
      }
      const nextFingerprint = targetFingerprint(result.targetDamage, nextTargetResources);
      const appliedAt = serverTimestamp();
      const reply: PermissionedDismantlingApplyReply = {
        status: 'applied',
        sessionId: command.sessionId,
        requestId: command.requestId,
        proposalId: command.proposalId,
        consentId: command.consentId,
        targetShipId: proposal.targetShipId,
        targetConsoleId: proposal.targetConsoleId,
        targetRevision: target.revision + 1,
        ...(isMacawScrapProposal(proposal)
          ? {
            scrapGain: proposal.scrapGain,
            scrapAfter: result.macawScrapAfter,
          }
          : {
            materialGain: proposal.materialGain,
            materialsAfter: result.targetResources.materials,
          }),
      };

      tx.update(sessionRef, {
        ['shipDamage.' + proposal.targetShipId]: result.targetDamage,
        ['shipResources.' + proposal.targetShipId]: nextTargetResources,
        ...(isMacawScrapProposal(proposal)
          ? {
            ...(macawHostTarget ? {} : { 'shipResources.capybara.scrap': result.macawScrapAfter }),
            macawRepairs: macawRepairLedger,
          }
          : {}),
        updatedAt: appliedAt,
      });
      tx.update(targetStateRef, {
        revision: target.revision + 1,
        fingerprint: nextFingerprint,
        observedSessionUpdatedAt: appliedAt,
        updatedAt: appliedAt,
      });
      tx.update(proposalRef, {
        status: 'applied',
        appliedByUid: actorUid,
        consumedConsentId: command.consentId,
        appliedAt,
      });
      tx.update(consentRef, {
        status: 'consumed',
        consumedByUid: actorUid,
        consumedAt: appliedAt,
      });
      tx.update(inboxRef, {
        status: 'applied',
        ...(isMacawScrapProposal(proposal)
          ? { scrapAfter: result.macawScrapAfter }
          : { materialsAfter: result.targetResources.materials }),
        updatedAt: appliedAt,
      });
      const receipt: StoredApplyReceipt = {
        type: 'permissioned-dismantling-receipt',
        sessionId: command.sessionId,
        requestId: command.requestId,
        proposalId: command.proposalId,
        consentId: command.consentId,
        actorUid,
        requestFingerprint: fingerprint,
        result: reply,
        createdAt: appliedAt,
      };
      tx.create(receiptRef, receipt);
      if (isMacawScrapProposal(proposal)) {
        writeStandardActionAudit(tx, db as unknown as Firestore, {
          sessionId: command.sessionId,
          actorUid,
          actorRoleId: 'capybara-captain',
          action: 'macaw-consented-dismantling',
          phase: 'active',
          requestId: command.requestId,
          revision: target.revision + 1,
          outcome: 'committed',
          resolutionSource: 'server-calculated',
          createdAt: appliedAt,
        }, {
          sourceId: 'macaw',
          requiredChoices: [{
            actor: 'player',
            kind: 'target-player-console-consent',
            value: {
              consentActorUid: consent.actorUid,
              targetShipId: proposal.targetShipId,
              targetConsoleId: proposal.targetConsoleId,
            },
          }],
          calculation: {
            targetRevisionBefore: target.revision,
            targetRevisionAfter: target.revision + 1,
            scrapGain: MACAW_CONSENTED_DISMANTLING_SCRAP_GAIN,
            cycle: macawCycle,
            repairRevision: macawRepairLedger?.revision,
          },
          consequences: {
            damagedConsoleId: proposal.targetConsoleId,
            capybaraScrapAfter: result.macawScrapAfter,
            repairHostShipIds: macawRepairLedger?.hosts.map(({ shipId }) => shipId),
          },
          audience: { operational: 'actor' },
        });
      }
      return reply;
    });
  };

  return {
    proposePermissionedDismantling,
    consentToPermissionedDismantling,
    declinePermissionedDismantling,
    revokePermissionedDismantlingConsent,
    applyPermissionedDismantling,
  };
}
