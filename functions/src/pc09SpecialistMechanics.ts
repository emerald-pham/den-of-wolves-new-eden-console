import { wolfShipForId, type WolfShipId } from './wolfShipCatalog';
import { EXPANDED_WOLF_TARGET_RING, shiftWolfTargetDie, type WolfCombatShip, type WolfFleetTargetId, type WolfTargetRing } from './wolfCombatMath';
import { isResourceShipId } from './resources';

export interface PdfFighterAceTarget {
  readonly instanceId: string;
  readonly shipId: WolfShipId;
  readonly damageTaken: number;
  readonly destroyed: boolean;
}

export type PdfFighterAceSourceId = 'fighter-wing-alpha' | 'fighter-wing-bravo' | 'pdf-escort-fighter-wing';
export type PdfFighterAceCommanderRoleId = 'wing-commander' | 'refinery-124-pdf-colonel';

export interface PdfFighterAcePermission {
  readonly type: 'pdf-fighter-ace-permission';
  readonly attackId: string;
  readonly turn: number;
  readonly sourceId: PdfFighterAceSourceId;
  readonly fighterIndex: number;
  readonly aceUid: string;
  readonly actorUid: string;
  readonly actorRoleId: PdfFighterAceCommanderRoleId;
  readonly requestId: string;
  readonly revision: number;
}

export interface PdfFighterAceSourceSnapshot {
  readonly sourceId: PdfFighterAceSourceId;
  readonly fighters: number;
  readonly losses: number;
  /** PDF wing or AEGIS combat-state revision. */
  readonly revision: number;
  /** Durable PDF wing or AEGIS fighter-count revision. */
  readonly durableRevision: number;
  readonly launched: true;
  readonly attackId: string;
  readonly cycle: number;
}

export interface PdfFighterAceActionReceipt {
  readonly type: 'pdf-fighter-ace-action';
  readonly attackId: string;
  readonly turn: number;
  readonly revision: number;
  readonly requestId: string;
  readonly actorUid: string;
  readonly actorRoleId: 'pdf-fighter-ace';
  readonly fighterUid: string;
  readonly sourceId: PdfFighterAceSourceId;
  readonly fighterIndex: number;
  readonly permissionActor: PdfFighterAcePermission;
  readonly permissionActorUid: string;
  readonly permissionActorRoleId: PdfFighterAceCommanderRoleId;
  readonly permissionRequestId: string;
  readonly permissionRevision: number;
  readonly range: 'long' | 'medium' | 'short';
  readonly submittedTargetId: string;
  readonly extraTargetId: string | null;
  readonly submittedTargetShift: -1 | 1 | null;
  readonly resolvedTargetShift: PdfFighterAceCombatResult['targetShift'] | null;
  readonly rosterBefore: readonly WolfCombatShip[];
  readonly targetResults: readonly PdfFighterAceTargetResult[];
  readonly sourceStateBefore: PdfFighterAceSourceSnapshot;
  readonly sourceStateAfter: PdfFighterAceSourceSnapshot;
  readonly outcome: Readonly<{
    damage: number;
    targetDestroyed: boolean;
    fighterDestroyed: boolean;
    aceDied: boolean;
    escaped: boolean;
  }>;
  readonly rolls: readonly number[];
  readonly committedAt: string;
}

export interface PdfFighterAceActionExpectation {
  readonly attackId?: string;
  readonly actorUid?: string;
  readonly targetRing?: WolfTargetRing;
}

function exactRecordKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function aceCommanderRole(sourceId: unknown): PdfFighterAceCommanderRoleId | undefined {
  if (sourceId === 'fighter-wing-alpha' || sourceId === 'fighter-wing-bravo') return 'wing-commander';
  if (sourceId === 'pdf-escort-fighter-wing') return 'refinery-124-pdf-colonel';
  return undefined;
}

