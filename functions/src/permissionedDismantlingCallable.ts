import { createHash } from 'node:crypto';
import {
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
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
import {
  ENGINEERING_DISMANTLING_CRAFT_IDS,
  PERMISSIONED_DISMANTLING_MATERIAL_GAIN,
  resolvePermissionedDismantling,
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
  readonly materialGain: number;
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

export interface PermissionedDismantlingApplyReply {
  readonly status: 'applied' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly targetShipId: string;
  readonly targetConsoleId: string;
  readonly targetRevision: number;
  readonly materialGain: number;
  readonly materialsAfter: number;
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
  readonly craftId: string;
  readonly targetShipId: string;
  readonly targetConsoleId: string;
  readonly expectedTargetRevision: number;
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
  readonly status: 'pending' | 'applied';
  readonly createdAt: unknown;
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

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PROPOSAL_BASE_KEYS = [
  'type', 'sessionId', 'proposalId', 'proposerUid', 'craftId', 'targetShipId',
  'targetConsoleId', 'targetRevision', 'materialGain', 'controlRevision',
  'targetFingerprint', 'status', 'createdAt',
] as const;
const PROPOSAL_APPLIED_KEYS = [
  ...PROPOSAL_BASE_KEYS, 'appliedAt', 'appliedByUid', 'consumedConsentId',
] as const;
const CONSENT_BASE_KEYS = [
  'type', 'sessionId', 'proposalId', 'consentId', 'actorUid', 'craftId',
  'targetShipId', 'targetConsoleId', 'targetRevision', 'materialGain',
  'controlRevision', 'status', 'createdAt',
] as const;
const TARGET_STATE_KEYS = [
  'type', 'sessionId', 'targetShipId', 'revision', 'fingerprint',
  'observedSessionUpdatedAt', 'updatedAt',
] as const;
const APPLY_REPLY_KEYS = [
  'status', 'sessionId', 'requestId', 'proposalId', 'consentId', 'targetShipId',
  'targetConsoleId', 'targetRevision', 'materialGain', 'materialsAfter',
] as const;
const APPLY_RECEIPT_KEYS = [
  'type', 'sessionId', 'requestId', 'proposalId', 'consentId', 'actorUid',
  'requestFingerprint', 'result', 'createdAt',
] as const;

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Data, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
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
  const data = requireRequest(value, [
    'sessionId', 'proposalId', 'craftId', 'targetShipId', 'targetConsoleId',
    'expectedTargetRevision', 'expectedControlRevision',
  ]);
  const sessionId = requireId(data.sessionId, 'sessionId');
  const proposalId = requireId(data.proposalId, 'proposalId');
  const craftId = requireId(data.craftId, 'craftId');
  const targetShipId = requireId(data.targetShipId, 'targetShipId');
  const targetConsoleId = requireId(data.targetConsoleId, 'targetConsoleId');
  if (!(ENGINEERING_DISMANTLING_CRAFT_IDS as readonly string[]).includes(craftId)) {
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
    expectedTargetRevision: requireRevision(data.expectedTargetRevision, 'expectedTargetRevision'),
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
  const replacementRoleId = player.get('replacementRoleId');
  if (replacementRoleId !== undefined && replacementRoleId !== null) {
    if (typeof replacementRoleId !== 'string' || replacementRoleId.length === 0 ||
        player.get('replacementStatus') !== undefined && player.get('replacementStatus') !== null) {
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
  if (!craft || !(ENGINEERING_DISMANTLING_CRAFT_IDS as readonly string[]).includes(craftId) ||
      !activeRoleIds.includes(craft.ownerRoleId)) {
    denied('This engineering craft is not enabled for the current session.');
  }
  const controls = parseShuttleControl(session.get('shuttleControl'));
  const control = controls?.[craftId];
  if (!control || control.shuttleId !== craftId || control.ownerRoleId !== craft.ownerRoleId) {
    precondition('The authoritative engineering-craft control state is unavailable.');
  }
  if (control.holderUid !== actorUid) {
    denied('Only the current holder of this engineering craft may propose or apply dismantling.');
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
    precondition('The engineering craft must remain docked at the exact target ship.');
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
  const keys = status === 'pending' ? PROPOSAL_BASE_KEYS :
    status === 'applied' ? PROPOSAL_APPLIED_KEYS : [];
  if (keys.length === 0 || !exactKeys(value, keys) ||
      value.type !== 'permissioned-dismantling-proposal' ||
      typeof value.sessionId !== 'string' || !ID_PATTERN.test(value.sessionId) ||
      typeof value.proposalId !== 'string' || !ID_PATTERN.test(value.proposalId) ||
      typeof value.proposerUid !== 'string' || value.proposerUid.length === 0 ||
      typeof value.craftId !== 'string' ||
      !(ENGINEERING_DISMANTLING_CRAFT_IDS as readonly string[]).includes(value.craftId) ||
      typeof value.targetShipId !== 'string' || !isResourceShipId(value.targetShipId) ||
      typeof value.targetConsoleId !== 'string' || !ID_PATTERN.test(value.targetConsoleId) ||
      !Number.isSafeInteger(value.targetRevision) || (value.targetRevision as number) < 0 ||
      value.materialGain !== PERMISSIONED_DISMANTLING_MATERIAL_GAIN ||
      !Number.isSafeInteger(value.controlRevision) || (value.controlRevision as number) < 0 ||
      !isHash(value.targetFingerprint) ||
      status !== 'pending' && status !== 'applied' ||
      status === 'applied' && (typeof value.appliedByUid !== 'string' ||
        value.appliedByUid.length === 0 || typeof value.consumedConsentId !== 'string' ||
        !ID_PATTERN.test(value.consumedConsentId))) {
    precondition('The stored permissioned-dismantling proposal is malformed.');
  }
  return value as unknown as StoredProposal;
}

function consentRecord(value: Data): StoredConsent {
  const status = value.status;
  const extraKeys = status === 'granted' ? [] :
    status === 'revoked' ? ['revokedAt'] :
    status === 'consumed' ? ['consumedAt', 'consumedByUid'] : null;
  if (!extraKeys || !exactKeys(value, [...CONSENT_BASE_KEYS, ...extraKeys]) ||
      value.type !== 'permissioned-dismantling-consent' ||
      typeof value.sessionId !== 'string' || !ID_PATTERN.test(value.sessionId) ||
      typeof value.proposalId !== 'string' || !ID_PATTERN.test(value.proposalId) ||
      typeof value.consentId !== 'string' || !ID_PATTERN.test(value.consentId) ||
      typeof value.actorUid !== 'string' || value.actorUid.length === 0 ||
      typeof value.craftId !== 'string' ||
      !(ENGINEERING_DISMANTLING_CRAFT_IDS as readonly string[]).includes(value.craftId) ||
      typeof value.targetShipId !== 'string' || !isResourceShipId(value.targetShipId) ||
      typeof value.targetConsoleId !== 'string' || !ID_PATTERN.test(value.targetConsoleId) ||
      !Number.isSafeInteger(value.targetRevision) || (value.targetRevision as number) < 0 ||
      value.materialGain !== PERMISSIONED_DISMANTLING_MATERIAL_GAIN ||
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
    materialGain: proposal.materialGain,
  };
}

function consentMatchesProposal(consent: StoredConsent, proposal: StoredProposal): boolean {
  return consent.sessionId === proposal.sessionId &&
    consent.proposalId === proposal.proposalId &&
    consent.craftId === proposal.craftId &&
    consent.targetShipId === proposal.targetShipId &&
    consent.targetConsoleId === proposal.targetConsoleId &&
    consent.targetRevision === proposal.targetRevision &&
    consent.materialGain === proposal.materialGain &&
    consent.controlRevision === proposal.controlRevision;
}

function targetConsoleIsEligible(
  targetShipId: string,
  targetConsoleId: string,
  damage: ShipDamageState,
  materials: number,
): void {
  const deck = SHIP_DAMAGE_DECKS[targetShipId];
  if (!deck || damage.destroyed) {
    precondition('A destroyed or unavailable target ship cannot be dismantled.');
  }
  if (!deck.some(({ systemId }) => systemId === targetConsoleId) ||
      damage.damagedSystemIds.includes(targetConsoleId)) {
    precondition('Choose one eligible, undamaged console on the target ship.');
  }
  if (materials > Number.MAX_SAFE_INTEGER - PERMISSIONED_DISMANTLING_MATERIAL_GAIN) {
    precondition('The target ship cannot safely receive the printed materials gain.');
  }
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
    proposal.targetRevision === command.expectedTargetRevision &&
    proposal.controlRevision === command.expectedControlRevision &&
    proposal.materialGain === PERMISSIONED_DISMANTLING_MATERIAL_GAIN;
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
    materialGain: proposal.materialGain,
  })).digest('hex');
}

function applyReply(value: unknown): PermissionedDismantlingApplyReply {
  if (!isRecord(value) || !exactKeys(value, APPLY_REPLY_KEYS) ||
      (value.status !== 'applied' && value.status !== 'replayed') ||
      typeof value.sessionId !== 'string' || !ID_PATTERN.test(value.sessionId) ||
      typeof value.requestId !== 'string' || !ID_PATTERN.test(value.requestId) ||
      typeof value.proposalId !== 'string' || !ID_PATTERN.test(value.proposalId) ||
      typeof value.consentId !== 'string' || !ID_PATTERN.test(value.consentId) ||
      typeof value.targetShipId !== 'string' || !isResourceShipId(value.targetShipId) ||
      typeof value.targetConsoleId !== 'string' || !ID_PATTERN.test(value.targetConsoleId) ||
      !Number.isSafeInteger(value.targetRevision) || (value.targetRevision as number) < 1 ||
      value.materialGain !== PERMISSIONED_DISMANTLING_MATERIAL_GAIN ||
      !Number.isSafeInteger(value.materialsAfter) || (value.materialsAfter as number) < 0) {
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
    return db.runTransaction(async (rawTx) => {
      const tx = rawTx as Transaction;
      const [session, actor, proposalSnapshot, targetStateSnapshot] = await Promise.all([
        tx.get(sessionRef), tx.get(actorRef), tx.get(proposalRef), tx.get(targetStateRef),
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
          target.revision !== command.expectedTargetRevision) {
        return {
          status: 'stale',
          sessionId: command.sessionId,
          proposalId: command.proposalId,
          expectedTargetRevision: command.expectedTargetRevision,
          currentTargetRevision: target.revision,
          expectedControlRevision: command.expectedControlRevision,
          currentControlRevision: controlRevision,
        };
      }
      targetConsoleIsEligible(
        command.targetShipId,
        command.targetConsoleId,
        target.damage,
        target.resources.materials,
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
          materialGain: existing.materialGain,
        };
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
        materialGain: PERMISSIONED_DISMANTLING_MATERIAL_GAIN,
        controlRevision,
        targetFingerprint: target.fingerprint,
        status: 'pending',
        createdAt: serverTimestamp(),
      };
      syncTargetState(
        tx, targetStateRef, target, command.sessionId, command.targetShipId, serverTimestamp,
      );
      tx.create(proposalRef, stored);
      return {
        status: 'proposed',
        sessionId: command.sessionId,
        proposalId: command.proposalId,
        craftId: command.craftId,
        targetShipId: command.targetShipId,
        targetConsoleId: command.targetConsoleId,
        targetRevision: target.revision,
        controlRevision,
        materialGain: PERMISSIONED_DISMANTLING_MATERIAL_GAIN,
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
        proposal.targetShipId,
        proposal.targetConsoleId,
        target.damage,
        target.resources.materials,
      );
      if (consentSnapshot.exists) {
        const existing = consentRecord(consentSnapshot.data() ?? {});
        if (!consentMatchesProposal(existing, proposal) || existing.consentId !== command.consentId ||
            existing.actorUid !== actorUid) {
          precondition('This consent ID is already bound to a different actor or proposal.');
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
        materialGain: proposal.materialGain,
        controlRevision: proposal.controlRevision,
        status: 'granted',
        createdAt: serverTimestamp(),
      };
      tx.create(consentRef, consent);
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
      if (consent.actorUid !== actorUid) denied('Only the player who granted this consent may revoke it.');
      if (consent.status === 'revoked') {
        return {
          status: 'replayed',
          sessionId: command.sessionId,
          proposalId: command.proposalId,
          consentId: command.consentId,
        };
      }
      if (proposal.status !== 'pending' || consent.status !== 'granted') {
        precondition('Only a current, unused consent on a pending proposal may be revoked.');
      }
      tx.update(consentRef, { status: 'revoked', revokedAt: serverTimestamp() });
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
      requireActiveSession(session);
      const timestamp = now();
      if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
        precondition('The server clock is unavailable.');
      }
      const proposal = proposalRecord(proposalSnapshot.data() ?? {});
      if (proposal.proposerUid !== actorUid || proposal.sessionId !== command.sessionId ||
          proposal.proposalId !== command.proposalId) {
        denied('Only the original engineering-craft proposer may apply this dismantling.');
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
            consent.status !== 'consumed' || consent.consumedByUid !== actorUid) {
          precondition('This dismantling replay receipt is not bound to the consumed proposal and consent.');
        }
        return { ...receipt.result, status: 'replayed' };
      }
      if (proposal.status !== 'pending') {
        precondition('This dismantling proposal has already been consumed.');
      }
      if (consent.status !== 'granted') {
        precondition(consent.status === 'revoked'
          ? 'The target-ship player revoked this dismantling consent.'
          : 'This dismantling consent has already been consumed.');
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
        });
      } catch (cause) {
        precondition(cause instanceof Error
          ? cause.message : 'Permissioned dismantling was rejected.');
      }
      if (target.revision === Number.MAX_SAFE_INTEGER) {
        precondition('The target ship revision cannot advance safely.');
      }
      const nextFingerprint = targetFingerprint(result.targetDamage, result.targetResources);
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
        materialGain: proposal.materialGain,
        materialsAfter: result.targetResources.materials,
      };

      tx.update(sessionRef, {
        ['shipDamage.' + proposal.targetShipId]: result.targetDamage,
        ['shipResources.' + proposal.targetShipId]: result.targetResources,
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
      return reply;
    });
  };

  return {
    proposePermissionedDismantling,
    consentToPermissionedDismantling,
    revokePermissionedDismantlingConsent,
    applyPermissionedDismantling,
  };
}
