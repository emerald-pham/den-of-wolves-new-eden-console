import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export type EndeavourResearchFunding = 'standard' | 'shepherd-ore';
export type EndeavourScienceDeviceId = 'ecm-device' | 'wolf-agent-detector';

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
  readonly scienceDevices?: EndeavourScienceDevicesView;
}

export interface EndeavourScienceDevicesView {
  readonly revision: number;
  readonly ecmBuilt: boolean;
  readonly detectorBuilt: boolean;
  readonly ecmUsed: boolean;
  readonly shepherdMaterials: number;
  readonly buildCosts: Readonly<Record<EndeavourScienceDeviceId, number | null>>;
}

export interface EndeavourScienceDeviceAttempt {
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedControlRevision: number;
  readonly expectedResearchRevision: number;
  readonly expectedDeviceRevision: number;
  readonly expectedCycle: number;
  readonly deviceId: EndeavourScienceDeviceId;
}

export interface EndeavourScienceDeviceReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly cycle: number;
  readonly deviceId: EndeavourScienceDeviceId;
  readonly deviceRevision: number;
  readonly built: true;
  readonly materialCost: number;
  readonly shepherdMaterials: number;
}

export interface EndeavourResearchAttempt {
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedControlRevision: number;
  readonly expectedResearchRevision: number;
  readonly expectedCycle: number;
  readonly trackId: string;
  readonly funding: EndeavourResearchFunding;
}

export interface EndeavourResearchStaleReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly trackId: string;
  readonly funding: EndeavourResearchFunding;
  readonly expected: Readonly<{ cycle: number; controlRevision: number; researchRevision: number }>;
  readonly current: Readonly<{ cycle: number; controlRevision: number; researchRevision: number }>;
}

