import {
  advanceEndeavourResearch,
  ENDEAVOUR_RESEARCH_TRACKS,
  endeavourResearchTrack,
  endeavourResearchTrackForConsole,
  type EndeavourResearchProgress,
  type EndeavourResearchTrackId,
} from './endeavourResearch';
import { isResourceShipId } from './resources';

export const ENDEAVOUR_UNFUELLED_UPGRADE_LIMIT = 2;
export const ENDEAVOUR_FUELLED_UPGRADE_LIMIT = 4;

export interface EndeavourFieldUpgradeTarget {
  readonly shipId: string;
  readonly systemId: string;
}

export interface EndeavourFieldUpgradeRecord extends EndeavourFieldUpgradeTarget {
  readonly trackId: EndeavourResearchTrackId;
  readonly materialCost: number;
  readonly crossedBox: number;
}

export interface EndeavourFieldUpgradeState {
  readonly cycle: number;
  readonly revision: number;
  readonly targets: readonly EndeavourFieldUpgradeRecord[];
}

export interface EndeavourFieldUpgradeResolution {
  readonly state: EndeavourFieldUpgradeState;
  readonly appliedTargets: readonly EndeavourFieldUpgradeRecord[];
  readonly materialsByShip: Readonly<Record<string, number>>;
  readonly researchByShip: Readonly<Record<string, EndeavourResearchProgress>>;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
    ? value as Record<string, unknown> : undefined;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function requireSafeCounter(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe non-negative integer.`);
  }
  return value as number;
}

function freezeRecord<T extends Record<string, unknown>>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function parseTarget(value: unknown): EndeavourFieldUpgradeRecord | null {
  const raw = record(value);
  const trackId = typeof raw?.trackId === 'string'
    ? raw.trackId as EndeavourResearchTrackId : null;
  const definition = trackId ? ENDEAVOUR_RESEARCH_TRACKS[trackId] : undefined;
  if (!raw || !exactKeys(raw, ['crossedBox', 'materialCost', 'shipId', 'systemId', 'trackId']) ||
      typeof raw.shipId !== 'string' || !isResourceShipId(raw.shipId) ||
      typeof raw.systemId !== 'string' || raw.systemId.length === 0 ||
      typeof raw.trackId !== 'string' ||
      !Number.isSafeInteger(raw.materialCost) || (raw.materialCost as number) < 1 ||
      !Number.isSafeInteger(raw.crossedBox) || (raw.crossedBox as number) < 0 ||
      !definition || (raw.crossedBox as number) >= definition.materialCosts.length ||
      definition.materialCosts[raw.crossedBox as number] !== raw.materialCost ||
      endeavourResearchTrackForConsole(raw.shipId, raw.systemId) !== raw.trackId) {
    return null;
  }
  return Object.freeze({
    shipId: raw.shipId,
    systemId: raw.systemId,
    trackId: raw.trackId as EndeavourResearchTrackId,
    materialCost: raw.materialCost as number,
    crossedBox: raw.crossedBox as number,
  });
}

function validateUniqueTargets(targets: readonly EndeavourFieldUpgradeRecord[]): boolean {
  const keys = targets.map((target) => `${target.shipId}:${target.systemId}`);
  return new Set(keys).size === keys.length;
}

/** Parse the durable, server-owned Endeavour upgrade receipt. */
export function parseEndeavourFieldUpgradeState(value: unknown): EndeavourFieldUpgradeState | null {
  if (value === undefined) return Object.freeze({ cycle: 0, revision: 0, targets: [] });
  const raw = record(value);
  if (!raw || !exactKeys(raw, ['cycle', 'revision', 'targets']) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 0 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      !Array.isArray(raw.targets) || raw.targets.length > ENDEAVOUR_FUELLED_UPGRADE_LIMIT) {
    return null;
  }
  if ((raw.cycle === 0 || raw.revision === 0) &&
      (raw.cycle !== 0 || raw.revision !== 0 || raw.targets.length !== 0)) return null;
  const targets: EndeavourFieldUpgradeRecord[] = [];
  for (const value of raw.targets) {
    const target = parseTarget(value);
    if (!target) return null;
    targets.push(target);
  }
  if (!validateUniqueTargets(targets)) return null;
  return Object.freeze({
    cycle: raw.cycle as number,
    revision: raw.revision as number,
    targets: Object.freeze(targets),
  });
}

function canonicalTargets(value: unknown): EndeavourFieldUpgradeTarget[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Choose at least one Endeavour target console.');
  }
  const targets: EndeavourFieldUpgradeTarget[] = [];
  for (const candidate of value) {
    const raw = record(candidate);
    if (!raw || !exactKeys(raw, ['shipId', 'systemId']) ||
        typeof raw.shipId !== 'string' || !isResourceShipId(raw.shipId) ||
        typeof raw.systemId !== 'string' || raw.systemId.length === 0 ||
        endeavourResearchTrackForConsole(raw.shipId, raw.systemId) === null) {
      throw new Error('Every Endeavour target must be a canonical upgrade console.');
    }
    targets.push(Object.freeze({ shipId: raw.shipId, systemId: raw.systemId }));
  }
  const keys = targets.map((target) => `${target.shipId}:${target.systemId}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error('Endeavour targets must be distinct consoles.');
  }
  return targets;
}

function canonicalMaterials(value: unknown): Readonly<Record<string, number>> {
  const raw = record(value);
  if (!raw) throw new Error('Endeavour material authority is malformed.');
  const result: Record<string, number> = {};
  for (const [shipId, amount] of Object.entries(raw)) {
    if (!isResourceShipId(shipId) || !Number.isSafeInteger(amount) || (amount as number) < 0) {
      throw new Error('Endeavour material authority is malformed.');
    }
    result[shipId] = amount as number;
  }
  return freezeRecord(result);
}

