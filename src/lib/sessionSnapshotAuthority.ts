import type { GameSession, Player, Seat } from '@/types/game';
import { turnLimitForSession, turnStateForPhaseContext } from './turnPhase';
import {
  LEGAL_LIFECYCLE_TRANSITIONS,
  type LifecyclePhase,
} from '../../functions/src/lifecycle';

export type SessionLifecycleCursor = {
  readonly currentTurn: number;
  readonly phase?: LifecyclePhase;
  readonly airspaceState?: 0 | 1;
  /** Canonical current-cycle phase revision, including attack closure/reopening. */
  readonly phaseRevision?: number;
};

/** Session timestamp compared at the ISO millisecond precision of callable replies. */
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
  /** Increments when an accepted server snapshot advances session authority. */
  authorityVersion?: number;
  latestSessionLifecycle?: SessionLifecycleCursor;
  latestServerAuthorityCursor?: ServerAuthorityCursor;
  /** Stable content identity used to distinguish metadata-only reconnects from unversioned writes. */
  latestServerSessionFingerprint?: string;
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

// A member feed can confirm current content before the normal resume SDK has
// accepted this document's identity. Failed attempts remain read-only until a
// matching normal retry succeeds; older replies cannot release a newer fence.
const memberResumeTokens = new WeakMap<SessionSnapshotAuthority, symbol>();

export function beginMemberSessionResume(authority: SessionSnapshotAuthority): symbol {
  const token = Symbol('member-resume');
  wingFirstEntries.delete(authority);
  memberResumeTokens.set(authority, token);
  return token;
}

export function isCurrentMemberSessionResume(authority: SessionSnapshotAuthority, token: symbol): boolean {
  return memberResumeTokens.get(authority) === token;
}

export function finishMemberSessionResume(authority: SessionSnapshotAuthority, token: symbol, accepted: boolean): void {
  if (accepted && isCurrentMemberSessionResume(authority, token)) memberResumeTokens.delete(authority);
}

export function memberSessionResumeBlocksFreshness(authority: SessionSnapshotAuthority): boolean {
  return memberResumeTokens.has(authority);
}

/** Local provenance for one accepted first-entry CAS; it grants no authority. */
export interface WingFirstEntryProjectionPending {
  readonly kind: 'app-wing-first-entry-withheld';
  readonly sessionId: string;
  readonly actorUid: string;
  readonly groupId: string;
  readonly role: 'player';
  readonly assignedRoleId: 'wing-commander';
  readonly activeConsoleRoleId: 'wing-commander' | null;
  readonly seatId: 'wing-commander';
  readonly shipId: 'aegis';
  readonly connectionGeneration: number;
  readonly identityHydrationRevision: number;
  readonly sourceConnectionGeneration: number;
  readonly sourceIdentityHydrationRevision: number;
  readonly documentTimeOrigin: number;
  readonly deadlineAt: number;
  readonly claimRequestId: string;
  readonly claimedSetupRevision: number;
  readonly memberSessionScope: NonNullable<GameSession['memberSessionScope']>;
}

type WingEntryContext = {
  readonly session: GameSession | null;
  readonly me: Player | null;
  readonly identityHydrationRevision: number;
};
const wingFirstEntries = new WeakMap<SessionSnapshotAuthority, WingFirstEntryProjectionPending>();

export function wingFirstEntryMatches(
  entry: WingFirstEntryProjectionPending,
  state: WingEntryContext,
  uid: string | undefined,
  documentTimeOrigin: number,
): boolean {
  const { session, me } = state;
  return Boolean(entry.kind === 'app-wing-first-entry-withheld' && entry.role === 'player' && entry.shipId === 'aegis' &&
    entry.assignedRoleId === 'wing-commander' && entry.seatId === 'wing-commander' &&
    Number.isSafeInteger(entry.connectionGeneration) && entry.connectionGeneration > 0 &&
    Number.isSafeInteger(entry.identityHydrationRevision) && entry.identityHydrationRevision > 0 &&
    typeof entry.claimRequestId === 'string' && entry.claimRequestId.length > 0 &&
    Number.isSafeInteger(entry.claimedSetupRevision) && entry.claimedSetupRevision >= 0 &&
    Number.isFinite(entry.deadlineAt) && Number.isFinite(entry.documentTimeOrigin) &&
    session && me && uid === entry.actorUid && me.uid === uid &&
    session.id === entry.sessionId && me.sessionId === session.id && me.role === 'player' && me.connected === true &&
    session.phase === 'casting' && session.currentTurn === 0 && session.setupConfirmed === true &&
    me.fleetGroupId === entry.groupId && me.assignedRoleId === entry.assignedRoleId && me.seatId === entry.seatId &&
    (me.activeConsoleRoleId === null || me.activeConsoleRoleId === entry.assignedRoleId) &&
    me.connectionGeneration === entry.connectionGeneration && entry.connectionGeneration === entry.sourceConnectionGeneration &&
    state.identityHydrationRevision === entry.identityHydrationRevision &&
    entry.identityHydrationRevision === entry.sourceIdentityHydrationRevision &&
    me.replacementRoleId == null && me.replacementStatus == null && me.escapeState == null &&
    (me as Player & { readonly kickedAt?: unknown }).kickedAt == null &&
    documentTimeOrigin === entry.documentTimeOrigin && Date.now() < entry.deadlineAt &&
    JSON.stringify(session.memberSessionScope) === JSON.stringify(entry.memberSessionScope));
}

