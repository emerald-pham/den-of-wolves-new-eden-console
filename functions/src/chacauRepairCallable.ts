import { isResourceShipId } from './resources';

/** Strict wire and replay contract consumed by the shared transactional callable. */
export interface ChacauRepairCallableCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
  readonly systemIds: readonly string[];
}

export interface ChacauRepairCommandFingerprint {
  readonly action: 'chacau-repair';
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

export interface ChacauRepairCallableReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: 'chacau';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseChacauRepairCallableCommand(value: unknown): ChacauRepairCallableCommand | null {
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

export function chacauRepairCommandFingerprint(
  actorUid: string,
  command: ChacauRepairCallableCommand,
): ChacauRepairCommandFingerprint {
  if (!actorUid) throw new Error('A current actor is required to bind Chacau repair replay.');
  return {
    action: 'chacau-repair',
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

export function isChacauRepairCallableReply(
  value: unknown,
  fingerprint: ChacauRepairCommandFingerprint,
): value is ChacauRepairCallableReply {
  const raw = record(value);
  const fields = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId',
    'systemIds', 'materialsRemaining', 'cycle', 'repairRevision',
  ];
  return Boolean(raw && Object.keys(raw).length === fields.length &&
    fields.every((key) => Object.hasOwn(raw, key)) &&
    (raw.status === 'committed' || raw.status === 'replayed') &&
    raw.sessionId === fingerprint.sessionId && raw.requestId === fingerprint.requestId &&
    raw.shuttleId === 'chacau' && raw.hostShipId === fingerprint.payload.hostShipId &&
    Array.isArray(raw.systemIds) && raw.systemIds.length === fingerprint.payload.systemIds.length &&
    raw.systemIds.every((id, index) => id === fingerprint.payload.systemIds[index]) &&
    isSafeCounter(raw.materialsRemaining) && raw.cycle === fingerprint.payload.expectedCycle &&
    Number.isSafeInteger(raw.repairRevision) &&
    raw.repairRevision === fingerprint.expectedRevision + 1);
}
