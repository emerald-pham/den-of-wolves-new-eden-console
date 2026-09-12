import type { FleetTickerMessage, FleetTickerState } from '@/types/game';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value : fallback;
}

function instant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function parseMessage(value: unknown): FleetTickerMessage | null {
  if (!record(value) || typeof value.id !== 'string' || value.id.length === 0 ||
      typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
      (value.source !== 'automatic' && value.source !== 'admiral' && value.source !== 'press') ||
      typeof value.priority !== 'number' || !Number.isSafeInteger(value.priority) || value.priority < 0 ||
      typeof value.text !== 'string' || value.text.length === 0 || value.text.length > 1_000 ||
      (value.tone !== 'danger' && value.tone !== 'normal') ||
      (value.gap !== 'standard' && value.gap !== 'long') ||
      (value.sourceId !== undefined && (typeof value.sourceId !== 'string' || value.sourceId.length === 0)) ||
      (value.passCount !== undefined &&
        (typeof value.passCount !== 'number' || !Number.isSafeInteger(value.passCount) || value.passCount < 1)) ||
      (value.expiresAt !== undefined && !instant(value.expiresAt)) || !instant(value.createdAt)) return null;
  return {
    id: value.id,
    sequence: value.sequence,
    source: value.source,
    priority: value.priority,
    text: value.text,
    tone: value.tone,
    gap: value.gap,
    ...(value.sourceId === undefined ? {} : { sourceId: value.sourceId }),
    ...(value.passCount === undefined ? {} : { passCount: value.passCount }),
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
    createdAt: value.createdAt,
  };
}

function messageList(value: unknown): readonly FleetTickerMessage[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseMessage).filter(
    (entry): entry is FleetTickerMessage => entry !== null,
  );
}

function messageQueue(value: unknown): readonly FleetTickerMessage[] {
  const messages = messageList(value);
  return [...messages].sort((left, right) =>
    right.priority - left.priority || left.sequence - right.sequence).slice(0, 12);
}

function isLive(message: FleetTickerMessage, nowMs: number): boolean {
  return message.expiresAt === undefined || Date.parse(message.expiresAt) > nowMs;
}

export function emptyFleetTickerState(): FleetTickerState {
  return {
    revision: 0, nextSequence: 0, replayCursor: 0,
    current: null, queued: [], draining: [], dismissed: [],
  };
}

/** Parse the member projection and project server deadlines without authoring state. */
export function fleetTickerState(value: unknown, now = new Date()): FleetTickerState {
  if (!record(value)) return emptyFleetTickerState();
  const current = value.current === null || value.current === undefined
    ? null : parseMessage(value.current);
  const queued = messageQueue(value.queued);
  // Drain order is the authoritative tail order. Queue precedence is not
  // allowed to reorder copy which has already entered a viewport.
  const draining = messageList(value.draining).slice(-12);
  const dismissed = Array.isArray(value.dismissed)
    ? value.dismissed.flatMap((entry) => {
      if (!record(entry) || typeof entry.id !== 'string' || entry.id.length === 0 ||
          typeof entry.sequence !== 'number' || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1 ||
          typeof entry.revision !== 'number' || !Number.isSafeInteger(entry.revision) || entry.revision < 1 ||
          !instant(entry.dismissedAt)) return [];
      return [{
        id: entry.id,
        sequence: entry.sequence,
        revision: entry.revision,
        dismissedAt: entry.dismissedAt,
      }];
    }).slice(-24)
    : [];
  let liveCurrent = current && isLive(current, now.getTime()) ? current : null;
  let liveQueued = queued.filter((entry) => isLive(entry, now.getTime()));
  if (!liveCurrent && liveQueued.length > 0) {
    liveCurrent = liveQueued[0] ?? null;
    liveQueued = liveQueued.slice(1);
  }
  const nextSequence = integer(value.nextSequence);
  return {
    revision: integer(value.revision),
    nextSequence,
    replayCursor: Math.min(integer(value.replayCursor), nextSequence),
    current: liveCurrent,
    queued: liveQueued,
    draining: draining.filter((entry) => isLive(entry, now.getTime())),
    dismissed,
  };
}