function canonicalResearch(value: unknown): Readonly<Record<string, EndeavourResearchProgress>> {
  const raw = record(value);
  if (!raw) throw new Error('Endeavour research authority is malformed.');
  const result: Record<string, EndeavourResearchProgress> = {};
  for (const [shipId, progress] of Object.entries(raw)) {
    if (!isResourceShipId(shipId)) throw new Error('Endeavour research authority is malformed.');
    // The research transition validates each track and count. Calling it for
    // the empty track is unnecessary, so validate the record through the
    // public view for every stored track instead.
    const progressRecord = record(progress);
    if (!progressRecord) throw new Error('Endeavour research authority is malformed.');
    for (const [trackId, crossedBox] of Object.entries(progressRecord)) {
      if (typeof trackId !== 'string' || !Number.isSafeInteger(crossedBox) || (crossedBox as number) < 0) {
        throw new Error('Endeavour research authority is malformed.');
      }
      endeavourResearchTrack(progressRecord, trackId as EndeavourResearchTrackId);
    }
    result[shipId] = Object.freeze({ ...progressRecord }) as EndeavourResearchProgress;
  }
  return freezeRecord(result);
}

/**
 * Calculate one atomic Endeavour field-upgrade batch.
 *
 * This is deliberately a pure authority boundary. It does not decide who
 * holds Endeavour, where it is docked, which phase is active, or how fuel is
 * acquired; those checks belong to the production callable that owns this
 * state later. It only consumes the current authoritative research and
 * material ledgers and returns the complete next state without mutating them.
 */
export function resolveEndeavourFieldUpgrades(input: Readonly<{
  readonly currentCycle: number;
  readonly expectedRevision: number;
  readonly fuelled: boolean;
  readonly targets: readonly EndeavourFieldUpgradeTarget[];
  readonly materialsByShip: unknown;
  readonly researchByShip: unknown;
  readonly state: unknown;
}>): EndeavourFieldUpgradeResolution {
  const currentCycle = requireSafeCounter(input.currentCycle, 'Endeavour cycle', 1);
  const expectedRevision = requireSafeCounter(input.expectedRevision, 'Endeavour upgrade revision');
  if (typeof input.fuelled !== 'boolean') throw new Error('Endeavour fuel state is malformed.');
  const state = parseEndeavourFieldUpgradeState(input.state);
  if (!state) throw new Error('Endeavour upgrade state is malformed.');
  if (state.revision !== expectedRevision) {
    throw new Error('Endeavour upgrades changed; refresh before upgrading.');
  }
  if (state.cycle > currentCycle) throw new Error('Endeavour upgrade state is ahead of the current cycle.');
  if (state.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Endeavour upgrade revision cannot advance safely.');

  const targets = canonicalTargets(input.targets);
  const limit = input.fuelled ? ENDEAVOUR_FUELLED_UPGRADE_LIMIT : ENDEAVOUR_UNFUELLED_UPGRADE_LIMIT;
  const priorTargets = state.cycle === currentCycle ? state.targets : [];
  if (priorTargets.length + targets.length > limit) {
    throw new Error(`Endeavour may upgrade at most ${limit} target consoles this cycle.`);
  }
  const priorKeys = new Set(priorTargets.map((target) => `${target.shipId}:${target.systemId}`));
  if (targets.some((target) => priorKeys.has(`${target.shipId}:${target.systemId}`))) {
    throw new Error('Endeavour cannot upgrade the same console twice in one cycle.');
  }

  const materials = canonicalMaterials(input.materialsByShip);
  const research = canonicalResearch(input.researchByShip);
  const nextMaterials: Record<string, number> = { ...materials };
  const nextResearch: Record<string, EndeavourResearchProgress> = { ...research };
  const appliedTargets: EndeavourFieldUpgradeRecord[] = [];

  // Resolve every target into local copies before returning anything. A
  // rejected later target therefore leaves all input ledgers untouched.
  for (const target of targets) {
    const trackId = endeavourResearchTrackForConsole(target.shipId, target.systemId);
    if (!trackId) throw new Error('Every Endeavour target must be a canonical upgrade console.');
    const progress = nextResearch[target.shipId] ?? {};
    const track = endeavourResearchTrack(progress, trackId);
    if (track.currentMaterialCost === null) throw new Error('The selected Endeavour research track is complete.');
    const materialsAvailable = nextMaterials[target.shipId];
    if (materialsAvailable === undefined) throw new Error('Each target ship needs an authoritative material ledger.');
    if (materialsAvailable < track.currentMaterialCost) {
      throw new Error(`The target ship needs ${track.currentMaterialCost} materials for this upgrade.`);
    }
    const advanced = advanceEndeavourResearch(progress, trackId);
    nextMaterials[target.shipId] = materialsAvailable - track.currentMaterialCost;
    nextResearch[target.shipId] = Object.freeze(advanced.progress);
    appliedTargets.push(Object.freeze({
      ...target,
      trackId,
      materialCost: track.currentMaterialCost,
      crossedBox: advanced.crossedBox,
    }));
  }

  const nextState: EndeavourFieldUpgradeState = Object.freeze({
    cycle: currentCycle,
    revision: state.revision + 1,
    targets: Object.freeze([
      ...(state.cycle === currentCycle ? state.targets : []),
      ...appliedTargets,
    ]),
  });
  return Object.freeze({
    state: nextState,
    appliedTargets: Object.freeze(appliedTargets),
    materialsByShip: freezeRecord(nextMaterials),
    researchByShip: freezeRecord(nextResearch),
  });
}
