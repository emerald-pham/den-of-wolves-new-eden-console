/**
 * Per-tab storage for a player's unsent form input ("safe local input").
 *
 * A draft survives Back navigation and a lost-station reselect, but it is
 * scoped to one session and one authenticated UID, holds only what the player
 * typed or chose (never a request ID or other command identity), and is never
 * submitted on restore. Server authority stays primary: restoring a draft only
 * refills a form the player must still submit explicitly.
 */
export interface SessionDraftScope {
  /** Draft family, e.g. `shuttle-cargo-draft`. */
  readonly kind: string;
  readonly sessionId: string | null | undefined;
  readonly uid: string | null | undefined;
  /** The workflow the draft belongs to inside that session, e.g. a shuttle ID. */
  readonly scope: string;
}

interface StoredSessionDraft {
  readonly version: 1;
  readonly sessionId: string;
  readonly uid: string;
  readonly scope: string;
  readonly value: unknown;
}

function storageKey(draft: SessionDraftScope): string | null {
  if (!draft.sessionId || !draft.uid || !draft.kind || !draft.scope) return null;
  return [
    'pc10',
    draft.kind,
    encodeURIComponent(draft.sessionId),
    encodeURIComponent(draft.uid),
    encodeURIComponent(draft.scope),
  ].join(':');
}

/** Returns the stored value only when it belongs to this exact session, UID and scope and `parse` accepts it. */
export function readSessionDraft<T>(
  draft: SessionDraftScope,
  parse: (value: unknown) => T | null,
): T | null {
  const key = storageKey(draft);
  if (!key || typeof window === 'undefined') return null;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || record.sessionId !== draft.sessionId || record.uid !== draft.uid ||
        record.scope !== draft.scope) return null;
    return parse(record.value);
  } catch {
    return null;
  }
}

export function writeSessionDraft(draft: SessionDraftScope, value: unknown): void {
  const key = storageKey(draft);
  if (!key || !draft.sessionId || !draft.uid || typeof window === 'undefined') return;
  const stored: StoredSessionDraft = {
    version: 1, sessionId: draft.sessionId, uid: draft.uid, scope: draft.scope, value,
  };
  try {
    window.sessionStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Storage is a convenience only; the visible form and server authority remain primary.
  }
}

/** Removes only the exact session, UID and scope draft, e.g. after the player's explicit submit succeeds. */
export function clearSessionDraft(draft: SessionDraftScope): void {
  const key = storageKey(draft);
  if (!key || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage is a convenience only.
  }
}
