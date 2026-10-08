import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { AwayMissionLifecycleAuthorityContext } from './awayMissionLifecycleCallable';
import { projectAwayMissionPublicState, type AwayMissionLifecycleRecord } from './awayMissionLifecycleAdapter';
import { applyEndeavourResearchReward, type EndeavourResearchRewardEffect } from './endeavourResearch';
import { parseEndeavourResearchCadenceState } from './endeavourResearchCadence';
import { missionResearchRewardEffects, planMissionConsoleRewards } from './missionRewardDelivery';
import { parseMissionNebulaBenefits } from './missionNebulaBenefits';
import { isStarSystemCoordinate } from './navigation';
import { organiserSitesForChart, type ChartId } from './starChartLookup';
import { wolfAttackWindowState } from './wolfAttackWindow';
import type { FleetGroupRecord } from './fleetGroups';
import { requireWolfAttackWindowRequest } from './requestGuards';

type Context = AwayMissionLifecycleAuthorityContext & {
  readonly nextRecord: AwayMissionLifecycleRecord;
  readonly currentGroupId?: string;
};

function invalid(message: string): never { throw new HttpsError('failed-precondition', message); }
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
}
function cycle(context: Context): number {
  const current = context.session.get('currentTurn');
  if (!Number.isSafeInteger(current) || (current as number) < context.nextRecord.sourceCycle) invalid('Current mission cycle is unavailable.');
  return current as number;
}
function chart(context: Context): ChartId {
  const current = context.session.get('chartId');
  if ((context.session.get('chartSelectionLocked') !== true && context.session.get('configurationLocked') !== true) ||
      !['A', 'B', 'C'].includes(String(current)) || context.mission.get('chart') !== current) invalid('Mission consequences require their original locked chart.');
  return current as ChartId;
}

/** Use C's single canonical transition. Mission rewards advance revision, never Team quotas or prices. */
async function prepareResearch(db: Firestore, context: Context, effects: readonly EndeavourResearchRewardEffect[]): Promise<() => void> {
  if (!effects.length) return () => undefined;
  const tx = context.transaction as Transaction;
  const progressRef = db.doc(`sessions/${context.sessionId}/serverState/endeavourResearch`);
  const cadenceRef = db.doc(`sessions/${context.sessionId}/serverState/endeavourResearchCadence`);
  const [progress, cadenceSnapshot] = await Promise.all([tx.get(progressRef), tx.get(cadenceRef)]);
  const cadence = parseEndeavourResearchCadenceState(cadenceSnapshot.exists ? cadenceSnapshot.data() : undefined);
  const currentCycle = cycle(context);
  if (!cadence || !revision(cadence.revision) || cadence.cycle > currentCycle) invalid('Research cadence authority is malformed.');
  let next;
  try { next = applyEndeavourResearchReward(progress.exists ? progress.data() : {}, effects); }
  catch { invalid('Research reward authority is malformed.'); }
  const nextCadence = { cycle: currentCycle, revision: cadence.revision + 1,
    choices: cadence.cycle === currentCycle ? [...cadence.choices] : [] };
  return () => { tx.set(progressRef, { ...next }); tx.set(cadenceRef, nextCadence); };
}

/** Revalidate a single changed choice; other opportunities may still await their own targets. */
export async function validateMissionRewardChoice(context: Context): Promise<void> {
  const changed = context.nextRecord.rewardChoices?.filter(selection =>
    JSON.stringify(selection) !== JSON.stringify(context.record.rewardChoices?.find(prior => prior.opportunityId === selection.opportunityId))) ?? [];
  if (changed.length > 1) invalid('Choose one pending mission reward at a time.');
  for (const selection of changed.length ? changed : context.nextRecord.rewardChoices ?? []) {
    const reward = context.nextRecord.rewards?.find(candidate => candidate.opportunityId === selection.opportunityId);
    if (!reward) invalid('The selected mission reward is unavailable.');
    try { planMissionConsoleRewards([reward], [selection], context.nextRecord.legalDropOffShipIds,
      context.session.get('shipUpgrades'), context.session.get('shipDamage')); }
    catch (cause) { invalid(cause instanceof Error ? cause.message : 'The selected mission targets are unavailable.'); }
  }
}

