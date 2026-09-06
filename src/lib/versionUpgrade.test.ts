import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { APP_VERSION } from '@/version';
import { PAGE_STALE_AFTER_MS, startVersionUpgradeMonitor } from './versionUpgrade';

describe('stale page recovery', () => {
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T18:00:00.000Z'));
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    useSessionStore.getState().reset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('only treats a page as stale after it has been unseen for one minute', () => {
    expect(PAGE_STALE_AFTER_MS).toBe(60_000);
  });

  it('reloads a stale page into a newer build without clearing its resumable identity', async () => {
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
    const reconnect = vi.fn();
    const fetchVersion = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '99.99.99' }),
    });
    const stop = startVersionUpgradeMonitor({ fetchVersion, reload, reconnect });

    expect(fetchVersion).not.toHaveBeenCalled();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(PAGE_STALE_AFTER_MS);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchVersion).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(reconnect).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      session, me: player, gmInstance, mode: 'gm', lastRoute: '/gm',
    });
    stop();
  });

  it('reconnects the previous session after a stale return when the build is current', async () => {
    const reconnect = vi.fn();
    const fetchVersion = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: APP_VERSION }),
    });
    const stop = startVersionUpgradeMonitor({ fetchVersion, reconnect, reload: vi.fn() });

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(PAGE_STALE_AFTER_MS - 1);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchVersion).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(PAGE_STALE_AFTER_MS);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchVersion).toHaveBeenCalledOnce();
    expect(reconnect).toHaveBeenCalledOnce();
    stop();
  });

  it('still reconnects when the version marker is temporarily unavailable', async () => {
    const reconnect = vi.fn();
    const stop = startVersionUpgradeMonitor({
      fetchVersion: vi.fn().mockRejectedValue(new Error('offline')),
      reconnect,
      reload: vi.fn(),
    });

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(PAGE_STALE_AFTER_MS);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(reconnect).toHaveBeenCalledOnce();
    stop();
  });
});
