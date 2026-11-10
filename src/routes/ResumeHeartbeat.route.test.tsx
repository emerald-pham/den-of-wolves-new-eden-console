// PC10.3 L1.4 (#242) review repair: a resume that keeps failing must not stop
// presence renewal. The server expires a device after 45 s without a heartbeat
// and releases its seat, so a member whose resume is rate-limited or refused
// by a flaky backend would lose the station they are trying to resume.
// The App timers, reconnect, resume and heartbeat code are real; only the
// callable boundary and the Firestore listeners are scripted, and heartbeats
// are counted where they leave the browser.
// Fixture and evidence class: src/test/stationLossReconnect.ts.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import { prepareReturningScientist, returningScientist, scientistSession, stationLossServer } from '@/test/stationLossReconnect';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('firebase/functions', async () =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.callableBoundary());
vi.mock('@/lib/firebase', async (importOriginal) =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.firebase(await importOriginal()));
vi.mock('@/lib/sessionService', async (importOriginal) =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.sessionService(
    await importOriginal(), { realPresence: true }));
vi.mock('@/lib/firestore', async (importOriginal) =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.firestore(await importOriginal()));
vi.mock('@/lib/versionUpgrade', async () =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.versionUpgrade());
vi.mock('@/lib/endeavourEcmDeviceService', async () =>
  (await import('@/test/stationLossReconnect')).stationLossMocks.endeavourEcmDevice());

const { subscribeSessionState } = await import('@/lib/firestore');

beforeEach(async () => {
  await prepareReturningScientist();
  stationLossServer.handlers.resumeSession = () => {
    throw Object.assign(new Error('backend unreachable'), { code: 'functions/unavailable' });
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const heartbeats = () => stationLossServer.callsTo('refreshPresence')
  .filter(({ data }) => !('activeConsoleRoleId' in data));

// quiet: the listener reports a fresh server snapshot once and then stays
// quiet; busy: it reports one every second.
it.each(['quiet', 'busy'] as const)(
  'keeps renewing presence for a minute of failing resumes behind a %s listener', async (listener) => {
  let handlers: Parameters<typeof subscribeSessionState>[2] | undefined;
  vi.mocked(subscribeSessionState).mockImplementation((_sessionId, _uid, next) => {
    handlers = next;
    return vi.fn();
  });
  const reportFresh = () => act(() => {
    handlers?.onSessionFreshness?.(true);
    handlers?.onPlayer?.(returningScientist);
    handlers?.onPlayerFreshness?.(true);
  });
  vi.useFakeTimers();
  render(<App />);

  for (let second = 1; second <= 60; second += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    if (second === 1) expect(handlers).toBeDefined();
    if (listener === 'busy' || second === 1) reportFresh();
  }

  // A 10 s heartbeat leaves the browser throughout, well inside the 45 s lease.
  expect(heartbeats().length).toBeGreaterThanOrEqual(5);
  // One attempt on mount, then at most one per 6 s outstanding-resume interval.
  expect(stationLossServer.callsTo('resumeSession').length).toBeLessThanOrEqual(11);
}, 30_000);

// PC10.3 replay repair: the accepted resume reply is what ends the retry, not
// the instant the connect attempt returns. The listeners can report a cached
// snapshot for a moment as that reply lands; treating the flicker as an
// outstanding resume kept a resume going every 6 s, and each one reset the
// member's station state under a deliberate reselect.
it('stops retrying once a resume is accepted although the listener flickers as the reply lands', async () => {
  let handlers: Parameters<typeof subscribeSessionState>[2] | undefined;
  vi.mocked(subscribeSessionState).mockImplementation((_sessionId, _uid, next) => {
    handlers = next;
    return vi.fn();
  });
  stationLossServer.reset();
  stationLossServer.resumeReply = { session: scientistSession, player: returningScientist };
  const accept = stationLossServer.handlers.resumeSession!;
  let acceptedAt: number | undefined;
  stationLossServer.handlers.resumeSession = (data) => {
    const listener = handlers;
    if (!listener) throw Object.assign(new Error('backend unreachable'), { code: 'functions/unavailable' });
    listener.onSessionFreshness?.(false);
    // The accepted identity resubscribes the listeners; the current ones report fresh.
    setTimeout(() => {
      handlers?.onSessionFreshness?.(true);
      handlers?.onPlayer?.(returningScientist);
      handlers?.onPlayerFreshness?.(true);
    }, 50);
    acceptedAt ??= stationLossServer.callsTo('resumeSession').length;
    return accept(data);
  };
  vi.useFakeTimers();
  render(<App />);

  for (let second = 1; second <= 30; second += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  }

  expect(acceptedAt).toBeDefined();
  expect(stationLossServer.callsTo('resumeSession')).toHaveLength(acceptedAt!);
  expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server' });
}, 30_000);
