import { Component, type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, GmInstance, Player, WolfAttackMemberView } from '@/types/game';
import { SESSION_WAIVER_STORAGE_KEY } from '@/lib/sessionWaiver';
import { MOTION_SAFETY_STORAGE_KEY } from '@/lib/motionSafety';

vi.mock('@/lib/sessionService', () => ({
  getWolfAmnestyView: vi.fn(async () => ({ type: 'wolf-amnesty-view',
    sessionId: useSessionStore.getState().session?.id ?? 's1', offer: null })),
  getWolfBoardingDefenceChoice: vi.fn(async () => null),
  getWolfBoardingSpecialChoice: vi.fn(async () => ({
    type: 'wolf-boarding-special-choice-unavailable', sessionId: 's1', reason: 'no-special-choice',
  })),
  getWolfRangeActionChoice: vi.fn(async () => null),
  getWolfForceFieldChoice: vi.fn(async () => null),
  commitWolfBoardingDefenceChoice: vi.fn(),
  commitWolfBoardingSpecialChoice: vi.fn(async () => ({
    status: 'committed', type: 'wolf-boarding-special-choice', sessionId: 's1', requestId: 'fixture-choice',
    turn: 1, revision: 1, currentStep: 'boarding', choiceKind: 'commander',
  })),
  commitWolfRangeActionChoice: vi.fn(),
  commitWolfForceFieldChoice: vi.fn(),
  getAegisEnrichedWarheadChoice: vi.fn(async () => ({
    type: 'aegis-enriched-warhead-view', sessionId: 's1', attackId: 'fixture-attack',
    turn: 1, revision: 0, choiceStatus: 'unavailable', eligible: false, oreCost: 5,
  })),
  commitAegisEnrichedWarheadChoice: vi.fn(async () => ({
    type: 'aegis-enriched-warhead-result', status: 'committed', sessionId: 's1',
    requestId: 'fixture-choice', turn: 1, revision: 1,
    view: { type: 'aegis-enriched-warhead-view', sessionId: 's1', attackId: 'fixture-attack',
      turn: 1, revision: 1, choiceStatus: 'passed', eligible: false, oreCost: 5 },
  })),
  CONNECT_RETRY_INTERVAL_MS: 2_000,
  connectAutomatically: vi.fn().mockResolvedValue(undefined),
  beginOpenAirspacePhase: vi.fn().mockResolvedValue(undefined),
  acknowledgeWolfHackingAlert: vi.fn(),
  createSession: vi.fn(),
  disconnectFromSession: vi.fn(),
  joinSession: vi.fn(),
  kickGmInstance: vi.fn(),
  loginGmAccess: vi.fn(),
  listGmInstances: vi.fn().mockResolvedValue([]),
  logoutGmAccess: vi.fn(),
  popShipConfetti: vi.fn(),
  reconcileGmAuthority: vi.fn().mockResolvedValue(undefined),
  refreshPresence: vi.fn().mockResolvedValue(undefined),
  refreshCommissarPurgeAuthority: vi.fn().mockResolvedValue(null),
  requireStationReselectionForCurrentSession: vi.fn(),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  releaseGmInstance: vi.fn(),
  selectConsoleRole: vi.fn().mockResolvedValue(undefined),
  setGmControlsLocked: vi.fn(),
  triggerDradisContact: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeCrisisReport: vi.fn(() => vi.fn()),
  sessionSnapshotAuthorityFor: vi.fn(() => ({ hasServerSessionAuthority: false })),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeSessionState: vi.fn(() => vi.fn()),
  subscribeWolfAttackMemberView: vi.fn((_sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    onView(null);
    return vi.fn();
  }),
  subscribeLoyaltyCensus: vi.fn(() => vi.fn()),
  subscribeGmWolfHackingAlerts: vi.fn(() => vi.fn()),
  subscribePlayerHackingNotices: vi.fn(() => vi.fn()),
  subscribeGmInstances: vi.fn((
    _sessionId: string,
    onInstances: (instances: readonly GmInstance[]) => void,
  ) => {
    onInstances([]);
    return vi.fn();
  }),
  subscribeShipConfetti: vi.fn(() => vi.fn()),
  subscribeSessionEvents: vi.fn((_sessionId: string, onEvents: (events: never[]) => void) => {
    onEvents([]);
    return vi.fn();
  }),
  subscribeDamageDraws: vi.fn((_sessionId: string, onDraws: (draws: never[]) => void) => {
    onDraws([]);
    return vi.fn();
  }),
  subscribeVipCards: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/versionUpgrade', () => ({
  startVersionUpgradeMonitor: vi.fn(() => vi.fn()),
}));


