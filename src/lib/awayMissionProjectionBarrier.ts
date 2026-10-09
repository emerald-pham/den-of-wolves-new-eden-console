import { onAuthStateChanged } from 'firebase/auth';
import { app, auth } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { memberAwayMissionProjectionSafety } from '../../functions/src/awayMissionProjectionSafety';
import type { AwayMissionProjectionSafetyFacts, Player } from '@/types/game';

const INTENT_KEY = 'dow-away-mission-memory-cutover';
const bootId = crypto.randomUUID();
type Intent = { version: 1; appName: string; sessionId: string; uid: string; policyVersion: 1; epoch: number; previousBootId: string };
type Authority = { sessionConfirmed: boolean; marker: AwayMissionProjectionSafetyFacts | null; player?: Player };
export interface AwayMissionProjectionAccess { readonly owner: boolean; readonly gm: boolean }
type Observer = { sessionId: string; uid: string; next: (access: AwayMissionProjectionAccess) => void; last?: AwayMissionProjectionAccess };
const authorities = new Map<string, Authority>();
const observers = new Set<Observer>();
let acceptedKey: string | null = null;
let dirty = false;
let reloadRequested = false;
let refreshing = false;
let refreshWanted = false;
let stopStore: (() => void) | undefined;
let stopAuth: (() => void) | undefined;

/** Member facts are exact public administration, never a persisted permit. */
export function parseAwayMissionProjectionSafetyFacts(value: unknown): AwayMissionProjectionSafetyFacts | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || record.policyVersion !== 1 ||
      !Number.isSafeInteger(record.epoch) || (record.epoch as number) < 1 ||
      (record.state !== 'held' && record.state !== 'ready')) return null;
  return { policyVersion: 1, epoch: record.epoch as number, state: record.state };
}
export function projectedAwayMissionSafety(value: unknown): AwayMissionProjectionSafetyFacts | null {
  return parseAwayMissionProjectionSafetyFacts(value) ?? memberAwayMissionProjectionSafety(value);
}
function readBootIntent(): Intent | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(INTENT_KEY) ?? 'null');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const keys = ['version', 'appName', 'sessionId', 'uid', 'policyVersion', 'epoch', 'previousBootId'];
    if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key)) ||
        record.version !== 1 || record.policyVersion !== 1 || !Number.isSafeInteger(record.epoch) || (record.epoch as number) < 1 ||
        ['appName', 'sessionId', 'uid', 'previousBootId'].some(key => typeof record[key] !== 'string' || !record[key])) return null;
    return value as Intent;
  } catch { return null; }
}
// Later storage writes cannot manufacture evidence of a different document.
let bootIntent = readBootIntent();
const authorityKey = (sessionId: string, uid: string) => JSON.stringify([sessionId, uid]);
function clearMissionViews(clearGm: boolean) {
  const store = useSessionStore.getState();
  if (store.awayMissionHandPointer !== null || store.awayMissionHand !== null ||
      store.awayMissionHandPointers.length || store.awayMissionHands.length || clearGm && store.gmAwayMissionHandPointers.length) {
    useSessionStore.setState({ awayMissionHandPointer: null, awayMissionHand: null,
      awayMissionHandPointers: [], awayMissionHands: [], ...(clearGm ? { gmAwayMissionHandPointers: [] } : {}) });
  }
}
function invalidate(clearAuthority = false) {
  acceptedKey = null; bootIntent = null; dirty = true;
  if (clearAuthority) for (const authority of authorities.values()) {
    authority.sessionConfirmed = false; authority.player = undefined;
  }
  clearMissionViews(clearAuthority);
}
function identity(): { uid: string; appName: string } | null {
  try {
    const uid = auth().currentUser?.uid;
    return uid ? { uid, appName: app().name } : null;
  } catch { return null; }
}
function isReloadDocument(): boolean {
  return typeof performance.getEntriesByType === 'function' &&
    performance.getEntriesByType('navigation').some(entry => (entry as PerformanceNavigationTiming).type === 'reload');
}
function requestCutover(intent: Omit<Intent, 'version' | 'previousBootId'>) {
  try { sessionStorage.setItem(INTENT_KEY, JSON.stringify({ ...intent, version: 1, previousBootId: bootId })); }
  catch { return; }
  if (reloadRequested) return;
  reloadRequested = true;
  // Only a new document resets the default SDK memory/provider and closures.
  // This does not erase a previously downloaded or copied snapshot.
  try { window.location.reload(); } catch { /* A blocked navigation leaves every owner read held. */ }
}
function accessFor(sessionId: string, uid: string): AwayMissionProjectionAccess {
  const current = identity(); const store = useSessionStore.getState();
  const authority = authorities.get(authorityKey(sessionId, uid));
  const player = authority?.player;
  if (!current || current.uid !== uid || !navigator.onLine || !player || player.uid !== uid ||
      player.sessionId !== sessionId || player.connected !== true || store.session?.id !== sessionId ||
      store.session.phase === 'closed' || store.connection !== 'live' || store.me?.uid !== uid || store.me.sessionId !== sessionId ||
      store.me.connected !== true || store.me.role !== player.role) {
    if (acceptedKey !== null || dirty) invalidate(true);
    return { owner: false, gm: false };
  }
  // This role came from the fresh own-player listener, not a supplied callback.
  if (player.role === 'gm') return { owner: false, gm: true };
  if (player.role !== 'player' || !authority?.sessionConfirmed || store.sessionSnapshotFreshness !== 'server' ||
      !Number.isSafeInteger(store.identityHydrationRevision) || store.identityHydrationRevision < 1 ||
      !Number.isSafeInteger(player.connectionGeneration) || (player.connectionGeneration ?? 0) < 1 ||
      player.connectionGeneration !== store.me.connectionGeneration || player.fleetGroupId !== store.me.fleetGroupId ||
      store.session.memberSessionScope?.groupId !== player.fleetGroupId) {
    if (acceptedKey !== null) invalidate(true);
    return { owner: false, gm: false };
  }
  const displayed = parseAwayMissionProjectionSafetyFacts(store.session.awayMissionProjectionSafety);
  const marker = authority.marker;
  if (!marker || marker.state !== 'ready' || !displayed || displayed.state !== 'ready' || displayed.epoch !== marker.epoch) {
    invalidate(true); return { owner: false, gm: false };
  }
  const key = JSON.stringify([current.appName, sessionId, uid, marker.epoch]);
  if (acceptedKey === key && !dirty) return { owner: true, gm: false };
  if (acceptedKey !== null && acceptedKey !== key) invalidate(true);
  if (!dirty && bootIntent && isReloadDocument() && bootIntent.previousBootId !== bootId &&
      bootIntent.appName === current.appName && bootIntent.sessionId === sessionId && bootIntent.uid === uid &&
      bootIntent.policyVersion === marker.policyVersion && bootIntent.epoch === marker.epoch) {
    acceptedKey = key; bootIntent = null;
    try { sessionStorage.removeItem(INTENT_KEY); } catch { /* The captured intent is already consumed. */ }
    return { owner: true, gm: false };
  }
  requestCutover({ appName: current.appName, sessionId, uid, policyVersion: 1, epoch: marker.epoch });
  return { owner: false, gm: false };
}
function refresh() {
  if (refreshing) { refreshWanted = true; return; }
  refreshing = true;
  do {
    refreshWanted = false;
    for (const observer of [...observers]) {
      const access = accessFor(observer.sessionId, observer.uid);
      if (observer.last?.owner === access.owner && observer.last?.gm === access.gm) continue;
      observer.last = access; observer.next(access);
    }
  } while (refreshWanted);
  refreshing = false;
}
function withdrawPage() { invalidate(true); refresh(); }
function restoredPage(event: PageTransitionEvent) { if (event.persisted) withdrawPage(); }