/** Prepared alongside existing mineral/survivor/Boa arithmetic, before any transaction writes. */
export async function prepareMissionRewardConsequences(db: Firestore, context: Context): Promise<Readonly<{
  sessionPatch: Readonly<Record<string, unknown>>; receiptFields: Readonly<Record<string, unknown>>; commit: () => void;
}>> {
  let consolePatch: Readonly<Record<string, unknown>>;
  let researchEffects: readonly EndeavourResearchRewardEffect[];
  try {
    consolePatch = planMissionConsoleRewards(context.nextRecord.rewards ?? [], context.nextRecord.rewardChoices ?? [],
      context.nextRecord.legalDropOffShipIds, context.session.get('shipUpgrades'), context.session.get('shipDamage'));
    // Fixed I3 was settled at resolution; selected research waits for actual reward delivery.
    researchEffects = missionResearchRewardEffects((context.nextRecord.rewards ?? []).map(reward =>
      ({ ...reward, effects: reward.effects.filter(effect => effect.kind !== 'unlockNamedResearch') })), context.nextRecord.rewardChoices ?? []);
  } catch (cause) { invalid(cause instanceof Error ? cause.message : 'Mission reward targets are unavailable.'); }
  const rawRevisions = context.session.get('vesselActionRevisions');
  if (rawRevisions !== undefined && !record(rawRevisions)) invalid('Console action revision authority is malformed.');
  const patch: Record<string, unknown> = { ...consolePatch };
  for (const shipId of new Set(Object.keys(consolePatch).map(field => field.split('.')[1]!))) {
    const current = record(rawRevisions) ? rawRevisions[shipId] ?? 0 : 0;
    if (!revision(current)) invalid('Console action revision authority is malformed.');
    patch[`vesselActionRevisions.${shipId}`] = current + 1;
  }
  return { sessionPatch: patch, receiptFields: { rewardChoices: context.nextRecord.rewardChoices ?? [], researchEffects, consolePatch },
    commit: await prepareResearch(db, context, researchEffects) };
}

export interface MissionWolfPressure {
  readonly type: 'mission-k-attack-schedule'; readonly status: 'scheduled' | 'declared';
  readonly sessionId: string; readonly missionId: string; readonly opportunityId: 'K-1';
  readonly resolutionRevision: number; readonly resolutionRequestId: string; readonly sourceCycle: number;
  readonly groupId: string; readonly chart: ChartId; readonly coordinate: string;
  readonly siteCode: 'K'; readonly arrivalTiming: 'immediate'; readonly vesselIds: readonly string[];
}