// Each real App lazy import stays pending until its test rejects that module.
const chunks = vi.hoisted(() => {
  const gate = () => {
    let reject: (reason: Error) => void = () => { throw new Error('Module was not requested'); };
    const promise = new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise; });
    return { promise, reject, requested: false };
  };
  return { ship: gate(), president: gate(), election: gate(), crisis: gate() };
});
vi.mock('@/routes/ShipConsole', async () => {
  chunks.ship.requested = true;
  return chunks.ship.promise;
});
vi.mock('@/routes/PresidentOffice', async () => {
  chunks.president.requested = true;
  return chunks.president.promise;
});
vi.mock('@/routes/ElectionWorkspace', async () => {
  chunks.election.requested = true;
  return chunks.election.promise;
});
vi.mock('@/components/CrisisReportPanel', async () => {
  chunks.crisis.requested = true;
  return chunks.crisis.promise;
});
vi.mock('@/routes/SessionMode', () => ({ default: () => <main><h1>Stations remain available</h1></main> }));

const escaped: Error[] = [];
class ObserveEscapedFailure extends Component<Readonly<{ children: ReactNode }>, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error) { escaped.push(error); }
  override render() { return this.state.failed ? <p>Module failure escaped App</p> : this.props.children; }
}

const stamp = '2026-01-01T00:00:00.000Z';
const session: GameSession = { id: 'deferred-test', name: 'Deferred loading test', phase: 'active',
  ownerUid: 'deferred-player', createdAt: stamp, updatedAt: stamp, currentTurn: 3,
  activeRoleIds: ['admiral'], activeVesselIds: ['aegis'] };
const player: Player = { uid: 'deferred-player', sessionId: session.id, displayName: 'Admiral',
  role: 'player', seatId: 'admiral', assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', joinedAt: stamp };

beforeEach(() => {
  escaped.length = 0;
  window.location.hash = '#/console';
  useSessionStore.getState().reset();
  localStorage.clear();
  localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(Date.now()));
  useSessionStore.getState().setIdentity(session, player);
  useSessionStore.getState().setMode('console');
});

function assertIdentityRetained() {
  expect(useSessionStore.getState().session?.id).toBe(session.id);
  expect(useSessionStore.getState().me?.uid).toBe(player.uid);
}

describe('PC09 deferred module failure containment', () => {
  it.each([
    { key: 'ship' as const, path: '/ships/aegis/roles/admiral', opening: 'Opening ship console…' },
    { key: 'president' as const, path: '/president', opening: "Opening President's office…" },
    { key: 'election' as const, path: '/election', opening: 'Opening presidential election…' },
  ])('keeps keyboard Back and identity when the $key module rejects', async ({key, path, opening}) => {
    window.location.hash = `#${path}`;
    render(<ObserveEscapedFailure><App /></ObserveEscapedFailure>);
    expect(screen.getByText(opening)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to stations' })).toHaveAttribute('href', '#/console');
    await waitFor(() => expect(chunks[key].requested).toBe(true));
    await act(async () => chunks[key].reject(new Error(`Prepared ${key} module fetch rejection`)));
    const back = screen.queryByRole('link', { name: 'Back to stations' });
    expect(back).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not open/i);
    expect(escaped).toEqual([]);
    assertIdentityRetained();
    back?.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Stations remain available' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/console');
    assertIdentityRetained();
  });

  it('isolates a rejected crisis report without removing the routed console or identity', async () => {
    render(<ObserveEscapedFailure><App /></ObserveEscapedFailure>);
    expect(await screen.findByRole('heading', { name: 'Stations remain available' })).toBeInTheDocument();
    await waitFor(() => expect(chunks.crisis.requested).toBe(true));
    await act(async () => chunks.crisis.reject(new Error('Prepared crisis module fetch rejection')));
    expect(screen.queryByRole('heading', { name: 'Stations remain available' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/crisis report could not open/i);
    expect(escaped).toEqual([]);
    expect(window.location.hash).toBe('#/console');
    assertIdentityRetained();
  });
});
