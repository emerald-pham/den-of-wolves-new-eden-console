import { consoleMetadataFor } from './consoleMetadata';

const track = (name: string, materialCosts: readonly number[]) => Object.freeze({
  name,
  materialCosts: Object.freeze([...materialCosts]),
});

export const ENDEAVOUR_RESEARCH_TRACKS = Object.freeze({
  reactor: track('Reactor', [8, 7, 6, 5, 4]),
  'jump-drive': track('Jump Drive', [14, 10, 6, 4, 3]),
  hydroponics: track('Hydroponics', [8, 4, 2, 1, 1]),
  'water-reclamation': track('Water Reclamation', [8, 4, 2, 1, 1]),
  'advanced-hydroponics': track('Advanced Hydroponics', [18, 14, 10, 6, 3]),
  'water-production': track('Water Production', [18, 14, 10, 6, 3]),
  'fuel-refinery': track('Fuel Refinery', [14, 12, 8, 6, 5]),
  'mining-drone-control': track('Mining Drone Control', [18, 14, 10, 6, 4]),
  'ram-scoop': track('Ram Scoop', [14, 12, 10, 8, 5]),
  'command-and-control': track('Command and Control', [12, 9, 7, 5, 6]),
  'point-defence-lasers': track('Point Defence Lasers', [12, 11, 8, 5, 2]),
  'missile-launchers': track('Missile Launchers', [12, 10, 7, 5, 3]),
  'ecm-device': track('ECM Device', [18, 13, 9, 7, 5]),
  'wolf-agent-detector': track('Wolf Agent Detector', [18, 12, 7, 5]),
} as const);

export type EndeavourResearchTrackId = keyof typeof ENDEAVOUR_RESEARCH_TRACKS;
export type EndeavourResearchProgress = Readonly<Partial<Record<EndeavourResearchTrackId, number>>>;

export interface EndeavourResearchTrackView {
  readonly trackId: EndeavourResearchTrackId;
  readonly name: string;
  readonly crossedBoxes: number;
  readonly totalBoxes: number;
  readonly currentMaterialCost: number | null;
  readonly complete: boolean;
}

export interface EndeavourResearchAdvance {
  readonly progress: EndeavourResearchProgress;
  readonly crossedBox: number;
  readonly previousMaterialCost: number;
  readonly track: EndeavourResearchTrackView;
}

const TRACK_IDS = Object.freeze(Object.keys(ENDEAVOUR_RESEARCH_TRACKS) as EndeavourResearchTrackId[]);
const TRACK_ID_SET = new Set<string>(TRACK_IDS);

const CONSOLE_TRACK_BY_SYSTEM_ID: Readonly<Record<string, EndeavourResearchTrackId>> = Object.freeze({
  reactor: 'reactor',
  'jump-drive': 'jump-drive',
  hydroponics: 'hydroponics',
  'water-reclamation': 'water-reclamation',
  'advanced-hydroponics': 'advanced-hydroponics',
  'advanced-hydroponics-ii': 'advanced-hydroponics',
  'water-production': 'water-production',
  'water-production-ii': 'water-production',
  'fuel-refinery': 'fuel-refinery',
  'fuel-refinery-ii': 'fuel-refinery',
  'mining-drone-control': 'mining-drone-control',
  'ram-scoop': 'ram-scoop',
  'command-and-control': 'command-and-control',
  'point-defence-lasers': 'point-defence-lasers',
  'missile-launchers': 'missile-launchers',
});

function canonicalProgress(value: unknown): EndeavourResearchProgress {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Endeavour research progress must be a canonical record.');
  }
  return value as EndeavourResearchProgress;
}

function requireTrackId(value: unknown): asserts value is EndeavourResearchTrackId {
  if (typeof value !== 'string' || !TRACK_ID_SET.has(value)) {
    throw new Error('Unknown Endeavour research track.');
  }
}

function crossedBoxesFor(progressValue: unknown, trackId: EndeavourResearchTrackId): number {
  const progress = canonicalProgress(progressValue);
  for (const [candidateId, candidateValue] of Object.entries(progress)) {
    if (!TRACK_ID_SET.has(candidateId)) throw new Error('Endeavour research progress contains an unknown track.');
    const costs = ENDEAVOUR_RESEARCH_TRACKS[candidateId as EndeavourResearchTrackId].materialCosts;
    if (!Number.isInteger(candidateValue) || candidateValue < 0 || candidateValue > costs.length) {
      throw new Error('Endeavour research progress contains an invalid crossed-box count.');
    }
  }
  return progress[trackId] ?? 0;
}

/** Return the next printed material cost after crossing boxes strictly from left to right. */
export function endeavourResearchTrack(
  progress: unknown,
  trackId: EndeavourResearchTrackId,
): EndeavourResearchTrackView {
  requireTrackId(trackId);
  const definition = ENDEAVOUR_RESEARCH_TRACKS[trackId];
  const crossedBoxes = crossedBoxesFor(progress, trackId);
  return {
    trackId,
    name: definition.name,
    crossedBoxes,
    totalBoxes: definition.materialCosts.length,
    currentMaterialCost: definition.materialCosts[crossedBoxes] ?? null,
    complete: crossedBoxes === definition.materialCosts.length,
  };
}

/** Cross exactly the left-most remaining box; callers cannot select or skip a box. */
export function advanceEndeavourResearch(
  progress: unknown,
  trackId: EndeavourResearchTrackId,
): EndeavourResearchAdvance {
  requireTrackId(trackId);
  const canonical = canonicalProgress(progress);
  const before = endeavourResearchTrack(canonical, trackId);
  if (before.complete || before.currentMaterialCost === null) {
    throw new Error(`${before.name} research is already complete.`);
  }
  const nextProgress = Object.freeze({ ...canonical, [trackId]: before.crossedBoxes + 1 });
  return {
    progress: nextProgress,
    crossedBox: before.crossedBoxes,
    previousMaterialCost: before.currentMaterialCost,
    track: endeavourResearchTrack(nextProgress, trackId),
  };
}

/** Map a canonical ship console to its shared Endeavour research track. */
export function endeavourResearchTrackForConsole(
  shipId: string,
  systemId: string,
): EndeavourResearchTrackId | null {
  if (!consoleMetadataFor(shipId, systemId)) return null;
  return CONSOLE_TRACK_BY_SYSTEM_ID[systemId] ?? null;
}
