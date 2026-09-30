import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { SameTableTradeBalances, SameTableTradeAmounts, SameTableTradeResourceId } from '@/components/SameTableTradePanel';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { db } from './firestore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

const RESOURCE_IDS: readonly SameTableTradeResourceId[] = [
  'ore', 'fuel', 'food', 'water', 'materials', 'securityTeams',
];

export interface SameTableTradeInventoryView {
  readonly revision: number;
  readonly balances: SameTableTradeBalances;
}

export interface SameTableTradeOfferView {
  readonly id: string;
  readonly fromUid: string;
  readonly toUid: string;
  readonly tableId: string;
  readonly revision: number;
  readonly quantities: SameTableTradeAmounts;
  readonly status: 'pending' | 'accepted';
}

export interface SameTableTradeOffersView {
  readonly incoming: readonly SameTableTradeOfferView[];
  readonly outgoing: readonly SameTableTradeOfferView[];
}

export interface SameTableTradeReceiptView {
  readonly receiptId: string;
  readonly offerId: string;
  readonly fromUid: string;
  readonly toUid: string;
  readonly tableId: string;
  readonly revision: number;
  readonly quantities: SameTableTradeBalances;
}

export interface SameTableTradeCommandReply {
  readonly status: string;
  readonly sessionId: string;
  readonly offerId?: string;
  readonly revision?: number;
  /** The callable returns only the authenticated recipient's own balance. */
  readonly inventory?: SameTableTradeInventoryView;
  readonly receipt?: SameTableTradeReceiptView;
  readonly targetUid?: string;
  readonly attestationId?: string;
  readonly offer?: SameTableTradeOfferView;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseBalances(value: unknown): SameTableTradeBalances | null {
  if (!isRecord(value) || Object.keys(value).length !== RESOURCE_IDS.length ||
      RESOURCE_IDS.some((resource) => !Object.hasOwn(value, resource) || !safeInteger(value[resource]))) {
    return null;
  }
  return Object.fromEntries(RESOURCE_IDS.map((resource) => [resource, value[resource]])) as SameTableTradeBalances;
}

function parseInventory(
  value: unknown,
  sessionId: string,
  uid: string,
): SameTableTradeInventoryView | null {
  if (!isRecord(value) || value.type !== 'player-held-resource-inventory' ||
      value.sessionId !== sessionId || value.playerUid !== uid || !safeInteger(value.revision)) return null;
  const baseline = value.baseline;
  if (!isRecord(baseline) || !isCanonicalUuid(baseline.attestationId) ||
      !isIdentity(baseline.attestedByUid) || !safeInteger(baseline.revision) ||
      baseline.revision > value.revision || !parseBalances(baseline.balances)) return null;
  const balances = parseBalances(value.balances);
  return balances ? { revision: value.revision as number, balances } : null;
}

function parseInventoryReply(value: unknown, uid: string): SameTableTradeInventoryView | null {
  if (!isRecord(value) || value.playerUid !== uid || !safeInteger(value.revision, 1)) return null;
  const balances = parseBalances(value.balances);
  return balances ? { revision: value.revision as number, balances } : null;
}

function parseReceipt(value: unknown, offerId: string): SameTableTradeReceiptView | null {
  if (!isRecord(value) || value.receiptId !== offerId || value.offerId !== offerId ||
      !isIdentity(value.fromUid) || !isIdentity(value.toUid) || value.fromUid === value.toUid ||
      !isIdentity(value.tableId) || !safeInteger(value.revision, 1)) return null;
  const quantities = parseBalances(value.quantities);
  return quantities ? {
    receiptId: offerId,
    offerId,
    fromUid: value.fromUid,
    toUid: value.toUid,
    tableId: value.tableId,
    revision: value.revision as number,
    quantities,
  } : null;
}

function parseQuantities(value: unknown): SameTableTradeAmounts | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.some(([resource, amount]) =>
    !RESOURCE_IDS.includes(resource as SameTableTradeResourceId) || !safeInteger(amount, 1))) return null;
  return Object.fromEntries(entries) as SameTableTradeAmounts;
}