export type EndeavourResearchMutationResult =
  | Readonly<{ status: 'committed' | 'replayed' }>
  | EndeavourResearchStaleReply;

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
    'fieldUpgradeState', 'scienceDevices',
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

  const rawDevices = value.scienceDevices;
  if (!isRecord(rawDevices) || !hasExactKeys(rawDevices, [
    'revision', 'ecmBuilt', 'detectorBuilt', 'ecmUsed', 'shepherdMaterials', 'buildCosts',
  ]) || !isCounter(rawDevices.revision) || rawDevices.revision > 2 ||
      typeof rawDevices.ecmBuilt !== 'boolean' || typeof rawDevices.detectorBuilt !== 'boolean' ||
      rawDevices.revision !== Number(rawDevices.ecmBuilt) + Number(rawDevices.detectorBuilt) ||
      typeof rawDevices.ecmUsed !== 'boolean' || (rawDevices.ecmUsed && !rawDevices.ecmBuilt) ||
      !isCounter(rawDevices.shepherdMaterials) || !isRecord(rawDevices.buildCosts) ||
      !hasExactKeys(rawDevices.buildCosts, ['ecm-device', 'wolf-agent-detector'])) return null;
  const validBuildCost = (cost: unknown): cost is number | null =>
    cost === null || (isCounter(cost) && [5, 7, 9, 10, 12, 13, 18].includes(cost));
  if (!validBuildCost(rawDevices.buildCosts['ecm-device']) ||
      !validBuildCost(rawDevices.buildCosts['wolf-agent-detector'])) return null;

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
    scienceDevices: {
      revision: rawDevices.revision,
      ecmBuilt: rawDevices.ecmBuilt,
      detectorBuilt: rawDevices.detectorBuilt,
      ecmUsed: rawDevices.ecmUsed,
      shepherdMaterials: rawDevices.shepherdMaterials,
      buildCosts: {
        'ecm-device': rawDevices.buildCosts['ecm-device'] as number | null,
        'wolf-agent-detector': rawDevices.buildCosts['wolf-agent-detector'] as number | null,
      },
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

function assertCurrentScientistAuthority(
  sessionId: string,
  uid: string,
  expectedControlRevision?: number,
  expectedCycle?: number,
): void {
  requireFreshSessionAuthority();
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  if (!session || !me || session.id !== sessionId || me.sessionId !== sessionId || me.uid !== uid ||
      me.role !== 'player' || me.activeConsoleRoleId !== 'shepherd-scientist' ||
      !session.activeRoleIds?.includes('shepherd-scientist') || control?.ownerRoleId !== 'shepherd-scientist' ||
      control.holderUid !== uid ||
      (expectedControlRevision !== undefined && control.revision !== expectedControlRevision) ||
      (expectedCycle !== undefined && session.currentTurn !== expectedCycle)) {
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

export function createEndeavourResearchAttempt(input: Readonly<{
  workspace: EndeavourResearchWorkspace;
  trackId: string;
  funding: EndeavourResearchFunding;
}>): EndeavourResearchAttempt {
  const { session, control } = currentScientistAuthority();
  if (input.workspace.sessionId !== session.id || input.workspace.cycle !== session.currentTurn ||
      !Number.isSafeInteger(input.workspace.researchRevision) ||
      input.workspace.researchRevision >= Number.MAX_SAFE_INTEGER ||
      !input.workspace.tracks.some((track) => track.trackId === input.trackId && !track.complete) ||
      (input.funding !== 'standard' && input.funding !== 'shepherd-ore')) {
    throw new Error('Endeavour research changed. Refresh before choosing.');
  }
  return Object.freeze({
    sessionId: session.id,
    requestId: requestId(),
    expectedControlRevision: control.revision,
    expectedResearchRevision: input.workspace.researchRevision,
    expectedCycle: input.workspace.cycle,
    trackId: input.trackId,
    funding: input.funding,
  });
}

export function createEndeavourScienceDeviceAttempt(input: Readonly<{
  workspace: EndeavourResearchWorkspace;
  deviceId: EndeavourScienceDeviceId;
}>): EndeavourScienceDeviceAttempt {
  const { session, control } = currentScientistAuthority();
  const devices = input.workspace.scienceDevices;
  const built = input.deviceId === 'ecm-device' ? devices?.ecmBuilt : devices?.detectorBuilt;
  const cost = devices?.buildCosts[input.deviceId];
  if (input.workspace.sessionId !== session.id || input.workspace.cycle !== session.currentTurn ||
      !Number.isSafeInteger(input.workspace.researchRevision) ||
      input.workspace.researchRevision >= Number.MAX_SAFE_INTEGER || !devices || built ||
      (input.deviceId === 'ecm-device' && devices.ecmUsed) || !isCounter(devices.revision) ||
      devices.revision > 1 || cost === null || cost === undefined || devices.shepherdMaterials < cost) {
    if (devices && cost !== null && cost !== undefined && devices.shepherdMaterials < cost) {
      throw new Error('Shepherd does not have enough materials for this science device.');
    }
    throw new Error('Endeavour science device state changed or this purchase is unavailable. Refresh before building.');
  }
  return Object.freeze({
    sessionId: session.id,
    requestId: requestId(),
    expectedControlRevision: control.revision,
    expectedResearchRevision: input.workspace.researchRevision,
    expectedDeviceRevision: devices.revision,
    expectedCycle: input.workspace.cycle,
    deviceId: input.deviceId,
  });
}

function assertWellFormedScienceDeviceAttempt(
  attempt: EndeavourScienceDeviceAttempt,
  sessionId: string,
): void {
  if (!attempt || attempt.sessionId !== sessionId ||
      typeof attempt.requestId !== 'string' || !/^[\w-]{1,128}$/.test(attempt.requestId) ||
      !isCounter(attempt.expectedControlRevision) || !isCounter(attempt.expectedResearchRevision) ||
      attempt.expectedResearchRevision >= Number.MAX_SAFE_INTEGER ||
      !isCounter(attempt.expectedDeviceRevision) || attempt.expectedDeviceRevision > 1 ||
      !isCounter(attempt.expectedCycle) || attempt.expectedCycle < 1 ||
      (attempt.deviceId !== 'ecm-device' && attempt.deviceId !== 'wolf-agent-detector')) {
    throw new Error('Endeavour science device state changed. Refresh before building.');
  }
}

function scienceDevicePayload(attempt: EndeavourScienceDeviceAttempt) {
  return {
    sessionId: attempt.sessionId,
    requestId: attempt.requestId,
    expectedControlRevision: attempt.expectedControlRevision,
    expectedResearchRevision: attempt.expectedResearchRevision,
    expectedDeviceRevision: attempt.expectedDeviceRevision,
    expectedCycle: attempt.expectedCycle,
    deviceId: attempt.deviceId,
  };
}

function parseScienceDeviceReply(
  value: unknown,
  attempt: EndeavourScienceDeviceAttempt,
): EndeavourScienceDeviceReply | null {
  const fields = [
    'status', 'sessionId', 'requestId', 'cycle', 'deviceId', 'deviceRevision', 'built', 'materialCost',
    'shepherdMaterials',
  ];
  if (!isRecord(value) || !hasExactKeys(value, fields) ||
      (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== attempt.sessionId || value.requestId !== attempt.requestId ||
      value.cycle !== attempt.expectedCycle || value.deviceId !== attempt.deviceId || value.built !== true ||
      value.deviceRevision !== attempt.expectedDeviceRevision + 1 || !isCounter(value.materialCost) ||
      !isCounter(value.shepherdMaterials)) return null;
  const validCosts = attempt.deviceId === 'ecm-device' ? [18, 13, 9, 7, 5] : [18, 12, 10];
  if (!validCosts.includes(value.materialCost)) return null;
  return {
    status: value.status,
    sessionId: attempt.sessionId,
    requestId: attempt.requestId,
    cycle: attempt.expectedCycle,
    deviceId: attempt.deviceId,
    deviceRevision: attempt.expectedDeviceRevision + 1,
    built: true,
    materialCost: value.materialCost,
    shepherdMaterials: value.shepherdMaterials,
  };
}

async function submitScienceDeviceAttempt(
  attempt: EndeavourScienceDeviceAttempt,
  exactRetry: boolean,
): Promise<EndeavourScienceDeviceReply> {
  const { session, me } = currentScientistAuthority();
  assertWellFormedScienceDeviceAttempt(attempt, session.id);
  if (!exactRetry && (attempt.expectedCycle !== session.currentTurn ||
      attempt.expectedControlRevision !== session.shuttleControl?.endeavour?.revision)) {
    throw new Error('Endeavour science device authority changed. Refresh before building.');
  }
  const response = await httpsCallable<ReturnType<typeof scienceDevicePayload>, unknown>(
    functions(), 'buildEndeavourScienceDevice',
  )(scienceDevicePayload(attempt));
  assertCurrentScientistAuthority(attempt.sessionId, me.uid,
    exactRetry ? undefined : attempt.expectedControlRevision,
    exactRetry ? undefined : attempt.expectedCycle);
  const result = parseScienceDeviceReply(response.data, attempt);
  if (!result) throw new Error('The server returned an invalid Endeavour science device result.');
  return result;
}

/** Build one unlocked device using the exact source quote shown in the private workspace. */
export function buildEndeavourScienceDevice(
  attempt: EndeavourScienceDeviceAttempt,
): Promise<EndeavourScienceDeviceReply> {
  return submitScienceDeviceAttempt(attempt, false);
}

/** Confirm an uncertain purchase using its immutable request after a same-holder rollover. */
export function retryUncertainEndeavourScienceDevice(
  attempt: EndeavourScienceDeviceAttempt,
): Promise<EndeavourScienceDeviceReply> {
  return submitScienceDeviceAttempt(attempt, true);
}

function parseStaleReply(value: unknown, attempt: EndeavourResearchAttempt): EndeavourResearchStaleReply | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'status', 'sessionId', 'requestId', 'trackId', 'funding', 'expected', 'current',
  ]) || value.status !== 'stale' || value.sessionId !== attempt.sessionId ||
      value.requestId !== attempt.requestId || value.trackId !== attempt.trackId || value.funding !== attempt.funding ||
      !isRecord(value.expected) || !hasExactKeys(value.expected, ['cycle', 'controlRevision', 'researchRevision']) ||
      !isRecord(value.current) || !hasExactKeys(value.current, ['cycle', 'controlRevision', 'researchRevision'])) return null;
  const expected = value.expected;
  const current = value.current;
  if (!isCounter(expected.cycle) || !isCounter(expected.controlRevision) || !isCounter(expected.researchRevision) ||
      !isCounter(current.cycle) || !isCounter(current.controlRevision) || !isCounter(current.researchRevision) ||
      expected.cycle !== attempt.expectedCycle || expected.controlRevision !== attempt.expectedControlRevision ||
      expected.researchRevision !== attempt.expectedResearchRevision ||
      current.cycle !== attempt.expectedCycle || current.controlRevision !== attempt.expectedControlRevision ||
      current.researchRevision <= attempt.expectedResearchRevision ||
      current.researchRevision >= Number.MAX_SAFE_INTEGER) return null;
  return {
    status: 'stale',
    sessionId: attempt.sessionId,
    requestId: attempt.requestId,
    trackId: attempt.trackId,
    funding: attempt.funding,
    expected: {
      cycle: expected.cycle,
      controlRevision: expected.controlRevision,
      researchRevision: expected.researchRevision,
    },
    current: {
      cycle: current.cycle,
      controlRevision: current.controlRevision,
      researchRevision: current.researchRevision,
    },
  };
}

