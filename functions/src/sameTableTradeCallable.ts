import {
  HttpsError,
} from 'firebase-functions/v2/https';
import type {
  DocumentSnapshot,
  Firestore,
  QuerySnapshot,
  Transaction,
} from 'firebase-admin/firestore';
import {
  SAME_TABLE_TRADE_RESOURCES,
  SameTableTradePolicyError,
  resolveSameTableTrade,
  type SameTableTradeInventory,
  type SameTableTradeOffer,
  type SameTableTradeQuantities,
  type SameTableTradeResource,
} from './sameTableTradePolicy';

type TradeDatabase = Pick<Firestore, 'doc' | 'collection' | 'runTransaction'>;
type Data = Record<string, unknown>;

interface RawCallableRequest {
  readonly auth?: { readonly uid?: string } | null;
  readonly data?: unknown;
}

interface RawStoredOffer extends Omit<SameTableTradeOffer, 'quantities'> {
  readonly quantities: SameTableTradeInventory;
  readonly sessionId: string;
  readonly type: 'same-table-trade-offer';
  readonly fleetGroupId: string;
  readonly status: 'pending' | 'accepted';
}

interface InventoryRecord {
  readonly sessionId: string;
  readonly playerUid: string;
  readonly balances: SameTableTradeInventory;
  readonly revision: number;
  readonly baseline: {
    readonly attestationId: string;
    readonly attestedByUid: string;
    readonly balances: SameTableTradeInventory;
    readonly revision: number;
    readonly attestedAt: unknown;
  };
}

export interface SameTableTradeCallableDependencies {
  readonly db: TradeDatabase;
  readonly requireUid: (auth: { readonly uid: string } | undefined) => string;
  readonly requireFacilitatorInstance: (
    tx: Transaction,
    sessionId: string,
    uid: string,
    instanceId: string,
  ) => Promise<unknown>;
  readonly isActivePlayer: (player: DocumentSnapshot) => boolean;
  readonly shipForRole: (roleId: unknown) => string | undefined;
  readonly serverTimestamp: () => unknown;
}

export interface SameTableTradeOfferProjection {
  readonly id: string;
  readonly fromUid: string;
  readonly toUid: string;
  readonly fleetGroupId: string;
  readonly tableId: string;
  readonly revision: number;
  readonly quantities: SameTableTradeInventory;
  readonly status: 'pending' | 'accepted';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RESOURCE_SET = new Set<string>(SAME_TABLE_TRADE_RESOURCES);

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function precondition(message: string): never {
  throw new HttpsError('failed-precondition', message);
}

function safeSegment(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 ||
      value.trim() !== value || value.includes('/')) {
    return invalid(`${label} is invalid.`);
  }
  return value;
}

function canonicalUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    return invalid(`${label} must be a canonical lowercase UUID.`);
  }
  return value;
}

function requireRequestData(value: unknown): Data {
  if (!isRecord(value)) return invalid('The same-table trade request is malformed.');
  return value;
}

function requireBalances(value: unknown): SameTableTradeInventory {
  if (!isRecord(value)) return invalid('The baseline balances are malformed.');
  const keys = Object.keys(value);
  if (keys.length !== SAME_TABLE_TRADE_RESOURCES.length ||
      keys.some((key) => !RESOURCE_SET.has(key))) {
    return invalid('A baseline must contain exactly the six supported resource balances.');
  }
  const balances = {} as Record<SameTableTradeResource, number>;
  for (const resource of SAME_TABLE_TRADE_RESOURCES) {
    const amount = value[resource];
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) {
      return invalid('Baseline balances must be safe, non-negative whole numbers.');
    }
    balances[resource] = amount;
  }
  return balances;
}

function requireQuantities(value: unknown): SameTableTradeInventory {
  if (!isRecord(value)) return invalid('The trade quantities are malformed.');
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !RESOURCE_SET.has(key))) {
    return invalid('A trade must name one or more supported resource quantities.');
  }
  const quantities = Object.fromEntries(
    SAME_TABLE_TRADE_RESOURCES.map((resource) => [resource, 0]),
  ) as Record<SameTableTradeResource, number>;
  for (const key of keys) {
    const amount = value[key];
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) {
      return invalid('Trade quantities must be safe, non-negative whole numbers.');
    }
    quantities[key as SameTableTradeResource] = amount;
  }
  if (Object.values(quantities).every((amount) => amount === 0)) {
    return invalid('A trade must move at least one token.');
  }
  return quantities;
}