/** Record one explicit current-commander's permission for one source fighter slot. */
export function createPdfFighterAcePermission(input: Readonly<{
  attackId: unknown; turn: unknown; sourceId: unknown; fighterIndex: unknown; aceUid: unknown;
  actorUid: unknown; actorRoleId: unknown; requestId: unknown; revision: unknown;
  fighters: unknown; launched: unknown; usedFighterIndexes?: readonly number[];
}>): PdfFighterAcePermission {
  const expectedRole = aceCommanderRole(input.sourceId);
  if (!expectedRole || input.actorRoleId !== expectedRole) {
    throw new Error('The selected source requires permission from its current commander role.');
  }
  if (input.launched !== true) throw new Error('The selected fighter source must be launched before permission is granted.');
  if (!Number.isSafeInteger(input.fighters) || (input.fighters as number) < 1 ||
      !Number.isSafeInteger(input.fighterIndex) || (input.fighterIndex as number) < 0 ||
      (input.fighterIndex as number) >= (input.fighters as number)) {
    throw new Error('The selected fighter slot is unavailable in this source.');
  }
  if (typeof input.attackId !== 'string' || !input.attackId.trim() || input.attackId.length > 160 ||
      !Number.isSafeInteger(input.turn) || (input.turn as number) < 1 ||
      typeof input.aceUid !== 'string' || !input.aceUid.trim() ||
      typeof input.actorUid !== 'string' || !input.actorUid.trim() || input.actorUid === input.aceUid ||
      typeof input.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.requestId) ||
      !Number.isSafeInteger(input.revision) || (input.revision as number) < 1) {
    throw new Error('The current commander permission does not match this attack and Ace.');
  }
  if (input.usedFighterIndexes !== undefined &&
      (!Array.isArray(input.usedFighterIndexes) || input.usedFighterIndexes.includes(input.fighterIndex as number))) {
    throw new Error('This source fighter slot has already been assigned during the current attack.');
  }
  return Object.freeze({
    type: 'pdf-fighter-ace-permission', attackId: input.attackId, turn: input.turn as number,
    sourceId: input.sourceId as PdfFighterAceSourceId, fighterIndex: input.fighterIndex as number,
    aceUid: input.aceUid, actorUid: input.actorUid, actorRoleId: input.actorRoleId as PdfFighterAceCommanderRoleId,
    requestId: input.requestId, revision: input.revision as number,
  });
}

/** Validate every authority binding before accepting an action or replay receipt. */
export function requirePdfFighterAcePermission(
  value: unknown,
  expected: Readonly<Partial<Pick<PdfFighterAcePermission,
    'attackId' | 'turn' | 'sourceId' | 'fighterIndex' | 'aceUid' | 'actorUid' | 'actorRoleId' | 'requestId' | 'revision'>>>,
): PdfFighterAcePermission {
  const permission = isRecord(value) ? value : undefined;
  const keys = ['type', 'attackId', 'turn', 'sourceId', 'fighterIndex', 'aceUid',
    'actorUid', 'actorRoleId', 'requestId', 'revision'];
  if (!permission || !exactRecordKeys(permission, keys) || permission.type !== 'pdf-fighter-ace-permission' ||
      aceCommanderRole(permission.sourceId) !== permission.actorRoleId ||
      typeof permission.attackId !== 'string' || !permission.attackId.trim() ||
      !Number.isSafeInteger(permission.turn) || (permission.turn as number) < 1 ||
      !Number.isSafeInteger(permission.fighterIndex) || (permission.fighterIndex as number) < 0 ||
      typeof permission.aceUid !== 'string' || !permission.aceUid.trim() ||
      typeof permission.actorUid !== 'string' || !permission.actorUid.trim() || permission.actorUid === permission.aceUid ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(String(permission.requestId)) ||
      !Number.isSafeInteger(permission.revision) || (permission.revision as number) < 1) {
    throw new Error('The Fighter Ace commander permission receipt is malformed.');
  }
  for (const field of ['attackId', 'turn', 'sourceId', 'fighterIndex', 'aceUid', 'actorUid', 'actorRoleId', 'requestId', 'revision'] as const) {
    if (expected[field] !== undefined && permission[field] !== expected[field]) {
      throw new Error(`The Fighter Ace permission ${field} does not match this source slot and action.`);
    }
  }
  return Object.freeze({
    type: 'pdf-fighter-ace-permission', attackId: permission.attackId as string,
    turn: permission.turn as number, sourceId: permission.sourceId as PdfFighterAceSourceId,
    fighterIndex: permission.fighterIndex as number, aceUid: permission.aceUid as string,
    actorUid: permission.actorUid as string, actorRoleId: permission.actorRoleId as PdfFighterAceCommanderRoleId,
    requestId: permission.requestId as string, revision: permission.revision as number,
  });
}