function parseCommittedReply(value: unknown, attempt: EndeavourResearchAttempt): EndeavourResearchMutationResult | null {
  const fields = [
    'status', 'sessionId', 'requestId', 'cycle', 'researchRevision', 'trackId', 'funding',
    'oreCost', 'previousMaterialCost', 'currentMaterialCost', 'shepherdOre', 'progress', 'cadence',
  ];
  if (!isRecord(value) || !hasExactKeys(value, fields) ||
      (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== attempt.sessionId || value.requestId !== attempt.requestId ||
      value.cycle !== attempt.expectedCycle || value.researchRevision !== attempt.expectedResearchRevision + 1 ||
      value.trackId !== attempt.trackId || value.funding !== attempt.funding ||
      value.oreCost !== (attempt.funding === 'standard' ? 0 : 5) ||
      !isCounter(value.previousMaterialCost) ||
      (value.currentMaterialCost !== null && !isCounter(value.currentMaterialCost)) ||
      !isCounter(value.shepherdOre) || !isRecord(value.progress) || !isRecord(value.cadence)) return null;
  if (Object.getPrototypeOf(value.progress) !== Object.prototype ||
      Object.entries(value.progress).some(([trackId, count]) =>
        !/^[a-z][a-z0-9-]{0,127}$/.test(trackId) || !isCounter(count)) ||
      !isCounter(value.progress[attempt.trackId]) || (value.progress[attempt.trackId] as number) < 1) return null;
  const cadence = value.cadence;
  if (!hasExactKeys(cadence, ['cycle', 'revision', 'choices']) ||
      cadence.cycle !== attempt.expectedCycle || cadence.revision !== attempt.expectedResearchRevision + 1 ||
      !Array.isArray(cadence.choices) || cadence.choices.length === 0 || cadence.choices.length > 5) return null;
  const chosenTracks = new Set<string>();
  let standardChoices = 0;
  let oreChoices = 0;
  const choices = cadence.choices;
  for (const choice of choices) {
    if (!isRecord(choice) || !hasExactKeys(choice, ['trackId', 'funding', 'oreCost']) ||
        typeof choice.trackId !== 'string' || !/^[a-z][a-z0-9-]{0,127}$/.test(choice.trackId) ||
        chosenTracks.has(choice.trackId) ||
        (choice.funding !== 'standard' && choice.funding !== 'shepherd-ore') ||
        choice.oreCost !== (choice.funding === 'standard' ? 0 : 5)) return null;
    chosenTracks.add(choice.trackId);
    if (choice.funding === 'standard') standardChoices += 1;
    else oreChoices += 1;
  }
  const lastChoice = choices.at(-1);
  if (standardChoices > 3 || oreChoices > 2 || !isRecord(lastChoice) ||
      lastChoice.trackId !== attempt.trackId || lastChoice.funding !== attempt.funding ||
      !isCounter(value.previousMaterialCost) || (value.previousMaterialCost as number) < 1 ||
      (value.currentMaterialCost !== null && (value.currentMaterialCost as number) < 1)) return null;
  return { status: value.status };
}

function assertWellFormedAttempt(attempt: EndeavourResearchAttempt, sessionId: string): void {
  if (!attempt || attempt.sessionId !== sessionId ||
      typeof attempt.requestId !== 'string' || !/^[\w-]{1,128}$/.test(attempt.requestId) ||
      !isCounter(attempt.expectedResearchRevision) || attempt.expectedResearchRevision >= Number.MAX_SAFE_INTEGER ||
      !isCounter(attempt.expectedControlRevision) || !isCounter(attempt.expectedCycle) ||
      typeof attempt.trackId !== 'string' || !/^[a-z][a-z0-9-]{0,127}$/.test(attempt.trackId) ||
      (attempt.funding !== 'standard' && attempt.funding !== 'shepherd-ore')) {
    throw new Error('Endeavour research changed. Refresh before choosing.');
  }
}

function requestPayload(attempt: EndeavourResearchAttempt) {
  return {
    sessionId: attempt.sessionId,
    requestId: attempt.requestId,
    expectedControlRevision: attempt.expectedControlRevision,
    expectedResearchRevision: attempt.expectedResearchRevision,
    expectedCycle: attempt.expectedCycle,
    trackId: attempt.trackId,
    funding: attempt.funding,
  };
}

export async function advanceEndeavourResearchTrack(
  input: EndeavourResearchAttempt | Readonly<{
    workspace: EndeavourResearchWorkspace;
    trackId: string;
    funding: EndeavourResearchFunding;
  }>,
): Promise<EndeavourResearchMutationResult> {
  const attempt = 'workspace' in input ? createEndeavourResearchAttempt(input) : input;
  const { session, me } = currentScientistAuthority();
  assertWellFormedAttempt(attempt, session.id);
  if (attempt.expectedCycle !== session.currentTurn ||
      attempt.expectedControlRevision !== session.shuttleControl?.endeavour?.revision) {
    throw new Error('Endeavour research changed. Refresh before choosing.');
  }
  const payload = requestPayload(attempt);
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'advanceEndeavourResearchTrack',
  )(payload);
  assertCurrentScientistAuthority(attempt.sessionId, me.uid);
  const stale = parseStaleReply(response.data, attempt);
  if (stale) return stale;
  // A committed result still needs its original CAS context. If authority rolled
  // while it was in flight, the panel must confirm through the exact replay path.
  assertCurrentScientistAuthority(attempt.sessionId, me.uid, attempt.expectedControlRevision, attempt.expectedCycle);
  const committed = parseCommittedReply(response.data, attempt);
  if (committed) return committed;
  throw new Error('The server returned an invalid Endeavour research result.');
}

export async function retryEndeavourResearchAttempt(
  attempt: EndeavourResearchAttempt,
): Promise<EndeavourResearchMutationResult> {
  const { session, me } = currentScientistAuthority();
  assertWellFormedAttempt(attempt, session.id);
  const payload = requestPayload(attempt);
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'advanceEndeavourResearchTrack',
  )(payload);
  // Exact replay is safe across cycle/control changes because the immutable payload
  // reaches the server's receipt check first. Still discard any reply after authority loss.
  assertCurrentScientistAuthority(attempt.sessionId, me.uid);
  const stale = parseStaleReply(response.data, attempt);
  if (stale) return stale;
  const committed = parseCommittedReply(response.data, attempt);
  if (committed) return committed;
  throw new Error('The server returned an invalid Endeavour research result.');
}
