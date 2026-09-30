/**
 * The Player's Guide v1.1, printed p. 5, permits held resource tokens to be
 * exchanged at one ship's table and requires a capable shuttle to move them
 * between tables. Per-player digital balances, facilitator-attested baselines,
 * exact recipient consent, and receipts are the PC06-A9 product representation
 * of that rule; they are not additional printed procedures.
 */
export const SAME_TABLE_TRADE_RESOURCES = [
  'ore',
  'fuel',
  'food',
  'water',
  'materials',
  'securityTeams',
] as const;

export type SameTableTradeResource = typeof SAME_TABLE_TRADE_RESOURCES[number];
export type SameTableTradeInventory = Readonly<Record<SameTableTradeResource, number>>;
export type SameTableTradeQuantities = Readonly<Partial<Record<SameTableTradeResource, number>>>;

export interface SameTableTradeOffer {
  readonly id: string;
  readonly fromUid: string;
  readonly toUid: string;
  readonly tableId: string;
  readonly revision: number;
  readonly quantities: SameTableTradeQuantities;
}

interface CanonicalSameTableTradeOffer extends Omit<SameTableTradeOffer, 'quantities'> {
  readonly quantities: SameTableTradeInventory;
}

export interface SameTableTradeParticipant {
  readonly uid: string;
  readonly active: boolean;
  readonly tableId: string | null;
}

export interface SameTableTradeReceipt {
  /** Stable offer identity; this resolver does not generate timestamps or randomness. */
  readonly receiptId: string;
  readonly offerId: string;
  readonly fromUid: string;
  readonly toUid: string;
  readonly tableId: string;
  readonly revision: number;
  readonly quantities: SameTableTradeInventory;
}

export interface SameTableTradeInput {
  /** The current server-stored offer, not a client-authored replacement. */
  readonly offer: unknown;
  /** The server-stored recipient acceptance and the offer snapshot it accepted. */
  readonly acceptance: unknown;
  /** Current session membership and each participant's ship-table location. */
  readonly participants: unknown;
  /** Revision of the trade state against which the offer was proposed. */
  readonly currentRevision: unknown;
  /** Server-read personal balance belonging to offer.fromUid. */
  readonly sourceInventory: unknown;
  /** Server-read personal balance belonging to offer.toUid. */
  readonly recipientInventory: unknown;
  /** A prior transaction receipt for this offer, when replaying a committed request. */
  readonly existingReceipt?: unknown;
}

export interface SameTableTradeResult {
  readonly status: 'committed' | 'replayed';
  readonly sourceInventory: SameTableTradeInventory;
  readonly recipientInventory: SameTableTradeInventory;
  readonly receipt: SameTableTradeReceipt;
}

export type SameTableTradePolicyErrorCode =
  | 'invalid-argument'
  | 'permission-denied'
  | 'failed-precondition';

export class SameTableTradePolicyError extends Error {
  constructor(
    readonly code: SameTableTradePolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SameTableTradePolicyError';
  }
}

const RESOURCE_SET = new Set<string>(SAME_TABLE_TRADE_RESOURCES);
const OFFER_KEYS = ['id', 'fromUid', 'toUid', 'tableId', 'revision', 'quantities'];
const ACCEPTANCE_KEYS = ['actorUid', 'offer'];
const PARTICIPANT_KEYS = ['uid', 'active', 'tableId'];
const RECEIPT_KEYS = [
  'receiptId', 'offerId', 'fromUid', 'toUid', 'tableId', 'revision', 'quantities',
];

function fail(code: SameTableTradePolicyErrorCode, message: string): never {
  throw new SameTableTradePolicyError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function nonEmptyIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function emptyInventory(): Record<SameTableTradeResource, number> {
  return {
    ore: 0,
    fuel: 0,
    food: 0,
    water: 0,
    materials: 0,
    securityTeams: 0,
  };
}

function requireQuantities(value: unknown): SameTableTradeInventory {
  if (!isRecord(value)) {
    return fail('invalid-argument', 'The trade offer quantities are malformed.');
  }

  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !RESOURCE_SET.has(key))) {
    return fail('invalid-argument', 'A trade offer must name at least one supported resource quantity.');
  }

  const quantities = emptyInventory();
  for (const key of keys) {
    const amount = value[key];
    if (!safeNonNegativeInteger(amount)) {
      return fail('invalid-argument', 'Trade quantities must be safe, non-negative whole numbers.');
    }
    quantities[key as SameTableTradeResource] = amount;
  }

  if (Object.values(quantities).every((amount) => amount === 0)) {
    return fail('invalid-argument', 'A trade offer must move at least one token.');
  }
  return quantities;
}

