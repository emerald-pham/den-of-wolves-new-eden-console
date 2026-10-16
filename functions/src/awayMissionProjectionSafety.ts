export interface AwayMissionProjectionSafety {
  readonly policyVersion: 1;
  readonly epoch: number;
  readonly state: 'held' | 'ready';
  readonly writeRevision: number;
}

/** A session marker is server-owned; malformed legacy state never grants reads. */
export function parseAwayMissionProjectionSafety(value: unknown): AwayMissionProjectionSafety | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || record.policyVersion !== 1 ||
      !Number.isSafeInteger(record.epoch) || (record.epoch as number) < 1 ||
      (record.state !== 'held' && record.state !== 'ready') ||
      !Number.isSafeInteger(record.writeRevision) || (record.writeRevision as number) < 0) return null;
  return { policyVersion: 1, epoch: record.epoch as number, state: record.state as 'held' | 'ready',
    writeRevision: record.writeRevision as number };
}

export function memberAwayMissionProjectionSafety(value: unknown): Omit<AwayMissionProjectionSafety, 'writeRevision'> | null {
  const marker = parseAwayMissionProjectionSafety(value);
  return marker ? { policyVersion: 1, epoch: marker.epoch, state: marker.state } : null;
}

/** Advance once in the pointer-writing transaction, never on gameplay replay. */
export function awayMissionPointerWriteSafetyPatch(value: unknown): Readonly<Record<string, unknown>> {
  const marker = parseAwayMissionProjectionSafety(value);
  if (!marker) {
    const priorEpoch = value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).epoch : undefined;
    if (priorEpoch === Number.MAX_SAFE_INTEGER) {
      throw new Error('Away-mission privacy epoch requires facilitator maintenance.');
    }
    const epoch = Number.isSafeInteger(priorEpoch) && (priorEpoch as number) > 0 ? (priorEpoch as number) + 1 : 1;
    return { awayMissionProjectionSafety: { policyVersion: 1, epoch, state: 'held', writeRevision: 1 } };
  }
  if (marker.writeRevision === Number.MAX_SAFE_INTEGER) {
    throw new Error('Away-mission privacy generation requires facilitator maintenance.');
  }
  return { 'awayMissionProjectionSafety.writeRevision': marker.writeRevision + 1 };
}
