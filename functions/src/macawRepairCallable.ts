import { isResourceShipId } from './resources';

export interface MacawRepairCallableCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
  readonly systemIds: readonly string[];
}

export interface MacawRepairCommandFingerprint {
  readonly action: 'macaw-repair';
  readonly sessionId: string;
  readonly requestId: string;
  readonly actorUid: string;
  readonly instanceId: null;
  readonly expectedRevision: number;
  readonly payload: Readonly<{
    expectedControlRevision: number;
    expectedCycle: number;
    hostShipId: string;
    systemIds: readonly string[];
  }>;
}

export interface MacawRepairCallableReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: 'macaw';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly scrapRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

/** Nonsecret, target-bound CAS state returned only to a still-authorized Captain. */
export interface MacawRepairCallableStaleReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: 'macaw';
  readonly expectedHostShipId: string;
  readonly systemIds: readonly string[];
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly currentRepairRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseMacawRepairCallableCommand(value: unknown): MacawRepairCallableCommand | null {
  const raw = record(value);
  const fields = [
    'sessionId', 'requestId', 'expectedControlRevision', 'expectedRepairRevision',
    'expectedCycle', 'expectedHostShipId', 'systemIds',
  ];
  if (!raw || Object.keys(raw).length !== fields.length || fields.some((key) => !Object.hasOwn(raw, key)) ||
      typeof raw.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(raw.sessionId) ||
      typeof raw.requestId !== 'string' || !/^[\w-]{1,128}$/.test(raw.requestId) ||
      !isSafeCounter(raw.expectedControlRevision) ||
      !isSafeCounter(raw.expectedRepairRevision) || raw.expectedRepairRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(raw.expectedCycle) || (raw.expectedCycle as number) < 1 ||
      typeof raw.expectedHostShipId !== 'string' || !isResourceShipId(raw.expectedHostShipId) ||
      !Array.isArray(raw.systemIds) || raw.systemIds.length < 1 || raw.systemIds.length > 2 ||
      raw.systemIds.some((id) => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)) ||
      new Set(raw.systemIds).size !== raw.systemIds.length) return null;

  return {
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    expectedControlRevision: raw.expectedControlRevision,
    expectedRepairRevision: raw.expectedRepairRevision,
    expectedCycle: raw.expectedCycle as number,
    expectedHostShipId: raw.expectedHostShipId,
    systemIds: [...raw.systemIds as string[]].sort(),
  };
}

export function macawRepairCommandFingerprint(
  actorUid: string,
  command: MacawRepairCallableCommand,
): MacawRepairCommandFingerprint {
  if (!actorUid) throw new Error('A current actor is required to bind Macaw repair replay.');
  return {
    action: 'macaw-repair',
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid,
    instanceId: null,
    expectedRevision: command.expectedRepairRevision,
    payload: {
      expectedControlRevision: command.expectedControlRevision,
      expectedCycle: command.expectedCycle,
      hostShipId: command.expectedHostShipId,
      systemIds: [...command.systemIds],
    },
  };
}

export function isMacawRepairCallableReply(
  value: unknown,
  fingerprint: MacawRepairCommandFingerprint,
): value is MacawRepairCallableReply {
  const raw = record(value);
  const fields = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId',
    'systemIds', 'scrapRemaining', 'cycle', 'repairRevision',
  ];
  return Boolean(raw && Object.keys(raw).length === fields.length &&
    fields.every((key) => Object.hasOwn(raw, key)) &&
    (raw.status === 'committed' || raw.status === 'replayed') &&
    raw.sessionId === fingerprint.sessionId && raw.requestId === fingerprint.requestId &&
    raw.shuttleId === 'macaw' && raw.hostShipId === fingerprint.payload.hostShipId &&
    Array.isArray(raw.systemIds) && raw.systemIds.length === fingerprint.payload.systemIds.length &&
    raw.systemIds.every((id, index) => id === fingerprint.payload.systemIds[index]) &&
    isSafeCounter(raw.scrapRemaining) && raw.cycle === fingerprint.payload.expectedCycle &&
    Number.isSafeInteger(raw.repairRevision) &&
    raw.repairRevision === fingerprint.expectedRevision + 1);
}

/** Accepts only a minimal stale envelope for this exact request and selection. */
export function isMacawRepairCallableStaleReply(
  value: unknown,
  command: MacawRepairCallableCommand,
): value is MacawRepairCallableStaleReply {
  const raw = record(value);
  const fields = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'expectedHostShipId', 'systemIds',
    'expectedControlRevision', 'currentControlRevision', 'expectedRepairRevision',
    'currentRepairRevision', 'expectedCycle', 'currentCycle',
  ];
  const expectedSystemIds = [...command.systemIds].sort();
  return Boolean(raw && Object.keys(raw).length === fields.length &&
    fields.every((key) => Object.hasOwn(raw, key)) && raw.status === 'stale' &&
    raw.sessionId === command.sessionId && raw.requestId === command.requestId &&
    raw.shuttleId === 'macaw' && raw.expectedHostShipId === command.expectedHostShipId &&
    Array.isArray(raw.systemIds) && raw.systemIds.length === expectedSystemIds.length &&
    raw.systemIds.every((id, index) => id === expectedSystemIds[index]) &&
    raw.expectedControlRevision === command.expectedControlRevision &&
    isSafeCounter(raw.currentControlRevision) &&
    raw.currentControlRevision >= command.expectedControlRevision &&
    raw.expectedRepairRevision === command.expectedRepairRevision &&
    isSafeCounter(raw.currentRepairRevision) &&
    raw.currentRepairRevision >= command.expectedRepairRevision &&
    raw.expectedCycle === command.expectedCycle &&
    Number.isSafeInteger(raw.currentCycle) && (raw.currentCycle as number) >= command.expectedCycle &&
    (raw.currentControlRevision > command.expectedControlRevision ||
      raw.currentRepairRevision > command.expectedRepairRevision ||
      (raw.currentCycle as number) > command.expectedCycle));
}
