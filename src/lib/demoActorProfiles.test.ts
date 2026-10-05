import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession, Player } from '@/types/game';
import {
  prepareDemoActors,
  readDemoActorRoster,
  renewDemoActorPresence,
  type DemoActorGateway,
} from './demoActorProfiles';
import type { DemoActorProfile } from './demoActorContext';
import { demoActorRosterStorageKey, readDemoActorAccountUid } from './demoActorContext';

const session = {
  id: 'demo-session', name: 'Solo rehearsal', joinCode: '482100', ownerUid: 'gm',
  phase: 'casting', currentTurn: 0, playerCount: 8, setupRevision: 2,
  activeRoleIds: ['admiral', 'wing-commander'], pressEnabled: true,
  fullGameDemo: { status: 'preparing', progression: 'manual' },
} as unknown as GameSession;

function gateway() {
  const seen = new Map<string, string>();
  let revision = 2;
  const identity = vi.fn(async (profile: DemoActorProfile, expectedUid?: string) => {
    const uid = seen.get(profile.roleId) ?? `auth-${profile.roleId}`;
    seen.set(profile.roleId, uid);
    if (expectedUid && expectedUid !== uid) throw new Error('Actor identity changed.');
    return uid;
  });
  const join = vi.fn(async (profile: DemoActorProfile) => ({
    session: { ...session, setupRevision: revision },
    player: { uid: seen.get(profile.roleId), sessionId: session.id, role: 'player', seatId: null } as Player,
  }));
  const claim = vi.fn(async (_profile: DemoActorProfile, command: { expectedSetupRevision: number; requestId: string }) => ({
    status: 'committed', setupRevision: ++revision,
    expectedSetupRevision: command.expectedSetupRevision,
  }));
  const resume = vi.fn(join);
  const presence = vi.fn<DemoActorGateway['presence']>(async () => undefined);
  return { identity, join, claim, resume, presence } satisfies DemoActorGateway;
}

beforeEach(() => { localStorage.clear(); });

