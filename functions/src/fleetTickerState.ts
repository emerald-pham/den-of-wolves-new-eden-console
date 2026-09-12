export type FleetTickerSource = 'automatic' | 'admiral' | 'press';
export type FleetTickerTone = 'danger' | 'normal';
export type FleetTickerGap = 'standard' | 'long';

export type FleetTickerMessage = Readonly<{
  id: string;
  sequence: number;
  source: FleetTickerSource;
  priority: number;
  text: string;
  tone: FleetTickerTone;
  gap: FleetTickerGap;
  sourceId?: string;
  passCount?: number;
  /** A server deadline for finite notices, independent of viewport geometry. */
  expiresAt?: string;
  createdAt: string;
}>;

export type FleetTickerDismissal = Readonly<{
  id: string;
  sequence: number;
  revision: number;
  dismissedAt: string;
}>;

export type FleetTickerState = Readonly<{
  revision: number;
  nextSequence: number;
  /** Latest sequence a reconnecting client must have observed to be current. */
  replayCursor: number;
  current: FleetTickerMessage | null;
  queued: readonly FleetTickerMessage[];
  draining: readonly FleetTickerMessage[];
  dismissed: readonly FleetTickerDismissal[];
}>;

export type FleetTickerTransmission = Readonly<{
  source: FleetTickerSource;
  priority: number;
  text: string;
  tone: FleetTickerTone;
  gap?: FleetTickerGap;
  sourceId?: string;
  passCount?: number;
  expiresAt?: string;
}>;

export const STAND_DOWN_EXPIRY_MS = 60_000;
export const FLEET_TICKER_PRIORITIES = {
  press: 20,
  turnZero: 30,
  airspace: 40,
  emergency: 60,
  turnStart: 70,
  admiral: 80,
  debrief: 100,
} as const;

