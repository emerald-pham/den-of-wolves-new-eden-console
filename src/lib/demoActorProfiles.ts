import { httpsCallable } from 'firebase/functions';
import { demoActorServices } from './firebase';
import { ensureAnonymousAuth } from './anonymousAuth';
import { demoActorDisplayName } from './demoActorDisplayName';
import {
  demoActorRosterStorageKey,
  demoActorUrl,
  readDemoActorAccountUid,
  rememberDemoActorAccount,
  DEMO_ACTOR_ROSTER_CHANGED,
  demoSessionStatus,
  type DemoActorProfile,
} from './demoActorContext';
export { demoSessionStatus } from './demoActorContext';
import { findConsoleRole } from '@/data/roles';
import { findShip } from '@/data/ships';
import type { GameSession, Player } from '@/types/game';

export interface DemoActorRecord extends DemoActorProfile {
  readonly uid: string;
  readonly label: string;
}

interface ActorReply { readonly session: GameSession; readonly player: Player }
interface ActorSeatCommand {
  readonly sessionId: string;
  readonly seatId: string;
  readonly requestId: string;
  readonly expectedSetupRevision: number;
}
interface ActorSeatReply { readonly status: string; readonly setupRevision?: number }

/** All methods authenticate as this profile's real SDK account. No UID override exists. */
export interface DemoActorGateway {
  identity(profile: DemoActorProfile, expectedUid?: string): Promise<string>;
  join(profile: DemoActorProfile, joinCode: string): Promise<ActorReply>;
  resume(profile: DemoActorProfile, sessionId: string): Promise<ActorReply>;
  claim(profile: DemoActorProfile, command: ActorSeatCommand): Promise<ActorSeatReply>;
  presence(profile: DemoActorProfile, activeConsoleRoleId?: string): Promise<void>;
}

const gateway: DemoActorGateway = {
  identity: async (profile, expectedUid) => {
    const pooled = readDemoActorAccountUid(profile.roleId);
    if (pooled === null || (expectedUid && pooled && expectedUid !== pooled)) {
      throw new Error('The saved demo actor identity is unavailable. Restore this browser’s saved data.');
    }
    const uid = (await ensureAnonymousAuth(demoActorServices(profile).auth, expectedUid ?? pooled)).uid;
    rememberDemoActorAccount(profile, uid);
    return uid;
  },
  join: async (profile, joinCode) => (await httpsCallable<
    { joinCode: string; displayName: string }, ActorReply
  >(demoActorServices(profile).functions, 'joinSession')({
    joinCode, displayName: demoActorDisplayName(profile.roleId),
  })).data,
  resume: async (profile, sessionId) => (await httpsCallable<
    { sessionId: string }, ActorReply
  >(demoActorServices(profile).functions, 'resumeSession')({ sessionId })).data,
  claim: async (profile, command) => (await httpsCallable<ActorSeatCommand, ActorSeatReply>(
    demoActorServices(profile).functions, 'claimSeat',
  )(command)).data,
  presence: async (profile, activeConsoleRoleId) => {
    await httpsCallable(demoActorServices(profile).functions, 'refreshPresence')({
      sessionId: profile.sessionId,
      ...(activeConsoleRoleId ? { activeConsoleRoleId } : {}),
    });
  },
};

function actorLabel(roleId: string): string {
  const role = findConsoleRole(roleId);
  const ship = role ? findShip(role.shipId) : undefined;
  return role ? `${ship?.name ?? 'Independent station'} // ${role.name}` : roleId;
}

export function readDemoActorRoster(sessionId: string): readonly DemoActorRecord[] {
  try {
    const records: unknown = JSON.parse(localStorage.getItem(demoActorRosterStorageKey(sessionId)) ?? '[]');
    if (!Array.isArray(records) || records.length > 21) return [];
    const valid = records.every(record => record && typeof record === 'object' &&
      record.sessionId === sessionId && typeof record.roleId === 'string' && findConsoleRole(record.roleId) &&
      typeof record.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(record.uid) &&
      typeof record.label === 'string' && record.label.length <= 160);
    if (!valid || new Set(records.map(record => record.roleId)).size !== records.length ||
        new Set(records.map(record => record.uid)).size !== records.length) return [];
    // Only retain the public identity metadata; unknown persisted fields are ignored.
    return records.map(record => ({ sessionId, roleId: record.roleId as string, uid: record.uid as string,
      label: actorLabel(record.roleId as string) }));
  } catch { return []; }
}