export function beginWingFirstEntry(
  authority: SessionSnapshotAuthority,
  before: WingEntryContext,
  current: WingEntryContext & { readonly seats: readonly Seat[] },
  uid: string | undefined,
  documentTimeOrigin: number,
  receipt: { readonly requestId: string; readonly setupRevision: number },
  deadlineAt: number,
): WingFirstEntryProjectionPending | undefined {
  const { session, me } = before;
  const berth = session?.currentActorBerthAuthority;
  const scope = session?.memberSessionScope;
  if (!authority.hasServerSessionAuthority || memberSessionResumeBlocksFreshness(authority) || wingFirstEntries.has(authority) ||
      !session || !me || !scope || me.role !== 'player' || me.connected !== true || me.uid !== uid || me.sessionId !== session.id ||
      me.assignedRoleId !== 'wing-commander' || me.activeConsoleRoleId !== null || me.seatId != null ||
      me.replacementRoleId != null || me.replacementStatus != null || me.escapeState != null ||
      (me as Player & { readonly kickedAt?: unknown }).kickedAt != null ||
      session.phase !== 'casting' || session.currentTurn !== 0 || session.setupConfirmed !== true ||
      !Number.isSafeInteger(me.connectionGeneration) || (me.connectionGeneration ?? 0) < 1 ||
      !(before.identityHydrationRevision > 0) || !berth || berth.sessionId !== session.id || berth.actorUid !== uid ||
      berth.role !== 'player' || berth.shipId !== 'aegis' || berth.groupId !== me.fleetGroupId || scope.groupId !== me.fleetGroupId ||
      !Array.isArray(scope.vesselIds) || !Array.isArray(scope.craftIds) || !scope.vesselIds.includes('aegis') ||
      berth.connectionGeneration !== me.connectionGeneration ||
      berth.assignedRoleId !== me.assignedRoleId || berth.activeConsoleRoleId !== null ||
      berth.replacementRoleId != null || berth.replacementStatus != null ||
      !current.seats.some(seat => seat.id === 'wing-commander' && seat.status === 'claimed' && seat.holderUid === uid) ||
      !Number.isSafeInteger(receipt.setupRevision) || receipt.setupRevision < (session.setupRevision ?? 0) ||
      current.session?.setupRevision !== receipt.setupRevision ||
      !receipt.requestId || !Number.isFinite(documentTimeOrigin) || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now()) return;
  const entry: WingFirstEntryProjectionPending = Object.freeze({ kind: 'app-wing-first-entry-withheld',
    sessionId: session.id, actorUid: me.uid, groupId: scope.groupId, role: 'player', assignedRoleId: 'wing-commander',
    activeConsoleRoleId: null, seatId: 'wing-commander', shipId: 'aegis', connectionGeneration: me.connectionGeneration!,
    identityHydrationRevision: before.identityHydrationRevision, sourceConnectionGeneration: me.connectionGeneration!,
    sourceIdentityHydrationRevision: before.identityHydrationRevision, documentTimeOrigin, deadlineAt,
    claimRequestId: receipt.requestId, claimedSetupRevision: receipt.setupRevision,
    memberSessionScope: { groupId: scope.groupId, vesselIds: [...scope.vesselIds], craftIds: [...scope.craftIds] } });
  if (!wingFirstEntryMatches(entry, current, uid, documentTimeOrigin)) return;
  wingFirstEntries.set(authority, entry);
  return entry;
}

export function pendingWingFirstEntry(
  authority: SessionSnapshotAuthority,
  state: WingEntryContext,
  uid: string | undefined,
  documentTimeOrigin: number,
): WingFirstEntryProjectionPending | undefined {
  const entry = wingFirstEntries.get(authority);
  if (!entry) return;
  if (authority.hasServerSessionAuthority && !memberSessionResumeBlocksFreshness(authority) &&
      wingFirstEntryMatches(entry, state, uid, documentTimeOrigin)) return entry;
  wingFirstEntries.delete(authority);
}