function sameBalances(left: SameTableTradeInventory, right: SameTableTradeInventory): boolean {
  return SAME_TABLE_TRADE_RESOURCES.every((resource) => left[resource] === right[resource]);
}

function sameQuantities(left: SameTableTradeQuantities, right: SameTableTradeQuantities): boolean {
  return SAME_TABLE_TRADE_RESOURCES.every((resource) =>
    (left[resource] ?? 0) === (right[resource] ?? 0));
}

function requireRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return precondition('The same-table trade revision is malformed.');
  }
  return value;
}

async function readRevision(
  tx: Transaction,
  stateRef: ReturnType<Firestore['doc']>,
  sessionId: string,
): Promise<{ readonly revision: number; readonly exists: boolean }> {
  const state = await tx.get(stateRef);
  if (!state.exists) return { revision: 0, exists: false };
  const data = state.data();
  if (!data || data.sessionId !== sessionId || data.type !== 'same-table-trade-state') {
    return precondition('The same-table trade state is malformed.');
  }
  return { revision: requireRevision(data.revision), exists: true };
}

function recordData(snapshot: DocumentSnapshot, label: string): Data {
  const data = snapshot.data();
  if (!snapshot.exists || !data) return precondition(`The ${label} record is missing.`);
  return data;
}

function requireInventoryRecord(
  snapshot: DocumentSnapshot,
  sessionId: string,
  playerUid: string,
): InventoryRecord {
  const data = recordData(snapshot, 'personal inventory');
  if (data.type !== 'player-held-resource-inventory' || data.sessionId !== sessionId ||
      data.playerUid !== playerUid) {
    return precondition('The personal inventory does not match this session participant.');
  }
  const baseline = data.baseline;
  if (!isRecord(baseline)) return precondition('The player has no facilitator-attested baseline.');
  const attestationId = safeStoredString(baseline.attestationId);
  const attestedByUid = safeStoredString(baseline.attestedByUid);
  const attestedAt = baseline.attestedAt;
  if (!attestationId || !attestedByUid || attestedAt === undefined) {
    return precondition('The player has no valid facilitator-attested baseline.');
  }
  let balances: SameTableTradeInventory;
  let baselineBalances: SameTableTradeInventory;
  try {
    balances = requireBalances(data.balances);
    baselineBalances = requireBalances(baseline.balances);
  } catch (error) {
    if (error instanceof HttpsError) {
      return precondition('The player inventory or its attestation is malformed.');
    }
    throw error;
  }
  const revision = requireRevision(data.revision);
  const baselineRevision = requireRevision(baseline.revision);
  return {
    sessionId,
    playerUid,
    balances,
    revision,
    baseline: { attestationId, attestedByUid, balances: baselineBalances, revision: baselineRevision, attestedAt },
  };
}

function safeStoredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    !value.includes('/') ? value : null;
}

function requireOfferData(value: unknown, sessionId: string, offerId: string): RawStoredOffer {
  if (!isRecord(value) || value.type !== 'same-table-trade-offer' || value.sessionId !== sessionId ||
      value.id !== offerId || (value.status !== 'pending' && value.status !== 'accepted')) {
    return precondition('The stored trade offer is malformed or belongs to another session.');
  }
  const fromUid = safeStoredString(value.fromUid);
  const toUid = safeStoredString(value.toUid);
  const tableId = safeStoredString(value.tableId);
  const fleetGroupId = safeStoredString(value.fleetGroupId);
  const revision = requireRevision(value.revision);
  if (!fromUid || !toUid || !tableId || !fleetGroupId || fromUid === toUid) {
    return precondition('The stored trade offer is malformed.');
  }
  let quantities: SameTableTradeInventory;
  try {
    quantities = requireQuantities(value.quantities);
  } catch (error) {
    if (error instanceof HttpsError) return precondition('The stored trade offer quantities are malformed.');
    throw error;
  }
  return { id: offerId, fromUid, toUid, tableId, fleetGroupId, revision, quantities, status: value.status, sessionId, type: 'same-table-trade-offer' };
}