function saveRoster(sessionId: string, records: readonly DemoActorRecord[]): void {
  localStorage.setItem(demoActorRosterStorageKey(sessionId), JSON.stringify(records));
  window.dispatchEvent(new Event(DEMO_ACTOR_ROSTER_CHANGED));
}

function checkedReply(reply: ActorReply, profile: DemoActorProfile, uid: string): ActorReply {
  if (!reply?.session || !reply.player || reply.session.id !== profile.sessionId ||
      reply.player.sessionId !== profile.sessionId || reply.player.uid !== uid || reply.player.role !== 'player') {
    throw new Error('The server returned a different demo actor identity. Stop and reopen the crew controller.');
  }
  if (!demoSessionStatus(reply.session)) throw new Error('The GM must prepare this session as a full-game demo first.');
  return reply;
}

interface ActorOptions {
  readonly gateway?: DemoActorGateway;
  readonly onProgress?: (actors: readonly DemoActorRecord[]) => void;
  readonly shouldContinue?: () => boolean;
  readonly waitForReady?: () => Promise<void>;
  readonly foregroundPresence?: {
    readonly profile: DemoActorProfile;
    readonly uid: string;
    readonly refresh: () => Promise<void>;
  };
}

function requirePreparation(session: GameSession): void {
  if (session.currentTurn !== 0) throw new Error('Prepare the demo crew during Cycle 0.');
  if (demoSessionStatus(session) !== 'preparing' || !['lobby', 'casting'].includes(session.phase)) {
    throw new Error('The GM must prepare this session as a full-game demo first.');
  }
}

interface DemoPreparationReadiness {
  readonly session: GameSession | null;
  readonly me: Pick<Player, 'uid' | 'sessionId' | 'role'> | null;
  readonly authenticatedUid: string | null;
  readonly mounted: boolean;
  readonly connection: 'idle' | 'connecting' | 'live' | 'offline';
  readonly freshness: 'unknown' | 'cache' | 'server';
}

/** Wait for the existing authenticated projection; never grant authority or repair identity locally. */
export async function waitForDemoPreparationReady(options: {
  readonly profile: DemoActorProfile;
  readonly expectedUid: string;
  readonly read: () => DemoPreparationReadiness;
}): Promise<void> {
  if (options.profile.roleId !== 'controller') throw new Error('Prepare the crew from its controller.');
  const deadline = Date.now() + 15_000;
  for (;;) {
    const current = options.read();
    if (!current.mounted || !options.expectedUid || current.authenticatedUid !== options.expectedUid ||
        current.me?.uid !== options.expectedUid || current.me.role !== 'player' ||
        current.me.sessionId !== options.profile.sessionId || current.session?.id !== options.profile.sessionId) {
      throw new Error('Demo preparation stopped because its controller identity changed. Reopen the crew controller.');
    }
    requirePreparation(current.session);
    if (current.connection === 'live' && current.freshness === 'server') return;
    if (Date.now() >= deadline) throw new Error('Demo preparation stopped. Reconnect and retry from the crew controller.');
    await new Promise<void>(resolve => window.setTimeout(resolve, 100));
  }
}

async function preparationStepReady(options: ActorOptions): Promise<void> {
  await options.waitForReady?.();
  if (options.shouldContinue?.() === false) throw new Error('Demo preparation stopped. Reconnect and retry from the crew controller.');
}

