import { useSessionStore } from '@/store/useSessionStore';
import {
  sessionSnapshotAuthorityFor,
  sessionSnapshotAuthorityVersion,
  type SessionSnapshotAuthority,
} from './firestore';

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
    sessionSnapshotAuthorityFor(checkpoint.sessionId, checkpoint.uid) === checkpoint.authority &&
    sessionSnapshotAuthorityVersion(checkpoint.authority) === checkpoint.version &&
    window.navigator.onLine &&
    store.sessionSnapshotFreshness === 'server' &&
    connectionIsFresh;
}