/** Parse only the K request shape. Protected source verification still precedes every timing write. */
export function requireMissionAwareWolfAttackWindowRequest(
  data: Parameters<typeof requireWolfAttackWindowRequest>[0],
): ReturnType<typeof requireWolfAttackWindowRequest> {
  if (data.threatSiteCode !== 'K') return requireWolfAttackWindowRequest(data);
  if (data.status !== 'due' || typeof data.targetGroupId !== 'string' ||
      typeof data.threatSourceId !== 'string' || !/^mission-[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(data.threatSourceId)) {
    throw new HttpsError('invalid-argument', 'A K timing choice requires its resolved mission source and current fleet group.');
  }
  const parsed = requireWolfAttackWindowRequest({ ...data, threatSiteCode: 'commander', threatSourceId: undefined });
  return { ...parsed, threatSiteCode: 'K', threatSourceId: data.threatSourceId };
}

/** A visit alone cannot schedule K: it needs a contributor-bearing resolved noncritical attempt. */
export function hasNoncriticalKAttempt(value: AwayMissionLifecycleRecord): boolean {
  return value.lifecycle.siteCode === 'K' && value.status !== 'active' &&
    value.outcomes?.some(outcome => outcome.opportunityId === 'K-1' && outcome.contributorCount > 0 &&
      (outcome.outcome === 'failure' || outcome.outcome === 'success')) === true;
}

/** Verify the protected source on every window/preparation/declaration use. Caller-supplied K grants nothing. */
export function requireLiveMissionWolfSource(input: Readonly<{
  sessionId: string; sourceId: string; currentCycle: number; chart: ChartId;
  group: FleetGroupRecord; activeVesselIds: readonly string[];
  mission: unknown; pressure: unknown;
}>): MissionWolfPressure {
  const missionId = input.sourceId.startsWith('mission-') ? input.sourceId.slice(8) : '';
  const mission = input.mission;
  const pressure = input.pressure;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(missionId) || !record(mission) || !record(pressure) ||
      mission.missionId !== missionId || mission.chart !== input.chart || mission.siteCode !== 'K' ||
      !record(mission.lifecycleRecord)) invalid('The K attack source is unavailable.');
  const resolved = mission.lifecycleRecord as unknown as AwayMissionLifecycleRecord;
  if (!projectAwayMissionPublicState(resolved, resolved.lifecycle?.leaderUid) || !hasNoncriticalKAttempt(resolved) ||
      resolved.sessionId !== input.sessionId || resolved.lifecycle.missionId !== missionId ||
      pressure.type !== 'mission-k-attack-schedule' || pressure.status !== 'scheduled' || pressure.sessionId !== input.sessionId ||
      pressure.missionId !== missionId || pressure.opportunityId !== 'K-1' || pressure.siteCode !== 'K' ||
      pressure.arrivalTiming !== 'immediate' || pressure.chart !== input.chart || pressure.coordinate !== mission.coordinate ||
      organiserSitesForChart(input.chart)[String(pressure.coordinate)]?.code !== 'K' ||
      !revision(pressure.resolutionRevision) || pressure.resolutionRevision !== resolved.resolutionRevision ||
      typeof pressure.resolutionRequestId !== 'string' || pressure.resolutionRequestId !== resolved.resolutionRequestId ||
      !resolved.commandReceipts.some(receipt => receipt.requestId === pressure.resolutionRequestId) ||
      !Number.isSafeInteger(pressure.sourceCycle) || (pressure.sourceCycle as number) < resolved.sourceCycle ||
      (pressure.sourceCycle as number) > input.currentCycle || pressure.groupId !== input.group.id ||
      !(resolved.groupId === input.group.id || input.group.mergedGroupIds?.includes(resolved.groupId)) ||
      !input.group.memberUids.includes(resolved.custody.holderUid) || !Array.isArray(pressure.vesselIds) || pressure.vesselIds.length === 0 ||
      new Set(pressure.vesselIds).size !== pressure.vesselIds.length || pressure.vesselIds.some(shipId =>
        typeof shipId !== 'string' || !input.group.vesselIds.includes(shipId) || !input.activeVesselIds.includes(shipId))) {
    invalid('The K attack source does not match a live resolved attempt for this group.');
  }
  return pressure as unknown as MissionWolfPressure;
}

