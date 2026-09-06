import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { APP_VERSION } from '@/version';
import { startVersionUpgradeMonitor } from './versionUpgrade';

describe('version upgrade monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSessionStore.getState().reset();
    localStorage.clear();
  });

  it('reloads an old client while preserving its session and GM instance for resume', async () => {
    const session = {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby' as const,
      ownerUid: 'u1', createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const player = {
      uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm' as const,
      seatId: null, joinedAt: '2026-01-01T00:00:00.000Z',
    };
    const gmInstance = {
      id: 'bridge', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    };
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setGmInstance(gmInstance);
    useSessionStore.getState().setMode('gm');
    useSessionStore.getState().setLastRoute('/gm');
    const reload = vi.fn();
    const fetchVersion = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '99.99.99' }),
    });

    const stop = startVersionUpgradeMonitor({ fetchVersion, reload });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchVersion).toHaveBeenCalledWith('/build-version.json', {
      cache: 'no-store',
    });
    expect(reload).toHaveBeenCalledOnce();
    expect(useSessionStore.getState()).toMatchObject({
      session,
      me: player,
      gmInstance,
      mode: 'gm',
      lastRoute: '/gm',
    });
    stop();
  });

  it('keeps the current client running for matching, unavailable, or malformed metadata', async () => {
    const reload = vi.fn();
    const replies = [
      { ok: true, json: async () => ({ version: APP_VERSION }) },
      { ok: false, json: async () => ({ version: '99.99.99' }) },
      { ok: true, json: async () => ({ version: 27 }) },
    ];
    const fetchVersion = vi.fn().mockImplementation(async () => replies.shift());

    const stop = startVersionUpgradeMonitor({
      fetchVersion,
      reload,
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchVersion).toHaveBeenCalledTimes(3);
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('stops polling after an upgrade is found or the monitor is disposed', async () => {
    const reload = vi.fn();
    const fetchVersion = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '99.99.99' }),
    });
    const stop = startVersionUpgradeMonitor({
      fetchVersion,
      reload,
      intervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchVersion).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();

    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchVersion).toHaveBeenCalledOnce();
  });
});
