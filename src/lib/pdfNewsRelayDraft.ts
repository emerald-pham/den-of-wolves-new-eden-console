/**
 * Tab-scoped storage for the P.D.F. Colonel's unsent news relay text. Each
 * draft is bound to one session, player and fleet group, so a later group never
 * sees text written for another audience, while a station reselect in the same
 * group restores it. Storage failures only lose the convenience, never a relay.
 */
export function pdfNewsRelayDraftKey(sessionId: string, uid: string, groupId: string): string {
  return `dow.pdfNewsRelayDraft.v1:${sessionId}:${uid}:${groupId}`;
}

export function readPdfNewsRelayDraft(key: string | null): string {
  if (!key) return '';
  try { return sessionStorage.getItem(key) ?? ''; } catch { return ''; }
}

export function writePdfNewsRelayDraft(key: string | null, text: string): void {
  if (!key) return;
  try {
    if (text) sessionStorage.setItem(key, text);
    else sessionStorage.removeItem(key);
  } catch { /* Draft retention is optional. */ }
}