function requireInventory(value: unknown, label: string): SameTableTradeInventory {
  if (!isRecord(value) || !hasExactKeys(value, SAME_TABLE_TRADE_RESOURCES)) {
    return fail('invalid-argument', `The ${label} personal inventory is malformed.`);
  }

  const inventory = emptyInventory();
  for (const resource of SAME_TABLE_TRADE_RESOURCES) {
    const amount = value[resource];
    if (!safeNonNegativeInteger(amount)) {
      return fail('invalid-argument', `The ${label} personal inventory has an invalid ${resource} balance.`);
    }
    inventory[resource] = amount;
  }
  return inventory;
}

function requireOffer(value: unknown): CanonicalSameTableTradeOffer {
  if (!isRecord(value) || !hasExactKeys(value, OFFER_KEYS) ||
      !nonEmptyIdentity(value.id) || !nonEmptyIdentity(value.fromUid) ||
      !nonEmptyIdentity(value.toUid) || !nonEmptyIdentity(value.tableId) ||
      !safeNonNegativeInteger(value.revision)) {
    return fail('invalid-argument', 'The same-table trade offer is malformed.');
  }
  if (value.fromUid === value.toUid) {
    return fail('invalid-argument', 'A participant cannot trade with themself.');
  }

  return {
    id: value.id,
    fromUid: value.fromUid,
    toUid: value.toUid,
    tableId: value.tableId,
    revision: value.revision,
    quantities: requireQuantities(value.quantities),
  };
}

function sameOffer(left: CanonicalSameTableTradeOffer, right: CanonicalSameTableTradeOffer): boolean {
  return left.id === right.id &&
    left.fromUid === right.fromUid &&
    left.toUid === right.toUid &&
    left.tableId === right.tableId &&
    left.revision === right.revision &&
    SAME_TABLE_TRADE_RESOURCES.every((resource) =>
      left.quantities[resource] === right.quantities[resource]);
}

function requireAcceptance(value: unknown): { actorUid: string; offer: CanonicalSameTableTradeOffer } {
  if (!isRecord(value) || !hasExactKeys(value, ACCEPTANCE_KEYS) || !nonEmptyIdentity(value.actorUid)) {
    return fail('invalid-argument', 'The recipient acceptance is malformed.');
  }
  return { actorUid: value.actorUid, offer: requireOffer(value.offer) };
}

function requireParticipants(value: unknown): readonly SameTableTradeParticipant[] {
  if (!Array.isArray(value)) {
    return fail('invalid-argument', 'Current trade participants are malformed.');
  }

  const seen = new Set<string>();
  const participants: SameTableTradeParticipant[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, PARTICIPANT_KEYS) ||
        !nonEmptyIdentity(entry.uid) || typeof entry.active !== 'boolean' ||
        (entry.tableId !== null && !nonEmptyIdentity(entry.tableId))) {
      return fail('invalid-argument', 'Current trade participants are malformed.');
    }
    if (seen.has(entry.uid)) {
      return fail('invalid-argument', 'Current trade participants contain a duplicate identity.');
    }
    seen.add(entry.uid);
    participants.push({ uid: entry.uid, active: entry.active, tableId: entry.tableId });
  }
  return participants;
}