/** Called only after the existing transaction/member or GM session feed accepts fresh server authority. */
export function confirmAwayMissionProjectionSession(sessionId: string, uid: string, value: unknown) {
  const key = authorityKey(sessionId, uid); const prior = authorities.get(key);
  const marker = projectedAwayMissionSafety(value);
  if (!marker || marker.state !== 'ready') invalidate();
  if (prior?.marker && marker?.epoch !== prior.marker.epoch) invalidate();
  authorities.set(key, { ...prior, sessionConfirmed: true, marker }); refresh();
}
/** Current role/connection proof comes from a server own-player snapshot. */
export function confirmAwayMissionProjectionPlayer(sessionId: string, uid: string, player: Player | undefined) {
  const key = authorityKey(sessionId, uid); const prior = authorities.get(key);
  if (prior?.player && (player?.role !== prior.player.role || player?.connected !== true ||
      player.connectionGeneration !== prior.player.connectionGeneration || player.fleetGroupId !== prior.player.fleetGroupId)) invalidate(true);
  authorities.set(key, { sessionConfirmed: prior?.sessionConfirmed ?? false, marker: prior?.marker ?? null, player }); refresh();
}
export function withdrawAwayMissionProjectionAuthority(sessionId: string, uid: string) {
  authorities.delete(authorityKey(sessionId, uid)); invalidate(); refresh();
}
export function markGmAwayMissionProjectionRead() { invalidate(); refresh(); }
export function hasAwayMissionOwnerAccess(sessionId: string, uid: string): boolean { return accessFor(sessionId, uid).owner; }

export function subscribeAwayMissionProjectionAccess(sessionId: string, uid: string,
  next: (access: AwayMissionProjectionAccess) => void): () => void {
  if (typeof window === 'undefined') { next({ owner: false, gm: false }); return () => undefined; }
  const observer = { sessionId, uid, next }; observers.add(observer);
  if (!stopStore) {
    stopStore = useSessionStore.subscribe(refresh);
    try { stopAuth = onAuthStateChanged(auth(), () => { if (acceptedKey !== null && identity()?.uid !== uid) invalidate(true); refresh(); }); }
    catch { stopAuth = undefined; }
    window.addEventListener('offline', withdrawPage);
    window.addEventListener('pagehide', withdrawPage);
    window.addEventListener('pageshow', restoredPage);
  }
  refresh();
  return () => {
    observers.delete(observer);
    if (observers.size) return;
    stopStore?.(); stopStore = undefined; stopAuth?.(); stopAuth = undefined;
    window.removeEventListener('offline', withdrawPage);
    window.removeEventListener('pagehide', withdrawPage);
    window.removeEventListener('pageshow', restoredPage);
  };
}
