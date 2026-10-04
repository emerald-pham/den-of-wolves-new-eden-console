import { fleetGroupRecord, type FleetGroupRecord } from './fleetGroups';
import { wolfShipForId, type WolfShipId } from './wolfShipCatalog';

export type WolfThreatSiteCode = 'L' | 'M' | 'P';
export type WolfCommanderRange = 'long' | 'medium' | 'short';

export interface WolfThreatComposition {
  readonly siteCode: WolfThreatSiteCode;
  readonly shipIds: readonly WolfShipId[];
  readonly counts: Readonly<Record<WolfShipId, number>>;
  readonly battleStationCount: number;
  readonly otherDamageCapacity: number;
  readonly damageCapacity: number;
}

export interface WolfFleetGroupIdentity {
  readonly id: string;
  readonly vesselIds: readonly string[];
  readonly memberUids: readonly string[];
}

const THREAT_ENTRY_REQUIREMENTS: Readonly<Record<WolfThreatSiteCode, {
  readonly battleStations: number;
  readonly otherCapacity: number;
}>> = {
  L: { battleStations: 1, otherCapacity: 20 },
  M: { battleStations: 2, otherCapacity: 25 },
  P: { battleStations: 1, otherCapacity: 20 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read pursuit from exactly the targeted group; no fleet-wide aggregate is valid. */
export function wolfThreatPursuit(
  targetGroupId: string,
  values: Readonly<Record<string, number>>,
  rawGroups: readonly (WolfFleetGroupIdentity | unknown)[],
): number {
  if (!/^fleet-[1-9][0-9]*$/.test(targetGroupId)) {
    throw new Error('A target fleet group is required for this Wolf threat.');
  }
  const groups = rawGroups.map((value) => {
    if (!isRecord(value)) return undefined;
    return fleetGroupRecord(value) as FleetGroupRecord | undefined;
  });
  if (groups.some((group) => group === undefined) || new Set(groups.map((group) => group?.id)).size !== groups.length) {
    throw new Error('The target fleet group authority is malformed.');
  }
  if (!groups.some((group) => group?.id === targetGroupId)) {
    throw new Error('The target fleet group does not exist.');
  }
  const pursuit = values[targetGroupId];
  if (typeof pursuit !== 'number' || !Number.isSafeInteger(pursuit) || pursuit < 0 || pursuit > 10) {
    throw new Error('The target fleet group pursuit authority is unavailable.');
  }
  return pursuit;
}

/** Validate the printed entry force without counting Battlestations as other ships. */
export function wolfThreatComposition(
  siteCode: WolfThreatSiteCode,
  shipIds: readonly string[],
): WolfThreatComposition {
  if (!(siteCode in THREAT_ENTRY_REQUIREMENTS) || !Array.isArray(shipIds) || shipIds.length === 0 || shipIds.length > 24) {
    throw new Error('Invalid Wolf threat entry attack composition.');
  }
  const counts: Record<WolfShipId, number> = {
    'wolf-fighter-wing': 0,
    'wolf-assault-transport': 0,
    'wolf-destroyer': 0,
    'wolf-cruiser': 0,
    'wolf-strikecarrier': 0,
    'wolf-battlestation': 0,
  };
  const canonicalIds: WolfShipId[] = [];
  let damageCapacity = 0;
  let otherDamageCapacity = 0;
  for (const shipId of shipIds) {
    const ship = typeof shipId === 'string' ? wolfShipForId(shipId) : undefined;
    if (!ship) throw new Error('The Wolf threat composition contains an unknown ship.');
    canonicalIds.push(ship.id);
    counts[ship.id] += 1;
    damageCapacity += ship.damageCapacity;
    if (ship.id !== 'wolf-battlestation') otherDamageCapacity += ship.damageCapacity;
  }
  const requirement = THREAT_ENTRY_REQUIREMENTS[siteCode];
  if (counts['wolf-battlestation'] < requirement.battleStations || otherDamageCapacity < requirement.otherCapacity) {
    throw new Error(
      `The ${siteCode} entry attack requires at least ${requirement.battleStations} Battlestation(s) and ` +
      `${requirement.otherCapacity} other-ship damage capacity.`,
    );
  }
  return Object.freeze({
    siteCode,
    shipIds: Object.freeze(canonicalIds),
    counts: Object.freeze(counts),
    battleStationCount: counts['wolf-battlestation'],
    otherDamageCapacity,
    damageCapacity,
  });
}

/** Commander attack dial: ten base damage capacity plus this target group's pursuit. */
export function commanderAttackRequirement(targetGroupPursuit: number): number {
  if (!Number.isSafeInteger(targetGroupPursuit) || targetGroupPursuit < 0 || targetGroupPursuit > 10) {
    throw new Error('Target group pursuit must be a whole number from zero through ten.');
  }
  return 10 + targetGroupPursuit;
}

export interface WolfCommanderTargetAdjustmentInput {
  readonly cycle: number;
  readonly range: WolfCommanderRange;
  readonly targetShipId: string;
  readonly currentTargetNumber: number;
  readonly delta: -1 | 1;
  readonly usedRanges: readonly WolfCommanderRange[];
}

export interface WolfCommanderTargetAdjustment {
  readonly cycle: number;
  readonly range: WolfCommanderRange;
  readonly targetShipId: string;
  readonly previousTargetNumber: number;
  readonly targetNumber: number;
  readonly delta: -1 | 1;
  readonly usedRanges: readonly WolfCommanderRange[];
}

/** Apply the once-per-range Commander change using the printed circular d6 dial. */
export function applyWolfCommanderTargetAdjustment(
  input: WolfCommanderTargetAdjustmentInput,
): WolfCommanderTargetAdjustment {
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 1 ||
      !['long', 'medium', 'short'].includes(input.range) ||
      typeof input.targetShipId !== 'string' || input.targetShipId.length === 0 ||
      !Number.isSafeInteger(input.currentTargetNumber) || input.currentTargetNumber < 1 || input.currentTargetNumber > 6 ||
      (input.delta !== -1 && input.delta !== 1) ||
      input.usedRanges.some((range) => !['long', 'medium', 'short'].includes(range)) ||
      new Set(input.usedRanges).size !== input.usedRanges.length) {
    throw new Error('The Commander target adjustment is malformed.');
  }
  if (input.usedRanges.includes(input.range)) {
    throw new Error(`The Commander has already used the ${input.range} range adjustment this cycle.`);
  }
  const targetNumber = ((input.currentTargetNumber - 1 + input.delta + 6) % 6) + 1;
  return Object.freeze({
    cycle: input.cycle,
    range: input.range,
    targetShipId: input.targetShipId,
    previousTargetNumber: input.currentTargetNumber,
    targetNumber,
    delta: input.delta,
    usedRanges: Object.freeze([...input.usedRanges, input.range]),
  });
}

export type WolfAmnestyStatus =
  | 'offered'
  | 'accepted-pending-facilitator'
  | 'declined'
  | 'facilitator-ruled';

export interface WolfAmnestyOffer {
  readonly cycle: number;
  readonly offerId: string;
  readonly targetShipId: string;
  readonly condition: 'surrender-by-medium-jump-to-0101';
  readonly responseDeadline: string;
  readonly facilitatorConsequence: string;
  readonly status: WolfAmnestyStatus;
  readonly response?: 'accept' | 'decline';
  readonly ruling?: string;
}

export type WolfAmnestyDecision =
  | Readonly<{ kind: 'response'; answer: 'accept' | 'decline' }>
  | Readonly<{ kind: 'facilitator-consequence'; text: string }>;

/** An offer is only an offer: acceptance waits for an explicit facilitator consequence. */
export function resolveWolfAmnestyDecision(
  offer: WolfAmnestyOffer,
  decision: WolfAmnestyDecision,
  expectedCycle: number,
  now = new Date().toISOString(),
): WolfAmnestyOffer {
  if (!Number.isSafeInteger(offer.cycle) || offer.cycle !== expectedCycle ||
      typeof offer.offerId !== 'string' || offer.offerId.length === 0 ||
      typeof offer.targetShipId !== 'string' || offer.targetShipId.length === 0 ||
      offer.condition !== 'surrender-by-medium-jump-to-0101' ||
      !Number.isFinite(Date.parse(offer.responseDeadline)) || !Number.isFinite(Date.parse(now)) ||
      typeof offer.facilitatorConsequence !== 'string' || offer.facilitatorConsequence.trim().length === 0) {
    throw new Error('The Commander amnesty contract is incomplete or belongs to another cycle.');
  }
  if (decision.kind === 'response') {
    if (offer.status !== 'offered') throw new Error('The amnesty offer is no longer open for a response.');
    if (Date.parse(now) > Date.parse(offer.responseDeadline)) {
      throw new Error('The amnesty response deadline has passed; record an explicit facilitator consequence.');
    }
    return Object.freeze({
      ...offer,
      status: decision.answer === 'accept' ? 'accepted-pending-facilitator' : 'declined',
      response: decision.answer,
    });
  }
  if (decision.kind !== 'facilitator-consequence' || offer.status !== 'accepted-pending-facilitator' ||
      offer.response !== 'accept' || typeof decision.text !== 'string' || decision.text.trim().length === 0) {
    throw new Error('A facilitator consequence requires an accepted offer and explicit ruling text.');
  }
  return Object.freeze({
    ...offer,
    status: 'facilitator-ruled',
    ruling: decision.text.trim(),
  });
}