function requireReceipt(value: unknown, offer: CanonicalSameTableTradeOffer): SameTableTradeReceipt {
  if (!isRecord(value) || !hasExactKeys(value, RECEIPT_KEYS) ||
      !nonEmptyIdentity(value.receiptId) || !nonEmptyIdentity(value.offerId) ||
      !nonEmptyIdentity(value.fromUid) || !nonEmptyIdentity(value.toUid) ||
      !nonEmptyIdentity(value.tableId) || !safeNonNegativeInteger(value.revision)) {
    return fail('invalid-argument', 'The existing trade receipt is malformed.');
  }

  const quantities = requireQuantities(value.quantities);
  if (value.receiptId !== offer.id || value.offerId !== offer.id ||
      value.fromUid !== offer.fromUid || value.toUid !== offer.toUid ||
      value.tableId !== offer.tableId || value.revision !== offer.revision ||
      !SAME_TABLE_TRADE_RESOURCES.every((resource) => quantities[resource] === offer.quantities[resource])) {
    return fail('failed-precondition', 'The existing receipt does not match this exact trade offer.');
  }

  return {
    receiptId: value.receiptId,
    offerId: value.offerId,
    fromUid: value.fromUid,
    toUid: value.toUid,
    tableId: value.tableId,
    revision: value.revision,
    quantities,
  };
}

function requireCurrentParticipants(
  participantsValue: unknown,
  offer: CanonicalSameTableTradeOffer,
): void {
  const participants = requireParticipants(participantsValue);
  const source = participants.find(({ uid }) => uid === offer.fromUid);
  const recipient = participants.find(({ uid }) => uid === offer.toUid);
  if (!source || !recipient || !source.active || !recipient.active) {
    return fail('failed-precondition', 'Both trade participants must remain active in the session.');
  }
  if (source.tableId !== offer.tableId || recipient.tableId !== offer.tableId) {
    return fail('failed-precondition', 'Both active participants must remain at the offer’s same ship table.');
  }
}

function makeReceipt(offer: CanonicalSameTableTradeOffer): SameTableTradeReceipt {
  return {
    receiptId: offer.id,
    offerId: offer.id,
    fromUid: offer.fromUid,
    toUid: offer.toUid,
    tableId: offer.tableId,
    revision: offer.revision,
    quantities: { ...offer.quantities },
  };
}

/**
 * Resolve one server-read offer and its exact recipient acceptance. The caller
 * owns the transaction, actor authentication, facilitator baseline attestation,
 * persistence, and any public/member-safe projection. A thrown policy error
 * means the caller must make no writes. Existing matching receipts are returned
 * unchanged as exact replays before rechecking mutable membership or revision.
 */
export function resolveSameTableTrade(input: SameTableTradeInput): SameTableTradeResult {
  const offer = requireOffer(input.offer);
  const acceptance = requireAcceptance(input.acceptance);
  if (acceptance.actorUid !== offer.toUid) {
    return fail('permission-denied', 'Only the intended recipient may accept a same-table trade.');
  }
  if (!sameOffer(offer, acceptance.offer)) {
    return fail('failed-precondition', 'The recipient must accept the exact current offer.');
  }

  const sourceInventory = requireInventory(input.sourceInventory, 'source');
  const recipientInventory = requireInventory(input.recipientInventory, 'recipient');

  if (input.existingReceipt !== undefined) {
    const receipt = requireReceipt(input.existingReceipt, offer);
    return {
      status: 'replayed',
      sourceInventory,
      recipientInventory,
      receipt,
    };
  }

  if (!safeNonNegativeInteger(input.currentRevision) || input.currentRevision !== offer.revision) {
    return fail('failed-precondition', 'The trade offer is stale; refresh before accepting it.');
  }
  requireCurrentParticipants(input.participants, offer);

  for (const resource of SAME_TABLE_TRADE_RESOURCES) {
    const amount = offer.quantities[resource];
    if (sourceInventory[resource] < amount) {
      return fail('failed-precondition', `The source participant no longer holds enough ${resource}.`);
    }
    if (recipientInventory[resource] > Number.MAX_SAFE_INTEGER - amount) {
      return fail('failed-precondition', `The recipient cannot safely receive the offered ${resource}.`);
    }
  }

  const nextSourceInventory = emptyInventory();
  const nextRecipientInventory = emptyInventory();
  for (const resource of SAME_TABLE_TRADE_RESOURCES) {
    const amount = offer.quantities[resource];
    nextSourceInventory[resource] = sourceInventory[resource] - amount;
    nextRecipientInventory[resource] = recipientInventory[resource] + amount;
  }

  return {
    status: 'committed',
    sourceInventory: nextSourceInventory,
    recipientInventory: nextRecipientInventory,
    receipt: makeReceipt(offer),
  };
}