function policyOffer(offer: RawStoredOffer): SameTableTradeOffer {
  return {
    id: offer.id,
    fromUid: offer.fromUid,
    toUid: offer.toUid,
    tableId: offer.tableId,
    revision: offer.revision,
    quantities: offer.quantities,
  };
}

function publicOffer(offer: RawStoredOffer): SameTableTradeOfferProjection {
  return {
    id: offer.id,
    fromUid: offer.fromUid,
    toUid: offer.toUid,
    fleetGroupId: offer.fleetGroupId,
    tableId: offer.tableId,
    revision: offer.revision,
    quantities: offer.quantities,
    status: offer.status,
  };
}

interface RosterPlayer {
  readonly uid: string;
  readonly player: DocumentSnapshot;
  readonly active: boolean;
  readonly role: string | null;
  readonly tableId: string | null;
  readonly fleetGroupId: string | null;
}

function readRoster(
  snapshot: QuerySnapshot,
  isActivePlayer: (player: DocumentSnapshot) => boolean,
  shipForRole: (roleId: unknown) => string | undefined,
): RosterPlayer[] {
  return snapshot.docs.map((player) => {
    const data = player.data() ?? {};
    const role = typeof data.role === 'string' ? data.role : null;
    const active = role === 'player' && isActivePlayer(player);
    const rawGroup = data.fleetGroupId;
    const fleetGroupId = typeof rawGroup === 'string' && rawGroup.trim() === rawGroup &&
      rawGroup.length > 0 && rawGroup.length <= 128 ? rawGroup : null;
    const tableId = active ? shipForRole(data.assignedRoleId) ?? null : null;
    return { uid: player.id, player, active, role, tableId, fleetGroupId };
  });
}

function requireActivePlayer(
  roster: readonly RosterPlayer[],
  uid: string,
  label: string,
): RosterPlayer {
  const entry = roster.find((player) => player.uid === uid);
  if (!entry || !entry.active || entry.role !== 'player') {
    throw new HttpsError('failed-precondition', `The ${label} must be an active player in this session.`);
  }
  if (!entry.tableId || !entry.fleetGroupId) {
    throw new HttpsError('failed-precondition', `The ${label} must have a current ship table and fleet group.`);
  }
  return entry;
}

function requireSameTableAndFleet(sender: RosterPlayer, recipient: RosterPlayer): void {
  if (sender.tableId !== recipient.tableId) {
    precondition('Both active players must remain at the offer’s same ship table.');
  }
  if (sender.fleetGroupId !== recipient.fleetGroupId) {
    precondition('Both active players must remain in the same fleet group.');
  }
}

function requireRevisionCoversInventories(
  globalRevision: number,
  ...inventories: readonly InventoryRecord[]
): void {
  if (inventories.some((inventory) => inventory.revision > globalRevision)) {
    precondition('The global trade revision trails a participant inventory revision.');
  }
}

function offerRequestMatches(
  offer: RawStoredOffer,
  fromUid: string,
  toUid: string,
  quantities: SameTableTradeInventory,
): boolean {
  return offer.fromUid === fromUid && offer.toUid === toUid && sameQuantities(offer.quantities, quantities);
}

function makeCallableError(error: unknown): never {
  if (error instanceof SameTableTradePolicyError) {
    throw new HttpsError(error.code, error.message);
  }
  throw error;
}

async function handleErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return makeCallableError(error);
  }
}

function authenticatedUid(
  dependencies: SameTableTradeCallableDependencies,
  request: RawCallableRequest,
): string {
  const uid = request.auth?.uid;
  return dependencies.requireUid(typeof uid === 'string' && uid.length > 0 ? { uid } : undefined);
}

function requireSessionId(data: Data): string {
  const sessionId = safeSegment(data.sessionId, 'sessionId');
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return invalid('sessionId is invalid.');
  return sessionId;
}

function participantDocPath(sessionId: string, uid: string): string {
  return `sessions/${sessionId}/players/${uid}`;
}

function inventoryDocPath(sessionId: string, uid: string): string {
  return `sessions/${sessionId}/playerHeldResourceInventories/${uid}`;
}

function stateDocPath(sessionId: string): string {
  return `sessions/${sessionId}/sameTableTradeState/current`;
}

