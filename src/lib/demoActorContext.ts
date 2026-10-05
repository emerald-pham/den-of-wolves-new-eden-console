import { findConsoleRole } from '@/data/roles';
import type { GameSession } from '@/types/game';

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
  // The same disclosed role account can join later fresh games through normal
  // admission. Reuse avoids consuming another Auth signup for every rehearsal.
  return profile ? `dow-demo-${profile.roleId}` : '[DEFAULT]';
}

export function demoActorSessionStorageKey(
  ordinaryKey: string,
  profile: DemoActorProfile | null = activeDemoActorProfile,
): string {
  return profile ? `${ordinaryKey}:${profile.sessionId}:${demoActorAppName(profile)}` : ordinaryKey;
}

export function demoActorRosterStorageKey(sessionId: string): string {
  return `dow-new-eden-demo-actors:${sessionId}`;
}
export const DEMO_ACTOR_ROSTER_CHANGED = 'dow-new-eden-demo-actors-changed';

export function demoSessionStatus(session: GameSession | null): 'preparing' | 'active' | 'complete' | null {
  const marker = (session as (GameSession & { fullGameDemo?: unknown }) | null)?.fullGameDemo;
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return null;
  const keys = Object.keys(marker);
  if (keys.length !== 2 || keys.some(key => key !== 'status' && key !== 'progression') ||
      !('progression' in marker) || marker.progression !== 'manual' ||
      !('status' in marker) || typeof marker.status !== 'string') return null;
  return marker.status === 'preparing' || marker.status === 'active' || marker.status === 'complete'
    ? marker.status : null;
}

/** Foreground normal presence is unchanged; terminal demo actors become idle. */
export function demoActorPresenceAllowed(session: GameSession | null, profile = activeDemoActorProfile): boolean {
  if (!profile) return true;
  if (!session || session.id !== profile.sessionId) return false;
  const status = demoSessionStatus(session);
  return !status || (status !== 'complete' && !['debrief', 'closed'].includes(session.phase));
}

const ACCOUNT_STORAGE_KEY = 'dow-new-eden-demo-actor-accounts';
interface ActorAccount { readonly roleId: string; readonly uid: string }

function readAccounts(): readonly ActorAccount[] | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (raw === null) return [];
    const records: unknown = JSON.parse(raw);
    if (!Array.isArray(records) || records.length > 32 || !records.every(record =>
      record && typeof record === 'object' && typeof record.roleId === 'string' &&
      (record.roleId === 'controller' || findConsoleRole(record.roleId)) &&
      typeof record.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(record.uid))) return null;
    if (new Set(records.map(record => record.roleId)).size !== records.length ||
        new Set(records.map(record => record.uid)).size !== records.length) return null;
    return records.map(record => ({ roleId: record.roleId as string, uid: record.uid as string }));
  } catch { return null; }
}

/** Only public SDK account metadata is retained; credentials stay in Firebase. */
export function readDemoActorAccountUid(roleId: string): string | null | undefined {
  const accounts = readAccounts();
  return accounts === null ? null : accounts.find(account => account.roleId === roleId)?.uid;
}

export function rememberDemoActorAccount(profile: DemoActorProfile, uid: string): void {
  const accounts = readAccounts();
  if (!accounts || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
      (profile.roleId !== 'controller' && !findConsoleRole(profile.roleId))) {
    throw new Error('The saved demo actor account identity is unavailable. Restore this browser’s saved data before preparing it.');
  }
  const previous = accounts.find(account => account.roleId === profile.roleId);
  if ((previous && previous.uid !== uid) || accounts.some(account => account.uid === uid && account.roleId !== profile.roleId)) {
    throw new Error('The demo actor identity changed. Return to the demo crew controller.');
  }
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify([
    ...accounts.filter(account => account.roleId !== profile.roleId), { roleId: profile.roleId, uid },
  ]));
}

/** undefined permits a new ordinary/controller identity; null fails closed. */
export function expectedDemoActorUid(profile = activeDemoActorProfile): string | null | undefined {
  if (!profile) return undefined;
  const pooled = readDemoActorAccountUid(profile.roleId);
  if (pooled === null || profile.roleId === 'controller') return pooled;
  try {
    const records: unknown = JSON.parse(localStorage.getItem(demoActorRosterStorageKey(profile.sessionId)) ?? '[]');
    if (!Array.isArray(records)) return null;
    const matches = records.filter(record => record && typeof record === 'object' &&
      record.sessionId === profile.sessionId && record.roleId === profile.roleId &&
      typeof record.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(record.uid));
    if (matches.length === 0) return pooled ?? null;
    if (matches.length !== 1 || (pooled && pooled !== matches[0].uid)) return null;
    return matches[0].uid as string;
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
