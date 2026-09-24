import { isResourceShipId } from './resources';
import { parseSmallShipState, SMALL_SHIP_IDS, type SmallShipId, type SmallShipState } from './smallShip';

const SMALL_SHIP_ROOT_KEYS = new Set([
  'id', 'hostShipId', 'dockingRevision', 'population', 'unrest', 'cycle',
]);
const SMALL_SHIP_CYCLE_KEYS = new Set([
  'step', 'revision', 'results', 'charges', 'turn', 'rationBonus',
  'chargingSkipped', 'startedAt', 'completedAt',
]);
const SMALL_SHIP_IDS_SET = new Set<string>(SMALL_SHIP_IDS);

export interface ExtraShipAdmissionInput {
  /** The immutable core fleet roster stored on the session. */
  readonly activeVesselIds: unknown;
  /** Server-written small-ship state; client writes to the session are denied. */
  readonly smallShipStates: unknown;
  readonly smallShipId: unknown;
  readonly expansion?: unknown;
  readonly capybaraEnabled?: unknown;
}

export type ExtraShipStateMapInput = Pick<ExtraShipAdmissionInput,
  'activeVesselIds' | 'smallShipStates' | 'expansion' | 'capybaraEnabled'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function isCoreFleet(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((id): id is string => typeof id === 'string' && isResourceShipId(id)) &&
    new Set(value).size === value.length;
}

/**
 * Parse the server-owned shape strictly for admission. The shared public-state
 * parser remains compatibility-oriented; unknown fields here fail closed so
 * a new or mixed schema cannot grant an extra ship accidentally.
 */
function strictSmallShipState(value: unknown, id: SmallShipId): SmallShipState | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, SMALL_SHIP_ROOT_KEYS) ||
      !Object.hasOwn(value, 'hostShipId') || !Object.hasOwn(value, 'dockingRevision') ||
      !Object.hasOwn(value, 'population') || !Object.hasOwn(value, 'unrest') ||
      !isRecord(value.cycle) || !hasOnlyKeys(value.cycle, SMALL_SHIP_CYCLE_KEYS) ||
      !isRecord(value.cycle.results) ||
      Object.entries(value.cycle.results).some(([key, result]) => !/^[1-5]$/.test(key) || typeof result !== 'string')) {
    return undefined;
  }
  return parseSmallShipState(value, id);
}

/**
 * An optional small ship is admitted only after the server-owned docking
 * transaction has written a valid, revision-advanced state at an active core
 * fleet host. The extra ship never enters or mutates activeVesselIds.
 */
function parsedExtraShipStateMap(input: ExtraShipStateMapInput): Map<SmallShipId, SmallShipState> | undefined {
  if (!isCoreFleet(input.activeVesselIds) || !isRecord(input.smallShipStates) ||
      (input.expansion !== undefined && input.expansion !== 'base' && input.expansion !== 'capybara' && input.expansion !== 'none') ||
      (input.capybaraEnabled !== undefined && typeof input.capybaraEnabled !== 'boolean')) {
    return undefined;
  }

  const expansion = input.expansion ?? 'base';
  const capybaraEnabled = input.capybaraEnabled !== false;
  if ((input.activeVesselIds.includes('capybara') && (expansion !== 'capybara' || !capybaraEnabled)) ||
      (expansion === 'capybara' && !capybaraEnabled) ||
      (Object.hasOwn(input.smallShipStates, 'capybara-small') &&
        (expansion !== 'base' || !capybaraEnabled))) return undefined;

  const coreVesselIds = new Set(input.activeVesselIds);
  const smallShipStates = input.smallShipStates;
  if (Object.keys(smallShipStates).some((id) => !SMALL_SHIP_IDS_SET.has(id))) return undefined;

  // Any present entry with an unknown schema or a dock outside the current
  // core fleet makes the optional-vessel authority ambiguous for this session.
  const parsedStates = new Map<SmallShipId, SmallShipState>();
  for (const [rawId, value] of Object.entries(smallShipStates)) {
    const id = rawId as SmallShipId;
    const state = strictSmallShipState(value, id);
    if (!state) return undefined;
    if (state.hostShipId !== null &&
        (state.dockingRevision < 1 || !isResourceShipId(state.hostShipId) ||
         !coreVesselIds.has(state.hostShipId))) {
      return undefined;
    }
    parsedStates.set(id, state);
  }

  return parsedStates;
}

/** Validate every server-owned optional-ship entry before projecting the map. */
export function isExtraShipStateMapValid(input: ExtraShipStateMapInput): boolean {
  return parsedExtraShipStateMap(input) !== undefined;
}

/**
 * Keep the public projection empty when any entry is malformed or mixed with
 * an unknown schema, so clients cannot advertise admission from a sanitized
 * partial map that the server itself rejects.
 */
export function publicSmallShipStatesForSession(
  input: ExtraShipStateMapInput,
): Record<string, SmallShipState> {
  if (input.smallShipStates === undefined || input.smallShipStates === null) return {};
  const parsedStates = parsedExtraShipStateMap(input);
  return parsedStates ? Object.fromEntries(parsedStates) : {};
}

export function isExtraShipAdmitted(input: ExtraShipAdmissionInput): boolean {
  if (typeof input.smallShipId !== 'string' || !SMALL_SHIP_IDS_SET.has(input.smallShipId)) return false;
  const parsedStates = parsedExtraShipStateMap(input);
  if (!parsedStates) return false;
  const state = parsedStates.get(input.smallShipId as SmallShipId);
  if (!state || state.hostShipId === null) return false;
  if (state.id === 'capybara-small' &&
      ((input.expansion ?? 'base') !== 'base' || input.capybaraEnabled === false)) {
    return false;
  }
  return true;
}
