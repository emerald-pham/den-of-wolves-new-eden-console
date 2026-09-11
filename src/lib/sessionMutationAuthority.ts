import { useSessionStore } from '@/store/useSessionStore';
import {
  sessionSnapshotAuthorityFor,
  sessionSnapshotAuthorityVersion,
  type SessionSnapshotAuthority,
} from './sessionSnapshotAuthority';

export const FRESH_SERVER_AUTHORITY_MESSAGE =
  'Reconnect until the live session state returns before changing gameplay.';

/** Client mutations may only begin from the latest accepted server snapshot. */
export function hasFreshSessionAuthority(): boolean {
  const { connection, sessionSnapshotFreshness } = useSessionStore.getState();
  return window.navigator.onLine &&
    connection === 'live' &&
    sessionSnapshotFreshness === 'server';
}

export function requireFreshSessionAuthority(
  message = FRESH_SERVER_AUTHORITY_MESSAGE,
): void {
  if (!hasFreshSessionAuthority()) throw new Error(message);
}

export interface SessionAuthorityCheckpoint {
  readonly sessionId: string;
  readonly uid: string;
  readonly authority: SessionSnapshotAuthority;
  readonly version: number;
}

/** Capture the accepted session cursor before an asynchronous callable starts. */
export function captureSessionAuthority(
  sessionId: string,
  uid: string | undefined,
): SessionAuthorityCheckpoint | undefined {
  if (!uid) return undefined;
  const authority = sessionSnapshotAuthorityFor(sessionId, uid);
  return {
    sessionId,
    uid,
    authority,
    version: sessionSnapshotAuthorityVersion(authority),
  };
}

/** Partial callable replies must not patch over a newer accepted snapshot. */
export function isCurrentSessionAuthority(
  checkpoint: SessionAuthorityCheckpoint | undefined,
  allowConnecting = false,
): boolean {
  const store = useSessionStore.getState();
  const connectionIsFresh = store.connection === 'live' ||
    (allowConnecting && store.connection === 'connecting');
  return checkpoint !== undefined &&
    // The cursor is keyed by session and uid. A same-uid rejoin can leave the
    // old cursor intact, so the displayed identity must still be the one that
    // started the callable before any delayed result may patch local state.
    store.session?.id === checkpoint.sessionId &&
    store.me?.sessionId === checkpoint.sessionId &&
    store.me?.uid === checkpoint.uid &&
    sessionSnapshotAuthorityFor(checkpoint.sessionId, checkpoint.uid) === checkpoint.authority &&
    sessionSnapshotAuthorityVersion(checkpoint.authority) === checkpoint.version &&
    window.navigator.onLine &&
    store.sessionSnapshotFreshness === 'server' &&
    connectionIsFresh;
}