const MAX_QUEUE = 12;
const MAX_DRAINING = 12;
const MAX_DISMISSED = 24;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function validInstant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function message(value: unknown): FleetTickerMessage | null {
  if (!record(value) || typeof value.id !== 'string' || value.id.length === 0 ||
      typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
      (value.source !== 'automatic' && value.source !== 'admiral' && value.source !== 'press') ||
      typeof value.priority !== 'number' || !Number.isSafeInteger(value.priority) || value.priority < 0 ||
      typeof value.text !== 'string' || value.text.length === 0 || value.text.length > 1_000 ||
      (value.tone !== 'danger' && value.tone !== 'normal') ||
      (value.gap !== 'standard' && value.gap !== 'long') ||
      (value.sourceId !== undefined && (typeof value.sourceId !== 'string' || value.sourceId.length === 0 || value.sourceId.length > 128)) ||
      (value.passCount !== undefined &&
        (typeof value.passCount !== 'number' || !Number.isSafeInteger(value.passCount) || value.passCount < 1)) ||
      (value.expiresAt !== undefined && !validInstant(value.expiresAt)) ||
      !validInstant(value.createdAt)) return null;
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

function dismissal(value: unknown): FleetTickerDismissal | null {
  if (!record(value) || typeof value.id !== 'string' || value.id.length === 0 ||
      typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
      typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      !validInstant(value.dismissedAt)) return null;
  return {
    id: value.id,
    sequence: value.sequence,
    revision: value.revision,
    dismissedAt: value.dismissedAt,
  };
}

function sortQueue(messages: readonly FleetTickerMessage[]): readonly FleetTickerMessage[] {
  return [...messages].sort((left, right) =>
    right.priority - left.priority || left.sequence - right.sequence);
}

function pruneExpired(state: FleetTickerState, now: string): FleetTickerState {
  const nowMs = Date.parse(now);
  let current = state.current && (
    state.current.expiresAt === undefined || Date.parse(state.current.expiresAt) > nowMs
  ) ? state.current : null;
  let queued = state.queued.filter((entry) =>
    entry.expiresAt === undefined || Date.parse(entry.expiresAt) > nowMs);
  const draining = state.draining.filter((entry) =>
    entry.expiresAt === undefined || Date.parse(entry.expiresAt) > nowMs);
  if (!current && queued.length > 0) {
    const [next, ...rest] = sortQueue(queued);
    current = next ?? null;
    queued = rest;
  }
  return { ...state, current, queued, draining };
}

export function emptyFleetTickerState(): FleetTickerState {
  return {
    revision: 0,
    nextSequence: 0,
    replayCursor: 0,
    current: null,
    queued: [],
    draining: [],
    dismissed: [],
  };
}

/** Fail closed when a client or an old document supplies a malformed stream. */
export function fleetTickerState(value: unknown): FleetTickerState {
  if (!record(value)) return emptyFleetTickerState();
  const current = value.current === null || value.current === undefined
    ? null : message(value.current);
  const queued = Array.isArray(value.queued)
    ? value.queued.map(message).filter((entry): entry is FleetTickerMessage => entry !== null)
    : [];
  const draining = Array.isArray(value.draining)
    ? value.draining.map(message).filter((entry): entry is FleetTickerMessage => entry !== null)
    : [];
  const dismissed = Array.isArray(value.dismissed)
    ? value.dismissed.map(dismissal).filter((entry): entry is FleetTickerDismissal => entry !== null)
    : [];
  const nextSequence = nonNegativeInteger(value.nextSequence);
  const revision = nonNegativeInteger(value.revision);
  const replayCursor = Math.min(nonNegativeInteger(value.replayCursor), nextSequence);
  return {
    revision,
    nextSequence,
    replayCursor,
    current,
    queued: sortQueue(queued).slice(0, MAX_QUEUE),
    draining: draining.slice(-MAX_DRAINING),
    dismissed: dismissed.slice(-MAX_DISMISSED),
  };
}

/** Project deadline expiry and queued promotion without authoring a mutation. */
export function reconcileFleetTicker(value: unknown, now: string): FleetTickerState {
  return pruneExpired(fleetTickerState(value), now);
}

function nextMessage(
  sessionId: string,
  state: FleetTickerState,
  input: FleetTickerTransmission,
  now: string,
): FleetTickerMessage {
  const sequence = state.nextSequence + 1;
  return {
    id: `${sessionId}:fleet-ticker:${sequence}`,
    sequence,
    source: input.source,
    priority: input.priority,
    text: input.text,
    tone: input.tone,
    gap: input.gap ?? 'standard',
    ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
    ...(input.passCount === undefined ? {} : { passCount: input.passCount }),
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    createdAt: now,
  };
}

function withDraining(
  state: FleetTickerState,
  outgoing: FleetTickerMessage | null,
): readonly FleetTickerMessage[] {
  return outgoing === null
    ? state.draining
    : [...state.draining, outgoing].slice(-MAX_DRAINING);
}

/**
 * Append one server-authored transmission. Priority decides whether it
 * replaces the visible current message or waits behind it; sequence order is
 * deterministic because the caller runs this reducer inside one transaction.
 */
export function publishFleetTicker(
  sessionId: string,
  value: unknown,
  input: FleetTickerTransmission,
  now: string,
): FleetTickerState {
  const normalized = pruneExpired(fleetTickerState(value), now);
  const next = nextMessage(sessionId, normalized, input, now);
  const replaces = normalized.current !== null && input.priority >= normalized.current.priority;
  const current = replaces || normalized.current === null ? next : normalized.current;
  const queued = replaces || normalized.current === null
    ? normalized.queued
    : sortQueue([...normalized.queued, next]).slice(0, MAX_QUEUE);
  return {
    ...normalized,
    revision: normalized.revision + 1,
    nextSequence: next.sequence,
    replayCursor: next.sequence,
    current,
    queued,
    draining: withDraining(normalized, replaces ? normalized.current : null),
  };
}

/** Remove a queued item immediately, or let a visible item drain once. */
export function dismissFleetTicker(
  sessionId: string,
  value: unknown,
  messageId: string,
  now: string,
): FleetTickerState {
  const normalized = pruneExpired(fleetTickerState(value), now);
  const queuedTarget = normalized.queued.find((entry) => entry.id === messageId);
  const queued = normalized.queued.filter((entry) => entry.id !== messageId);
  const currentTarget = normalized.current?.id === messageId ? normalized.current : null;
  const drainingTarget = normalized.draining.find((entry) => entry.id === messageId) ?? null;
  const target = currentTarget ?? drainingTarget;
  if (!target && queued.length === normalized.queued.length) return normalized;
  const revision = normalized.revision + 1;
  const [next, ...remaining] = sortQueue(queued);
  return {
    ...normalized,
    revision,
    replayCursor: Math.max(normalized.replayCursor, target?.sequence ?? queuedTarget?.sequence ?? 0),
    current: currentTarget ? (next ?? null) : normalized.current,
    queued: currentTarget ? remaining : queued,
    // A draining item has already left current/queued. Keep it in the drain
    // so viewers which have started the pass can finish their local tail.
    draining: currentTarget ? withDraining(normalized, currentTarget) : normalized.draining,
    dismissed: [...normalized.dismissed, {
      id: messageId,
      sequence: target?.sequence ?? queuedTarget?.sequence ?? 0,
      revision,
      dismissedAt: now,
    }].slice(-MAX_DISMISSED),
  };
}

/** Resolve a source-owned dismissal to the stream identity allocated by the server. */
export function dismissFleetTickerSource(
  sessionId: string,
  value: unknown,
  sourceId: string,
  now: string,
): FleetTickerState {
  const state = fleetTickerState(value);
  const target = [state.current, ...state.queued, ...state.draining]
    .find((entry) => entry?.sourceId === sourceId);
  return target ? dismissFleetTicker(sessionId, state, target.id, now) : state;
}

/** Stand-down uses a shared server deadline; local animation may outlive it. */
export function standDownExpiry(now: string): string {
  return new Date(Date.parse(now) + STAND_DOWN_EXPIRY_MS).toISOString();
}