export interface PdfFighterAceCombatInput {
  readonly range: 'long' | 'medium' | 'short';
  readonly target: unknown;
  readonly extraTarget?: unknown;
  readonly rolls?: readonly number[];
  readonly targetShift?: -1 | 1;
  readonly currentTarget?: WolfFleetTargetId;
  readonly targetRing?: WolfTargetRing;
}

export interface PdfFighterAceTargetResult {
  readonly instanceId: string;
  readonly shipId: WolfShipId;
  readonly damage: number;
  readonly destroyed: boolean;
}

export interface PdfFighterAceCombatResult {
  readonly range: 'long' | 'medium' | 'short';
  readonly damage: number;
  readonly targetDestroyed: boolean;
  readonly fighterDestroyed: boolean;
  readonly aceDied: boolean;
  readonly escaped: boolean;
  readonly targetShift?: Readonly<{ instanceId: string; from: number; to: number; shift: -1 | 1 }>;
  readonly targetResults: readonly PdfFighterAceTargetResult[];
}

/** Apply a private Ace result to the current attack roster without exposing contact identity. */
export function applyPdfFighterAceResults<T extends PdfFighterAceTarget>(
  roster: readonly T[],
  results: readonly PdfFighterAceTargetResult[],
): readonly T[] {
  if (!Array.isArray(roster) || !Array.isArray(results)) {
    throw new Error('The Fighter Ace combat roster and damage results must be canonical arrays.');
  }
  const currentById = new Map<string, T>();
  for (const entry of roster) {
    if (!isRecord(entry) || typeof entry.instanceId !== 'string' || !entry.instanceId ||
        typeof entry.shipId !== 'string' || !wolfShipForId(entry.shipId) ||
        !Number.isSafeInteger(entry.damageTaken) || (entry.damageTaken as number) < 0 ||
        typeof entry.destroyed !== 'boolean' || currentById.has(entry.instanceId)) {
      throw new Error('The Fighter Ace combat roster is malformed.');
    }
    const capacity = wolfShipForId(entry.shipId)!.damageCapacity;
    if ((entry.damageTaken as number) > capacity ||
        entry.destroyed !== ((entry.damageTaken as number) >= capacity)) {
      throw new Error('The Fighter Ace combat roster damage and destruction state do not match catalog capacity.');
    }
    currentById.set(entry.instanceId, entry as T);
  }
  const nextById = new Map<string, PdfFighterAceTargetResult>();
  for (const result of results) {
    if (!isRecord(result) || typeof result.instanceId !== 'string' || typeof result.shipId !== 'string' ||
        !Number.isSafeInteger(result.damage) || (result.damage as number) < 0 ||
        typeof result.destroyed !== 'boolean' || nextById.has(result.instanceId)) {
      throw new Error('The Fighter Ace damage result is malformed.');
    }
    const current = currentById.get(result.instanceId);
    if (!current || current.shipId !== result.shipId || current.destroyed) {
      throw new Error('The Fighter Ace damage result does not match a live combat contact.');
    }
    const capacity = wolfShipForId(current.shipId)!.damageCapacity;
    const totalDamage = current.damageTaken + (result.damage as number);
    if (totalDamage > capacity || result.destroyed !== (totalDamage >= capacity)) {
      throw new Error('The Fighter Ace damage result does not match catalog capacity.');
    }
    nextById.set(result.instanceId, result as unknown as PdfFighterAceTargetResult);
  }
  return Object.freeze(roster.map((entry) => {
    const result = nextById.get(entry.instanceId);
    return result ? Object.freeze({ ...entry, damageTaken: entry.damageTaken + result.damage,
      destroyed: result.destroyed }) as T : entry;
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function aceTarget(value: unknown): PdfFighterAceTarget {
  if (!isRecord(value) || typeof value.instanceId !== 'string' || !value.instanceId ||
      typeof value.shipId !== 'string' || !wolfShipForId(value.shipId) ||
      !Number.isSafeInteger(value.damageTaken) || (value.damageTaken as number) < 0 ||
      typeof value.destroyed !== 'boolean') {
    throw new Error('Choose a current, resolved Wolf contact.');
  }
  if (value.destroyed) throw new Error('A destroyed Wolf contact cannot be targeted.');
  const ship = wolfShipForId(value.shipId)!;
  if ((value.damageTaken as number) >= ship.damageCapacity) {
    throw new Error('The Wolf contact damage record is malformed.');
  }
  return value as unknown as PdfFighterAceTarget;
}

function damageTarget(target: PdfFighterAceTarget, requestedDamage: number): PdfFighterAceTargetResult {
  const ship = wolfShipForId(target.shipId)!;
  const damage = Math.min(requestedDamage, ship.damageCapacity - target.damageTaken);
  return {
    instanceId: target.instanceId,
    shipId: target.shipId,
    damage,
    destroyed: target.damageTaken + damage >= ship.damageCapacity,
  };
}

/** The printed Detector is right on rolls 1–4 and reports the inverse on 5–6. */
export function detectorReportedWolf(actualWolf: boolean, accuracyRoll: number): boolean {
  if (typeof actualWolf !== 'boolean' || !Number.isSafeInteger(accuracyRoll) ||
      accuracyRoll < 1 || accuracyRoll > 6) {
    throw new Error('Detector result requires server-known truth and a valid server die.');
  }
  return accuracyRoll <= 4 ? actualWolf : !actualWolf;
}

/** Resolve only the printed attendance threshold; the result contains no loyalty or suspicion. */
export function resolveArrestOutcome(requiredPlayers: number, presentPlayers: number): 'arrested' | 'not-arrested' {
  if (!Number.isSafeInteger(requiredPlayers) || requiredPlayers < 0 ||
      !Number.isSafeInteger(presentPlayers) || presentPlayers < 0) {
    throw new Error('Arrest resolution requires a canonical posse count.');
  }
  return presentPlayers >= requiredPlayers ? 'arrested' : 'not-arrested';
}

export interface VipHostMaintenanceGrant {
  readonly type: 'vip-host-maintenance-grant';
  readonly sessionId: string;
  readonly hostUid: string;
  readonly shipId: string;
  readonly cycle: number;
  readonly status: 'available' | 'consumed';
  readonly revision: number;
  readonly attestedByUid: string;
}

/** Build the private, cycle-bound result of one current GM's Team-time attestation. */
export function createHostedMaintenanceGrant(input: Readonly<{
  sessionId: unknown;
  cycle: unknown;
  hostUid: unknown;
  hostRoleId: unknown;
  hostShipId: unknown;
  destinationShipId: unknown;
  destinationActive: unknown;
  attestedByUid: unknown;
  inTeamPhase: unknown;
}>): VipHostMaintenanceGrant {
  if (typeof input.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(input.sessionId) ||
      !Number.isSafeInteger(input.cycle) || (input.cycle as number) < 1 ||
      typeof input.hostUid !== 'string' || !/^[\w-]{1,128}$/.test(input.hostUid) ||
      typeof input.attestedByUid !== 'string' || !/^[\w-]{1,128}$/.test(input.attestedByUid) ||
      input.hostUid === input.attestedByUid || input.hostRoleId !== 'vip-host' || input.hostShipId !== 'dione' ||
      typeof input.destinationShipId !== 'string' || !isResourceShipId(input.destinationShipId) ||
      input.destinationShipId === 'dione') {
    throw new Error('The current VIP Host must visit an active ship other than Dione.');
  }
  if (input.inTeamPhase !== true) throw new Error('The VIP Host visit must be attested during the current Team Phase.');
  if (input.destinationActive !== true) throw new Error('The destination ship is not active this cycle.');
  return Object.freeze({
    type: 'vip-host-maintenance-grant', sessionId: input.sessionId, hostUid: input.hostUid,
    shipId: input.destinationShipId, cycle: input.cycle as number, status: 'available',
    revision: 1, attestedByUid: input.attestedByUid,
  });
}

/** Consume one matching visit grant. A replay must use the stored action receipt. */
export function consumeHostedMaintenanceGrant(
  value: unknown,
  input: Readonly<{ sessionId: unknown; shipId: unknown; cycle: unknown }>,
): VipHostMaintenanceGrant {
  if (!isRecord(value) || value.type !== 'vip-host-maintenance-grant' ||
      typeof value.sessionId !== 'string' || typeof value.hostUid !== 'string' ||
      typeof value.shipId !== 'string' || !Number.isSafeInteger(value.cycle) ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      (value.status !== 'available' && value.status !== 'consumed') ||
      typeof value.attestedByUid !== 'string') {
    throw new Error('The hosted maintenance grant is malformed.');
  }
  if (value.status === 'consumed') throw new Error('This hosted maintenance reroll has already been consumed.');
  if (value.sessionId !== input.sessionId || value.shipId !== input.shipId || value.cycle !== input.cycle) {
    throw new Error('The hosted maintenance reroll is not for the bound ship or cycle.');
  }
  if ((value.revision as number) >= Number.MAX_SAFE_INTEGER) throw new Error('The hosted maintenance grant cannot advance safely.');
  return Object.freeze({
    type: 'vip-host-maintenance-grant', sessionId: value.sessionId, hostUid: value.hostUid,
    shipId: value.shipId, cycle: value.cycle as number, status: 'consumed',
    revision: (value.revision as number) + 1, attestedByUid: value.attestedByUid,
  });
}

/** Resolve one PDF Fighter Ace action; dice and contact state are supplied only by the server caller. */
export function resolvePdfFighterAceCombat(input: PdfFighterAceCombatInput): PdfFighterAceCombatResult {
  if (!input || (input.range !== 'long' && input.range !== 'medium' && input.range !== 'short')) {
    throw new Error('Choose the open Fighter Ace range.');
  }
  const target = aceTarget(input.target);
  const ship = wolfShipForId(target.shipId)!;
  if (!ship.ranges[input.range].canBeDamaged) {
    throw new Error('This Wolf contact cannot take damage at the current range.');
  }
  let targetResults: PdfFighterAceTargetResult[];
  let fighterDestroyed = false;
  let aceDied = false;
  let escaped = false;
  let targetShift: PdfFighterAceCombatResult['targetShift'];

  if (input.range === 'long') {
    if (input.extraTarget !== undefined || input.targetShift !== undefined ||
        !Array.isArray(input.rolls) || input.rolls.length !== 3 ||
        input.rolls.some((roll) => !Number.isSafeInteger(roll) || roll < 1 || roll > 6)) {
      throw new Error('Long Range needs exactly three server-owned six-sided dice.');
    }
    const hits = input.rolls.filter((roll) => roll >= 3).length;
    targetResults = [damageTarget(target, hits)];
    const targetDestroyed = targetResults[0]!.destroyed;
    fighterDestroyed = !targetDestroyed;
    aceDied = fighterDestroyed;
  } else if (input.range === 'medium') {
    if (input.extraTarget !== undefined || (input.targetShift !== undefined &&
        input.targetShift !== -1 && input.targetShift !== 1)) {
      throw new Error('Medium Range accepts one target and an optional one-step targeting shift.');
    }
    targetResults = [damageTarget(target, 1)];
    if (input.targetShift !== undefined) {
      const ring = input.targetRing;
      const targetNumber = ring && input.currentTarget !== undefined
        ? ring.indexOf(input.currentTarget) : undefined;
      if (!ring || !Array.isArray(ring) || ring.length < 2 ||
          !ring.every((entry) => typeof entry === 'string') || targetNumber === undefined || targetNumber < 0) {
        throw new Error('The current attack target ring is unavailable for the Ace shift.');
      }
      targetShift = {
        instanceId: target.instanceId,
        from: targetNumber + 1,
        to: shiftWolfTargetDie(targetNumber + 1, input.targetShift, ring as WolfTargetRing),
        shift: input.targetShift,
      };
    }
  } else {
    if (input.rolls !== undefined || input.targetShift !== undefined) {
      throw new Error('Short Range uses one target and an optional second target.');
    }
    if (input.extraTarget === undefined || input.extraTarget === null) {
      targetResults = [damageTarget(target, 1)];
    } else {
      const second = aceTarget(input.extraTarget);
      if (!ship.ranges.short.canBeDamaged || !wolfShipForId(second.shipId)!.ranges.short.canBeDamaged) {
        throw new Error('A selected short-range target cannot take damage.');
      }
      fighterDestroyed = true;
      escaped = true;
      const firstResult = damageTarget(target, 1);
      const secondResult = damageTarget(second, 1);
      targetResults = firstResult.instanceId === secondResult.instanceId
        ? [{ ...firstResult, damage: Math.min(2, ship.damageCapacity - target.damageTaken),
          destroyed: target.damageTaken + Math.min(2, ship.damageCapacity - target.damageTaken) >= ship.damageCapacity }]
        : [firstResult, secondResult];
    }
  }
  const damage = targetResults.reduce((sum, result) => sum + result.damage, 0);
  return Object.freeze({
    range: input.range,
    damage,
    targetDestroyed: targetResults.some((result) => result.instanceId === target.instanceId && result.destroyed),
    fighterDestroyed,
    aceDied,
    escaped,
    ...(targetShift === undefined ? {} : { targetShift }),
    targetResults: Object.freeze(targetResults.map((result) => Object.freeze(result))),
  });
}

function canonicalAceRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}

function aceSourceSnapshot(value: unknown): value is PdfFighterAceSourceSnapshot {
  return isRecord(value) && exactRecordKeys(value, [
    'sourceId', 'fighters', 'losses', 'revision', 'durableRevision', 'launched', 'attackId', 'cycle',
  ]) && (value.sourceId === 'fighter-wing-alpha' || value.sourceId === 'fighter-wing-bravo' ||
    value.sourceId === 'pdf-escort-fighter-wing') && Number.isSafeInteger(value.fighters) && (value.fighters as number) >= 0 &&
    Number.isSafeInteger(value.losses) && (value.losses as number) >= 0 &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 1 &&
    Number.isSafeInteger(value.durableRevision) && (value.durableRevision as number) >= 0 &&
    value.launched === true && canonicalAceRequestId(value.attackId) &&
    Number.isSafeInteger(value.cycle) && (value.cycle as number) >= 1;
}

function sameAceSourceSnapshot(left: PdfFighterAceSourceSnapshot, right: PdfFighterAceSourceSnapshot): boolean {
  return left.sourceId === right.sourceId && left.fighters === right.fighters && left.losses === right.losses &&
    left.revision === right.revision && left.durableRevision === right.durableRevision &&
    left.launched === right.launched && left.attackId === right.attackId && left.cycle === right.cycle;
}

function sameAceTargetDeltas(left: readonly PdfFighterAceTargetResult[], right: unknown): boolean {
  return Array.isArray(right) && left.length === right.length && left.every((entry, index) => {
    const candidate = right[index];
    return isRecord(candidate) && exactRecordKeys(candidate, ['instanceId', 'shipId', 'damage', 'destroyed']) &&
      entry.instanceId === candidate.instanceId && entry.shipId === candidate.shipId &&
      entry.damage === candidate.damage && entry.destroyed === candidate.destroyed;
  });
}

function sameAceResolvedShift(
  left: PdfFighterAceCombatResult['targetShift'] | undefined,
  right: unknown,
): boolean {
  if (left === undefined) return right === null;
  return isRecord(right) && exactRecordKeys(right, ['instanceId', 'from', 'to', 'shift']) &&
    left.instanceId === right.instanceId && left.from === right.from && left.to === right.to && left.shift === right.shift;
}

function aceReceiptRoster(value: unknown, ring: WolfTargetRing): value is readonly WolfCombatShip[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => isRecord(entry) &&
    exactRecordKeys(entry, ['instanceId', 'shipId', 'target', 'damageTaken', 'destroyed']) &&
    typeof entry.instanceId === 'string' && entry.instanceId.length > 0 &&
    typeof entry.shipId === 'string' && Boolean(wolfShipForId(entry.shipId)) &&
    typeof entry.target === 'string' && ring.includes(entry.target as WolfFleetTargetId) &&
    Number.isSafeInteger(entry.damageTaken) && (entry.damageTaken as number) >= 0 &&
    typeof entry.destroyed === 'boolean');
}

/**
 * Validate the complete private, attack-bound Ace receipt. This parser recomputes
 * the printed option from its captured roster and server dice, and verifies that
 * any source loss advanced both the combat and durable fighter counters once.
 */
export function requirePdfFighterAceActionReceipt(
  value: unknown,
  expected: PdfFighterAceActionExpectation = {},
): PdfFighterAceActionReceipt {
  const keys = [
    'type', 'attackId', 'turn', 'revision', 'requestId', 'actorUid', 'actorRoleId', 'fighterUid', 'sourceId',
    'fighterIndex', 'permissionActor', 'permissionActorUid', 'permissionActorRoleId', 'permissionRequestId',
    'permissionRevision', 'range', 'submittedTargetId', 'extraTargetId', 'submittedTargetShift',
    'resolvedTargetShift', 'rosterBefore', 'targetResults', 'sourceStateBefore', 'sourceStateAfter',
    'outcome', 'rolls', 'committedAt',
  ];
  function invalid(): never { throw new Error('The Fighter Ace action receipt is malformed or inconsistent.'); }
  if (!isRecord(value) || !exactRecordKeys(value, keys) || value.type !== 'pdf-fighter-ace-action' ||
      !canonicalAceRequestId(value.attackId) || !Number.isSafeInteger(value.turn) || (value.turn as number) < 1 ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      !canonicalAceRequestId(value.requestId) || typeof value.actorUid !== 'string' || !value.actorUid ||
      value.actorRoleId !== 'pdf-fighter-ace' || value.fighterUid !== value.actorUid ||
      !Number.isSafeInteger(value.fighterIndex) || (value.fighterIndex as number) < 0 ||
      (value.range !== 'long' && value.range !== 'medium' && value.range !== 'short') ||
      typeof value.submittedTargetId !== 'string' || !/^contact-[1-9]\d*$/.test(value.submittedTargetId) ||
      !(value.extraTargetId === null || typeof value.extraTargetId === 'string' &&
        /^contact-[1-9]\d*$/.test(value.extraTargetId)) ||
      !(value.submittedTargetShift === null || value.submittedTargetShift === -1 || value.submittedTargetShift === 1) ||
      !Array.isArray(value.rolls) || value.rolls.some((roll) => !Number.isSafeInteger(roll) || (roll as number) < 1 || (roll as number) > 6) ||
      typeof value.committedAt !== 'string' || !Number.isFinite(Date.parse(value.committedAt))) invalid();

  const sourceId = value.sourceId;
  if (sourceId !== 'fighter-wing-alpha' && sourceId !== 'fighter-wing-bravo' && sourceId !== 'pdf-escort-fighter-wing') invalid();
  if (expected.attackId !== undefined && expected.attackId !== value.attackId ||
      expected.actorUid !== undefined && expected.actorUid !== value.actorUid) invalid();
  const permission = requirePdfFighterAcePermission(value.permissionActor, {
    attackId: value.attackId as string, turn: value.turn as number, sourceId,
    fighterIndex: value.fighterIndex as number, aceUid: value.actorUid as string,
    actorUid: value.permissionActorUid as string, actorRoleId: value.permissionActorRoleId as PdfFighterAceCommanderRoleId,
    requestId: value.permissionRequestId as string, revision: value.permissionRevision as number,
  });
  if (value.permissionActorUid !== permission.actorUid || value.permissionActorRoleId !== permission.actorRoleId ||
      value.permissionRequestId !== permission.requestId || value.permissionRevision !== permission.revision) invalid();

  const ring = expected.targetRing ?? EXPANDED_WOLF_TARGET_RING;
  if (!aceSourceSnapshot(value.sourceStateBefore) || !aceSourceSnapshot(value.sourceStateAfter) ||
      value.sourceStateBefore.sourceId !== sourceId || value.sourceStateAfter.sourceId !== sourceId ||
      value.sourceStateBefore.attackId !== value.attackId || value.sourceStateAfter.attackId !== value.attackId ||
      value.sourceStateBefore.cycle !== value.turn || value.sourceStateAfter.cycle !== value.turn ||
      value.sourceStateBefore.launched !== true || value.sourceStateAfter.launched !== true ||
      (value.fighterIndex as number) >= value.sourceStateBefore.fighters ||
      !aceReceiptRoster(value.rosterBefore, ring) || !Array.isArray(value.targetResults) ||
      value.targetResults.some((result) => !isRecord(result) ||
        !exactRecordKeys(result, ['instanceId', 'shipId', 'damage', 'destroyed']) ||
        typeof result.instanceId !== 'string' || typeof result.shipId !== 'string' ||
        !Number.isSafeInteger(result.damage) || (result.damage as number) < 0 || typeof result.destroyed !== 'boolean') ||
      !isRecord(value.outcome) || !exactRecordKeys(value.outcome, [
        'damage', 'targetDestroyed', 'fighterDestroyed', 'aceDied', 'escaped',
      ]) || !Number.isSafeInteger(value.outcome.damage) || (value.outcome.damage as number) < 0 ||
      typeof value.outcome.targetDestroyed !== 'boolean' || typeof value.outcome.fighterDestroyed !== 'boolean' ||
      typeof value.outcome.aceDied !== 'boolean' || typeof value.outcome.escaped !== 'boolean') invalid();

  const roster = value.rosterBefore as readonly WolfCombatShip[];
  const primaryIndex = Number((value.submittedTargetId as string).slice('contact-'.length)) - 1;
  const extraIndex = value.extraTargetId === null ? undefined
    : Number((value.extraTargetId as string).slice('contact-'.length)) - 1;
  const primary = roster[primaryIndex];
  const extra = extraIndex === undefined ? undefined : roster[extraIndex];
  if (!primary || (extraIndex !== undefined && !extra) ||
      (value.range !== 'short' && extraIndex !== undefined) ||
      (value.range !== 'medium' && value.submittedTargetShift !== null) ||
      value.range === 'long' && (value.rolls as readonly number[]).length !== 3 ||
      value.range !== 'long' && (value.rolls as readonly number[]).length !== 0 ||
      (value.resolvedTargetShift !== null && (!isRecord(value.resolvedTargetShift) ||
        !exactRecordKeys(value.resolvedTargetShift, ['instanceId', 'from', 'to', 'shift']) ||
        typeof value.resolvedTargetShift.instanceId !== 'string' ||
        !Number.isSafeInteger(value.resolvedTargetShift.from) || (value.resolvedTargetShift.from as number) < 1 ||
        !Number.isSafeInteger(value.resolvedTargetShift.to) || (value.resolvedTargetShift.to as number) < 1 ||
        (value.resolvedTargetShift.shift !== -1 && value.resolvedTargetShift.shift !== 1)))) invalid();
  let recomputed: PdfFighterAceCombatResult;
  try {
    recomputed = resolvePdfFighterAceCombat({
      range: value.range as PdfFighterAceCombatInput['range'], target: primary,
      ...(extra === undefined ? {} : { extraTarget: extra }),
      ...(value.rolls.length === 0 ? {} : { rolls: value.rolls as readonly number[] }),
      ...(value.submittedTargetShift === null ? {} : {
        targetShift: value.submittedTargetShift as -1 | 1,
        currentTarget: primary.target,
        targetRing: ring,
      }),
    });
  } catch {
    invalid();
  }
  const deltaEqual = sameAceTargetDeltas(recomputed.targetResults, value.targetResults);
  const summary = value.outcome as Record<string, unknown>;
  if (!deltaEqual || recomputed.damage !== summary.damage || recomputed.targetDestroyed !== summary.targetDestroyed ||
      recomputed.fighterDestroyed !== summary.fighterDestroyed || recomputed.aceDied !== summary.aceDied ||
      recomputed.escaped !== summary.escaped ||
      !sameAceResolvedShift(recomputed.targetShift, value.resolvedTargetShift)) {
    throw new Error('The Fighter Ace target damage or outcome does not match the captured option.');
  }
  try { applyPdfFighterAceResults(roster, recomputed.targetResults); } catch { invalid(); }
  if (expected.targetRing && roster.some((entry) => !expected.targetRing!.includes(entry.target))) invalid();

  const before = value.sourceStateBefore;
  const after = value.sourceStateAfter;
  if (value.outcome.fighterDestroyed) {
    if (before.fighters < 1 || after.fighters !== before.fighters - 1 || after.losses !== before.losses + 1 ||
        after.revision !== before.revision + 1 || after.durableRevision !== before.durableRevision + 1) {
      throw new Error('The Fighter Ace source loss and revision counters are inconsistent.');
    }
  } else if (!sameAceSourceSnapshot(before, after)) invalid();
  return value as unknown as PdfFighterAceActionReceipt;
}
