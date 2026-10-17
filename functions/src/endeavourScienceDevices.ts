import { endeavourResearchTrack } from './endeavourResearch';

export type EndeavourScienceDeviceId = 'ecm-device' | 'wolf-agent-detector';

export interface EndeavourScienceDevicesState {
  readonly revision: number;
  readonly ecmBuilt: boolean;
  readonly detectorBuilt: boolean;
}

const BUILD_COSTS: Readonly<Record<EndeavourScienceDeviceId, readonly (number | null)[]>> = Object.freeze({
  'ecm-device': Object.freeze([18, 13, 9, 7, 5]),
  'wolf-agent-detector': Object.freeze([null, null, 18, 12, 10]),
});

/**
 * The printed construction lane has its own availability and prices. Keep that
 * quote separate from the generic research-track advancement price.
 */
export function endeavourScienceDeviceBuildCost(
  progress: unknown,
  deviceId: EndeavourScienceDeviceId,
): number | null {
  const track = endeavourResearchTrack(progress, deviceId);
  return BUILD_COSTS[deviceId][track.crossedBoxes] ?? null;
}

export function parseEndeavourScienceDevicesState(value: unknown): EndeavourScienceDevicesState | null {
  if (value === undefined) return Object.freeze({ revision: 0, ecmBuilt: false, detectorBuilt: false });
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).sort().join(',') !== 'detectorBuilt,ecmBuilt,revision' ||
      typeof raw.ecmBuilt !== 'boolean' || typeof raw.detectorBuilt !== 'boolean' ||
      !Number.isSafeInteger(raw.revision) ||
      raw.revision !== Number(raw.ecmBuilt) + Number(raw.detectorBuilt)) return null;
  return Object.freeze({ revision: raw.revision as number, ecmBuilt: raw.ecmBuilt, detectorBuilt: raw.detectorBuilt });
}

export function requireEndeavourScienceDeviceBuilt(value: unknown, deviceId: EndeavourScienceDeviceId): void {
  const state = parseEndeavourScienceDevicesState(value);
  if (!state) throw new Error('Science device construction state is malformed.');
  if (!(deviceId === 'ecm-device' ? state.ecmBuilt : state.detectorBuilt)) {
    throw new Error(`Build the ${deviceId === 'ecm-device' ? 'ECM Device' : 'Wolf Agent Detector'} before use.`);
  }
}

/** Resolve a source-priced construction and the corresponding Shepherd debit. */
export function resolveEndeavourScienceDeviceBuild(input: Readonly<{
  state: unknown;
  progress: unknown;
  deviceId: EndeavourScienceDeviceId;
  expectedRevision: number;
  shepherdMaterials: number;
}>): Readonly<{ state: EndeavourScienceDevicesState; materialCost: number; shepherdMaterials: number }> {
  if (input.deviceId !== 'ecm-device' && input.deviceId !== 'wolf-agent-detector') {
    throw new Error('Unknown Endeavour science device.');
  }
  const state = parseEndeavourScienceDevicesState(input.state);
  if (!state) throw new Error('Science device construction state is malformed.');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision ||
      state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Science device construction changed; refresh before purchasing.');
  }
  if (input.deviceId === 'ecm-device' ? state.ecmBuilt : state.detectorBuilt) {
    throw new Error('This science device has already been built.');
  }
  const materialCost = endeavourScienceDeviceBuildCost(input.progress, input.deviceId);
  if (materialCost === null) throw new Error('Research has not unlocked this device purchase.');
  if (!Number.isSafeInteger(input.shepherdMaterials) || input.shepherdMaterials < materialCost) {
    throw new Error('Shepherd does not have enough materials for this science device.');
  }
  return Object.freeze({
    state: Object.freeze({ ...state, revision: state.revision + 1,
      ...(input.deviceId === 'ecm-device' ? { ecmBuilt: true } : { detectorBuilt: true }) }),
    materialCost,
    shepherdMaterials: input.shepherdMaterials - materialCost,
  });
}
