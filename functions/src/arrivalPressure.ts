import type { FleetGroupRecord } from './fleetGroups';
import { missionCardForCode, type MissionWolfEntryAttackRule } from './missionCards';
import { organiserSitesForChart, type ChartId } from './starChartLookup';

export type WolfBaseCode = 'L' | 'M';
export type WolfArrivalPressureStatus = 'operational' | 'departed' | 'cleared';

export interface WolfArrivalPressure {
  readonly type: 'wolf-base-arrival-pressure';
  readonly status: WolfArrivalPressureStatus;
  readonly groupId: string;
  readonly chart: ChartId;
  readonly coordinate: string;
  readonly siteCode: WolfBaseCode;
  readonly sourceShipId: string;
  readonly sourceTransitionId: string;
  readonly cycle: number;
  readonly revision: number;
  readonly attackStatus: 'scheduled';
  readonly arrivalTiming: 'immediate';
  readonly minimumBattleStations: 1 | 2;
  readonly minimumOtherShipDamage: 20 | 25;
  readonly missionAccess: 'blockedWhileWolfBaseOperational';
  readonly recurringUntil: readonly ['baseDestroyed', 'jumpAway'];
  readonly endedBy?: 'baseDestroyed' | 'jumpAway';
}

export interface WolfArrivalPressureState {
  readonly type: 'wolf-base-arrival-pressure-state';
  readonly groupId: string;
  readonly chart: ChartId;
  readonly revision: number;
  readonly entries: readonly WolfArrivalPressure[];
}

export type WolfArrivalPressureTransition = Readonly<{
  state: WolfArrivalPressureState | undefined;
  scheduled: WolfArrivalPressure | undefined;
}>;

