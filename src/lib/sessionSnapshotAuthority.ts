import type { GameSession } from '@/types/game';
import {
  LEGAL_LIFECYCLE_TRANSITIONS,
  type LifecyclePhase,
} from '../../functions/src/lifecycle';

export type SessionLifecycleCursor = {
  readonly currentTurn: number;
  readonly phase?: LifecyclePhase;
  readonly airspaceState?: 0 | 1;
};

/** Firestore's full-precision monotonic server timestamp. */
export type ServerAuthorityCursor = {
  readonly seconds: number;
  readonly nanoseconds: number;
};

/**
 * Subscription-independent authority for session snapshots. App route effects
 * may briefly tear down and recreate listeners without surrendering the newest
 * server lifecycle cursor to a delayed cache callback.
 */
export interface SessionSnapshotAuthority {
  hasServerSessionAuthority: boolean;
  /** Increments only when a newer accepted server snapshot wins the cursor. */
  authorityVersion?: number;
  latestSessionLifecycle?: SessionLifecycleCursor;
  latestServerAuthorityCursor?: ServerAuthorityCursor;
}

export function createSessionSnapshotAuthority(): SessionSnapshotAuthority {
  return { hasServerSessionAuthority: false, authorityVersion: 0 };
}

export function sessionSnapshotAuthorityVersion(
  authority: SessionSnapshotAuthority,
): number {
  return authority.authorityVersion ?? 0;
}

const sessionSnapshotAuthorities = new Map<string, SessionSnapshotAuthority>();

/** One authority object shared by callable hydration and every listener for an identity. */
export function sessionSnapshotAuthorityFor(
  sessionId: string,
  uid: string,
): SessionSnapshotAuthority {
  const key = JSON.stringify([sessionId, uid]);
  const existing = sessionSnapshotAuthorities.get(key);
  if (existing) return existing;
  const authority = createSessionSnapshotAuthority();
  sessionSnapshotAuthorities.set(key, authority);
  return authority;
}

function cursorFromMillis(value: unknown): ServerAuthorityCursor | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const seconds = Math.floor(value / 1_000);
  const nanoseconds = Math.round((value - seconds * 1_000) * 1_000_000);
  if (!Number.isSafeInteger(seconds) || nanoseconds < 0 || nanoseconds >= 1_000_000_000) {
    return undefined;
  }
  return { seconds, nanoseconds };
}

function timestampFieldsCursor(value: Readonly<Record<string, unknown>>): ServerAuthorityCursor | undefined {
  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds;
  if (
    typeof seconds !== 'number' || !Number.isSafeInteger(seconds) ||
    typeof nanoseconds !== 'number' || !Number.isSafeInteger(nanoseconds) ||
    nanoseconds < 0 || nanoseconds >= 1_000_000_000
  ) return undefined;
  return { seconds, nanoseconds };
}

export function trustedTimestampCursor(value: unknown): ServerAuthorityCursor | undefined {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return cursorFromMillis(parsed);
  }
  if (value instanceof Date) return cursorFromMillis(value.getTime());
  if (typeof value !== 'object' || value === null) return undefined;
  const timestamp = value as Readonly<Record<string, unknown>> & {
    readonly toMillis?: unknown;
    readonly toDate?: unknown;
  };
  const fieldCursor = timestampFieldsCursor(timestamp);
  if (fieldCursor) return fieldCursor;
  if (typeof timestamp.toMillis === 'function') {
    const millis = timestamp.toMillis();
    return cursorFromMillis(millis);
  }
  if (typeof timestamp.toDate === 'function') {
    const date = timestamp.toDate();
    return date instanceof Date ? cursorFromMillis(date.getTime()) : undefined;
  }
  return undefined;
}

const ACTIONABLE_LIFECYCLE_PHASES: readonly LifecyclePhase[] = [
  'lobby', 'casting', 'briefing', 'active',
];

function lifecyclePhase(value: unknown): value is LifecyclePhase {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(
    LEGAL_LIFECYCLE_TRANSITIONS,
    value,
  );
}

function compareServerAuthorityCursors(
  left: ServerAuthorityCursor,
  right: ServerAuthorityCursor,
): number {
  return left.seconds === right.seconds
    ? left.nanoseconds - right.nanoseconds
    : left.seconds - right.seconds;
}

function acceptsServerAuthorityCursor(
  hasServerSessionAuthority: boolean,
  previous: ServerAuthorityCursor | undefined,
  next: ServerAuthorityCursor | undefined,
  allowEqual = false,
): boolean {
  // Preserve one intentional legacy hydration. After any server callback has
  // been accepted, another unversioned callback cannot overwrite it; a trusted
  // cursor may upgrade that legacy authority exactly once. Once present, only
  // a strictly newer full-precision listener cursor may advance server
  // authority. A fresh callable may reconcile an equal cursor so disconnect
  // followed by a same-state rejoin can restore local identity.
  if (!hasServerSessionAuthority) return true;
  if (previous === undefined) return next !== undefined;
  if (next === undefined) return false;
  const order = compareServerAuthorityCursors(next, previous);
  return allowEqual ? order >= 0 : order > 0;
}

