import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export type EndeavourResearchFunding = 'standard' | 'shepherd-ore';

export interface EndeavourResearchTrackView {
  readonly trackId: string;
  readonly name: string;
  readonly crossedBoxes: number;
  readonly totalBoxes: number;
  readonly currentMaterialCost: number | null;
  readonly complete: boolean;
}

export interface EndeavourResearchChoice {
  readonly trackId: string;
  readonly funding: EndeavourResearchFunding;
  readonly oreCost: 0 | 5;
}

export interface EndeavourResearchWorkspace {
  readonly status: 'ready';
  readonly sessionId: string;
  readonly cycle: number;
  readonly researchRevision: number;
  readonly cadence: Readonly<{
    cycle: number;
    revision: number;
    choices: readonly EndeavourResearchChoice[];
  }>;
  readonly progress: Readonly<Record<string, number>>;
  readonly tracks: readonly EndeavourResearchTrackView[];
  readonly shepherdOre: number;
  readonly fieldUpgradeState: Readonly<{
    upgradeRevision: number;
    targetsUsedThisCycle: number;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => keys.includes(key));
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseWorkspace(value: unknown, expectedSessionId: string): EndeavourResearchWorkspace | null {
  const fields = [
    'status', 'sessionId', 'cycle', 'researchRevision', 'cadence', 'progress', 'tracks', 'shepherdOre',
    'fieldUpgradeState',
  ];
  if (!isRecord(value) || !hasExactKeys(value, fields) || value.status !== 'ready' ||
      value.sessionId !== expectedSessionId || !isCounter(value.cycle) || value.cycle < 1 ||
      !isCounter(value.researchRevision) || !isCounter(value.shepherdOre) ||
      !isRecord(value.progress) || !Array.isArray(value.tracks) || value.tracks.length === 0 ||
      !isRecord(value.fieldUpgradeState) ||
      !hasExactKeys(value.fieldUpgradeState, ['upgradeRevision', 'targetsUsedThisCycle']) ||
      !isCounter(value.fieldUpgradeState.upgradeRevision) ||
      value.fieldUpgradeState.upgradeRevision >= Number.MAX_SAFE_INTEGER ||
      !isCounter(value.fieldUpgradeState.targetsUsedThisCycle) ||
      value.fieldUpgradeState.targetsUsedThisCycle > 4 ||
      !isRecord(value.cadence) || !hasExactKeys(value.cadence, ['cycle', 'revision', 'choices']) ||
      value.cadence.cycle !== value.cycle || value.cadence.revision !== value.researchRevision ||
      !Array.isArray(value.cadence.choices)) return null;

  const progress: Record<string, number> = {};
  for (const [trackId, count] of Object.entries(value.progress)) {
    if (!/^[a-z][a-z0-9-]{0,127}$/.test(trackId) || !isCounter(count)) return null;
    progress[trackId] = count;
  }

  const trackIds = new Set<string>();
  const tracks: EndeavourResearchTrackView[] = [];
  for (const rawTrack of value.tracks) {
    const trackFields = ['trackId', 'name', 'crossedBoxes', 'totalBoxes', 'currentMaterialCost', 'complete'];
    if (!isRecord(rawTrack) || !hasExactKeys(rawTrack, trackFields) ||
        typeof rawTrack.trackId !== 'string' || !/^[a-z][a-z0-9-]{0,127}$/.test(rawTrack.trackId) ||
        trackIds.has(rawTrack.trackId) || typeof rawTrack.name !== 'string' || rawTrack.name.length === 0 ||
        !isCounter(rawTrack.crossedBoxes) || typeof rawTrack.totalBoxes !== 'number' ||
        !Number.isSafeInteger(rawTrack.totalBoxes) || rawTrack.totalBoxes < 1 ||
        rawTrack.crossedBoxes > rawTrack.totalBoxes ||
        (rawTrack.currentMaterialCost !== null &&
          (!isCounter(rawTrack.currentMaterialCost) || rawTrack.currentMaterialCost < 1)) ||
        typeof rawTrack.complete !== 'boolean' ||
        rawTrack.complete !== (rawTrack.crossedBoxes === rawTrack.totalBoxes) ||
        (rawTrack.complete !== (rawTrack.currentMaterialCost === null))) return null;
    trackIds.add(rawTrack.trackId);
    tracks.push({
      trackId: rawTrack.trackId,
      name: rawTrack.name,
      crossedBoxes: rawTrack.crossedBoxes,
      totalBoxes: rawTrack.totalBoxes,
      currentMaterialCost: rawTrack.currentMaterialCost as number | null,
      complete: rawTrack.complete,
    });
  }

  const choices: EndeavourResearchChoice[] = [];
  const choiceTracks = new Set<string>();
  let standardCount = 0;
  let oreCount = 0;
  for (const rawChoice of value.cadence.choices) {
    if (!isRecord(rawChoice) || !hasExactKeys(rawChoice, ['trackId', 'funding', 'oreCost']) ||
        typeof rawChoice.trackId !== 'string' || !trackIds.has(rawChoice.trackId) ||
        choiceTracks.has(rawChoice.trackId) ||
        (rawChoice.funding !== 'standard' && rawChoice.funding !== 'shepherd-ore') ||
        rawChoice.oreCost !== (rawChoice.funding === 'standard' ? 0 : 5)) return null;
    choiceTracks.add(rawChoice.trackId);
    if (rawChoice.funding === 'standard') standardCount += 1;
    else oreCount += 1;
    choices.push({
      trackId: rawChoice.trackId,
      funding: rawChoice.funding,
      oreCost: rawChoice.oreCost as 0 | 5,
    });
  }
  if (standardCount > 3 || oreCount > 2 || value.researchRevision < choices.length) return null;

  return {
    status: 'ready',
    sessionId: expectedSessionId,
    cycle: value.cycle,
    researchRevision: value.researchRevision,
    cadence: { cycle: value.cycle, revision: value.researchRevision, choices },
    progress,
    tracks,
    shepherdOre: value.shepherdOre,
    fieldUpgradeState: {
      upgradeRevision: value.fieldUpgradeState.upgradeRevision,
      targetsUsedThisCycle: value.fieldUpgradeState.targetsUsedThisCycle,
    },
  };
}

function currentScientistAuthority() {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  if (!session || !me?.uid || me.sessionId !== session.id || me.role !== 'player' ||
      me.activeConsoleRoleId !== 'shepherd-scientist' ||
      !session.activeRoleIds?.includes('shepherd-scientist') ||
      control?.shuttleId !== 'endeavour' || control.ownerRoleId !== 'shepherd-scientist' ||
      control.holderUid !== me.uid || !Number.isSafeInteger(control.revision) || control.revision < 0) {
    throw new Error('Reconnect as the current Shepherd Scientist holding Endeavour.');
  }
  requireFreshSessionAuthority();
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before viewing Endeavour research.');
  return { session, me, control, checkpoint };
}

function assertCurrentScientistAuthority(sessionId: string, uid: string): void {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  if (!isCurrentSessionAuthority(captureSessionAuthority(sessionId, uid)) ||
      session?.id !== sessionId || me?.sessionId !== sessionId || me.uid !== uid || me.role !== 'player' ||
      me.activeConsoleRoleId !== 'shepherd-scientist' ||
      !session.activeRoleIds?.includes('shepherd-scientist') ||
      control?.ownerRoleId !== 'shepherd-scientist' || control.holderUid !== uid) {
    throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
  }
}

function requestId(): string {
  return window.crypto.randomUUID();
}

export async function readEndeavourResearchWorkspace(): Promise<EndeavourResearchWorkspace> {
  const { session, me, checkpoint } = currentScientistAuthority();
  const response = await httpsCallable<{ sessionId: string }, unknown>(
    functions(), 'readEndeavourResearchWorkspace',
  )({ sessionId: session.id });
  if (!isCurrentSessionAuthority(checkpoint)) {
    throw new Error('Endeavour authority changed. Reconnect and refresh the Scientist console.');
  }
  assertCurrentScientistAuthority(session.id, me.uid);
  const workspace = parseWorkspace(response.data, session.id);
  if (!workspace) throw new Error('The server returned invalid Endeavour research data.');
  return workspace;
}

export async function advanceEndeavourResearchTrack(input: Readonly<{
  workspace: EndeavourResearchWorkspace;
  trackId: string;
  funding: EndeavourResearchFunding;
}>): Promise<void> {
  const { session, control } = currentScientistAuthority();
  if (input.workspace.sessionId !== session.id || input.workspace.cycle !== session.currentTurn ||
      !Number.isSafeInteger(input.workspace.researchRevision) ||
      !input.workspace.tracks.some((track) => track.trackId === input.trackId && !track.complete)) {
    throw new Error('Endeavour research changed. Refresh before choosing.');
  }
  const payload = {
    sessionId: session.id,
    requestId: requestId(),
    expectedControlRevision: control.revision,
    expectedResearchRevision: input.workspace.researchRevision,
    expectedCycle: input.workspace.cycle,
    trackId: input.trackId,
    funding: input.funding,
  };
  await httpsCallable<typeof payload, unknown>(functions(), 'advanceEndeavourResearchTrack')(payload);
}