function parseOffer(
  value: unknown,
  id: string,
  sessionId: string,
  uid: string,
  fleetGroupId: string,
  direction: 'incoming' | 'outgoing',
): SameTableTradeOfferView | null {
  if (!isRecord(value) || value.type !== 'same-table-trade-offer' ||
      value.sessionId !== sessionId || value.id !== id || value.fleetGroupId !== fleetGroupId ||
      !isIdentity(value.fromUid) || !isIdentity(value.toUid) || value.fromUid === value.toUid ||
      !isIdentity(value.tableId) || !safeInteger(value.revision) ||
      (value.status !== 'pending' && value.status !== 'accepted') ||
      (direction === 'incoming' ? value.toUid !== uid : value.fromUid !== uid)) return null;
  const quantities = parseQuantities(value.quantities);
  return quantities ? {
    id,
    fromUid: value.fromUid,
    toUid: value.toUid,
    tableId: value.tableId,
    revision: value.revision as number,
    quantities,
    status: value.status,
  } : null;
}

/** Read only this player's attested counts. Cached snapshots never seed gameplay authority. */
export function subscribeSameTableTradeInventory(
  sessionId: string,
  uid: string,
  onInventory: (inventory: SameTableTradeInventoryView | null) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  let active = true;
  onInventory(null);
  const unsubscribe = onSnapshot(
    doc(db(), `sessions/${sessionId}/playerHeldResourceInventories/${uid}`),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!active || snapshot.metadata?.fromCache === true) return;
      if (!snapshot.exists()) {
        onInventory(null);
        return;
      }
      const inventory = parseInventory(snapshot.data(), sessionId, uid);
      onInventory(inventory);
      if (!inventory) onError();
    },
    () => {
      if (!active) return;
      onInventory(null);
      onError();
    },
  );
  return () => {
    active = false;
    unsubscribe();
  };
}

/** Listen to only offers whose sender or recipient is this player in the current fleet group. */
export function subscribeSameTableTradeOffers(
  sessionId: string,
  uid: string,
  fleetGroupId: string,
  onOffers: (offers: SameTableTradeOffersView) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  let active = true;
  const outgoingRows = new Map<string, SameTableTradeOfferView>();
  const incomingRows = new Map<string, SameTableTradeOfferView>();
  const ready = [false, false];
  onOffers({ incoming: [], outgoing: [] });
  if (!isIdentity(sessionId) || !isIdentity(uid) || !isIdentity(fleetGroupId)) {
    return () => { active = false; };
  }

  function publish(): void {
    if (!active || !ready.every(Boolean)) return;
    onOffers({
      incoming: [...incomingRows.values()].filter((offer) => offer.status === 'pending')
        .sort((left, right) => left.id.localeCompare(right.id)),
      outgoing: [...outgoingRows.values()]
        .sort((left, right) => left.id.localeCompare(right.id)),
    });
  }

  function listen(direction: 'incoming' | 'outgoing', index: number): Unsubscribe {
    const field = direction === 'incoming' ? 'toUid' : 'fromUid';
    const target = query(
      collection(db(), `sessions/${sessionId}/sameTableTradeOffers`),
      where('type', '==', 'same-table-trade-offer'),
      where('sessionId', '==', sessionId),
      where('fleetGroupId', '==', fleetGroupId),
      where(field, '==', uid),
    );
    return onSnapshot(
      target,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active || snapshot.metadata?.fromCache === true) return;
        const rows = direction === 'incoming' ? incomingRows : outgoingRows;
        rows.clear();
        for (const offerDocument of snapshot.docs) {
          const offer = parseOffer(offerDocument.data(), offerDocument.id, sessionId, uid, fleetGroupId, direction);
          if (offer) rows.set(offer.id, offer);
        }
        ready[index] = true;
        publish();
      },
      () => {
        if (!active) return;
        active = false;
        onOffers({ incoming: [], outgoing: [] });
        onError();
      },
    );
  }

  const stopOutgoing = listen('outgoing', 0);
  const stopIncoming = listen('incoming', 1);
  return () => {
    active = false;
    stopOutgoing();
    stopIncoming();
  };
}

