import { findConsoleRole } from '@/data/roles';

export interface DemoActorProfile {
  readonly sessionId: string;
  readonly roleId: string;
}

/** These identifiers select local SDK storage; they are never credentials. */
export function demoActorProfileFromUrl(href: string): DemoActorProfile | null {
  try {
    const values = new URL(href).searchParams.getAll('demoActor');
    if (values.length !== 1) return null;
    const parts = values[0]?.split('~');
    if (parts?.length !== 2) return null;
    const [sessionId, roleId] = parts;
    if (!sessionId || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId) ||
        !roleId || (roleId !== 'controller' && !findConsoleRole(roleId))) return null;
    return { sessionId, roleId };
  } catch { return null; }
}

// A Firebase app and its store must never change while this document is alive.
// The selector navigates to a new document rather than exchanging identities
// beneath existing private listeners, queued commands or in-flight responses.
export const activeDemoActorProfile = typeof window === 'undefined'
  ? null : demoActorProfileFromUrl(window.location.href);

export function demoActorAppName(profile: DemoActorProfile | null = activeDemoActorProfile): string {
  return profile ? `dow-demo-${profile.sessionId}~${profile.roleId}` : '[DEFAULT]';
}

export function demoActorSessionStorageKey(
  ordinaryKey: string,
  profile: DemoActorProfile | null = activeDemoActorProfile,
): string {
  return profile ? `${ordinaryKey}:${demoActorAppName(profile)}` : ordinaryKey;
}

export function demoActorRosterStorageKey(sessionId: string): string {
  return `dow-new-eden-demo-actors:${sessionId}`;
}

/** undefined is an ordinary/controller identity; null is an unavailable actor. */
export function expectedDemoActorUid(profile = activeDemoActorProfile): string | null | undefined {
  if (!profile || profile.roleId === 'controller') return undefined;
  try {
    const records: unknown = JSON.parse(localStorage.getItem(demoActorRosterStorageKey(profile.sessionId)) ?? '[]');
    if (!Array.isArray(records)) return null;
    const matches = records.filter(record => record && typeof record === 'object' &&
      record.sessionId === profile.sessionId && record.roleId === profile.roleId &&
      typeof record.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(record.uid));
    return matches.length === 1 ? matches[0].uid as string : null;
  } catch { return null; }
}

export function demoActorJoinCode(href = window.location.href): string | null {
  const values = new URL(href).searchParams.getAll('demoJoin');
  const code = values.length === 1 ? values[0] : undefined;
  return code && /^(?:\d{4}|\d{6})$/.test(code) ? code : null;
}

export function demoActorUrl(profile: DemoActorProfile, joinCode: string, baseHref: string): string {
  const url = new URL(baseHref);
  // Do not forward unrelated query parameters, especially browser-local data.
  url.search = '';
  url.searchParams.set('demoActor', `${profile.sessionId}~${profile.roleId}`);
  url.searchParams.set('demoJoin', joinCode);
  url.hash = '/demo-actors';
  return url.href;
}

export function demoActorManagerUrl(
  session: Readonly<{ id: string; joinCode: string }>,
  baseHref: string,
): string {
  return demoActorUrl({ sessionId: session.id, roleId: 'controller' }, session.joinCode, baseHref);
}
