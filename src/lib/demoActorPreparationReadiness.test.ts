import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession, Player } from '@/types/game';
import { prepareDemoActors, waitForDemoPreparationReady, type DemoActorGateway } from './demoActorProfiles';

const session = {
  id: 'fresh-demo', joinCode: '482100', currentTurn: 0, phase: 'casting', setupRevision: 2,
  activeRoleIds: ['admiral'], pressEnabled: false,
  fullGameDemo: { status: 'preparing', progression: 'manual' },
} as unknown as GameSession;
const controller = { uid: 'real-controller', sessionId: session.id, role: 'player' } as Player;
const profile = { sessionId: session.id, roleId: 'controller' };

function snapshot() {
  return { session, me: controller, authenticatedUid: controller.uid, mounted: true,
    connection: 'live' as 'live' | 'connecting' | 'offline', freshness: 'server' as 'server' | 'cache' };
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('bound real demo preparation readiness', () => {
  it('waits through a transient connection/projection refresh until the same actor is server-live', async () => {
    let current = { ...snapshot(), connection: 'connecting' as const, freshness: 'cache' as const } as ReturnType<typeof snapshot>;
    let resolved = false;
    const ready = waitForDemoPreparationReady({ profile, expectedUid: controller.uid, read: () => current }).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(300);
    expect(resolved).toBe(false);
    current = snapshot();
    await vi.advanceTimersByTimeAsync(100);
    await ready;
    expect(resolved).toBe(true);
  });

  it('never waits past changed SDK/member/session identity or a departed controller', async () => {
    for (const change of [{ authenticatedUid: 'different-sdk' }, { authenticatedUid: null },
      { me: { ...controller, uid: 'different-member' } }, { me: null },
      { me: { ...controller, role: 'gm' as const } }, { session: null },
      { session: { ...session, id: 'other-game' } }, { mounted: false }]) {
      await expect(waitForDemoPreparationReady({ profile, expectedUid: controller.uid,
        read: () => ({ ...snapshot(), connection: 'offline', freshness: 'cache', ...change }) })).rejects.toThrow(/identity|stopped/i);
    }
    await expect(waitForDemoPreparationReady({ profile: { ...profile, roleId: 'admiral' },
      expectedUid: controller.uid, read: snapshot })).rejects.toThrow(/controller/i);
  });

  it('stops immediately on active/complete/malformed markers and terminal or non-casting games', async () => {
    for (const change of [{ currentTurn: 1 }, { phase: 'closed' }, { phase: 'debrief' },
      { fullGameDemo: { status: 'active', progression: 'manual' } },
      { fullGameDemo: { status: 'complete', progression: 'manual' } },
      { fullGameDemo: { status: ['preparing'], progression: 'manual' } },
      { fullGameDemo: { status: 'preparing', progression: 'manual', privateText: 'never use' } }]) {
      await expect(waitForDemoPreparationReady({ profile, expectedUid: controller.uid,
        read: () => ({ ...snapshot(), session: { ...session, ...change } as GameSession }) })).rejects.toThrow(/prepar|cycle/i);
    }
  });

  it('bounds a cache-only wait and never promotes its own authority', async () => {
    const current = { ...snapshot(), freshness: 'cache' as const };
    const ready = waitForDemoPreparationReady({ profile, expectedUid: controller.uid, read: () => current });
    const rejected = expect(ready).rejects.toThrow(/Reconnect and retry/);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(current.freshness).toBe('cache');
  });

  it('waits before the normal seat transaction after admission temporarily refreshes the controller projection', async () => {
    let current = snapshot();
    const api: DemoActorGateway = {
      identity: vi.fn(async () => 'actual-admiral'),
      join: vi.fn(async () => {
        current = { ...snapshot(), connection: 'connecting', freshness: 'cache' };
        return { session, player: { uid: 'actual-admiral', sessionId: session.id, role: 'player', seatId: null } as Player };
      }),
      claim: vi.fn(async () => ({ status: 'committed' })),
      resume: vi.fn(), presence: vi.fn(),
    };
    const result = prepareDemoActors(session, { gateway: api,
      waitForReady: () => waitForDemoPreparationReady({ profile, expectedUid: controller.uid, read: () => current }) });
    await vi.advanceTimersByTimeAsync(300);
    expect(api.join).toHaveBeenCalledTimes(1);
    expect(api.claim).not.toHaveBeenCalled();
    current = snapshot();
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toHaveLength(1);
    expect(api.claim).toHaveBeenCalledWith({ sessionId: session.id, roleId: 'admiral' }, expect.objectContaining({
      sessionId: session.id, seatId: 'admiral', expectedSetupRevision: 2,
    }));
  });
});