function canReachLifecyclePhase(
  from: LifecyclePhase,
  target: LifecyclePhase,
  visited = new Set<LifecyclePhase>(),
): boolean {
  if (from === target) return true;
  if (visited.has(from)) return false;
  visited.add(from);
  return LEGAL_LIFECYCLE_TRANSITIONS[from].some((next) =>
    canReachLifecyclePhase(next, target, new Set(visited)));
}

function canReachActionableLifecyclePhase(
  phase: LifecyclePhase,
  visited = new Set<LifecyclePhase>(),
): boolean {
  if (ACTIONABLE_LIFECYCLE_PHASES.includes(phase)) return true;
  if (visited.has(phase)) return false;
  visited.add(phase);
  return LEGAL_LIFECYCLE_TRANSITIONS[phase].some((next) =>
    canReachActionableLifecyclePhase(next, new Set(visited)));
}

function isNonReopenableLifecyclePhase(phase: LifecyclePhase): boolean {
  return !canReachActionableLifecyclePhase(phase);
}

function sessionLifecycleCursor(
  session: GameSession,
  previous: SessionLifecycleCursor | undefined,
): SessionLifecycleCursor {
  const storedTurn = session.currentTurn;
  const currentTurn = typeof storedTurn === 'number' && Number.isSafeInteger(storedTurn) && storedTurn >= 0
    ? storedTurn
    : previous?.currentTurn ?? 1;
  const phase = lifecyclePhase(session.phase) ? session.phase : previous?.phase;
  const turnPhase = session.turnPhase?.turn === currentTurn ? session.turnPhase : undefined;
  const airspaceState = phase === 'active'
    ? turnPhase?.airspace.state === 'lifted'
      ? 1 as const
      : turnPhase?.airspace.state === 'restricted'
        ? 0 as const
        : previous !== undefined && previous.currentTurn === currentTurn && previous.phase === 'active'
          ? previous.airspaceState
          : undefined
    : undefined;
  return {
    currentTurn,
    ...(phase ? { phase } : {}),
    ...(airspaceState === undefined ? {} : { airspaceState }),
  };
}

/**
 * Firestore may deliver cached snapshots after a newer server snapshot. Keep
 * the server lifecycle monotonic while allowing equal-window data changes to
 * reach the store. Ordering is based only on authoritative turn/phase fields.
 */
function acceptsSessionLifecycleSnapshot(
  previous: SessionLifecycleCursor | undefined,
  next: SessionLifecycleCursor,
): boolean {
  if (!previous) return true;

  // Terminal outcomes and debrief/closed states can never reopen an action
  // window, even if a delayed snapshot reports a larger (legacy) turn value.
  if (previous.phase && next.phase &&
      isNonReopenableLifecyclePhase(previous.phase) &&
      ACTIONABLE_LIFECYCLE_PHASES.includes(next.phase)) {
    return false;
  }
  if (next.currentTurn < previous.currentTurn) return false;

  if (previous.phase && next.phase && previous.phase !== next.phase) {
    const directTransition = LEGAL_LIFECYCLE_TRANSITIONS[previous.phase].includes(next.phase);
    if (isNonReopenableLifecyclePhase(previous.phase) && !directTransition) return false;
    if (isNonReopenableLifecyclePhase(next.phase) && !directTransition) return false;

    // A one-way path from the incoming phase back to the accepted phase means
    // this is an older lifecycle snapshot. Cyclic setup edges remain valid.
    if (
      canReachLifecyclePhase(next.phase, previous.phase) &&
      !canReachLifecyclePhase(previous.phase, next.phase)
    ) return false;
  }

  // Within one numbered turn, restricted Team precedes lifted Coordination.
  // Ignore malformed/missing clocks rather than inventing client authority.
  if (
    next.currentTurn === previous.currentTurn &&
    previous.phase === 'active' && next.phase === 'active' &&
    previous.airspaceState !== undefined && next.airspaceState !== undefined &&
    next.airspaceState < previous.airspaceState
  ) return false;

  return true;
}

export function acceptServerSessionAuthority(
  authority: SessionSnapshotAuthority,
  session: GameSession,
  cursor: ServerAuthorityCursor | undefined,
  allowEqualCursor = false,
): boolean {
  if (!acceptsServerAuthorityCursor(
    authority.hasServerSessionAuthority,
    authority.latestServerAuthorityCursor,
    cursor,
    allowEqualCursor,
  )) return false;
  const nextLifecycle = sessionLifecycleCursor(session, authority.latestSessionLifecycle);
  if (!acceptsSessionLifecycleSnapshot(authority.latestSessionLifecycle, nextLifecycle)) return false;
  authority.hasServerSessionAuthority = true;
  authority.authorityVersion = sessionSnapshotAuthorityVersion(authority) + 1;
  authority.latestSessionLifecycle = nextLifecycle;
  if (cursor !== undefined) authority.latestServerAuthorityCursor = cursor;
  return true;
}

/** Reconcile a fresh join/resume result with the same authority used by listeners. */
export function acceptCallableSessionAuthority(session: GameSession, uid: string): boolean {
  return acceptServerSessionAuthority(
    sessionSnapshotAuthorityFor(session.id, uid),
    session,
    trustedTimestampCursor(session.updatedAt),
    true,
  );
}