describe('ordinary authenticated demo cohort preparation', () => {
  it('creates distinct identities and uses their own normal join, seat and Press paths', async () => {
    const api = gateway();
    const actors = await prepareDemoActors(session, { gateway: api });
    expect(actors.map(actor => actor.uid)).toEqual(['auth-admiral', 'auth-wing-commander', 'auth-press-officer']);
    expect(api.join).toHaveBeenCalledTimes(3);
    expect(api.claim.mock.calls.map(([profile]) => profile.roleId)).toEqual(['admiral', 'wing-commander']);
    expect(api.presence).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'press-officer' }), 'press-officer');
    expect(readDemoActorRoster(session.id)).toEqual(actors);
    expect(JSON.stringify(actors)).not.toMatch(/password|token|credential|loyalty|secret/i);
  });

  it('fails closed before account creation for an ordinary or already active session', async () => {
    const api = gateway();
    const ordinary = { ...session } as GameSession & { fullGameDemo?: unknown };
    delete ordinary.fullGameDemo;
    await expect(prepareDemoActors(ordinary, { gateway: api })).rejects.toThrow(/prepar/i);
    await expect(prepareDemoActors({ ...session, currentTurn: 1 }, { gateway: api })).rejects.toThrow(/cycle 0/i);
    expect(api.identity).not.toHaveBeenCalled();
  });

  it('does not register an identity from a mismatched join reply', async () => {
    const api = gateway();
    api.join.mockResolvedValue({ session: { ...session, setupRevision: 2 }, player: { uid: 'different-auth', sessionId: session.id } as Player });
    await expect(prepareDemoActors(session, { gateway: api })).rejects.toThrow(/identity/i);
    expect(api.claim).not.toHaveBeenCalled();
    expect(readDemoActorRoster(session.id)).toEqual([]);
  });

  it('retries a stale seat with fresh server authority and a new bound request id', async () => {
    const api = gateway();
    api.claim.mockResolvedValueOnce({ status: 'stale', setupRevision: 9, expectedSetupRevision: 2 });
    await prepareDemoActors(session, { gateway: api });
    expect(api.resume).toHaveBeenCalled();
    expect(api.claim.mock.calls[0]?.[1].requestId).not.toBe(api.claim.mock.calls[1]?.[1].requestId);
  });

  it('restores existing SDK identities rather than fabricating a replacement UID on retry', async () => {
    const api = gateway();
    await prepareDemoActors(session, { gateway: api });
    await prepareDemoActors(session, { gateway: api });
    expect(api.identity).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'admiral' }), 'auth-admiral');
  });

  it('renews only disclosed real actor leases, without repeating claims or gameplay choices', async () => {
    const api = gateway();
    await prepareDemoActors(session, { gateway: api });
    api.presence.mockClear(); api.join.mockClear(); api.claim.mockClear();
    await renewDemoActorPresence(session, { gateway: api });
    expect(api.presence).toHaveBeenCalledTimes(3);
    expect(api.join).not.toHaveBeenCalled();
    expect(api.claim).not.toHaveBeenCalled();
  });

  it('never renews a cohort in an ordinary session', async () => {
    const api = gateway();
    await prepareDemoActors(session, { gateway: api });
    api.presence.mockClear();
    const ordinary = { ...session } as GameSession & { fullGameDemo?: unknown };
    delete ordinary.fullGameDemo;
    await renewDemoActorPresence(ordinary, { gateway: api });
    expect(api.presence).not.toHaveBeenCalled();
  });

  it('does not replace a lost established identity or proceed into its seat', async () => {
    const api = gateway();
    await prepareDemoActors(session, { gateway: api });
    api.claim.mockClear(); api.join.mockClear();
    api.identity.mockRejectedValueOnce(new Error('Actor account is unavailable.'));
    await expect(prepareDemoActors(session, { gateway: api })).rejects.toThrow(/unavailable/i);
    expect(api.join).not.toHaveBeenCalled();
    expect(api.claim).not.toHaveBeenCalled();
    expect(readDemoActorRoster(session.id)[0]?.uid).toBe('auth-admiral');
  });

  it('cannot silently reactivate a kicked actor through background presence recovery', async () => {
    const api = gateway();
    const roster = await prepareDemoActors(session, { gateway: api });
    api.join.mockClear(); api.claim.mockClear();
    api.presence.mockRejectedValue(new Error('permission-denied'));
    api.resume.mockRejectedValue(new Error('kicked'));
    const failed = await renewDemoActorPresence(session, { gateway: api });
    expect(failed).toEqual(roster.map(actor => actor.label));
    expect(api.join).not.toHaveBeenCalled();
    expect(api.claim).not.toHaveBeenCalled();
  });

  it('retains the anchor identity after a replacement and never restores its original station on recovery', async () => {
    const api = gateway();
    const originalRoster = await prepareDemoActors(session, { gateway: api });
    api.presence.mockClear(); api.join.mockClear(); api.claim.mockClear();
    api.presence.mockRejectedValueOnce(new Error('Reconnect needed.'));
    api.resume.mockResolvedValueOnce({ session: { ...session, setupRevision: 2 }, player: { uid: 'auth-admiral', sessionId: session.id,
      role: 'player', assignedRoleId: 'admiral', replacementRoleId: 'doctor',
      activeConsoleRoleId: null, seatId: null } as Player });
    await expect(renewDemoActorPresence(session, { gateway: api })).resolves.toEqual([]);
    expect(api.presence.mock.calls.every(call => call.length === 1)).toBe(true);
    expect(readDemoActorRoster(session.id)).toEqual(originalRoster);
    expect(api.join).not.toHaveBeenCalled();
    expect(api.claim).not.toHaveBeenCalled();
  });

  it('drops private or credential fields and rejects ambiguous local roster identities', async () => {
    const api = gateway();
    const roster = await prepareDemoActors(session, { gateway: api });
    localStorage.setItem(demoActorRosterStorageKey(session.id), JSON.stringify(roster.map(actor => ({
      ...actor, privateLoyalty: 'never restore', token: 'never restore', label: 'untrusted name',
    }))));
    expect(readDemoActorRoster(session.id)).toEqual(roster);
    localStorage.setItem(demoActorRosterStorageKey(session.id), JSON.stringify([roster[0], roster[0]]));
    expect(readDemoActorRoster(session.id)).toEqual([]);
  });

  it('retains a real identity before a lost admission acknowledgement and cannot replace it on retry', async () => {
    const api = gateway();
    api.join.mockRejectedValueOnce(new Error('Lost join reply.'));
    await expect(prepareDemoActors(session, { gateway: api })).rejects.toThrow('Lost join reply.');
    expect(readDemoActorAccountUid('admiral')).toBe('auth-admiral');
    expect(readDemoActorRoster(session.id)).toEqual([]);
    api.identity.mockImplementationOnce(async (_profile, expectedUid) => {
      expect(expectedUid).toBe('auth-admiral');
      throw new Error('SDK account unavailable.');
    });
    await expect(prepareDemoActors(session, { gateway: api })).rejects.toThrow(/unavailable/i);
    expect(api.join).toHaveBeenCalledTimes(1);
    expect(api.claim).not.toHaveBeenCalled();
  });

  it('retains the established identity when a seat commits but its acknowledgement is lost', async () => {
    const api = gateway();
    api.claim.mockRejectedValueOnce(new Error('Lost seat acknowledgement.'));
    await expect(prepareDemoActors(session, { gateway: api })).rejects.toThrow('Lost seat acknowledgement.');
    expect(readDemoActorAccountUid('admiral')).toBe('auth-admiral');
    expect(readDemoActorRoster(session.id)).toEqual([]);
    api.identity.mockImplementationOnce(async (_profile, expectedUid) => {
      expect(expectedUid).toBe('auth-admiral');
      throw new Error('SDK account unavailable.');
    });
    await expect(prepareDemoActors(session, { gateway: api })).rejects.toThrow(/unavailable/i);
    expect(api.join).toHaveBeenCalledTimes(1);
    expect(api.claim).toHaveBeenCalledTimes(1);
  });

  it('reuses the authenticated role pool for a fresh session without carrying old session state', async () => {
    const api = gateway();
    await prepareDemoActors(session, { gateway: api });
    const next = { ...session, id: 'fresh-session' };
    api.join.mockImplementation(async profile => ({ session: { ...next, setupRevision: 2 },
      player: { uid: `auth-${profile.roleId}`, sessionId: next.id, role: 'player', seatId: null } as Player }));
    await prepareDemoActors(next, { gateway: api });
    expect(api.identity).toHaveBeenCalledWith({ sessionId: next.id, roleId: 'admiral' }, 'auth-admiral');
    expect(readDemoActorRoster(next.id)).toHaveLength(3);
    expect(readDemoActorRoster(session.id)).toHaveLength(3);
  });

  it('stops operational presence on complete, debrief and closed sessions', async () => {
    const api = gateway();
    await prepareDemoActors(session, { gateway: api });
    api.identity.mockClear(); api.presence.mockClear();
    for (const ended of [{ ...session, fullGameDemo: { status: 'complete', progression: 'manual' } },
      { ...session, phase: 'debrief' }, { ...session, phase: 'closed' }]) {
      await renewDemoActorPresence(ended as GameSession, { gateway: api });
    }
    expect(api.identity).not.toHaveBeenCalled();
    expect(api.presence).not.toHaveBeenCalled();
  });
});