export function finishWingFirstEntry(authority: SessionSnapshotAuthority, entry?: WingFirstEntryProjectionPending): void {
  if (!entry || wingFirstEntries.get(authority) === entry) wingFirstEntries.delete(authority);
}

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

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sessionFingerprint(session: GameSession): string {
  // The hydration boundary synthesizes wall-clock timestamps for legacy docs
  // without createdAt/updatedAt. They are not session-content changes and
  // must not defeat duplicate-payload suppression after reconnect.
  const projection = Object.fromEntries(
    Object.entries(session).filter(([key]) => key !== 'createdAt' && key !== 'updatedAt'),
  );
  return stableSerialize(projection);
}

export function hasSameServerSessionProjection(
  authority: SessionSnapshotAuthority,
  session: GameSession,
): boolean {
  return authority.latestServerSessionFingerprint === sessionFingerprint(session);
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

/** Callable session projections encode updatedAt as ISO milliseconds. */
export function comparableSessionCursor(value: unknown): ServerAuthorityCursor | undefined {
  const cursor = trustedTimestampCursor(value);
  if (!cursor) return undefined;
  return {
    seconds: cursor.seconds,
    nanoseconds: Math.floor(cursor.nanoseconds / 1_000_000) * 1_000_000,
  };
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
  allowUnversioned = false,
): boolean {
  // Preserve one intentional legacy hydration. By default, an established
  // server authority requires a newer cursor. Callers may allow an equal or
  // missing cursor only after verifying that an authoritative server payload
  // actually changed; session lifecycle checks still apply before acceptance.
  if (!hasServerSessionAuthority) return true;
  if (next === undefined) return allowUnversioned;
  if (previous === undefined) return true;
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
  const turnState = phase === 'active'
    ? turnStateForPhaseContext(session.turnState, turnPhase, currentTurn, turnLimitForSession(session))
    : undefined;
  const phaseRevision = turnState?.phaseRevision ??
    (previous?.currentTurn === currentTurn && previous.phase === phase ? previous.phaseRevision : undefined);
  return {
    currentTurn,
    ...(phase ? { phase } : {}),
    ...(airspaceState === undefined ? {} : { airspaceState }),
    ...(phaseRevision === undefined ? {} : { phaseRevision }),
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
  if (next.currentTurn === previous.currentTurn && previous.phaseRevision !== undefined &&
      next.phaseRevision !== undefined && next.phaseRevision < previous.phaseRevision) return false;

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

  // A real attack closes already-open airspace in the same cycle and advances
  // the canonical phase revision. Legacy/malformed clocks still cannot reopen
  // an earlier Team projection solely because their timestamp changed.
  if (
    next.currentTurn === previous.currentTurn &&
    previous.phase === 'active' && next.phase === 'active' &&
    previous.airspaceState !== undefined && next.airspaceState !== undefined &&
    next.airspaceState < previous.airspaceState &&
    !(previous.phaseRevision !== undefined && next.phaseRevision !== undefined &&
      next.phaseRevision > previous.phaseRevision)
  ) return false;

  return true;
}

/** Accept a session payload while preserving lifecycle monotonicity. */
export function acceptServerSessionAuthority(
  authority: SessionSnapshotAuthority,
  session: GameSession,
  cursor: ServerAuthorityCursor | undefined,
  allowEqualCursor = false,
  allowUnversioned = false,
): boolean {
  if (!acceptsServerAuthorityCursor(
    authority.hasServerSessionAuthority,
    authority.latestServerAuthorityCursor,
    cursor,
    allowEqualCursor,
    allowUnversioned,
  )) return false;
  const nextLifecycle = sessionLifecycleCursor(session, authority.latestSessionLifecycle);
  if (!acceptsSessionLifecycleSnapshot(authority.latestSessionLifecycle, nextLifecycle)) return false;
  authority.hasServerSessionAuthority = true;
  authority.authorityVersion = sessionSnapshotAuthorityVersion(authority) + 1;
  authority.latestSessionLifecycle = nextLifecycle;
  authority.latestServerSessionFingerprint = sessionFingerprint(session);
  if (cursor !== undefined) authority.latestServerAuthorityCursor = cursor;
  return true;
}

/** Reconcile a fresh join/resume result with the same authority used by listeners. */
export function acceptCallableSessionAuthority(session: GameSession, uid: string): boolean {
  return acceptServerSessionAuthority(
    sessionSnapshotAuthorityFor(session.id, uid),
    session,
    comparableSessionCursor(session.updatedAt),
    true,
  );
}
