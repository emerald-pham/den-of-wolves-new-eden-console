import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TurnPhaseCoordinator from './TurnPhaseCoordinator';
import { useSessionStore } from '@/store/useSessionStore';
import { acceptServerSessionAuthority, sessionSnapshotAuthorityFor, sessionSnapshotAuthorityVersion } from '@/lib/sessionSnapshotAuthority';
import type { GameSession } from '@/types/game';

// Actual component, service, mutation checkpoint, parser and Store. Auth,
// callable transport, attack feed and time are inert ports, never native proof.
const ports = vi.hoisted(() => ({ rpc: vi.fn(), factory: vi.fn(), auth: { currentUser: { uid: 'review-actor' } } }));
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: ports.factory }));
vi.mock('@/lib/firebase', () => ({ auth: () => ports.auth, functions: () => ({ kind: 'inert-functions' }) }));
vi.mock('@/lib/firestore', () => ({
  subscribeWolfAttackMemberView: vi.fn((_id, receive) => { receive(null); return vi.fn(); }),
  closedMemberSessionFrom: vi.fn(), parseArrestPosseCalculation: vi.fn(), parseSessionDebriefProjection: vi.fn(),
}));
let caseNumber = 0;
const epoch = '2026-10-14T12:00:00.000Z';
const state = () => useSessionStore.getState();
function acceptedServerPublication(session: GameSession) {
  // Same real acceptance call used by the current-member reader. This explicit
  // mock producer supplies a server fixture; it is not an observed SDK callback.
  expect(acceptServerSessionAuthority(sessionSnapshotAuthorityFor(session.id, 'review-actor'), session, undefined, false, true)).toBe(true);
  state().setSession(session); state().setConnection('live'); state().setSessionSnapshotFreshness('server');
}
function liftedReply() {
  return { data: { turnPhase: { ...state().session!.turnPhase!, airspace: { state: 'lifted', tickerActive: false, pressAccess: true } } } };
}
function heldReply() {
  let resolve!: (value: ReturnType<typeof liftedReply>) => void;
  const promise = new Promise<ReturnType<typeof liftedReply>>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function tick(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function deliver(run: () => void) { await act(async () => { run(); await Promise.resolve(); }); }
async function mount() { render(<TurnPhaseCoordinator />); await act(async () => { await Promise.resolve(); }); }
function trace(label: string) {
  console.log(JSON.stringify({ reviewCase: label, rpcCalls: ports.rpc.mock.calls.length, factoryCalls: ports.factory.mock.calls.length,
    connection: state().connection, freshness: state().sessionSnapshotFreshness, phase: state().session?.turnPhase?.airspace.state,
    cycle: state().session?.currentTurn, teamDeadline: state().session?.turnPhase?.teamPhaseEndsAt,
    authorityVersion: sessionSnapshotAuthorityVersion(sessionSnapshotAuthorityFor(state().session!.id, 'review-actor')) }));
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(epoch));
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  ports.rpc.mockReset(); ports.factory.mockReset().mockImplementation((_instance, name) => { expect(name).toBe('beginOpenAirspacePhase'); return ports.rpc; });
  ports.rpc.mockImplementation(async () => liftedReply());
  state().reset();
  const session = { id: 'review-session-' + (++caseNumber), name: 'Source fixture', joinCode: '0000', phase: 'active', ownerUid: 'review-actor',
    createdAt: epoch, updatedAt: epoch, currentTurn: 2, turnLimit: 7,
    turnPhase: { turn: 2, teamPhaseEndsAt: '2026-10-14T12:00:01.000Z', openAirspaceEndsAt: '2026-10-14T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } } } as GameSession;
  state().setIdentity(session, { uid: 'review-actor', sessionId: session.id, displayName: 'Fixture member', role: 'player', seatId: null, joinedAt: epoch });
  acceptedServerPublication(session);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('rearms after actual service no-op on cache authority then same-clock server restoration', async () => {
  // Consumer-supported live/cache precondition; its exact native producer is not claimed.
  state().setSessionSnapshotFreshness('cache');
  await mount(); await tick(1000);
  expect(ports.factory).not.toHaveBeenCalled(); expect(ports.rpc).not.toHaveBeenCalled();
  trace('cache service fulfillment without RPC');
  await deliver(() => acceptedServerPublication({ ...state().session!, turnPhase: { ...state().session!.turnPhase! } }));
  await tick(5000); trace('same-clock server restored');
  expect(ports.rpc).toHaveBeenCalledTimes(1);
  expect(state().session!.turnPhase!.airspace.state).toBe('lifted');
});

it('retries the restricted current clock after same-key settlement drops an obsolete real checkpoint', async () => {
  const held = heldReply(); ports.rpc.mockReturnValueOnce(held.promise);
  await mount(); await tick(1000); expect(ports.rpc).toHaveBeenCalledTimes(1);
  const obsoleteLifted = liftedReply();
  await deliver(() => acceptedServerPublication({ ...state().session!, turnPhase: { ...state().session!.turnPhase!, teamPhaseEndsAt: '2026-10-14T12:00:03.000Z' } }));
  await tick(2000); expect(ports.rpc).toHaveBeenCalledTimes(1);
  await deliver(() => held.resolve(obsoleteLifted));
  expect(state().session!.turnPhase!.airspace.state).toBe('restricted');
  expect(state().session!.turnPhase!.teamPhaseEndsAt).toBe('2026-10-14T12:00:03.000Z');
  trace('old reply correctly discarded by actual service');
  await tick(5000); trace('new eligible clock after settlement');
  expect(ports.rpc).toHaveBeenCalledTimes(2);
  expect(state().session!.turnPhase!.airspace.state).toBe('lifted');
});

it('stops after a current matching reply actually publishes lifted airspace through real service', async () => {
  await mount(); await tick(1000); expect(ports.rpc).toHaveBeenCalledTimes(1);
  expect(state().session!.turnPhase!.airspace.state).toBe('lifted');
  await deliver(() => acceptedServerPublication({ ...state().session! }));
  await tick(10000); trace('current lifted publication cancels scheduling');
  expect(ports.rpc).toHaveBeenCalledTimes(1);
});