/** Prepare a virtual crew via the same admission and seat transactions as ordinary players. */
export async function prepareDemoActors(session: GameSession, options: ActorOptions = {}): Promise<readonly DemoActorRecord[]> {
  requirePreparation(session);
  const api = options.gateway ?? gateway;
  const roleIds = [...session.activeRoleIds ?? []];
  if (!roleIds.length || roleIds.length > 20 || new Set(roleIds).size !== roleIds.length ||
      roleIds.some(roleId => roleId === 'press-officer' || !findConsoleRole(roleId))) {
    throw new Error('Refresh the GM-confirmed printed roster before preparing the crew.');
  }
  if (session.pressEnabled !== false) roleIds.push('press-officer');
  let records = [...readDemoActorRoster(session.id)];
  for (const roleId of roleIds) {
    await preparationStepReady(options);
    const profile = { sessionId: session.id, roleId };
    const previous = records.find(record => record.roleId === roleId);
    const pooled = readDemoActorAccountUid(roleId);
    if (pooled === null || (previous && pooled && previous.uid !== pooled)) {
      throw new Error('The saved demo actor identity is unavailable. Restore this browser’s saved data.');
    }
    const uid = await api.identity(profile, previous?.uid ?? pooled);
    // Retain this real SDK UID before admission or a seat transaction can
    // commit. A lost acknowledgement must never silently create a new actor.
    rememberDemoActorAccount(profile, uid);
    await preparationStepReady(options);
    let reply = checkedReply(await api.join(profile, session.joinCode), profile, uid);
    requirePreparation(reply.session);
    if (roleId === 'press-officer') {
      // Press uses its existing exclusive player-station path, not a core seat.
      await preparationStepReady(options);
      await api.presence(profile, roleId);
    } else if (reply.player.seatId !== roleId) {
      if (reply.player.seatId) throw new Error('This demo actor already holds another station. Review its ordinary seat assignment.');
      let claimed = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await preparationStepReady(options);
        const revision = reply.session.setupRevision;
        if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new Error('Wait for the current setup revision before claiming a demo station.');
        const result = await api.claim(profile, {
          sessionId: session.id, seatId: roleId,
          requestId: crypto.randomUUID(), expectedSetupRevision: revision as number,
        });
        if (result.status === 'committed' || result.status === 'replayed') { claimed = true; break; }
        if (result.status !== 'stale') throw new Error('The server did not confirm this demo station claim. Refresh and retry.');
        reply = checkedReply(await api.resume(profile, session.id), profile, uid);
        requirePreparation(reply.session);
      }
      if (!claimed) throw new Error('Casting changed while the crew prepared. Retry preparation after the GM finishes its current change.');
    }
    const record = { ...profile, uid, label: actorLabel(roleId) };
    records = [...records.filter(item => item.roleId !== roleId), record];
    saveRoster(session.id, records);
    options.onProgress?.(records);
  }
  return records;
}

/** Renew online virtual personas only; never attest that physical people attended. */
export async function renewDemoActorPresence(session: GameSession, options: ActorOptions = {}): Promise<readonly string[]> {
  const status = demoSessionStatus(session);
  if (!status || status === 'complete' || ['debrief', 'closed'].includes(session.phase)) return [];
  const api = options.gateway ?? gateway;
  const failed: string[] = [];
  for (const profile of readDemoActorRoster(session.id)) {
    if (options.shouldContinue?.() === false) break;
    try {
      await api.identity(profile, profile.uid);
      if (options.shouldContinue?.() === false) break;
      const foreground = options.foregroundPresence;
      if (foreground?.profile.sessionId === profile.sessionId && foreground.profile.roleId === profile.roleId) {
        if (foreground.uid !== profile.uid) throw new Error('The selected demo actor identity changed.');
        // The document's normal presence owner also owns its reconnect and
        // identity hydration. Passive roster renewal must not resume it again.
        await foreground.refresh();
        if (options.shouldContinue?.() === false) break;
        continue;
      }
      try { await api.presence(profile); }
      catch {
        if (options.shouldContinue?.() === false) break;
        // Resume is the ordinary recovery path and still rejects kicked actors.
        checkedReply(await api.resume(profile, session.id), profile, profile.uid);
        if (options.shouldContinue?.() === false) break;
        await api.presence(profile);
      }
      if (options.shouldContinue?.() === false) break;
    } catch { failed.push(profile.label); }
  }
  return failed;
}

export async function assertSelectedDemoActorIdentity(profile: DemoActorProfile): Promise<void> {
  if (profile.roleId === 'controller') {
    await gateway.identity(profile);
    return;
  }
  const record = readDemoActorRoster(profile.sessionId).find(actor => actor.roleId === profile.roleId);
  if (!record) throw new Error('Prepare this actor through the demo crew controller in this browser first.');
  await gateway.identity(profile, record.uid);
}

/** SDK credentials stay in their browser; no token is copied into this link. */
export async function switchDemoActor(
  actor: DemoActorRecord,
  joinCode: string,
  location: Pick<Location, 'href' | 'assign'> = window.location,
): Promise<void> {
  await assertSelectedDemoActorIdentity(actor);
  const url = demoActorUrl(actor, joinCode, location.href);
  location.assign(url);
}
