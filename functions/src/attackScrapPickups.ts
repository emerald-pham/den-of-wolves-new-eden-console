import { isResourceShipId } from './resources';
import { isWolfCalculationReceipt } from './wolfCombatMath';
import { wolfDamageScrapOpportunities } from './wolfAttackAftermath';

/**
 * A qualifying attack Scrap pickup that its attack did not collect before the
 * next attack replaced the current attack state. The printed Capybara rule
 * gives the damaged ship one Scrap with no stated expiry. Owner decision,
 * 2026-11-05: an uncollected pickup persists until collected, exactly once, so
 * the server keeps it here until an entitled shuttle collects it.
 */
export type AttackScrapPickup = Readonly<{ attackId: string; turn: number; destroyed: boolean }>;
/** Keyed by the damaged ship so the member session projection scopes it to that ship's group. */
export type AttackScrapPickupLedger = Readonly<Record<string, readonly AttackScrapPickup[]>>;

type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickup(value: unknown): AttackScrapPickup | undefined {
  if (!record(value) || Object.keys(value).length !== 3 || typeof value.attackId !== 'string' ||
      !/^[\w.:-]{1,160}$/.test(value.attackId) || !Number.isSafeInteger(value.turn) ||
      (value.turn as number) < 1 || typeof value.destroyed !== 'boolean') return undefined;
  return { attackId: value.attackId, turn: value.turn as number, destroyed: value.destroyed };
}

/** An absent ledger is empty; any malformed or duplicated entry rejects the whole ledger. */
export function parseAttackScrapPickups(value: unknown): AttackScrapPickupLedger | undefined {
  if (value === undefined) return {};
  if (!record(value)) return undefined;
  const ledger: Record<string, AttackScrapPickup[]> = {};
  for (const [shipId, entries] of Object.entries(value)) {
    if (!isResourceShipId(shipId) || !Array.isArray(entries) || entries.length < 1) return undefined;
    const parsed = entries.map(pickup);
    if (parsed.some((entry) => entry === undefined) ||
        new Set(parsed.map((entry) => entry!.attackId)).size !== parsed.length) return undefined;
    ledger[shipId] = parsed as AttackScrapPickup[];
  }
  return ledger;
}

/**
 * Add the finished attack's uncollected threshold pickups. An attack without a
 * resolved combat damage receipt never offered a collectible pickup.
 */
export function carryForwardAttackScrapPickups(
  ledger: AttackScrapPickupLedger,
  previousState: unknown,
): AttackScrapPickupLedger {
  if (!record(previousState) || previousState.status !== 'resolved' ||
      typeof previousState.attackId !== 'string' || !Number.isSafeInteger(previousState.turn) ||
      (previousState.turn as number) < 1 || !isWolfCalculationReceipt(previousState.calculationReceipt)) {
    return ledger;
  }
  const attackId = previousState.attackId;
  const turn = previousState.turn as number;
  const fleetDamage = (previousState.calculationReceipt as unknown as RecordValue).fleetDamage as unknown[];
  if (fleetDamage.some((row) => !record(row) || !record(row.state) || typeof row.state.destroyed !== 'boolean')) {
    return ledger;
  }
  let opportunities: ReturnType<typeof wolfDamageScrapOpportunities>;
  try {
    opportunities = wolfDamageScrapOpportunities(attackId, (fleetDamage as RecordValue[]).map((row) => ({
      target: row.target as string, amount: row.amount as number,
    })));
  } catch {
    return ledger;
  }
  const aftermath = record(previousState.aftermath) ? previousState.aftermath : {};
  const claims = record(aftermath.scrapClaims) ? aftermath.scrapClaims : {};
  const next: Record<string, readonly AttackScrapPickup[]> = { ...ledger };
  for (const { shipId } of opportunities) {
    if (claims[shipId] !== undefined || !isResourceShipId(shipId)) continue;
    const existing = next[shipId] ?? [];
    if (existing.some((entry) => entry.attackId === attackId)) continue;
    const row = (fleetDamage as RecordValue[]).find((entry) => entry.target === shipId)!;
    next[shipId] = [...existing, { attackId, turn, destroyed: (row.state as RecordValue).destroyed as boolean }];
  }
  return next;
}

/** Remove one carried pickup, or return undefined when it is not (or no longer) pending. */
export function takeAttackScrapPickup(
  ledger: AttackScrapPickupLedger,
  shipId: string,
  attackId: string,
): { pickup: AttackScrapPickup; ledger: AttackScrapPickupLedger } | undefined {
  const entries = ledger[shipId] ?? [];
  const found = entries.find((entry) => entry.attackId === attackId);
  if (!found) return undefined;
  const remaining = entries.filter((entry) => entry !== found);
  const next: Record<string, readonly AttackScrapPickup[]> = { ...ledger };
  if (remaining.length) next[shipId] = remaining;
  else delete next[shipId];
  return { pickup: found, ledger: next };
}

/**
 * Coordinator ruling (C3.2, 2026-11-05, extending the owner's C3 decision): a
 * pending pickup whose ship is destroyed after its attack becomes
 * destroyed-status, so only the shuttle retained from that ship can collect it.
 * Derived from the authoritative ship damage on every read and write, so every
 * destruction path is covered without each one rewriting this ledger.
 */
export function withCurrentShipDestruction(
  ledger: AttackScrapPickupLedger,
  shipDamage: unknown,
): AttackScrapPickupLedger {
  let changed = false;
  const next: Record<string, readonly AttackScrapPickup[]> = {};
  for (const [shipId, entries] of Object.entries(ledger)) {
    const destroyed = shipIsDestroyed(shipDamage, shipId);
    next[shipId] = entries.map((entry) => {
      if (!destroyed || entry.destroyed) return entry;
      changed = true;
      return { ...entry, destroyed: true };
    });
  }
  return changed ? next : ledger;
}

/** Whether the authoritative damage map currently records the ship as destroyed. */
export function shipIsDestroyed(shipDamage: unknown, shipId: string): boolean {
  if (!record(shipDamage)) return false;
  const damage = shipDamage[shipId];
  return record(damage) && damage.destroyed === true;
}