type ArrivalInput = Readonly<{
  chart: ChartId;
  group: FleetGroupRecord;
  coordinates: Readonly<Record<string, string>>;
  movedShipId: string;
  destination: string;
  sourceTransitionId: string;
  cycle: number;
  current?: WolfArrivalPressureState;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWolfBaseCode(value: unknown): value is WolfBaseCode {
  return value === 'L' || value === 'M';
}

function isChartId(value: unknown): value is ChartId {
  return value === 'A' || value === 'B' || value === 'C';
}

function entryRule(code: WolfBaseCode): MissionWolfEntryAttackRule {
  const rule = missionCardForCode(code)?.siteRules.entryAttack;
  if (!rule || rule.kind !== 'immediateWolfAttackOnEntry' || rule.scope !== 'group') {
    throw new Error(`Wolf base ${code} has no canonical group entry pressure.`);
  }
  return rule;
}

export function parseWolfArrivalPressure(
  value: unknown,
  expectedChart?: ChartId,
): WolfArrivalPressure | undefined {
  if (!record(value) || value.type !== 'wolf-base-arrival-pressure' ||
      !['operational', 'departed', 'cleared'].includes(String(value.status)) ||
      typeof value.groupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(value.groupId) ||
      !isChartId(value.chart) || (expectedChart !== undefined && value.chart !== expectedChart) ||
      typeof value.coordinate !== 'string' || !/^\d{4}$/.test(value.coordinate) ||
      !isWolfBaseCode(value.siteCode) || typeof value.sourceShipId !== 'string' ||
      value.sourceShipId.length === 0 || typeof value.sourceTransitionId !== 'string' ||
      value.sourceTransitionId.length === 0 || !Number.isSafeInteger(value.cycle) ||
      (value.cycle as number) < 1 || !Number.isSafeInteger(value.revision) ||
      (value.revision as number) < 1 || value.attackStatus !== 'scheduled' ||
      value.arrivalTiming !== 'immediate' ||
      value.missionAccess !== 'blockedWhileWolfBaseOperational' ||
      !Array.isArray(value.recurringUntil) || value.recurringUntil.length !== 2 ||
      value.recurringUntil[0] !== 'baseDestroyed' || value.recurringUntil[1] !== 'jumpAway') {
    return undefined;
  }
  const rule = entryRule(value.siteCode);
  if (organiserSitesForChart(value.chart)[value.coordinate]?.code !== value.siteCode) return undefined;
  if (value.minimumBattleStations !== rule.minimumBattleStations ||
      value.minimumOtherShipDamage !== rule.minimumOtherShipDamage) return undefined;
  const status = value.status as WolfArrivalPressureStatus;
  const endedBy = value.endedBy;
  if ((status === 'operational' && endedBy !== undefined) ||
      (status === 'departed' && endedBy !== 'jumpAway') ||
      (status === 'cleared' && endedBy !== 'baseDestroyed')) return undefined;
  return {
    type: 'wolf-base-arrival-pressure', status,
    groupId: value.groupId, chart: value.chart,
    coordinate: value.coordinate, siteCode: value.siteCode,
    sourceShipId: value.sourceShipId, sourceTransitionId: value.sourceTransitionId,
    cycle: value.cycle as number, revision: value.revision as number,
    attackStatus: 'scheduled', arrivalTiming: 'immediate',
    minimumBattleStations: rule.minimumBattleStations,
    minimumOtherShipDamage: rule.minimumOtherShipDamage,
    missionAccess: 'blockedWhileWolfBaseOperational',
    recurringUntil: ['baseDestroyed', 'jumpAway'],
    ...(endedBy === 'jumpAway' || endedBy === 'baseDestroyed' ? { endedBy } : {}),
  };
}

export function parseWolfArrivalPressureState(
  value: unknown,
  expectedChart?: ChartId,
): WolfArrivalPressureState | undefined {
  if (!record(value) || value.type !== 'wolf-base-arrival-pressure-state' ||
      typeof value.groupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(value.groupId) ||
      !isChartId(value.chart) || (expectedChart !== undefined && value.chart !== expectedChart) ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      !Array.isArray(value.entries)) return undefined;
  const chart = value.chart as ChartId;
  const entries = value.entries.map((entry) => parseWolfArrivalPressure(entry, chart));
  if (entries.some((entry) => entry === undefined) ||
      entries.some((entry) => entry?.groupId !== value.groupId) ||
      new Set(entries.map((entry) => entry?.coordinate)).size !== entries.length ||
      entries.some((entry) => (entry?.revision ?? 0) > (value.revision as number))) return undefined;
  return {
    type: 'wolf-base-arrival-pressure-state', groupId: value.groupId, chart,
    revision: value.revision as number, entries: entries as WolfArrivalPressure[],
  };
}

export function wolfArrivalPressureForMovement(input: ArrivalInput): WolfArrivalPressureTransition {
  if (!input.group.vesselIds.includes(input.movedShipId)) {
    throw new Error('The moving ship has no authority in the selected fleet group.');
  }
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 1) {
    throw new Error('Arrival pressure requires an active numbered cycle.');
  }
  if (!input.sourceTransitionId) throw new Error('Arrival pressure requires a transition identity.');
  if (input.current && input.current.groupId !== input.group.id) {
    throw new Error('Stored arrival pressure belongs to another fleet group.');
  }
  if (input.current && input.current.chart !== input.chart) {
    throw new Error('Stored arrival pressure belongs to another organiser chart.');
  }

  const nextRevision = (input.current?.revision ?? 0) + 1;
  let changed = false;
  const entries = (input.current?.entries ?? []).map((entry) => {
    const occupied = input.group.vesselIds.some((shipId) => input.coordinates[shipId] === entry.coordinate);
    if (entry.status !== 'operational' || occupied) return entry;
    changed = true;
    return { ...entry, status: 'departed' as const, endedBy: 'jumpAway' as const, revision: nextRevision };
  });
  const destinationCode = organiserSitesForChart(input.chart)[input.destination]?.code;

  if (isWolfBaseCode(destinationCode)) {
    const existingIndex = entries.findIndex((entry) => entry.coordinate === input.destination);
    const existing = existingIndex >= 0 ? entries[existingIndex] : undefined;
    if (existing?.status === 'operational' && existing.siteCode === destinationCode) {
      return changed
        ? {
          state: { ...input.current!, revision: nextRevision, entries },
          scheduled: undefined,
        }
        : { state: input.current, scheduled: undefined };
    }
    const rule = entryRule(destinationCode);
    const scheduled: WolfArrivalPressure = {
      type: 'wolf-base-arrival-pressure', status: 'operational',
      groupId: input.group.id, chart: input.chart,
      coordinate: input.destination, siteCode: destinationCode,
      sourceShipId: input.movedShipId, sourceTransitionId: input.sourceTransitionId,
      cycle: input.cycle, revision: nextRevision,
      attackStatus: 'scheduled', arrivalTiming: 'immediate',
      minimumBattleStations: rule.minimumBattleStations,
      minimumOtherShipDamage: rule.minimumOtherShipDamage,
      missionAccess: 'blockedWhileWolfBaseOperational',
      recurringUntil: ['baseDestroyed', 'jumpAway'],
    };
    if (existingIndex >= 0) entries[existingIndex] = scheduled;
    else entries.push(scheduled);
    return {
      scheduled,
      state: {
        type: 'wolf-base-arrival-pressure-state', groupId: input.group.id, chart: input.chart,
        revision: nextRevision, entries,
      },
    };
  }

  return changed
    ? {
      state: { ...input.current!, revision: nextRevision, entries },
      scheduled: undefined,
    }
    : { state: input.current, scheduled: undefined };
}

export function wolfArrivalPressureBlocksMissions(
  state: WolfArrivalPressureState | undefined,
  groupId: string,
): boolean {
  return state?.groupId === groupId && state.entries.some((entry) =>
    entry.status === 'operational' && entry.missionAccess === 'blockedWhileWolfBaseOperational');
}
