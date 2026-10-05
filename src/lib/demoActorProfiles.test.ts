import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession, Player } from '@/types/game';
import {
  prepareDemoActors,
  readDemoActorRoster,
  renewDemoActorPresence,
  type DemoActorGateway,
} from './demoActorProfiles';
import type { DemoActorProfile } from './demoActorContext';

const session = {
  id: 'demo-session', name: 'Solo rehearsal', joinCode: '482100', ownerUid: 'gm',
  phase: 'casting', currentTurn: 0, playerCount: 8, setupRevision: 2,
  activeRoleIds: ['admiral', 'wing-commander'], pressEnabled: true,
  fullGameDemo: { status: 'preparing', progression: 'manual' },
} as GameSession;

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
  const claim = vi.fn(async (_profile: DemoActorProfile, command: { expectedSetupRevision: number }) => ({
    status: 'committed', setupRevision: ++revision,
    expectedSetupRevision: command.expectedSetupRevision,
  }));
  const resume = vi.fn(join);
  const presence = vi.fn(async () => undefined);
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
    api.join.mockResolvedValue({ session, player: { uid: 'different-auth', sessionId: session.id } as Player });
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
});