function commandContext(expectedRole: 'gm' | 'player') {
  const state = useSessionStore.getState();
  const { session, me } = state;
  if (!session || !me || me.sessionId !== session.id || me.role !== expectedRole) {
    throw new Error(expectedRole === 'gm'
      ? 'Claim an active facilitator before recording player-held token counts.'
      : 'Join as an active player before trading held tokens.');
  }
  requireFreshSessionAuthority('Reconnect before changing player-held token counts.');
  return { state, session, me };
}

function validBalances(value: unknown): value is SameTableTradeBalances {
  return parseBalances(value) !== null;
}

function parseCommandReply(value: unknown, sessionId: string, status: readonly string[]): SameTableTradeCommandReply {
  if (!isRecord(value) || !status.includes(String(value.status)) || value.sessionId !== sessionId) {
    throw new Error('The server returned an invalid same-table trade result. Refresh and try again.');
  }
  if (Object.hasOwn(value, 'sourceInventory') || Object.hasOwn(value, 'recipientInventory')) {
    throw new Error('The server returned private balances outside this player’s own inventory.');
  }
  return value as unknown as SameTableTradeCommandReply;
}

/** Record an existing tabletop count once under the active facilitator instance. */
export async function attestPlayerHeldTokenBaseline(
  targetUid: string,
  balances: SameTableTradeBalances,
  attestationId: string,
): Promise<SameTableTradeCommandReply> {
  const { session, state } = commandContext('gm');
  if (!state.gmInstance || state.gmInstance.uid !== state.me?.uid ||
      !isIdentity(targetUid) || !isCanonicalUuid(attestationId) || !validBalances(balances)) {
    throw new Error('The facilitator token-count attestation is invalid.');
  }
  const payload = { sessionId: session.id, instanceId: state.gmInstance.id, targetUid, balances, attestationId };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'attestPlayerHeldTokenBaseline');
  const reply = parseCommandReply((await call(payload)).data, session.id, ['attested', 'replayed']);
  if (reply.targetUid !== targetUid || reply.attestationId !== attestationId || !safeInteger(reply.revision)) {
    throw new Error('The server returned a mismatched same-table baseline result.');
  }
  return reply;
}

/** Create one exact sender-proposed offer with a stable ID for safe retry. */
export async function createSameTableTradeOffer(
  offerId: string,
  recipientUid: string,
  quantities: SameTableTradeAmounts,
): Promise<SameTableTradeCommandReply> {
  const { session } = commandContext('player');
  if (!isCanonicalUuid(offerId) || !isIdentity(recipientUid) || !parseQuantities(quantities)) {
    throw new Error('The same-table offer is invalid.');
  }
  const payload = { sessionId: session.id, offerId, recipientUid, quantities };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'createSameTableTradeOffer');
  const reply = parseCommandReply((await call(payload)).data, session.id, ['created', 'replayed']);
  if (!isRecord(reply.offer) || reply.offer.id !== offerId) {
    throw new Error('The server returned a mismatched same-table offer.');
  }
  return reply;
}

/** Accept the exact immutable offer ID addressed to the current player. */
export async function acceptSameTableTradeOffer(offerId: string): Promise<SameTableTradeCommandReply> {
  const { session, me } = commandContext('player');
  if (!isCanonicalUuid(offerId)) throw new Error('The same-table offer identity is invalid.');
  const payload = { sessionId: session.id, offerId };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'acceptSameTableTradeOffer');
  const reply = parseCommandReply((await call(payload)).data, session.id, ['committed', 'replayed']);
  const inventoryValue = reply.inventory;
  const inventory = parseInventoryReply(inventoryValue, me.uid);
  const receipt = parseReceipt(reply.receipt, offerId);
  if (reply.offerId !== offerId || !safeInteger(reply.revision, 1) || !inventory || !receipt ||
      inventory.revision > reply.revision || receipt.toUid !== me.uid) {
    throw new Error('The server returned a mismatched same-table acceptance.');
  }
  return { ...reply, inventory, receipt };
}