function offerDocPath(sessionId: string, offerId: string): string {
  return `sessions/${sessionId}/sameTableTradeOffers/${offerId}`;
}

function receiptDocPath(sessionId: string, offerId: string): string {
  return `sessions/${sessionId}/sameTableTradeReceipts/${offerId}`;
}

function ensureSessionExists(snapshot: DocumentSnapshot): void {
  if (!snapshot.exists) throw new HttpsError('not-found', 'No such session.');
}

function inventoryData(
  sessionId: string,
  playerUid: string,
  balances: SameTableTradeInventory,
  revision: number,
  baseline: InventoryRecord['baseline'],
  updatedAt: unknown,
): Data {
  return {
    type: 'player-held-resource-inventory',
    sessionId,
    playerUid,
    balances,
    revision,
    baseline,
    updatedAt,
  };
}

function cleanReceipt(value: Data): Data {
  return {
    receiptId: value.receiptId,
    offerId: value.offerId,
    fromUid: value.fromUid,
    toUid: value.toUid,
    tableId: value.tableId,
    revision: value.revision,
    quantities: value.quantities,
  };
}

export function createSameTableTradeCallables(dependencies: SameTableTradeCallableDependencies) {
  const { db } = dependencies;

  const attestPlayerHeldTokenBaseline = async (request: RawCallableRequest) => handleErrors(async () => {
    const data = requireRequestData(request.data);
    const uid = authenticatedUid(dependencies, request);
    const sessionId = requireSessionId(data);
    const targetUid = safeSegment(data.targetUid, 'targetUid');
    const instanceId = safeSegment(data.instanceId, 'instanceId');
    const attestationId = canonicalUuid(data.attestationId, 'attestationId');
    const balances = requireBalances(data.balances);
    return db.runTransaction(async (tx) => {
      await dependencies.requireFacilitatorInstance(tx, sessionId, uid, instanceId);
      const sessionSnapshot = await tx.get(db.doc(`sessions/${sessionId}`));
      const targetSnapshot = await tx.get(db.doc(participantDocPath(sessionId, targetUid)));
      const inventoryRef = db.doc(inventoryDocPath(sessionId, targetUid));
      const inventorySnapshot = await tx.get(inventoryRef);
      const stateRef = db.doc(stateDocPath(sessionId));
      const state = await readRevision(tx, stateRef, sessionId);
      ensureSessionExists(sessionSnapshot);
      if (!targetSnapshot.exists || !dependencies.isActivePlayer(targetSnapshot) ||
          targetSnapshot.get('role') !== 'player') {
        throw new HttpsError('failed-precondition', 'The baseline target must be an active player.');
      }
      if (inventorySnapshot.exists) {
        const existing = requireInventoryRecord(inventorySnapshot, sessionId, targetUid);
        if (existing.baseline.attestationId !== attestationId ||
            existing.baseline.attestedByUid !== uid || !sameBalances(existing.baseline.balances, balances)) {
          precondition('This player already has a different facilitator baseline attestation.');
        }
        if (!state.exists) precondition('The baseline exists without its trade revision state.');
        return {
          status: 'replayed' as const,
          sessionId,
          targetUid,
          attestationId,
          revision: existing.baseline.revision,
        };
      }

      const baseline = {
        attestationId,
        attestedByUid: uid,
        balances,
        revision: state.revision,
        attestedAt: dependencies.serverTimestamp(),
      };
      tx.create(inventoryRef, inventoryData(
        sessionId,
        targetUid,
        balances,
        state.revision,
        baseline,
        dependencies.serverTimestamp(),
      ));
      if (!state.exists) {
        tx.create(stateRef, {
          type: 'same-table-trade-state',
          sessionId,
          revision: 0,
          updatedAt: dependencies.serverTimestamp(),
        });
      }
      return { status: 'attested' as const, sessionId, targetUid, attestationId, revision: state.revision };
    });
  });

  const createSameTableTradeOffer = async (request: RawCallableRequest) => handleErrors(async () => {
    const data = requireRequestData(request.data);
    const uid = authenticatedUid(dependencies, request);
    const sessionId = requireSessionId(data);
    const offerId = canonicalUuid(data.offerId, 'offerId');
    const toUid = safeSegment(data.recipientUid, 'recipientUid');
    if (uid === toUid) invalid('A participant cannot trade with themself.');
    const quantities = requireQuantities(data.quantities);
    return db.runTransaction(async (tx) => {
      const sessionSnapshot = await tx.get(db.doc(`sessions/${sessionId}`));
      const offerRef = db.doc(offerDocPath(sessionId, offerId));
      const existingOfferSnapshot = await tx.get(offerRef);
      ensureSessionExists(sessionSnapshot);
      if (existingOfferSnapshot.exists) {
        const existingOffer = requireOfferData(existingOfferSnapshot.data(), sessionId, offerId);
        if (!offerRequestMatches(existingOffer, uid, toUid, quantities)) {
          precondition('This offer ID was already used for a different exact trade request.');
        }
        return { status: 'replayed' as const, sessionId, offer: publicOffer(existingOffer) };
      }

      const playersSnapshot = await tx.get(db.collection(`sessions/${sessionId}/players`)) as QuerySnapshot;
      const senderInventoryRef = db.doc(inventoryDocPath(sessionId, uid));
      const recipientInventoryRef = db.doc(inventoryDocPath(sessionId, toUid));
      const senderInventorySnapshot = await tx.get(senderInventoryRef);
      const recipientInventorySnapshot = await tx.get(recipientInventoryRef);
      const stateRef = db.doc(stateDocPath(sessionId));
      const state = await readRevision(tx, stateRef, sessionId);

      const roster = readRoster(playersSnapshot, dependencies.isActivePlayer, dependencies.shipForRole);
      const sender = requireActivePlayer(roster, uid, 'sender');
      const recipient = requireActivePlayer(roster, toUid, 'recipient');
      requireSameTableAndFleet(sender, recipient);
      const senderInventory = requireInventoryRecord(senderInventorySnapshot, sessionId, uid);
      const recipientInventory = requireInventoryRecord(recipientInventorySnapshot, sessionId, toUid);
      requireRevisionCoversInventories(state.revision, senderInventory, recipientInventory);
      for (const resource of SAME_TABLE_TRADE_RESOURCES) {
        if (senderInventory.balances[resource] < quantities[resource]) {
          precondition(`The sender does not hold enough ${resource} for this offer.`);
        }
        if (recipientInventory.balances[resource] > Number.MAX_SAFE_INTEGER - quantities[resource]) {
          precondition(`The recipient cannot safely receive the offered ${resource}.`);
        }
      }

      const offer: RawStoredOffer = {
        type: 'same-table-trade-offer',
        sessionId,
        id: offerId,
        fromUid: uid,
        toUid,
        fleetGroupId: sender.fleetGroupId as string,
        tableId: sender.tableId as string,
        revision: state.revision,
        quantities,
        status: 'pending',
      };
      tx.create(offerRef, { ...offer, createdAt: dependencies.serverTimestamp() });
      if (!state.exists) {
        tx.create(stateRef, {
          type: 'same-table-trade-state',
          sessionId,
          revision: 0,
          updatedAt: dependencies.serverTimestamp(),
        });
      }
      return { status: 'created' as const, sessionId, offer: publicOffer(offer) };
    });
  });

  const acceptSameTableTradeOffer = async (request: RawCallableRequest) => handleErrors(async () => {
    const data = requireRequestData(request.data);
    const uid = authenticatedUid(dependencies, request);
    const sessionId = requireSessionId(data);
    const offerId = canonicalUuid(data.offerId, 'offerId');
    return db.runTransaction(async (tx) => {
      const sessionSnapshot = await tx.get(db.doc(`sessions/${sessionId}`));
      const offerRef = db.doc(offerDocPath(sessionId, offerId));
      const offerSnapshot = await tx.get(offerRef);
      ensureSessionExists(sessionSnapshot);
      const storedOffer = requireOfferData(recordData(offerSnapshot, 'trade offer'), sessionId, offerId);
      if (storedOffer.toUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the intended recipient may accept this trade.');
      }

      const receiptRef = db.doc(receiptDocPath(sessionId, offerId));
      const receiptSnapshot = await tx.get(receiptRef);
      const senderInventoryRef = db.doc(inventoryDocPath(sessionId, storedOffer.fromUid));
      const recipientInventoryRef = db.doc(inventoryDocPath(sessionId, storedOffer.toUid));
      const senderInventorySnapshot = await tx.get(senderInventoryRef);
      const recipientInventorySnapshot = await tx.get(recipientInventoryRef);
      const stateRef = db.doc(stateDocPath(sessionId));
      const state = await readRevision(tx, stateRef, sessionId);

      const senderInventory = requireInventoryRecord(senderInventorySnapshot, sessionId, storedOffer.fromUid);
      const recipientInventory = requireInventoryRecord(recipientInventorySnapshot, sessionId, storedOffer.toUid);
      const serverOffer = policyOffer(storedOffer);
      if (receiptSnapshot.exists) {
        if (storedOffer.status !== 'accepted') {
          precondition('A trade receipt exists for an offer that is not marked accepted.');
        }
        const receiptData = recordData(receiptSnapshot, 'trade receipt');
        let replay;
        try {
          replay = resolveSameTableTrade({
            offer: serverOffer,
            acceptance: { actorUid: uid, offer: serverOffer },
            participants: [],
            currentRevision: state.revision,
            sourceInventory: senderInventory.balances,
            recipientInventory: recipientInventory.balances,
            existingReceipt: cleanReceipt(receiptData),
          });
        } catch (error) {
          return makeCallableError(error);
        }
        return {
          status: 'replayed' as const,
          sessionId,
          offerId,
          revision: state.revision,
          inventory: replay.recipientInventory,
          receipt: replay.receipt,
        };
      }
      if (storedOffer.status !== 'pending') {
        precondition('This offer is no longer pending and has no matching receipt.');
      }
      const playersSnapshot = await tx.get(db.collection(`sessions/${sessionId}/players`)) as QuerySnapshot;
      const roster = readRoster(playersSnapshot, dependencies.isActivePlayer, dependencies.shipForRole);
      const sender = requireActivePlayer(roster, storedOffer.fromUid, 'sender');
      const recipient = requireActivePlayer(roster, storedOffer.toUid, 'recipient');
      requireSameTableAndFleet(sender, recipient);
      requireRevisionCoversInventories(state.revision, senderInventory, recipientInventory);
      if (sender.tableId !== storedOffer.tableId || recipient.tableId !== storedOffer.tableId ||
          sender.fleetGroupId !== storedOffer.fleetGroupId || recipient.fleetGroupId !== storedOffer.fleetGroupId) {
        precondition('Both active players must remain at the offer’s current ship table and fleet group.');
      }
      const accepted = resolveSameTableTrade({
        offer: serverOffer,
        acceptance: { actorUid: uid, offer: serverOffer },
        participants: roster.map((player) => ({ uid: player.uid, active: player.active, tableId: player.tableId })),
        currentRevision: state.revision,
        sourceInventory: senderInventory.balances,
        recipientInventory: recipientInventory.balances,
      });
      if (state.revision === Number.MAX_SAFE_INTEGER) {
        precondition('The same-table trade revision cannot advance safely.');
      }
      const nextRevision = state.revision + 1;
      const timestamp = dependencies.serverTimestamp();
      tx.update(senderInventoryRef, {
        balances: accepted.sourceInventory,
        revision: nextRevision,
        updatedAt: timestamp,
      });
      tx.update(recipientInventoryRef, {
        balances: accepted.recipientInventory,
        revision: nextRevision,
        updatedAt: timestamp,
      });
      tx.update(offerRef, {
        status: 'accepted',
        acceptedByUid: uid,
        acceptedAt: timestamp,
        acceptedRevision: nextRevision,
      });
      tx.create(receiptRef, {
        type: 'same-table-trade-receipt',
        sessionId,
        ...accepted.receipt,
        committedAt: timestamp,
      });
      if (!state.exists) {
        tx.create(stateRef, {
          type: 'same-table-trade-state',
          sessionId,
          revision: nextRevision,
          updatedAt: timestamp,
        });
      } else {
        tx.update(stateRef, { revision: nextRevision, updatedAt: timestamp });
      }
      return {
        status: 'committed' as const,
        sessionId,
        offerId,
        revision: nextRevision,
        inventory: accepted.recipientInventory,
        receipt: accepted.receipt,
      };
    });
  });

  return {
    attestPlayerHeldTokenBaseline,
    createSameTableTradeOffer,
    acceptSameTableTradeOffer,
  };
}
