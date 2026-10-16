/**
 * The printed capacity that survives a fleet ship's destruction.
 *
 * The small ships and the approaching vessel do not have an independent
 * crew/passenger capacity printed on their sheets, so they deliberately do
 * not appear in this table.  Callers must not turn their population into a
 * fabricated pod capacity.
 */
export interface EscapePodCapacity {
  readonly crewCapacity: number;
  readonly passengerCapacity: number;
  readonly podCapacity: number;
}

export const PRINTED_ESCAPE_POD_CAPACITIES: Readonly<Record<string, EscapePodCapacity>> = Object.freeze({
  aegis: { crewCapacity: 3_000, passengerCapacity: 100, podCapacity: 3_100 },
  dione: { crewCapacity: 4_000, passengerCapacity: 12_000, podCapacity: 16_000 },
  icebreaker: { crewCapacity: 10_000, passengerCapacity: 100, podCapacity: 10_100 },
  shepherd: { crewCapacity: 4_000, passengerCapacity: 4_000, podCapacity: 8_000 },
  quellon: { crewCapacity: 6_500, passengerCapacity: 10, podCapacity: 6_510 },
  'refinery-124': { crewCapacity: 5_000, passengerCapacity: 0, podCapacity: 5_000 },
  capybara: { crewCapacity: 5_000, passengerCapacity: 500, podCapacity: 5_500 },
});

export function escapePodCapacityForShip(shipId: string): EscapePodCapacity | undefined {
  return PRINTED_ESCAPE_POD_CAPACITIES[shipId];
}

/** The stable member-readable event id for a ship's one catastrophe. */
export function catastropheEventIdForShip(shipId: string): string {
  return `damage-destroyed-${shipId}`;
}

/** Terminal provenance for the owner's never-assigned craft ruling. */
export interface UnassignedCraftHostLoss {
  readonly status: 'lost';
  readonly destroyedHostShipId: string;
  readonly sourceId: string;
  readonly cycle: number;
  readonly lostAt: string;
  readonly hostRepair?: CraftHostRepair;
}
export interface CraftHostRepair {
  readonly sourceId: string;
  readonly requestId: string;
  readonly revision: number;
  readonly repairedAt: string;
}
export function parseCraftHostRepair(value: unknown, sourceId: string, lostAt: string): CraftHostRepair | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== 4 || Object.keys(raw).some(key => !['sourceId', 'requestId', 'revision', 'repairedAt'].includes(key)) ||
      raw.sourceId !== sourceId || typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || typeof raw.repairedAt !== 'string' ||
      !Number.isFinite(Date.parse(raw.repairedAt)) || Date.parse(raw.repairedAt) < Date.parse(lostAt)) return undefined;
  return raw as unknown as CraftHostRepair;
}

/** A repair acknowledgement is authored only by the ordinary correction after
 * reading the original catastrophe. It never restores the terminal craft. */
export function craftHostLossHasCurrentProof(loss: UnassignedCraftHostLoss, damage: unknown, revisions: unknown): boolean {
  if (!damage || typeof damage !== 'object' || Array.isArray(damage)) return false;
  const host = (damage as Record<string, unknown>)[loss.destroyedHostShipId];
  if (!host || typeof host !== 'object' || Array.isArray(host)) return false;
  const destroyed = (host as Record<string, unknown>).destroyed;
  if (destroyed === true) return true;
  const revision = revisions && typeof revisions === 'object' && !Array.isArray(revisions)
    ? (revisions as Record<string, unknown>)[loss.destroyedHostShipId] : undefined;
  return destroyed === false && !!loss.hostRepair && Number.isSafeInteger(revision) && Number(revision) >= loss.hostRepair.revision;
}
export function parseUnassignedCraftHostLoss(value: unknown): UnassignedCraftHostLoss | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== (Object.hasOwn(raw, 'hostRepair') ? 6 : 5) || Object.keys(raw).some(key =>
    !['status', 'destroyedHostShipId', 'sourceId', 'cycle', 'lostAt', 'hostRepair'].includes(key)) ||
    raw.status !== 'lost' || typeof raw.destroyedHostShipId !== 'string' ||
    !escapePodCapacityForShip(raw.destroyedHostShipId) ||
    raw.sourceId !== catastropheEventIdForShip(raw.destroyedHostShipId) ||
    !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 1 ||
    typeof raw.lostAt !== 'string' || !Number.isFinite(Date.parse(raw.lostAt)) ||
    Object.hasOwn(raw, 'hostRepair') && !parseCraftHostRepair(raw.hostRepair, String(raw.sourceId), String(raw.lostAt))) return undefined;
  return raw as unknown as UnassignedCraftHostLoss;
}

export interface DestructionTransition {
  readonly eventId: string;
  readonly capacity: EscapePodCapacity;
  /** True only when this transaction must create the durable catastrophe. */
  readonly createEvent: boolean;
}

/**
 * Decide the one destruction transition from the transaction's current state.
 *
 * A missing old catastrophe record is repaired without incrementing any game
 * revision.  Once the stable event exists, repeated draws are a read-only
 * terminal result and cannot create another catastrophe.
 */
export function destructionTransition(
  shipId: string,
  alreadyDestroyed: boolean,
  catastropheEventExists: boolean,
): DestructionTransition {
  const capacity = escapePodCapacityForShip(shipId);
  if (!capacity) throw new Error('This vessel has no printed escape-pod capacity.');
  return {
    eventId: catastropheEventIdForShip(shipId),
    capacity,
    createEvent: !alreadyDestroyed || !catastropheEventExists,
  };
}