/** Automatic consequences share the existing resolve transaction and its command receipt. */
export async function prepareResolvedMissionConsequences(db: Firestore, context: Context): Promise<() => void> {
  const tx = context.transaction as Transaction;
  const rewards = context.nextRecord.rewards ?? [];
  const fixed = rewards.flatMap(reward => reward.effects.filter(effect => effect.kind === 'unlockNamedResearch'));
  const commitResearch = await prepareResearch(db, context, fixed.length ?
    [{ trackId: 'ecm-device', marks: 'complete' }, { trackId: 'jump-drive', marks: 'complete' }] : []);
  const suppress = rewards.some(reward => reward.effects.some(effect => effect.kind === 'removeNebulaDamage'));
  const freeExit = rewards.some(reward => reward.effects.some(effect => effect.kind === 'noFuelOnNebulaExit'));
  let commitNebula: (() => void) | undefined;
  let commitAttack: (() => void) | undefined;
  if (suppress || freeExit) {
    const originalChart = chart(context);
    const coordinate = context.mission.get('coordinate');
    const ref = db.doc(`sessions/${context.sessionId}/serverState/navigation`);
    const snapshot = await tx.get(ref);
    const raw = snapshot.exists ? snapshot.data() : undefined;
    const benefits = parseMissionNebulaBenefits(record(raw) ? raw.missionNebulaBenefitsByShip : undefined);
    if (!record(raw) || !record(raw.shipGalacticCoordinates) || !revision(raw.revision) || !benefits ||
        typeof coordinate !== 'string' || !isStarSystemCoordinate(coordinate) ||
        organiserSitesForChart(originalChart)[coordinate]?.code !== 'I' || !context.nextRecord.legalDropOffShipIds.length ||
        context.nextRecord.legalDropOffShipIds.some(shipId => (raw.shipGalacticCoordinates as Record<string, unknown>)[shipId] !== coordinate)) {
      invalid('Nebula rewards require the entitled group at its original system.');
    }
    const next = { ...benefits };
    for (const shipId of context.nextRecord.legalDropOffShipIds) {
      const previous = next[shipId]?.coordinate === coordinate ? next[shipId] : undefined;
      next[shipId] = { missionId: context.missionId, coordinate,
        suppressMaintenanceDamage: suppress || previous?.suppressMaintenanceDamage === true,
        freeExitFuel: freeExit || previous?.freeExitFuel === true };
    }
    const nextRevision = raw.revision + 1;
    commitNebula = () => tx.set(ref, { ...raw, missionNebulaBenefitsByShip: next, revision: nextRevision, updatedAt: FieldValue.serverTimestamp() });
  }
  if (hasNoncriticalKAttempt(context.nextRecord)) {
    const originalChart = chart(context);
    const groupId = context.currentGroupId;
    const coordinate = context.mission.get('coordinate');
    if (typeof groupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(groupId) || typeof coordinate !== 'string' ||
        organiserSitesForChart(originalChart)[coordinate]?.code !== 'K' || !context.nextRecord.legalDropOffShipIds.length) invalid('K attack group authority is unavailable.');
    const sourceId = `mission-${context.missionId}`;
    const ref = db.doc(`sessions/${context.sessionId}/wolfAttackPressure/${sourceId}`);
    const windowRef = db.doc(`sessions/${context.sessionId}/wolfAttackWindow/current`);
    const [prior, windowSnapshot, attackSnapshot] = await Promise.all([tx.get(ref), tx.get(windowRef), tx.get(db.doc(`sessions/${context.sessionId}/wolfAttackState/current`))]);
    const window = windowSnapshot.exists ? wolfAttackWindowState(windowSnapshot.data()) : undefined;
    if (prior.exists || (windowSnapshot.exists && !window)) invalid('K attack pressure or window authority is inconsistent.');
    const attack = attackSnapshot.exists ? attackSnapshot.data() : undefined;
    if (attackSnapshot.exists && (!record(attack) || typeof attack.status !== 'string')) invalid('Current attack authority is malformed.');
    const canOpen = (!window || window.status === 'resolved') &&
      (!attackSnapshot.exists || record(attack) && attack.status === 'resolved' && attack.currentStep === 'resolved');
    if (canOpen && window && !revision(window.revision)) invalid('K attack window revision is exhausted.');
    const pressure: MissionWolfPressure = { type: 'mission-k-attack-schedule', status: 'scheduled', sessionId: context.sessionId,
      missionId: context.missionId, opportunityId: 'K-1', resolutionRevision: context.nextRecord.resolutionRevision!,
      resolutionRequestId: context.nextRecord.resolutionRequestId!,
      sourceCycle: cycle(context), groupId, chart: originalChart, coordinate, siteCode: 'K', arrivalTiming: 'immediate',
      vesselIds: [...context.nextRecord.legalDropOffShipIds] };
    commitAttack = () => {
      tx.create(ref, { ...pressure, createdAt: FieldValue.serverTimestamp() });
      if (canOpen) tx.set(windowRef, { status: 'due', turn: cycle(context), revision: (window?.revision ?? 0) + 1,
        targetGroupId: groupId, threatSiteCode: 'K', threatSourceId: sourceId, updatedAt: FieldValue.serverTimestamp() });
    };
  }
  return () => { commitResearch(); commitNebula?.(); commitAttack?.(); };
}
