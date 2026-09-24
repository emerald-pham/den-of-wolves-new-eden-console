import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import type { CrisisStateProjection, ZealotryResponse, CivilUnrestResolution } from '@/types/crisis';
import { INITIAL_SHIP_RESOURCES } from '@/data/resources';
import { recommendedRoleIds } from '@/data/rolePresets';
import { FIGHTER_WING_IDS } from '@/data/aegisConsoles';
import { STAR_CHART_SYSTEMS as LEGACY_SYSTEMS, siteForCoordinate } from '@/data/starChart';
import { acceptCallableSessionAuthority } from '@/lib/sessionSnapshotAuthority';
import {
  SESSION_WAIVER_RESET_EVENT,
  SESSION_WAIVER_STORAGE_KEY,
} from '@/lib/sessionWaiver';
import GmConsole from './GmConsole';

const ORGANISER_SYSTEMS = Object.fromEntries(LEGACY_SYSTEMS.map((system, index) => [
  `system-${String(index + 1).padStart(2, '0')}`, system.coordinate,
]));
const organiserSitesFor = (chart: 'A' | 'B' | 'C') => Object.fromEntries(LEGACY_SYSTEMS.flatMap((system) => {
  const site = siteForCoordinate(system.coordinate, chart);
  return site ? [[system.coordinate, site]] : [];
}));

vi.mock('@/lib/sessionService', () => ({
  kickGmInstance: vi.fn(),
  kickPlayer: vi.fn(),
  assignRole: vi.fn(),
  releaseRole: vi.fn(),
  setReplacementEligibility: vi.fn(),
  assignReplacementRole: vi.fn(),
  setCapybaraEnabled: vi.fn(),
  setDioneEnabled: vi.fn(),
  setPressEnabled: vi.fn(),
  setDebriefMode: vi.fn(),
  replayTurnStartAnnouncement: vi.fn(),
  setGmControlsLocked: vi.fn(),
  advanceTurn: vi.fn(),
  startGame: vi.fn(),
  setFighterWingCount: vi.fn(),
  extendAirspaceWindow: vi.fn(),
  setWolfAttackWindow: vi.fn(),
  stageWolfAttackPreparation: vi.fn(),
  declareWolfAttack: vi.fn(),
  startWolfConsoleVisit: vi.fn(),
  resolveWolfConsoleSabotage: vi.fn(),
  setEmergencyTimerPaused: vi.fn(),
  confirmSetup: vi.fn(),
  setFacilitatorResponsibility: vi.fn(),
  setFacilitatorCensusNote: vi.fn(),
  calculateArrestPosse: vi.fn(),
  deliverWolfCultIntelligence: vi.fn(),
  authorUniversalArbourVision: vi.fn(),
  authorFacilitatorRuleCall: vi.fn(),
  setCandidatePlanCheckpoint: vi.fn(),
  transitionCrisis: vi.fn(),
  setDiseaseQuarantine: vi.fn(),
  admitVoyage33: vi.fn(),
  recordZealotryResponse: vi.fn(),
  recordCivilUnrestResolution: vi.fn(),
  applyShipCounterSteps: vi.fn(),
  scavengeDestroyedShipStores: vi.fn(),
  triggerDradisContact: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeConnectedPlayers: vi.fn(),
  subscribeSessionPlayers: vi.fn(),
  subscribeGmInstances: vi.fn(),
  subscribeGmWolfAttackWindow: vi.fn(),
  subscribeGmWolfAttackPreparation: vi.fn(),
  subscribeGmWolfAttackState: vi.fn(),
  subscribeGmWolfAssignment: vi.fn(),
  subscribeGmWolfActionReceipt: vi.fn(),
  subscribeGmWolfSuspicionHistory: vi.fn(),
  subscribeGmWolfClueDisclosure: vi.fn(),
  subscribeGmWolfCultIntelligence: vi.fn(),
  subscribeGmArbourVision: vi.fn(),
  subscribeGmFacilitatorRuleCall: vi.fn(),
  subscribeGmCrisisState: vi.fn(),
  subscribeGmZealotryResponse: vi.fn(),
  subscribeGmCivilUnrestResolution: vi.fn(),
  subscribeGmArrestPosseCalculation: vi.fn(),
  subscribeSessionEvents: vi.fn(),
  subscribeDamageDraws: vi.fn(),
}));

vi.mock('@/lib/smallShipService', () => ({
  runSmallShipMaintenance: vi.fn(),
  setSmallShipDocking: vi.fn(),
}));

const { kickGmInstance, kickPlayer, assignRole, releaseRole, setReplacementEligibility, assignReplacementRole, setCapybaraEnabled, setDioneEnabled, setPressEnabled, setDebriefMode, setGmControlsLocked,
  replayTurnStartAnnouncement, advanceTurn, startGame, extendAirspaceWindow, setWolfAttackWindow, stageWolfAttackPreparation, declareWolfAttack, startWolfConsoleVisit, resolveWolfConsoleSabotage, setEmergencyTimerPaused, calculateArrestPosse,
  confirmSetup, setFacilitatorResponsibility, setFacilitatorCensusNote, deliverWolfCultIntelligence, authorUniversalArbourVision, authorFacilitatorRuleCall, setCandidatePlanCheckpoint, transitionCrisis, setDiseaseQuarantine, admitVoyage33, recordZealotryResponse, recordCivilUnrestResolution, applyShipCounterSteps, scavengeDestroyedShipStores, triggerDradisContact,
  setFighterWingCount } =
  await import('@/lib/sessionService');
const { subscribeConnectedPlayers, subscribeSessionPlayers, subscribeGmInstances, subscribeGmWolfAttackWindow, subscribeGmWolfAttackPreparation, subscribeGmWolfAttackState, subscribeGmWolfAssignment, subscribeGmWolfActionReceipt, subscribeGmWolfSuspicionHistory, subscribeGmWolfClueDisclosure, subscribeGmWolfCultIntelligence, subscribeGmArbourVision, subscribeGmFacilitatorRuleCall, subscribeGmCrisisState, subscribeGmZealotryResponse, subscribeGmCivilUnrestResolution, subscribeGmArrestPosseCalculation, subscribeSessionEvents, subscribeDamageDraws } =
  await import('@/lib/firestore');
const { runSmallShipMaintenance } = await import('@/lib/smallShipService');

const local = {
  id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
  deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
  responsibilities: [] as readonly ('main' | 'assistant')[],
};
const other = {
  id: 'other-1', sessionId: 's1', uid: 'u2', name: 'Tablet',
  deviceLabel: 'iPad / Safari', claimedAt: '2026-01-01T00:01:00.000Z',
  responsibilities: [] as readonly ('main' | 'assistant')[],
};
const liveCrisis: CrisisStateProjection = {
  sessionId: 's1', crisisId: 'crisis-1', state: 'draft', revision: 1,
  title: 'Relay pressure', details: 'Facilitator-only deliberation.',
};

function renderConsole() {
  return render(
    <MemoryRouter initialEntries={['/gm']}>
      <Routes>
        <Route
          path="/console"
          element={<><p>Role selection route</p><Link to="/gm">Return to GM console</Link></>}
        />
        <Route path="/gm" element={<GmConsole />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    onEvents([]);
    return vi.fn();
  });
  vi.mocked(subscribeSessionPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([]);
    return vi.fn();
  });
  vi.mocked(subscribeDamageDraws).mockImplementation((_sessionId, onDraws) => {
    onDraws([]);
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfAttackWindow).mockImplementation((_sessionId, onWindow) => {
    onWindow(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfAttackPreparation).mockImplementation((_sessionId, onPreparation) => {
    onPreparation(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfAttackState).mockImplementation((_sessionId, onState) => {
    onState(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfAssignment).mockImplementation((_sessionId, onAssignment) => {
    onAssignment(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfActionReceipt).mockImplementation((_sessionId, onReceipt) => {
    onReceipt(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfSuspicionHistory).mockImplementation((_sessionId, onHistory) => {
    onHistory([]);
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfClueDisclosure).mockImplementation((_sessionId, onDisclosure) => {
    onDisclosure(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfCultIntelligence).mockImplementation((_sessionId, onIntelligence) => {
    onIntelligence(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmArbourVision).mockImplementation((_sessionId, onVision) => {
    onVision(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmFacilitatorRuleCall).mockImplementation((_sessionId, onCall) => {
    onCall(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    onState(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmZealotryResponse).mockImplementation((_sessionId, onResponse) => {
    onResponse(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmCivilUnrestResolution).mockImplementation((_sessionId, onResolution) => {
    onResolution(null);
    return vi.fn();
  });
  vi.mocked(subscribeGmArrestPosseCalculation).mockImplementation((_sessionId, onCalculation) => {
    onCalculation(null);
    return vi.fn();
  });
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([]);
    return vi.fn();
  });
});

afterEach(() => vi.clearAllMocks());

function streamInstances(instances: readonly typeof local[]) {
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    onInstances(instances);
    return vi.fn();
  });
}

const productionReceipt = {
  source: 'routine-start', playerCount: 8, mode: 'base',
  rosterIds: ['admiral'], pressEligibility: { enabled: true, activeClaimCount: 0, claimed: false },
  excludedGmCount: 1, wolfCount: 1 as const, wolfRule: 'one-wolf-at-8-13',
  selectedWolfRoleIds: ['admiral'], eligibleRoleIds: ['admiral'], orderedModifiers: [],
  resultCount: 8, loyaltySource: 'automatic-default' as const, request: {},
  expectedSetupRevision: 0, committedSetupRevision: 1, actorUid: 'u1',
  serverTime: '2026-09-09T00:00:00.000Z', event: 'game-started',
};

function productionReply(status: 'committed' | 'replayed' = 'committed') {
  return {
    status, sessionId: 's1', requestId: 'start-ui', currentTurn: 1, setupRevision: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
    setupReceipt: productionReceipt,
  } as never;
}

it('redirects browsers without a local GM claim', () => {
  renderConsole();
  expect(screen.getByText('Role selection route')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /gm starmap/i })).not.toBeInTheDocument();
});

it('lists every GM instance and only offers to kick other instances', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  renderConsole();

  expect(await screen.findByText('Bridge laptop')).toBeInTheDocument();
  expect(screen.getByText('Tablet')).toBeInTheDocument();
  expect(screen.getByText('iPad / Safari')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /kick/i })).toHaveLength(1);
});

it('shows the facilitator-only loyalty census without exposing private card extras', () => {
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmLoyaltyCensus({
    revision: 7,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 10 }],
  });
  streamInstances([local]);
  renderConsole();

  const census = screen.getByRole('region', { name: 'Private loyalty census' });
  expect(census).toHaveTextContent('u2');
  expect(census).toHaveTextContent('wolf-agent');
  expect(census).toHaveTextContent('10');
  expect(census).not.toHaveTextContent(/brief|notes|link|proof/i);
});

it('mounts the private arrest calculator only on the verified GM console and submits no suspicion', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmLoyaltyCensus({
    revision: 9, entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 14 }],
  });
  vi.mocked(calculateArrestPosse).mockResolvedValue({
    type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
    requestId: 'arrest-1', targetUid: 'u2', defenders: 2, adjustment: 1,
    requiredPlayers: 7, censusRevision: 9,
  } as never);
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Arrest posse calculator' });
  expect(panel).not.toHaveTextContent('14');
  expect(panel).not.toHaveTextContent(/suspicion/i);
  fireEvent.change(within(panel).getByLabelText('Defenders'), { target: { value: '2' } });
  await user.selectOptions(within(panel).getByLabelText('Optional adjustment'), '1');
  await user.click(within(panel).getByRole('button', { name: 'Calculate required players' }));

  await waitFor(() => expect(calculateArrestPosse).toHaveBeenCalledWith('u2', 2, 1, 0));
  expect(await within(panel).findByRole('status')).toHaveTextContent('7 players needed');
});

it('clears the arrest count and ignores late projection callbacks after GM authority is revoked', async () => {
  let publishInstances: ((instances: readonly typeof local[]) => void) | undefined;
  let publishCalculation: ((calculation: {
    type: 'arrest-posse-calculation'; sessionId: string; revision: number; requestId: string;
    targetUid: string; defenders: number; requiredPlayers: number; censusRevision: number;
  } | null) => void) | undefined;
  const stopCalculation = vi.fn();
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    publishInstances = onInstances;
    onInstances([local]);
    return vi.fn();
  });
  vi.mocked(subscribeGmArrestPosseCalculation).mockImplementation((_sessionId, onCalculation) => {
    publishCalculation = onCalculation;
    onCalculation(null);
    return stopCalculation;
  });
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmLoyaltyCensus({
    revision: 9, entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 14 }],
  });
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Arrest posse calculator' });
  act(() => publishCalculation?.({
    type: 'arrest-posse-calculation', sessionId: 's1', revision: 1,
    requestId: 'arrest-live', targetUid: 'u2', defenders: 2,
    requiredPlayers: 8, censusRevision: 9,
  }));
  expect(within(panel).getByRole('status')).toHaveTextContent('8 players needed');

  act(() => {
    useSessionStore.getState().setIdentity(
      useSessionStore.getState().session!,
      { ...useSessionStore.getState().me!, role: 'player' },
    );
    publishCalculation?.({
      type: 'arrest-posse-calculation', sessionId: 's1', revision: 2,
      requestId: 'arrest-stale', targetUid: 'u2', defenders: 2,
      requiredPlayers: 99, censusRevision: 9,
    });
  });

  expect(stopCalculation).toHaveBeenCalled();
  expect(await screen.findByText('Role selection route')).toBeInTheDocument();
  expect(screen.queryByText('99 players needed')).not.toBeInTheDocument();
  expect(useSessionStore.getState().me?.role).toBe('player');
  // Exercise the already-revoked listener and keep the route privacy boundary.
  act(() => publishInstances?.([]));
  expect(screen.queryByRole('region', { name: 'Arrest posse calculator' })).not.toBeInTheDocument();
});

it('runs the server-timed facilitator flow for random or chosen console sabotage', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    phase: 'active', currentTurn: 2, activeVesselIds: ['aegis', 'dione'],
    shipDamage: { dione: { damagedSystemIds: ['storage'], destroyed: false } },
  });
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmLoyaltyCensus({
    revision: 4,
    entries: [{ uid: 'wolf-player', kind: 'wolf-agent', suspicion: 1 }],
  });
  const now = Date.now();
  vi.mocked(startWolfConsoleVisit).mockResolvedValue({
    status: 'observing', type: 'wolf-console-visit', sessionId: 's1', visitId: 'visit-1',
    cycle: 2, actorUid: 'wolf-player', coverRoleId: 'dione-engineer', targetShipId: 'dione',
    startedAt: new Date(now - 20_000).toISOString(),
    eligibleAt: new Date(now - 10_000).toISOString(),
    expiresAt: new Date(now + 40_000).toISOString(),
  });
  vi.mocked(resolveWolfConsoleSabotage).mockResolvedValue({
    status: 'committed', type: 'wolf-console-sabotage', sessionId: 's1',
    requestId: 'resolve-1', visitId: 'visit-1', cycle: 2, revision: 1,
    actorUid: 'wolf-player', coverRoleId: 'dione-engineer', targetShipId: 'dione',
    targetSystemId: 'reactor', targetSystemName: 'Reactor', mode: 'chosen',
    suspicion: 5, auditId: 'wolf-console-sabotage-resolve-1',
  });
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Wolf console sabotage observation' });
  await user.selectOptions(within(panel).getByLabelText('Visited ship'), 'dione');
  await user.click(within(panel).getByRole('button', { name: 'Start 10-second observation' }));
  await waitFor(() => expect(startWolfConsoleVisit).toHaveBeenCalledWith('wolf-player', 'dione'));
  expect(panel).toHaveTextContent('ELIGIBLE');
  await user.selectOptions(within(panel).getByLabelText('Target mode'), 'chosen');
  await user.selectOptions(within(panel).getByLabelText('Chosen console'), 'reactor');
  await user.click(within(panel).getByRole('button', { name: 'Confirm console sabotage' }));
  await waitFor(() => expect(resolveWolfConsoleSabotage).toHaveBeenCalledWith(
    'visit-1', 'chosen', 'reactor',
  ));
  expect(panel).toHaveTextContent('COMMITTED // Reactor damaged // +4 suspicion');
});

it('wakes the console sabotage controls at eligibility and expiry boundaries', async () => {
  vi.useFakeTimers();
  try {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    vi.setSystemTime(now);
    useSessionStore.getState().setSession({
      ...useSessionStore.getState().session!,
      phase: 'active', currentTurn: 2, activeVesselIds: ['aegis', 'dione'],
      shipDamage: { dione: { damagedSystemIds: ['storage'], destroyed: false } },
    });
    useSessionStore.getState().setGmInstance(local);
    useSessionStore.getState().setGmLoyaltyCensus({
      revision: 4,
      entries: [{ uid: 'wolf-player', kind: 'wolf-agent', suspicion: 1 }],
    });
    vi.mocked(startWolfConsoleVisit).mockResolvedValue({
      status: 'observing', type: 'wolf-console-visit', sessionId: 's1', visitId: 'visit-timed',
      cycle: 2, actorUid: 'wolf-player', coverRoleId: 'dione-engineer', targetShipId: 'dione',
      startedAt: new Date(now).toISOString(),
      eligibleAt: new Date(now + 10_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    });
    streamInstances([local]);
    renderConsole();

    const panel = screen.getByRole('region', { name: 'Wolf console sabotage observation' });
    fireEvent.change(within(panel).getByLabelText('Visited ship'), { target: { value: 'dione' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Start 10-second observation' }));
    await act(async () => { await Promise.resolve(); });

    const confirm = within(panel).getByRole('button', { name: 'Confirm console sabotage' });
    expect(panel).toHaveTextContent('OBSERVING // 10 seconds remain');
    expect(confirm).toBeDisabled();

    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(panel).toHaveTextContent('ELIGIBLE');
    expect(confirm).toBeEnabled();

    await act(async () => { vi.advanceTimersByTime(50_001); });
    expect(panel).toHaveTextContent('EXPIRED');
    expect(confirm).toBeDisabled();
  } finally {
    vi.useRealTimers();
  }
});

it('shows the latest Wolf clue only in the facilitator console', async () => {
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmWolfClueDisclosure).mockImplementation((_sessionId, onDisclosure) => {
    onDisclosure({
      revision: 5,
      actorUid: 'u2',
      action: 'sabotage-supplies',
      cycle: 3,
      requestId: 'wolf-supply-1',
      oldSuspicion: 8,
      increment: 2,
      newSuspicion: 10,
      roll: 6,
      total: 16,
      clueTier: 'wolf-activity-hint',
      facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
    });
    return vi.fn();
  });
  streamInstances([local]);
  renderConsole();

  const disclosure = await screen.findByRole('region', { name: 'Latest Wolf suspicion clue' });
  expect(disclosure).toHaveTextContent('Cycle 3');
  expect(disclosure).toHaveTextContent('Supply sabotage');
  expect(disclosure).toHaveTextContent('Suspicion 8 + 2 = 10; d6 6; total 16.');
  expect(disclosure).toHaveTextContent('Point out the wolf activity, and give a hint.');
});

it('shows the complete Wolf action receipt only in the facilitator console', async () => {
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmWolfActionReceipt).mockImplementation((_sessionId, onReceipt) => {
    onReceipt({
      type: 'wolf-action-receipt',
      status: 'committed',
      action: 'sabotage-supplies',
      projectionRevision: 5,
      sessionId: 's1',
      requestId: 'wolf-supply-1',
      cycle: 3,
      actorUid: 'u2',
      actorRoleId: 'dione-engineer',
      vesselId: 'philia',
      phase: 'active',
      revision: 1,
      idempotencyKey: 'wolf-supply-1',
      auditId: 'wolf-supply-sabotage-wolf-supply-1',
      resourceId: 'food',
      destroyedAmount: 2,
      remainingAmount: 3,
      oldSuspicion: 8,
      suspicionIncrement: 2,
      newSuspicion: 10,
      roll: 6,
      total: 16,
      clueTier: 'wolf-activity-hint',
      facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
      createdAt: '2026-09-20T20:00:00.000Z',
    });
    return vi.fn();
  });
  streamInstances([local]);
  renderConsole();

  const receipt = await screen.findByRole('region', { name: 'Latest Wolf action receipt' });
  expect(receipt).toHaveTextContent('COMMITTED // Cycle 3 // revision 1');
  expect(receipt).toHaveTextContent('u2');
  expect(receipt).toHaveTextContent('dione-engineer');
  expect(receipt).toHaveTextContent('philia');
  expect(receipt).toHaveTextContent('ACTIVE');
  expect(receipt).toHaveTextContent('Projection revision5');
  expect(receipt).toHaveTextContent('Requestwolf-supply-1');
  expect(receipt).toHaveTextContent('Idempotency keywolf-supply-1');
  expect(receipt).toHaveTextContent('2 food destroyed; 3 remain');
  expect(receipt).toHaveTextContent('8 + 2 = 10');
  expect(receipt).toHaveTextContent('d6 6; total 16');
  expect(receipt).toHaveTextContent('Wolf activity with hint');
  expect(receipt).toHaveTextContent('wolf-supply-sabotage-wolf-supply-1');
  expect(receipt).toHaveTextContent('2026-09-20T20:00:00.000Z');
});

it('shows a private Wolf handler message and its suspicion receipt to the facilitator', async () => {
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmWolfActionReceipt).mockImplementation((_sessionId, onReceipt) => {
    onReceipt({
      type: 'wolf-action-receipt', status: 'committed', action: 'provide-intel',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-intel-1', cycle: 4,
      actorUid: 'u2', actorRoleId: 'dione-engineer', phase: 'active', revision: 2,
      idempotencyKey: 'wolf-intel-1', auditId: 'wolf-intelligence-wolf-intel-1',
      message: 'Relay quiet.', oldSuspicion: 8, suspicionIncrement: 3, newSuspicion: 11,
      roll: 1, total: 12, clueTier: 'wolf-activity',
      facilitatorInstruction: 'Point out the wolf activity to someone.',
      createdAt: '2026-09-20T21:00:00.000Z',
    });
    return vi.fn();
  });
  streamInstances([local]);
  renderConsole();

  const receipt = await screen.findByRole('region', { name: 'Latest Wolf action receipt' });
  expect(receipt).toHaveTextContent('Intelligence dispatch');
  expect(receipt).toHaveTextContent('Handler messageRelay quiet.');
  expect(receipt).toHaveTextContent('8 + 3 = 11');
  expect(receipt).toHaveTextContent('wolf-intelligence-wolf-intel-1');
  expect(receipt).not.toHaveTextContent(/destroyed|remain/i);
});

it('shows homing-beacon pressure as eligible only after the next cycle starts', async () => {
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmWolfActionReceipt).mockImplementation((_sessionId, onReceipt) => {
    onReceipt({
      type: 'wolf-action-receipt', status: 'committed', action: 'homing-beacon',
      projectionRevision: 7, sessionId: 's1', requestId: 'wolf-beacon-1', cycle: 4,
      actorUid: 'u2', actorRoleId: 'dione-engineer', phase: 'active', revision: 3,
      idempotencyKey: 'wolf-beacon-1', auditId: 'wolf-homing-beacon-wolf-beacon-1',
      groupId: 'fleet-1', coordinate: '5143', dueCycle: 5,
      arrivalTiming: 'after-cycle-start', oldSuspicion: 11, suspicionIncrement: 5,
      newSuspicion: 16, roll: 1, total: 17, clueTier: 'wolf-activity-hint',
      facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
    });
    return vi.fn();
  });
  streamInstances([local]);
  renderConsole();

  const receipt = await screen.findByRole('region', { name: 'Latest Wolf action receipt' });
  expect(receipt).toHaveTextContent('Homing beacon');
  expect(receipt).toHaveTextContent('5143 // fleet-1 // eligible after cycle 5 starts');
  expect(receipt).toHaveTextContent('11 + 5 = 16');
  expect(receipt).not.toHaveTextContent(/at cycle start/i);
});

it('shows durable Wolf suspicion history in the facilitator console', async () => {
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmWolfSuspicionHistory).mockImplementation((_sessionId, onHistory) => {
    onHistory([{
      type: 'wolf-suspicion-history', status: 'committed',
      action: 'sabotage-supplies', source: 'wolf-supply-sabotage',
      sessionId: 's1', requestId: 'wolf-supply-1', cycle: 3,
      actorUid: 'u2', actorRoleId: 'dione-engineer',
      oldSuspicion: 8, increment: 2, newSuspicion: 10,
      roll: 6, total: 16, clueTier: 'wolf-activity-hint',
      disclosure: 'Point out the wolf activity, and give a hint.',
      auditId: 'wolf-supply-sabotage-wolf-supply-1',
      createdAt: '2026-09-20T20:00:00.000Z',
    }]);
    return vi.fn();
  });
  streamInstances([local]);
  renderConsole();

  const history = await screen.findByRole('region', { name: 'Private Wolf suspicion history' });
  expect(history).toHaveTextContent('Cycle 3 // u2 // dione-engineer');
  expect(history).toHaveTextContent('8 + 2 = 10; d6 6; total 16; Wolf activity with hint.');
  expect(history).toHaveTextContent('Point out the wolf activity, and give a hint.');
  expect(history).toHaveTextContent('wolf-supply-sabotage // wolf-supply-1 // wolf-supply-sabotage-wolf-supply-1 // 2026-09-20T20:00:00.000Z');
});

it('renders and saves facilitator notes and hydrates the hidden Wolf assignment', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmLoyaltyCensus({
    revision: 7,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 10, note: 'Watch the transfer window' }],
  });
  vi.mocked(setFacilitatorCensusNote).mockResolvedValue('applied');
  vi.mocked(subscribeGmWolfAssignment).mockImplementation((_sessionId, onAssignment) => {
    onAssignment({ roleIds: ['admiral'] });
    return vi.fn();
  });
  streamInstances([local]);
  renderConsole();

  const census = await screen.findByRole('region', { name: 'Private loyalty census' });
  expect(within(census).getByLabelText('Facilitator note for u2')).toHaveValue('Watch the transfer window');
  await user.click(within(census).getByRole('button', { name: 'Save note' }));
  expect(setFacilitatorCensusNote).toHaveBeenCalledWith('u2', 'Watch the transfer window');
  expect(await screen.findByRole('region', { name: 'Private Wolf assignment' })).toHaveTextContent('Admiral');
});

it('makes the facilitator-authored Wolf Cult delivery reachable from the GM console', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmLoyaltyCensus({
    revision: 7,
    entries: [
      { uid: 'u2', kind: 'wolf-cult', suspicion: 15 },
      { uid: 'u3', kind: 'wolf-agent', suspicion: 0 },
    ],
  });
  vi.mocked(deliverWolfCultIntelligence).mockResolvedValue('applied');
  streamInstances([local]);
  renderConsole();

  const delivery = await screen.findByRole('region', { name: /Wolf Cult intelligence delivery/i });
  await user.type(within(delivery).getByLabelText('Active Wolf fortress coordinate'), '4454');
  await user.type(within(delivery).getByLabelText('Abandoned supplies coordinate'), '1964');
  await user.type(within(delivery).getByLabelText('Code word'), 'NIGHTFALL');
  await user.click(within(delivery).getByRole('button', { name: /deliver private Wolf intel/i }));

  await waitFor(() => expect(deliverWolfCultIntelligence).toHaveBeenCalledWith(
    '4454', '1964', 'u3', 'NIGHTFALL',
  ));
  expect(delivery).toHaveTextContent(/WOLF INTEL DELIVERED/i);
});

it('authorizes a labeled private Universal Arbour call from the GM console', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmLoyaltyCensus({
    revision: 7,
    entries: [{ uid: 'u2', kind: 'universal-arbour', suspicion: 10 }],
  });
  vi.mocked(authorUniversalArbourVision).mockResolvedValue('applied');
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Universal Arbour facilitator call' });
  await user.selectOptions(within(panel).getByLabelText('Call type'), 'danger');
  await user.type(within(panel).getByLabelText('Facilitator call'), 'There is danger at the relay.');
  await user.click(within(panel).getByRole('button', { name: 'Publish private call' }));
  expect(authorUniversalArbourVision).toHaveBeenCalledWith(
    'u2', 'danger', 'There is danger at the relay.',
  );
  expect(await within(panel).findByRole('status')).toHaveTextContent(/facilitator call applied/i);
});

it('records a durable facilitator rule call for a selected player', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(authorFacilitatorRuleCall).mockResolvedValue('applied');
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Facilitator rule call' });
  await user.type(within(panel).getByLabelText('Question or ambiguity'), 'Does docking happen first?');
  await user.type(within(panel).getByLabelText('Source or reference'), 'Facilitator reference');
  await user.type(within(panel).getByLabelText('Decision'), 'Use the printed docking state.');
  await user.selectOptions(within(panel).getByLabelText('Audience'), 'selected-player');
  expect(within(panel).getByLabelText('Recipient')).toBeVisible();
  await user.selectOptions(within(panel).getByLabelText('Audience'), 'gm-only');
  await user.click(within(panel).getByRole('button', { name: 'Record rule call' }));
  expect(authorFacilitatorRuleCall).toHaveBeenCalledWith({
    ambiguity: 'Does docking happen first?',
    source: 'Facilitator reference',
    decision: 'Use the printed docking state.',
    audience: 'gm-only',
  });
  expect(await within(panel).findByRole('status')).toHaveTextContent(/rule call applied/i);
});

it('records only the Cycle 6 candidate plan presence marker', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, phase: 'active', currentTurn: 6,
  });
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(setCandidatePlanCheckpoint).mockResolvedValue('applied');
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Cycle 6 candidate plan checkpoint' });
  await user.click(within(panel).getByRole('checkbox', { name: 'Candidate plan exists' }));
  await user.click(within(panel).getByRole('button', { name: 'Save Cycle 6 plan status' }));
  expect(setCandidatePlanCheckpoint).toHaveBeenCalledWith(true);
  expect(await within(panel).findByRole('status')).toHaveTextContent(/cycle 6 plan status applied/i);
  expect(panel).not.toHaveTextContent('hidden plan text');
});

it.each([undefined, 5, 7])('locks the candidate plan control outside Cycle 6 (%s)', async (currentTurn) => {
  const user = userEvent.setup();
  const candidateSession = { ...useSessionStore.getState().session! };
  if (currentTurn === undefined) delete candidateSession.currentTurn;
  else candidateSession.currentTurn = currentTurn;
  useSessionStore.getState().setSession({ ...candidateSession, phase: 'active' });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Cycle 6 candidate plan checkpoint' });
  expect(within(panel).getByRole('checkbox', { name: 'Candidate plan exists' })).toBeDisabled();
  expect(within(panel).getByRole('button', { name: 'Save Cycle 6 plan status' })).toBeDisabled();
  expect(panel).toHaveTextContent(`available during Cycle 6 only`);
  expect(setCandidatePlanCheckpoint).not.toHaveBeenCalled();
  await user.click(within(panel).getByRole('button', { name: 'Save Cycle 6 plan status' }));
});

it('lets the facilitator author and advance a crisis lifecycle from the GM console', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(transitionCrisis).mockResolvedValue('applied');
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Crisis state machine' });
  await user.type(within(panel).getByRole('textbox', { name: 'Crisis title' }), 'Relay pressure');
  await user.type(within(panel).getByRole('textbox', { name: 'Crisis facilitator notes' }), 'Facilitator-only deliberation.');
  await user.selectOptions(within(panel).getByRole('combobox', { name: 'Crisis kind' }), 'approaching-vessel');
  expect(within(panel).getByText('Vessel reality and difficulty reasoning (private)')).toBeVisible();
  expect(within(panel).getByText(/Delivery publishes the scouting report/)).toBeVisible();
  await user.selectOptions(within(panel).getByRole('combobox', { name: 'Crisis kind' }), 'religious-zealotry');
  expect(within(panel).getByText(/Delivery publishes the movement report/)).toBeVisible();
  await user.selectOptions(within(panel).getByRole('combobox', { name: 'Crisis kind' }), 'presidential-election');
  expect(within(panel).getByText(/Delivery introduces the election decision/)).toBeVisible();
  await user.type(within(panel).getByRole('textbox', { name: 'Crisis configuration override' }), 'Alternate decision maker agreed at this table.');
  await user.click(within(panel).getByRole('button', { name: 'Mark draft' }));

  await waitFor(() => expect(transitionCrisis).toHaveBeenCalledWith(
    'crisis-1', 'draft', 'Relay pressure', 'Facilitator-only deliberation.',
    { crisisKind: 'presidential-election', configurationOverride: 'Alternate decision maker agreed at this table.' },
  ));
  expect(await within(panel).findByRole('status')).toHaveTextContent(/crisis transition committed/i);
});

it('exposes Voyage 33-0 admission only on an active Approaching Vessel crisis', async () => {
  const user = userEvent.setup();
  const approachingCrisis: CrisisStateProjection = {
    sessionId: 's1', crisisId: 'approach-1', state: 'resolved', revision: 3,
    title: 'Approaching vessel', details: 'Facilitator acceptance notes.', crisisKind: 'approaching-vessel',
  };
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    onState(approachingCrisis);
    return vi.fn();
  });
  vi.mocked(admitVoyage33).mockResolvedValue('applied');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Crisis state machine' });
  const admission = within(panel).getByRole('region', { name: 'Voyage 33-0 admission' });
  expect(admission).toHaveTextContent(/40,000 survivors/i);
  expect(admission).toHaveTextContent(/host-docking and maintenance commitments/i);
  expect(within(panel).getByRole('button', { name: 'Admit Voyage 33-0' })).toBeEnabled();
  await user.click(within(panel).getByRole('button', { name: 'Admit Voyage 33-0' }));

  await waitFor(() => expect(admitVoyage33).toHaveBeenCalledWith('approach-1'));
  expect(await within(panel).findByRole('status')).toHaveTextContent(/Voyage 33-0 admitted/i);
});

it('records a private source-approved Zealotry response only at the debated stage', async () => {
  const user = userEvent.setup();
  const debatedZealotry: CrisisStateProjection = {
    sessionId: 's1', crisisId: 'zealotry-1', state: 'debated', revision: 3,
    title: 'Religious zealotry', details: 'The movement is growing.', crisisKind: 'religious-zealotry',
  };
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    onState(debatedZealotry);
    return vi.fn();
  });
  vi.mocked(recordZealotryResponse).mockResolvedValue('applied');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();
  await screen.findByRole('region', { name: 'Crisis state machine' });
  act(() => useSessionStore.getState().setGmCrisisState(debatedZealotry));
  const panel = await screen.findByRole('region', { name: 'Private Religious Zealotry response' });
  await user.click(within(panel).getByRole('checkbox', { name: 'Pressure' }));
  await user.click(within(panel).getByRole('checkbox', { name: 'Investigate' }));
  await user.type(within(panel).getByRole('textbox', { name: 'Custom Religious Zealotry response' }), 'Keep it informal.');
  await user.type(within(panel).getByRole('textbox', { name: 'Private Religious Zealotry rationale' }), 'No automatic suspicion change.');
  await user.click(within(panel).getByRole('button', { name: 'Record private response' }));

  await waitFor(() => expect(recordZealotryResponse).toHaveBeenCalledWith(
    ['pressure', 'investigate'], 'Keep it informal.', 'No automatic suspicion change.',
  ));
  expect(await within(panel).findByRole('status')).toHaveTextContent(/recorded privately.*publication and law handling remain separate/i);
});

it('clears a prior Zealotry response when a later crisis arrives and ignores late hydration', async () => {
  const user = userEvent.setup();
  const crisisA: CrisisStateProjection = {
    sessionId: 's1', crisisId: 'zealotry-a', state: 'debated', revision: 3,
    title: 'Religious zealotry A', details: 'First crisis notes.', crisisKind: 'religious-zealotry',
  };
  const crisisB: CrisisStateProjection = {
    ...crisisA, crisisId: 'zealotry-b', revision: 9,
    title: 'Religious zealotry B', details: 'Second crisis notes.',
  };
  const responseA: ZealotryResponse = {
    sessionId: 's1', crisisId: 'zealotry-a', crisisRevision: 3, state: 'debated', revision: 1,
    actions: ['pressure', 'investigate'], rationale: 'Keep this private to crisis A.',
    loyaltyCensusRevision: null,
  };
  let publishCrisis: ((state: CrisisStateProjection | null) => void) | undefined;
  let publishResponse: ((response: ZealotryResponse | null) => void) | undefined;
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    publishCrisis = onState;
    onState(crisisA);
    return vi.fn();
  });
  vi.mocked(subscribeGmZealotryResponse).mockImplementation((_sessionId, onResponse) => {
    publishResponse = onResponse;
    onResponse(responseA);
    return vi.fn();
  });
  useSessionStore.getState().setGmCrisisState(crisisA);
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Private Religious Zealotry response' });
  expect(within(panel).getByRole('checkbox', { name: 'Pressure' })).toBeChecked();
  expect(within(panel).getByRole('textbox', { name: 'Private Religious Zealotry rationale' })).toHaveValue(responseA.rationale);

  act(() => publishCrisis?.(crisisB));
  expect(within(panel).getByRole('checkbox', { name: 'Pressure' })).not.toBeChecked();
  expect(within(panel).getByRole('checkbox', { name: 'Investigate' })).not.toBeChecked();
  expect(within(panel).getByRole('textbox', { name: 'Custom Religious Zealotry response' })).toHaveValue('');
  expect(within(panel).getByRole('textbox', { name: 'Private Religious Zealotry rationale' })).toHaveValue('');
  expect(panel).toHaveTextContent(/no private response recorded/i);

  act(() => publishResponse?.(responseA));
  expect(within(panel).getByRole('checkbox', { name: 'Pressure' })).not.toBeChecked();
  expect(within(panel).getByRole('textbox', { name: 'Private Religious Zealotry rationale' })).toHaveValue('');
  expect(recordZealotryResponse).not.toHaveBeenCalled();
  await user.click(within(panel).getByRole('checkbox', { name: 'Leave' }));
  expect(recordZealotryResponse).not.toHaveBeenCalled();
});

it('records a facilitator-attributed Civil Unrest response with grievance links and resets stale crisis hydration', async () => {
  const user = userEvent.setup();
  const crisisA: CrisisStateProjection = {
    sessionId: 's1', crisisId: 'unrest-a', state: 'debated', revision: 3,
    title: 'Civil Unrest A', details: 'Team grievances.', crisisKind: 'civil-unrest',
  };
  const crisisB: CrisisStateProjection = { ...crisisA, crisisId: 'unrest-b', revision: 4, title: 'Civil Unrest B' };
  const responseA: CivilUnrestResolution = {
    sessionId: 's1', crisisId: 'unrest-a', crisisRevision: 3, state: 'debated', revision: 1,
    presidentResponse: 'Facilitator-recorded response A', consequence: 'No automatic change A', rationale: 'Private rationale A',
    grievanceRevisions: [
      { shipId: 'dione', revision: 2 }, { shipId: 'icebreaker', revision: null },
      { shipId: 'shepherd', revision: null }, { shipId: 'quellon', revision: null }, { shipId: 'refinery-124', revision: null },
    ], recordedBy: 'facilitator', actorUid: 'gm-1', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  let publishCrisis: ((state: CrisisStateProjection | null) => void) | undefined;
  let publishResolution: ((resolution: CivilUnrestResolution | null) => void) | undefined;
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    publishCrisis = onState;
    onState(crisisA);
    return vi.fn();
  });
  vi.mocked(subscribeGmCivilUnrestResolution).mockImplementation((_sessionId, onResolution) => {
    publishResolution = onResolution;
    onResolution(responseA);
    return vi.fn();
  });
  vi.mocked(recordCivilUnrestResolution).mockResolvedValue('applied');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();
  const panel = await screen.findByRole('region', { name: 'Private Civil Unrest resolution' });
  expect(within(panel).getByRole('textbox', { name: 'Facilitator-recorded President response' })).toHaveValue(responseA.presidentResponse);
  expect(within(panel).getByRole('textbox', { name: 'Facilitator-recorded Civil Unrest consequence' })).toHaveValue(responseA.consequence);
  expect(panel).toHaveTextContent('Decision source // Facilitator response on behalf of the President');
  expect(panel).toHaveTextContent('Decision actor // facilitator // gm-1');
  expect(panel).toHaveTextContent('Decision time //');
  await user.click(within(panel).getByRole('button', { name: 'Record private Civil Unrest resolution' }));
  await waitFor(() => expect(recordCivilUnrestResolution).toHaveBeenCalledWith(
    responseA.presidentResponse, responseA.consequence, responseA.rationale,
  ));
  expect(within(panel).getByRole('status')).toHaveTextContent(/recorded privately.*no fleet change or public publication/i);
  act(() => publishCrisis?.(crisisB));
  expect(within(panel).getByRole('textbox', { name: 'Facilitator-recorded President response' })).toHaveValue('');
  expect(within(panel).getByRole('textbox', { name: 'Facilitator-recorded Civil Unrest consequence' })).toHaveValue('');
  act(() => publishResolution?.(responseA));
  expect(within(panel).getByRole('textbox', { name: 'Facilitator-recorded President response' })).toHaveValue('');
  expect(recordCivilUnrestResolution).toHaveBeenCalledTimes(1);
});

it('withholds the private crisis stream until the fresh manifest confirms this instance', async () => {
  const crisisSubscribe = vi.fn();
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    crisisSubscribe();
    onState(liveCrisis);
    return vi.fn();
  });
  useSessionStore.getState().setGmCrisisState(liveCrisis);
  useSessionStore.getState().setGmInstance(local);
  streamInstances([]);
  renderConsole();

  expect(await screen.findByText('Role selection route')).toBeInTheDocument();
  expect(crisisSubscribe).not.toHaveBeenCalled();
  expect(useSessionStore.getState().gmInstance).toBeNull();
  expect(useSessionStore.getState().gmCrisisState).toBeNull();
});

it('invalidates the crisis stream when the same GM is replaced by another instance', async () => {
  let publish: ((instances: readonly typeof local[]) => void) | undefined;
  let crisisPublish: ((state: CrisisStateProjection | null) => void) | undefined;
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    publish = onInstances;
    onInstances([local]);
    return vi.fn();
  });
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    crisisPublish = onState;
    onState(liveCrisis);
    return vi.fn();
  });
  useSessionStore.getState().setGmInstance(local);
  renderConsole();
  await screen.findByRole('region', { name: 'Crisis state machine' });

  act(() => publish?.([{ ...local, id: 'replacement-1' }]));
  act(() => crisisPublish?.(liveCrisis));

  expect(useSessionStore.getState().gmInstance).toBeNull();
  expect(useSessionStore.getState().gmCrisisState).toBeNull();
  expect(await screen.findByText('Role selection route')).toBeInTheDocument();
});

it('clears demoted GM crisis state and ignores late listener callbacks', async () => {
  let crisisPublish: ((state: CrisisStateProjection | null) => void) | undefined;
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    crisisPublish = onState;
    onState(liveCrisis);
    return vi.fn();
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();
  await screen.findByRole('region', { name: 'Crisis state machine' });
  expect(useSessionStore.getState().gmCrisisState).toEqual(liveCrisis);

  act(() => {
    useSessionStore.getState().setIdentity(
      useSessionStore.getState().session!,
      { ...useSessionStore.getState().me!, role: 'player' },
    );
    crisisPublish?.(liveCrisis);
  });

  expect(useSessionStore.getState().gmCrisisState).toBeNull();
  expect(await screen.findByText('Role selection route')).toBeInTheDocument();
});

it('ignores a stale crisis callable result after GM instance replacement', async () => {
  const user = userEvent.setup();
  let resolveTransition: ((value: 'applied') => void) | undefined;
  vi.mocked(transitionCrisis).mockImplementation(() => new Promise((resolve) => {
    resolveTransition = resolve;
  }));
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();
  const panel = await screen.findByRole('region', { name: 'Crisis state machine' });
  await user.type(within(panel).getByRole('textbox', { name: 'Crisis title' }), 'Relay pressure');
  await user.click(within(panel).getByRole('button', { name: 'Mark draft' }));
  await waitFor(() => expect(transitionCrisis).toHaveBeenCalled());

  act(() => useSessionStore.getState().setGmInstance({ ...local, id: 'replacement-1' }));
  act(() => resolveTransition?.('applied'));

  expect(useSessionStore.getState().gmCrisisState).toBeNull();
  expect(screen.queryByText(/crisis transition committed/i)).not.toBeInTheDocument();
});

it('returns to role selection', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await screen.findByText('Bridge laptop');
  await user.click(screen.getByRole('link', { name: /back to role selection/i }));

  expect(screen.getByText('Role selection route')).toBeInTheDocument();
});

it('lets the active GM reset the code of conduct checklist from the GM Console', async () => {
  const user = userEvent.setup();
  const resetEvent = vi.fn();
  localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(Date.now()));
  window.addEventListener(SESSION_WAIVER_RESET_EVENT, resetEvent);
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const access = await screen.findByRole('region', { name: /session access controls/i });
  const reset = within(access).getByRole('button', {
    name: /reset code of conduct checklist/i,
  });

  await user.click(reset);

  expect(localStorage.getItem(SESSION_WAIVER_STORAGE_KEY)).toBeNull();
  expect(resetEvent).toHaveBeenCalledOnce();
  window.removeEventListener(SESSION_WAIVER_RESET_EVENT, resetEvent);
});

it('keeps Cycle 0 Skip separate while routing production start through Setup', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...activeSession, currentTurn: 0 });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(advanceTurn).mockImplementation(async () => {
    const session = useSessionStore.getState().session;
    if (session) useSessionStore.getState().setSession({ ...session, currentTurn: 1 });
  });
  renderConsole();

  const turnControls = await screen.findByRole('region', { name: /cycle controls/i });
  expect(within(turnControls).getByText(/Cycle 0 \/\/ ordinary production start/)).toBeInTheDocument();
  const skipButton = within(turnControls).getByRole('button', { name: /skip to cycle 1/i });
  expect(within(turnControls).queryByRole('button', { name: 'Advance to Cycle 1' })).not.toBeInTheDocument();

  await user.click(skipButton);
  expect(advanceTurn).not.toHaveBeenCalled();
  expect(skipButton).toHaveClass('cic-action-button--confirm');
  expect(skipButton).toHaveTextContent('ARE YOU SURE? // Skip to Cycle 1');
  await user.click(skipButton);

  expect(advanceTurn).toHaveBeenCalledOnce();
  expect(advanceTurn).toHaveBeenCalledWith({ skipTurnStartAnnouncement: true });
  await waitFor(() => expect(within(turnControls).getByText('Cycle 1')).toBeInTheDocument());
  expect(within(turnControls).queryByRole('button', { name: /skip to cycle 1/i }))
    .not.toBeInTheDocument();
});

it('keeps Advance and Skip available for every numbered cycle', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...activeSession, currentTurn: 2 });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(advanceTurn).mockResolvedValue(undefined);
  renderConsole();

  const turnControls = await screen.findByRole('region', { name: /cycle controls/i });
  const advance = within(turnControls).getByRole('button', { name: 'Advance to Cycle 3' });
  const skip = within(turnControls).getByRole('button', { name: 'Skip to Cycle 3' });
  expect(advance).toBeEnabled();
  expect(skip).toBeEnabled();

  await user.click(skip);
  expect(advanceTurn).not.toHaveBeenCalled();
  expect(within(turnControls).getByRole('button', {
    name: 'ARE YOU SURE? // Skip to Cycle 3',
  })).toBeVisible();
  await user.click(within(turnControls).getByRole('button', {
    name: 'ARE YOU SURE? // Skip to Cycle 3',
  }));

  expect(advanceTurn).toHaveBeenCalledWith({ skipTurnStartAnnouncement: true });
});

it('offers local and shared replay controls for the current turn transmission', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(replayTurnStartAnnouncement).mockResolvedValue(undefined);
  renderConsole();

  const turnControls = await screen.findByRole('region', { name: /cycle controls/i });
  const gmOnly = within(turnControls).getByRole('button', {
    name: /replay last transmission \/\/ gm only/i,
  });
  const everyone = within(turnControls).getByRole('button', {
    name: /replay last transmission \/\/ everyone/i,
  });
  expect(gmOnly).toBeEnabled();
  expect(everyone).toBeEnabled();

  await user.click(gmOnly);
  expect(replayTurnStartAnnouncement).toHaveBeenCalledWith('gm');
  await user.click(everyone);
  expect(replayTurnStartAnnouncement).toHaveBeenCalledWith('everyone');
});

it('kicks another instance and removes it from the list', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  vi.mocked(kickGmInstance).mockResolvedValue('applied');
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /kick tablet/i }));

  expect(kickGmInstance).toHaveBeenCalledWith('other-1');
  await waitFor(() => expect(screen.queryByText('Tablet')).not.toBeInTheDocument());
});

it('updates when the live GM instance stream changes', async () => {
  let publish: ((instances: readonly typeof local[]) => void) | undefined;
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    publish = onInstances;
    onInstances([local]);
    return vi.fn();
  });
  renderConsole();
  await screen.findByText('Bridge laptop');

  act(() => publish?.([local, other]));

  expect(await screen.findByText('Tablet')).toBeInTheDocument();
});

it('revokes the local GM authority when the manifest listener fails', async () => {
  let publish: ((instances: readonly typeof local[]) => void) | undefined;
  let fail: (() => void) | undefined;
  let crisisPublish: ((state: CrisisStateProjection | null) => void) | undefined;
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, onState) => {
    crisisPublish = onState;
    onState(liveCrisis);
    return vi.fn();
  });
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances, onError) => {
    publish = onInstances;
    fail = onError;
    onInstances([local]);
    return vi.fn();
  });
  renderConsole();
  await screen.findByText('Bridge laptop');

  act(() => fail?.());
  act(() => crisisPublish?.(liveCrisis));
  expect(useSessionStore.getState().communicationError?.code).toBe('gm-manifest-link');
  expect(useSessionStore.getState().gmInstance).toBeNull();
  expect(useSessionStore.getState().gmCrisisState).toBeNull();
  expect(await screen.findByText('Role selection route')).toBeInTheDocument();
  act(() => publish?.([local, other]));
  expect(screen.queryByText('Tablet')).not.toBeInTheDocument();
});

it('groups connected players by command role in the GM console', async () => {
  const user = userEvent.setup();
  const stopPlayers = vi.fn();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([
      {
        uid: 'u1', sessionId: 's1', displayName: 'Morgan', role: 'gm', seatId: null,
        activeConsoleRoleId: null, joinedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        uid: 'u2', sessionId: 's1', displayName: 'Ari', role: 'player', seatId: null,
        activeConsoleRoleId: 'dione-captain', joinedAt: '2026-01-01T00:01:00.000Z',
      },
      {
        uid: 'u3', sessionId: 's1', displayName: 'Bea', role: 'player', seatId: null,
        activeConsoleRoleId: 'dione-captain', joinedAt: '2026-01-01T00:02:00.000Z',
      },
      {
        uid: 'u4', sessionId: 's1', displayName: 'Cy', role: 'player', seatId: null,
        activeConsoleRoleId: null, joinedAt: '2026-01-01T00:03:00.000Z',
      },
    ]);
    return stopPlayers;
  });

  const { unmount } = renderConsole();
  const roster = await screen.findByRole('region', { name: /connected players by role/i });

  expect(within(roster).getByText('Dione // Captain')).toBeInTheDocument();
  expect(within(roster).getByText('Ari')).toBeInTheDocument();
  expect(within(roster).getByText('Bea')).toBeInTheDocument();
  expect(within(roster).getByText('GM')).toBeInTheDocument();
  expect(within(roster).getByText('Morgan')).toBeInTheDocument();
  expect(within(roster).getByText('Unassigned')).toBeInTheDocument();
  expect(within(roster).getByText('Cy')).toBeInTheDocument();

  vi.mocked(kickPlayer).mockResolvedValue('applied');
  await user.click(within(roster).getByRole('button', { name: 'Kick Ari' }));
  expect(kickPlayer).toHaveBeenCalledWith('u2');

  unmount();
  expect(stopPlayers).toHaveBeenCalledOnce();
});

it('gives the live GM an explicit replacement adjudication panel with keyboard actions', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
    activeRoleIds: ['admiral'], expansion: 'base', smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: null, dockingRevision: 0,
        population: 1000, unrest: 0, cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([{
      uid: 'u2', sessionId: 's1', displayName: 'Ari', role: 'player', seatId: 'admiral',
      assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', connected: false,
      joinedAt: '2026-01-01T00:01:00.000Z',
    }]);
    return vi.fn();
  });
  vi.mocked(setReplacementEligibility).mockResolvedValue({
    status: 'committed', sessionId: 's1', targetUid: 'u2', revision: 1, setupRevision: 5,
    actorUid: 'u1', recordedAt: '2026-09-20T17:00:00.000Z',
  });
  vi.mocked(assignReplacementRole).mockResolvedValue({
    status: 'committed', sessionId: 's1', targetUid: 'u2', revision: 2,
    setupRevision: 6, replacementRoleId: 'wolf-commander',
    actorUid: 'u1', recordedAt: '2026-09-20T17:01:00.000Z',
  });
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Facilitator replacement roles' });
  expect(within(panel).queryByRole('option', { name: /Gorgoneion Captain/i })).not.toBeInTheDocument();
  await user.selectOptions(within(panel).getByLabelText('Player record'), 'u2');
  const record = within(panel).getByRole('button', { name: 'Record eligibility' });
  record.focus();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(setReplacementEligibility).toHaveBeenCalledWith('u2', 'dead', 0, 0));
  expect(within(panel).getByRole('region', { name: 'Decision attribution' })).toHaveTextContent(
    'Decision actor // facilitator // u1',
  );
  expect(within(panel).getByRole('region', { name: 'Decision attribution' })).toHaveTextContent(
    'Decision time // 9/20/2026',
  );
  expect(within(panel).getByRole('region', { name: 'Decision attribution' }).querySelector('time')).toHaveAttribute(
    'datetime', '2026-09-20T17:00:00.000Z',
  );
  await user.click(within(panel).getByRole('button', { name: 'Assign replacement role' }));
  await waitFor(() => expect(assignReplacementRole).toHaveBeenCalledWith('u2', 'wolf-commander', 1, 5));
  expect(within(panel).getByRole('region', { name: 'Decision attribution' }).querySelector('time')).toHaveAttribute(
    'datetime', '2026-09-20T17:01:00.000Z',
  );
});

it('renders charged base Capybara production controls in the live GM console', () => {
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
    activeRoleIds: ['admiral'], expansion: 'base', capybaraEnabled: true,
    smallShipStates: {
      'capybara-small': {
        id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1,
        population: 2_000, unrest: 0,
        cycle: { step: 5, revision: 5, results: { '4': 'Reactor powered up.' }, charges: ['water-reclimator', 'hydroponics'] },
      },
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const card = screen.getByRole('region', { name: 'Capybara small-ship operations' });
  expect(within(card).getByRole('button', { name: /Run Water Reclimator/ })).toBeEnabled();
  expect(within(card).getByRole('button', { name: /Run Hydroponics/ })).toBeEnabled();
  expect(within(card).getByRole('button', { name: 'End small-ship cycle' })).toBeEnabled();
});

it('exposes the real Additional Labour consoles in the Vulcan reactor controls', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
    activeRoleIds: ['admiral'],
    smallShipStates: {
      vulcan: {
        id: 'vulcan', hostShipId: 'aegis', dockingRevision: 1,
        population: 15_000, unrest: 0,
        cycle: { step: 4, revision: 4, results: {}, charges: [] },
      },
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const card = screen.getByRole('region', { name: 'Vulcan small-ship operations' });
  expect(within(card).getByText('Additional Labour 1')).toBeVisible();
  expect(within(card).getByText('Additional Labour 2')).toBeVisible();
  await user.click(within(card).getByLabelText('Additional Labour 1'));
  await user.click(within(card).getByRole('button', { name: 'Charge selected consoles' }));
  await waitFor(() => expect(runSmallShipMaintenance).toHaveBeenCalledWith(
    'vulcan', 'reactor', 4, { consoles: ['additional-labour-1'] },
  ));
});

it('charges named base Capybara consoles before exposing their production actions', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
    activeRoleIds: ['admiral'], expansion: 'base', capybaraEnabled: true,
    smallShipStates: {
      'capybara-small': {
        id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1,
        population: 2_000, unrest: 0,
        cycle: { step: 4, revision: 4, results: {}, charges: [] },
      },
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(runSmallShipMaintenance).mockImplementation(async (_id, action, expectedRevision, choices) => {
    const session = useSessionStore.getState().session;
    const state = session?.smallShipStates?.['capybara-small'];
    if (!session || !state) throw new Error('Expected the fixture Capybara state.');
    const nextCycle = action === 'reactor'
      ? { ...state.cycle, step: 5, revision: expectedRevision + 1, charges: [...(choices?.consoles ?? [])] }
      : { ...state.cycle, revision: expectedRevision + 1, charges: state.cycle.charges.filter((charge) => charge !== choices?.productionConsoleId) };
    useSessionStore.getState().setSession({
      ...session,
      smallShipStates: { ...session.smallShipStates, 'capybara-small': { ...state, cycle: nextCycle } },
    });
    return { status: 'committed' };
  });
  renderConsole();

  const card = screen.getByRole('region', { name: 'Capybara small-ship operations' });
  await user.click(within(card).getByRole('checkbox', { name: 'Water Reclimator' }));
  await user.click(within(card).getByRole('checkbox', { name: 'Hydroponics' }));
  await user.click(within(card).getByRole('button', { name: 'Charge selected consoles' }));
  await waitFor(() => expect(runSmallShipMaintenance).toHaveBeenCalledWith(
    'capybara-small', 'reactor', 4, { consoles: ['water-reclimator', 'hydroponics'] },
  ));
  await waitFor(() => expect(within(card).getByRole('button', { name: /Run Water Reclimator/ })).toBeEnabled());

  await user.click(within(card).getByRole('button', { name: /Run Water Reclimator/ }));
  await waitFor(() => expect(runSmallShipMaintenance).toHaveBeenLastCalledWith(
    'capybara-small', 'production', 5, { productionConsoleId: 'water-reclimator' },
  ));
});

it('charges and runs the base Capybara Fuel Processor with an explicit ore amount', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
    activeRoleIds: ['admiral'], expansion: 'base', capybaraEnabled: true,
    smallShipStates: {
      'capybara-small': {
        id: 'capybara-small', hostShipId: 'aegis', dockingRevision: 1,
        population: 2_000, unrest: 0,
        cycle: { step: 4, revision: 4, results: {}, charges: [] },
      },
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(runSmallShipMaintenance).mockImplementation(async (_id, action, expectedRevision, choices) => {
    const session = useSessionStore.getState().session;
    const state = session?.smallShipStates?.['capybara-small'];
    if (!session || !state) throw new Error('Expected the fixture Capybara state.');
    const nextCycle = action === 'reactor'
      ? { ...state.cycle, step: 5, revision: expectedRevision + 1, charges: [...(choices?.consoles ?? [])] }
      : { ...state.cycle, revision: expectedRevision + 1, charges: state.cycle.charges.filter((charge) => charge !== choices?.productionConsoleId) };
    useSessionStore.getState().setSession({
      ...session,
      smallShipStates: { ...session.smallShipStates, 'capybara-small': { ...state, cycle: nextCycle } },
    });
    return { status: 'committed' };
  });
  renderConsole();

  const card = screen.getByRole('region', { name: 'Capybara small-ship operations' });
  await user.click(within(card).getByRole('checkbox', { name: 'Fuel Processor' }));
  await user.click(within(card).getByRole('checkbox', { name: 'Water Reclimator' }));
  await user.click(within(card).getByRole('button', { name: 'Charge selected consoles' }));
  await waitFor(() => expect(runSmallShipMaintenance).toHaveBeenCalledWith(
    'capybara-small', 'reactor', 4, { consoles: ['fuel-processor', 'water-reclimator'] },
  ));
  await waitFor(() => expect(within(card).getByRole('button', { name: /Run Fuel Processor/ })).toBeEnabled());

  await user.selectOptions(within(card).getByRole('combobox', { name: 'Fuel Processor ore amount' }), '4');
  await user.click(within(card).getByRole('button', { name: /Run Fuel Processor/ }));
  await waitFor(() => expect(runSmallShipMaintenance).toHaveBeenLastCalledWith(
    'capybara-small', 'production', 5,
    { productionConsoleId: 'fuel-processor', productionOreAmount: 4 },
  ));
});

it('does not advertise extra-ship replacement roles for a duplicate vessel tuple', async () => {
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'gorgoneion', 'gorgoneion'],
    activeRoleIds: ['admiral'], expansion: 'base', smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: null, dockingRevision: 0,
        population: 1000, unrest: 0, cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([{
      uid: 'u2', sessionId: 's1', displayName: 'Ari', role: 'player', seatId: 'admiral',
      assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', connected: false,
      joinedAt: '2026-01-01T00:01:00.000Z',
    }]);
    return vi.fn();
  });
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Facilitator replacement roles' });
  expect(within(panel).queryByRole('option', { name: /Gorgoneion Captain/i })).not.toBeInTheDocument();
  expect(within(panel).getByRole('option', { name: /Wolf Commander/i })).toBeInTheDocument();
});

it('offers the Gorgoneion Captain after GM docking while preserving the core vessel roster', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
    activeRoleIds: ['admiral'], expansion: 'base', capybaraEnabled: true,
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1,
        population: 1_000, unrest: 0, cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([{
      uid: 'u2', sessionId: 's1', displayName: 'Ari', role: 'player', seatId: 'admiral',
      assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', connected: false,
      joinedAt: '2026-01-01T00:01:00.000Z',
    }]);
    return vi.fn();
  });
  renderConsole();

  const panel = await screen.findByRole('region', { name: 'Facilitator replacement roles' });
  expect(within(panel).getByRole('option', { name: /Gorgoneion Captain/i })).toBeInTheDocument();
  expect(useSessionStore.getState().session?.activeVesselIds).toEqual(['aegis']);
});

it('gives the facilitator an authoritative release and reassignment path during casting', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'casting',
    currentTurn: 0,
    activeRoleIds: recommendedRoleIds(8),
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(assignRole).mockResolvedValue('applied');
  vi.mocked(releaseRole).mockResolvedValue('applied');
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([
      {
        uid: 'u2', sessionId: 's1', displayName: 'Ari', role: 'player', seatId: 'admiral',
        assignedRoleId: 'admiral', activeConsoleRoleId: null, joinedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        uid: 'u3', sessionId: 's1', displayName: 'Bea', role: 'player', seatId: null,
        assignedRoleId: null, activeConsoleRoleId: null, joinedAt: '2026-01-01T00:01:00.000Z',
      },
    ]);
    return vi.fn();
  });
  renderConsole();

  const casting = await screen.findByRole('region', { name: /facilitator casting/i });
  await user.click(within(casting).getByRole('button', { name: /release role from ari/i }));
  expect(releaseRole).toHaveBeenCalledWith('u2');

  const roleSelect = within(casting).getByRole('combobox', { name: /role for bea/i });
  await user.selectOptions(roleSelect, 'wing-commander');
  await user.click(within(casting).getByRole('button', { name: /assign role to bea/i }));
  expect(assignRole).toHaveBeenCalledWith('u3', 'wing-commander');
});

it('keeps held core seats and Press stations out of facilitator casting controls', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'casting',
    currentTurn: 0,
    activeRoleIds: recommendedRoleIds(8),
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([
      {
        uid: 'u4', sessionId: 's1', displayName: 'Seatbound', role: 'player', seatId: 'admiral',
        assignedRoleId: null, activeConsoleRoleId: null, joinedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        uid: 'u5', sessionId: 's1', displayName: 'Press holder', role: 'player', seatId: null,
        assignedRoleId: null, activeConsoleRoleId: 'press-officer', joinedAt: '2026-01-01T00:01:00.000Z',
      },
    ]);
    return vi.fn();
  });
  renderConsole();

  const casting = await screen.findByRole('region', { name: /facilitator casting/i });
  expect(within(casting).getByText(/station held.*admiral.*release it before casting/i)).toBeInTheDocument();
  expect(within(casting).getByText(/press station held.*release press on that device/i)).toBeInTheDocument();
  expect(within(casting).queryByRole('button', { name: /assign role to seatbound/i })).not.toBeInTheDocument();
  expect(within(casting).queryByRole('button', { name: /assign role to press holder/i })).not.toBeInTheDocument();
  expect(assignRole).not.toHaveBeenCalled();
  expect(releaseRole).not.toHaveBeenCalled();
});

it('shows fleet DRADIS and jumps between ship perspectives', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const { container } = renderConsole();

  expect(await screen.findByRole('region', { name: /fleet dradis/i })).toBeInTheDocument();
  expect(screen.getByText(/dradis perspective.*aegis/i)).toBeInTheDocument();
  expect(screen.getByText('DRADIS perspective // AEGIS // GALACTIC COORDINATES // 0000'))
    .toBeInTheDocument();
  expect(container.querySelectorAll(
    '.gm-dradis .contact-plot__contact:not([data-ambient="true"]) .contact-plot__range',
  )).toHaveLength(0);
  const aegisScan = container.querySelector('.gm-dradis .contact-plot__rig');

  await user.click(screen.getByRole('button', { name: /view dradis from shepherd/i }));

  expect(screen.getByText(/dradis perspective.*shepherd/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view dradis from shepherd/i }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.gm-dradis .contact-plot__rig')).not.toBe(aegisScan);
});

it('keeps base setup from showing the expansion ship in GM targeting controls', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    playerCount: 8,
    expansion: 'base',
    capybaraEnabled: true,
    activeRoleIds: recommendedRoleIds(8),
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const dradis = await screen.findByRole('region', { name: /fleet dradis/i });
  expect(within(dradis).queryByRole('button', { name: /view dradis from capybara/i }))
    .not.toBeInTheDocument();
  const starmap = screen.getByRole('region', { name: /gm starmap/i });
  expect(within(starmap).queryByRole('option', { name: 'Capybara' })).not.toBeInTheDocument();
});

it('uses the ship-console outline treatment for compact GM DRADIS', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const { container } = renderConsole();

  const dradis = await screen.findByRole('region', { name: /fleet dradis/i });
  const viewport = container.querySelector('.gm-dradis__viewport');

  expect(viewport).toHaveClass('dradis-outline');
  expect(within(dradis).getByText('DRADIS // LOCAL PLOT')).toBeInTheDocument();
});

it('shows the 3D starmap only inside the GM console and follows the organiser chart', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    chartId: 'C', organiserSystems: ORGANISER_SYSTEMS, organiserSites: organiserSitesFor('C'),
  });
  renderConsole();

  const gmMap = await screen.findByRole('region', { name: /gm starmap/i });
  expect(within(gmMap).getByRole('region', { name: '3D starmap' })).toBeInTheDocument();
  expect(within(gmMap).getByText(/FLEET FIX \/\/ 0000/i)).toBeInTheDocument();
  expect(within(gmMap).getByText('Chart C // labelled overlay')).toBeInTheDocument();
  expect(within(gmMap).queryByRole('group', { name: 'Organiser chart' })).not.toBeInTheDocument();
  expect(within(gmMap).getAllByRole('button', { name: /system /i })).toHaveLength(22);

  expect(within(gmMap).getByRole('button', { name: /system 8378.*deep nebula/i })).toBeInTheDocument();

  await user.click(within(gmMap).getByRole('button', { name: /system 8378.*deep nebula/i }));
  expect(within(gmMap).getByRole('region', { name: /selected system readout/i }))
    .toHaveTextContent(/8378.*deep nebula.*new eden candidate/i);
});

it('reuses the shared DRADIS range-display policy for the GM plot', () => {
  const console = readFileSync('src/routes/GmConsole.tsx', 'utf8');
  const shipPlot = readFileSync('src/components/ShipPlot.tsx', 'utf8');

  expect(console).toContain('layout="gm"');
  expect(shipPlot).toMatch(/color: ship\.color,\s+combatRange: ship\.combatRange,\s+showCombatRange: ship\.showCombatRange,/);
});

it('shows live resource stock for every flagged ship', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    shipResources: {
      ...INITIAL_SHIP_RESOURCES,
      dione: { ...INITIAL_SHIP_RESOURCES.dione!, fuel: 6 },
    },
    shipUnrest: { dione: 4 },
  });
  renderConsole();

  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  for (const shipName of [
    'AEGIS', 'Dione', 'Icebreaker', 'Capybara', 'Shepherd', 'Quellon', 'Refinery 124',
  ]) {
    const ship = within(fleet).getByRole('group', { name: `${shipName} resource controls` });
    expect(within(ship).getByRole('img', { name: `${shipName} flag` })).toBeInTheDocument();
  }
  const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
  expect(within(dione).getByRole('heading', { name: 'Census' })).toBeInTheDocument();
  expect(within(dione).getByLabelText('Strytium Fuel: 6')).toBeInTheDocument();
  expect(within(dione).getByRole('img', { name: 'Strytium Fuel icon' })).toBeInTheDocument();
  expect(within(dione).getByLabelText('Civil Unrest: 4')).toBeInTheDocument();
  expect(within(dione).getByRole('img', { name: 'Civil Unrest icon' })).toBeInTheDocument();
  expect(within(dione).getByLabelText('Survivor Population: 100000')).toBeInTheDocument();
  expect(within(dione).getByRole('button', { name: /increase survivor population/i }))
    .toBeDisabled();
  expect(within(dione).getByRole('button', { name: /increase strytium fuel/i })).toBeDisabled();
  expect(within(dione).getByRole('button', { name: /decrease survivor population/i }))
    .toBeDisabled();
  expect(within(dione).getByRole('button', { name: /increase civil unrest/i })).toBeDisabled();

  await user.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));

  expect(within(dione).getByRole('button', { name: /decrease survivor population/i }))
    .toBeEnabled();
  expect(within(dione).getByRole('button', { name: /increase civil unrest/i })).toBeEnabled();
});

it('keeps fighter counts read-only until GM write mode and sends one wing correction', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    activeVesselIds: ['aegis'],
    shipUpgrades: { aegis: [] },
    fighterWingCounts: Object.fromEntries(FIGHTER_WING_IDS.map((wingId) => [wingId, { count: 4, revision: 0 }])),
  });
  vi.mocked(setFighterWingCount).mockResolvedValue({
    status: 'committed', wingId: 'fighter-wing-alpha', count: 3, revision: 1, capacity: 4,
  });
  renderConsole();

  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  const aegis = within(fleet).getByRole('group', { name: 'AEGIS resource controls' });
  const alpha = within(aegis).getByRole('listitem', { name: /fighter-wing-alpha fighter count 4/i });
  expect(within(alpha).getByRole('button', { name: /apply fighter-wing-alpha fighter count/i })).toBeDisabled();

  await user.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
  const input = within(alpha).getByRole('spinbutton', { name: /set fighter-wing-alpha fighter count/i });
  await user.clear(input);
  await user.type(input, '3');
  await user.click(within(alpha).getByRole('button', { name: /apply fighter-wing-alpha fighter count/i }));

  expect(setFighterWingCount).toHaveBeenCalledWith('fighter-wing-alpha', 3);
});

it('keeps the proposed count visible and supports an explicit retry after a stale live count', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    activeVesselIds: ['aegis'],
    shipUpgrades: { aegis: [] },
    fighterWingCounts: Object.fromEntries(FIGHTER_WING_IDS.map((wingId) => [wingId, { count: 4, revision: 0 }])),
  });

  let attempts = 0;
  vi.mocked(setFighterWingCount).mockImplementation(async (wingId, count) => {
    attempts += 1;
    const current = useSessionStore.getState().session;
    if (!current) throw new Error('Expected the test session.');
    if (attempts === 1) {
      useSessionStore.getState().setSession({
        ...current,
        shipUpgrades: { ...current.shipUpgrades, aegis: ['construction-bay'] },
        fighterWingCounts: {
          ...current.fighterWingCounts,
          [wingId]: { count: 6, revision: 2 },
        },
      });
      return { status: 'stale', wingId, count: 5, currentRevision: 1, revision: 1, capacity: 6 };
    }
    useSessionStore.getState().setSession({
      ...current,
      fighterWingCounts: {
        ...current.fighterWingCounts,
        [wingId]: { count, revision: 3 },
      },
    });
    return { status: 'committed', wingId, count, revision: 3, capacity: 6 };
  });

  renderConsole();
  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  const aegis = within(fleet).getByRole('group', { name: 'AEGIS resource controls' });
  await user.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
  let alpha = within(aegis).getByRole('listitem', { name: /fighter-wing-alpha fighter count 4/i });
  let input = within(alpha).getByRole('spinbutton', { name: /set fighter-wing-alpha fighter count/i });
  await user.clear(input);
  await user.type(input, '3');
  await user.click(within(alpha).getByRole('button', { name: /apply fighter-wing-alpha fighter count/i }));

  expect(await screen.findByText('STALE // live count 6 / 6; draft preserved. Apply again to retry.'))
    .toBeInTheDocument();
  alpha = within(aegis).getByRole('listitem', { name: /fighter-wing-alpha fighter count 6/i });
  input = within(alpha).getByRole('spinbutton', { name: /set fighter-wing-alpha fighter count/i });
  expect(input).toHaveValue(3);
  const retry = within(alpha).getByRole('button', { name: /apply fighter-wing-alpha fighter count/i });
  expect(retry).toBeEnabled();
  await user.click(retry);

  expect(await within(aegis).findByRole('listitem', { name: /fighter-wing-alpha fighter count 3/i }))
    .toBeInTheDocument();
  expect(setFighterWingCount).toHaveBeenNthCalledWith(1, 'fighter-wing-alpha', 3);
  expect(setFighterWingCount).toHaveBeenNthCalledWith(2, 'fighter-wing-alpha', 3);
  expect(screen.queryByText(/draft preserved/)).not.toBeInTheDocument();
});

it('shows the authoritative group pursuit beneath every grouped ship resource control', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 4,
    pursuitGroups: { 'fleet-1': 2 },
    shipFleetGroupIds: Object.fromEntries([
      'aegis', 'dione', 'icebreaker', 'capybara', 'shepherd', 'quellon', 'refinery-124',
    ].map((shipId) => [shipId, 'fleet-1'])),
    shipGalacticCoordinates: {
      aegis: '0000',
      dione: '5143',
      icebreaker: '6837',
      capybara: '8378',
      shepherd: '0000',
      quellon: '1096',
      'refinery-124': '0408',
    },
    pursuitDistances: {
      aegis: 0, dione: 1, icebreaker: 2, capybara: 6,
      shepherd: 0, quellon: 4, 'refinery-124': 7,
    },
    fleetRedAlert: { active: true, revision: 1 },
  });
  renderConsole();

  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  const expectedTrackByShip = [
    ['AEGIS', 'Start system', '2 / 10'],
    ['Dione', '-1 pursuit distance', '2 / 10'],
    ['Icebreaker', '-2 pursuit distance', '2 / 10'],
    ['Capybara', '-6 pursuit distance', '2 / 10'],
    ['Shepherd', 'Start system', '2 / 10'],
    ['Quellon', '-4 pursuit distance', '2 / 10'],
    ['Refinery 124', '-7 pursuit distance', '2 / 10'],
  ] as const;

  for (const [shipName, distance, track] of expectedTrackByShip) {
    const ship = within(fleet).getByRole('group', { name: `${shipName} resource controls` });
    const tracker = within(ship).getByRole('region', { name: 'Pursuit tracker' });

    expect(tracker).toHaveTextContent(`Distance from Home Systems // ${distance}`);
    expect(tracker).toHaveTextContent(`Current track // ${track}`);
    expect(tracker).not.toHaveTextContent('Map depth is shared; position is ship-local.');
    expect(tracker).toHaveAttribute('data-red-alert', 'true');
    expect(tracker).toHaveTextContent('RED ALERT ACTIVE');
    expect(ship.lastElementChild).toBe(tracker);
  }
});

it('keeps resource stores read-only until enabled and resets after leaving', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
  const writeMode = within(fleet).getByRole('button', { name: /ship numbers write mode/i });
  const increaseFuel = within(dione).getByRole('button', { name: /increase strytium fuel/i });

  expect(writeMode).toHaveAttribute('aria-pressed', 'false');
  expect(within(fleet).getByText(/ship number access.*read only/i)).toBeInTheDocument();
  expect(increaseFuel).toBeDisabled();

  await user.click(writeMode);
  expect(writeMode).toHaveAttribute('aria-pressed', 'true');
  expect(within(fleet).getByText(/ship number access.*write mode/i)).toBeInTheDocument();
  expect(increaseFuel).toBeEnabled();

  await user.click(screen.getByRole('link', { name: /back to role selection/i }));
  await user.click(screen.getByRole('link', { name: /return to gm console/i }));

  const returnedFleet = await screen.findByRole('region', { name: /fleet resource controls/i });
  expect(within(returnedFleet).getByRole('button', { name: /ship numbers write mode/i }))
    .toHaveAttribute('aria-pressed', 'false');
  expect(within(
    within(returnedFleet).getByRole('group', { name: 'Dione resource controls' }),
  ).getByRole('button', { name: /increase strytium fuel/i })).toBeDisabled();
});

it('transfers every retained store only to a living ship in the same fleet group', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active',
    activeVesselIds: ['aegis', 'dione', 'capybara'],
    shipFleetGroupIds: { aegis: 'fleet-1', dione: 'fleet-1', capybara: 'fleet-2' },
    shipDamage: {
      aegis: { damagedSystemIds: [], destroyed: true },
      dione: { damagedSystemIds: [], destroyed: false },
      capybara: { damagedSystemIds: [], destroyed: false },
    },
    shipResources: {
      ...INITIAL_SHIP_RESOURCES,
      aegis: { ore: 2, fuel: 3, food: 0, water: 1, materials: 4, securityTeams: 1 },
    },
  });
  vi.mocked(scavengeDestroyedShipStores).mockResolvedValue({
    status: 'committed', sourceShipId: 'aegis', transfers: [], inventories: {}, revisions: {},
    actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 0, phase: 'active',
    revision: 5, idempotencyKey: 'scavenge-1', auditId: 'scavenge-scavenge-1',
  });
  renderConsole();

  const aegis = await screen.findByRole('group', { name: 'AEGIS resource controls' });
  const recipient = within(aegis).getByRole('combobox', { name: 'AEGIS store recipient' });
  expect(recipient).toHaveValue('dione');
  expect(within(recipient).getByRole('option', { name: 'Dione' })).toBeInTheDocument();
  expect(within(recipient).queryByRole('option', { name: 'Capybara' })).not.toBeInTheDocument();

  await user.click(within(aegis).getByRole('button', { name: 'Transfer all retained stores' }));
  expect(scavengeDestroyedShipStores).toHaveBeenCalledWith('aegis', {
    dione: { ore: 2, fuel: 3, water: 1, materials: 4, securityTeams: 1 },
  });
  expect(await within(aegis).findByText('All retained stores transferred and reconciled.'))
    .toBeInTheDocument();
});

it('updates a GM counter immediately and sends rapid changes in one ordered batch', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    shipResources: {
      ...INITIAL_SHIP_RESOURCES,
      dione: { ...INITIAL_SHIP_RESOURCES.dione!, fuel: 6 },
    },
  });
  renderConsole();
  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });

  vi.useFakeTimers();
  try {
    const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
    fireEvent.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
    const increaseFuel = within(dione).getByRole('button', { name: /increase strytium fuel/i });
    fireEvent.click(increaseFuel);
    fireEvent.click(increaseFuel);
    fireEvent.click(increaseFuel);

    expect(within(dione).getByLabelText('Strytium Fuel: 9, pending transmission')).toBeInTheDocument();
    expect(applyShipCounterSteps).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(250); });

    expect(applyShipCounterSteps).toHaveBeenCalledTimes(1);
    expect(applyShipCounterSteps).toHaveBeenCalledWith(
      'dione', { counter: 'resource', resourceId: 'fuel' }, [1, 1, 1],
    );
  } finally {
    vi.useRealTimers();
  }
});

it('keeps stale GM counter steps for an explicit retry against the refreshed value', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    vesselActionRevisions: { dione: 0 },
    shipResources: {
      ...INITIAL_SHIP_RESOURCES,
      dione: { ...INITIAL_SHIP_RESOURCES.dione!, fuel: 6 },
    },
  });
  vi.mocked(applyShipCounterSteps)
    .mockImplementationOnce(async () => {
      const current = useSessionStore.getState().session;
      if (current) useSessionStore.getState().setSession({
        ...current,
        vesselActionRevisions: { ...current.vesselActionRevisions, dione: 2 },
        shipResources: {
          ...current.shipResources,
          dione: { ...INITIAL_SHIP_RESOURCES.dione!, fuel: 7 },
        },
      });
      return { status: 'stale', amount: 7, alertRaised: false, revision: 2, currentRevision: 2 } as never;
    })
    .mockImplementationOnce(async () => {
      const current = useSessionStore.getState().session;
      if (current) useSessionStore.getState().setSession({
        ...current,
        vesselActionRevisions: { ...current.vesselActionRevisions, dione: 3 },
        shipResources: {
          ...current.shipResources,
          dione: { ...INITIAL_SHIP_RESOURCES.dione!, fuel: 8 },
        },
      });
      return { amount: 8, alertRaised: false, revision: 3 } as never;
    });
  const view = renderConsole();
  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });

  vi.useFakeTimers();
  try {
    const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
    fireEvent.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
    fireEvent.click(within(dione).getByRole('button', { name: /increase strytium fuel/i }));
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(dione).getByLabelText('Strytium Fuel: current 7, proposed 8, stale changes ready to retry')).toBeInTheDocument();
    expect(within(dione).getByText('Current amount: 7; proposed after steps: 8')).toBeInTheDocument();
    expect(within(dione).getByRole('status')).toHaveTextContent(/counter changed while these steps were pending/i);
    expect(within(dione).getByRole('button', { name: /retry.*fuel/i })).toBeEnabled();
    expect(applyShipCounterSteps).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(applyShipCounterSteps).toHaveBeenCalledTimes(1);
    renderConsole();
    const restoredFleet = screen.getByRole('region', { name: /fleet resource controls/i });
    const restoredDione = within(restoredFleet).getByRole('group', { name: 'Dione resource controls' });
    fireEvent.click(within(restoredFleet).getByRole('button', { name: /ship numbers write mode/i }));
    expect(within(restoredDione).getByRole('button', { name: /retry.*fuel/i })).toBeEnabled();
    expect(within(restoredDione).getByRole('button', { name: /discard.*fuel/i })).toBeEnabled();

    fireEvent.click(within(restoredDione).getByRole('button', { name: /retry.*fuel/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(applyShipCounterSteps).toHaveBeenCalledTimes(2);
    expect(applyShipCounterSteps).toHaveBeenLastCalledWith(
      'dione', { counter: 'resource', resourceId: 'fuel' }, [1],
    );
    expect(within(restoredDione).getByLabelText('Strytium Fuel: 8')).toBeInTheDocument();
    expect(within(restoredDione).queryByRole('button', { name: /retry.*fuel/i })).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
    vi.mocked(applyShipCounterSteps).mockReset();
  }
});

it('keeps stale counter input when an alert blocks retry until a fresh snapshot', async () => {
  const sessionId = 'stale-counter-alert-refresh';
  const current = useSessionStore.getState();
  useSessionStore.getState().setIdentity(
    { ...current.session!, id: sessionId, updatedAt: '2026-01-01T00:00:00.000Z' },
    { ...current.me!, sessionId },
  );
  const instance = { ...local, sessionId };
  useSessionStore.getState().setGmInstance(instance);
  streamInstances([instance]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active',
    vesselActionRevisions: { dione: 0 },
    shipUnrest: { dione: 7 },
  });
  const initialSnapshot = useSessionStore.getState().session!;
  expect(acceptCallableSessionAuthority(initialSnapshot, 'u1')).toBe(true);
  vi.mocked(applyShipCounterSteps)
    .mockImplementationOnce(async () => {
      const current = useSessionStore.getState().session;
      if (current) useSessionStore.getState().setSession({
        ...current,
        vesselActionRevisions: { ...current.vesselActionRevisions, dione: 2 },
        shipUnrest: { ...current.shipUnrest, dione: 8 },
      });
      return {
        status: 'stale', amount: 8, alertRaised: false, revision: 2,
        currentRevision: 2, retryBlockedByAlert: true,
      } as never;
    })
    .mockRejectedValueOnce(new Error('The current unrest alert must be dismissed first.'));
  const view = renderConsole();
  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });

  vi.useFakeTimers();
  try {
    const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
    fireEvent.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
    fireEvent.click(within(dione).getByRole('button', { name: /decrease civil unrest/i }));
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    const retry = within(dione).getByRole('button', { name: /retry.*unrest/i });
    expect(within(dione).getByText('Current amount: 8; proposed after steps: 7')).toBeInTheDocument();
    expect(retry).toBeDisabled();

    const beforeRetry = useSessionStore.getState().session!;
    const refreshedAfterAlert = {
      ...beforeRetry,
      updatedAt: '2026-09-23T10:01:00.000Z',
      vesselActionRevisions: { ...beforeRetry.vesselActionRevisions, dione: 2 },
      unrestAlerts: {},
    };
    expect(acceptCallableSessionAuthority(refreshedAfterAlert, 'u1')).toBe(true);
    await act(async () => useSessionStore.getState().setSession({
      ...refreshedAfterAlert,
    }));
    expect(within(dione).getByRole('button', { name: /retry.*unrest/i })).toBeEnabled();

    await act(async () => {
      fireEvent.click(within(dione).getByRole('button', { name: /retry.*unrest/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(within(dione).getByRole('status')).toHaveTextContent(/retry is paused/i);
    expect(within(dione).getByRole('button', { name: /retry.*unrest/i })).toBeDisabled();
    expect(applyShipCounterSteps).toHaveBeenCalledTimes(2);

    const afterRejection = useSessionStore.getState().session!;
    const refreshedAfterRejection = {
      ...afterRejection,
      updatedAt: '2026-09-23T10:02:00.000Z',
      vesselActionRevisions: { ...afterRejection.vesselActionRevisions, dione: 2 },
      unrestAlerts: {},
    };
    expect(acceptCallableSessionAuthority(refreshedAfterRejection, 'u1')).toBe(true);
    await act(async () => useSessionStore.getState().setSession({
      ...refreshedAfterRejection,
    }));
    expect(within(dione).getByRole('button', { name: /retry.*unrest/i })).toBeEnabled();
    fireEvent.click(within(dione).getByRole('button', { name: /discard.*unrest/i }));
    expect(within(dione).queryByRole('button', { name: /retry.*unrest/i })).not.toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
    vi.mocked(applyShipCounterSteps).mockReset();
  }
});

it('uses a newer alert-free snapshot that arrives before the stale response', async () => {
  const sessionId = 'stale-counter-snapshot-first';
  const current = useSessionStore.getState();
  useSessionStore.getState().setIdentity(
    { ...current.session!, id: sessionId, updatedAt: '2026-01-01T00:00:00.000Z' },
    { ...current.me!, sessionId },
  );
  const instance = { ...local, sessionId };
  useSessionStore.getState().setGmInstance(instance);
  streamInstances([instance]);
  const activeSession = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active',
    vesselActionRevisions: { dione: 0 },
    shipUnrest: { dione: 7 },
  });
  const initialSnapshot = useSessionStore.getState().session!;
  expect(acceptCallableSessionAuthority(initialSnapshot, 'u1')).toBe(true);
  let completeStale!: () => void;
  vi.mocked(applyShipCounterSteps).mockImplementationOnce(() => new Promise((resolve) => {
    completeStale = () => resolve({
      status: 'stale', amount: 8, alertRaised: false, revision: 2,
      currentRevision: 2, retryBlockedByAlert: true,
    } as never);
  }));
  const view = renderConsole();
  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });

  vi.useFakeTimers();
  try {
    const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
    fireEvent.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
    fireEvent.click(within(dione).getByRole('button', { name: /decrease civil unrest/i }));
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(applyShipCounterSteps).toHaveBeenCalledTimes(1);

    const beforeSnapshot = useSessionStore.getState().session!;
    const newerSnapshot = {
      ...beforeSnapshot,
      updatedAt: '2026-09-23T10:05:00.000Z',
      vesselActionRevisions: { ...beforeSnapshot.vesselActionRevisions, dione: 3 },
      shipUnrest: { ...beforeSnapshot.shipUnrest, dione: 9 },
      unrestAlerts: {},
    };
    expect(acceptCallableSessionAuthority(newerSnapshot, 'u1')).toBe(true);
    await act(async () => {
      useSessionStore.getState().setSession(newerSnapshot);
    });
    await act(async () => {
      completeStale();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(dione).getByText('Current amount: 9; proposed after steps: 8')).toBeInTheDocument();
    expect(within(dione).getByRole('button', { name: /retry.*unrest/i })).toBeEnabled();
    fireEvent.click(within(dione).getByRole('button', { name: /discard.*unrest/i }));
  } finally {
    view.unmount();
    vi.useRealTimers();
    vi.mocked(applyShipCounterSteps).mockReset();
  }
});

it('keeps a locally crossed threshold locked until its alert reaches the session snapshot', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({
    ...activeSession,
    shipUnrest: { dione: 7 },
  });
  vi.mocked(applyShipCounterSteps).mockImplementation(async () => {
    const current = useSessionStore.getState().session;
    if (current) useSessionStore.getState().setSession({
      ...current,
      shipUnrest: { ...current.shipUnrest, dione: 8 },
    });
    return { amount: 8, alertRaised: true } as never;
  });
  renderConsole();
  const fleet = await screen.findByRole('region', { name: /fleet resource controls/i });

  vi.useFakeTimers();
  try {
    const dione = within(fleet).getByRole('group', { name: 'Dione resource controls' });
    fireEvent.click(within(fleet).getByRole('button', { name: /ship numbers write mode/i }));
    const increaseUnrest = within(dione).getByRole('button', { name: /increase civil unrest/i });
    fireEvent.click(increaseUnrest);

    expect(within(dione).getByLabelText('Civil Unrest: 8, pending transmission')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(dione).getByLabelText('Civil Unrest: 8')).toBeInTheDocument();
    expect(within(dione).getByRole('button', { name: /increase civil unrest/i })).toBeDisabled();
    expect(within(dione).getByRole('button', { name: /decrease civil unrest/i })).toBeDisabled();
  } finally {
    vi.useRealTimers();
  }
});

it('starts with a compact DRADIS and expands it on demand', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const dradis = await screen.findByRole('region', { name: /fleet dradis/i });
  expect(dradis).toHaveAttribute('data-expanded', 'false');
  expect(screen.queryByRole('complementary', { name: 'Combat range bands' }))
    .not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /zoom into dradis panel/i }));

  expect(dradis).toHaveAttribute('data-expanded', 'true');
  expect(screen.getByRole('button', { name: /close dradis/i })).toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Combat range bands' }))
    .not.toBeInTheDocument();
});

it('keeps each airspace-window countdown in compact and expanded fleet DRADIS', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 1,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as never);
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  expect(await screen.findByRole('status', {
    name: /Airspace closed \/\/ \d{2}:\d{2} remaining/i,
  })).toHaveAttribute('data-tone', 'blue');
  fireEvent.click(screen.getByRole('button', { name: /zoom into dradis panel/i }));
  expect(screen.getByRole('status', {
    name: /Airspace closed \/\/ \d{2}:\d{2} remaining/i,
  })).toHaveAttribute('data-tone', 'blue');

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  }));

  expect(screen.getByRole('status', {
    name: /Airspace open \/\/ \d{2}:\d{2} remaining/i,
  })).toHaveAttribute('data-tone', 'blue');
});

it('lets the active GM trigger a fleetwide contact only from expanded DRADIS', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setConnection('live');
  streamInstances([local]);
  vi.mocked(triggerDradisContact).mockResolvedValue(undefined);
  renderConsole();

  await screen.findByRole('region', { name: /fleet dradis/i });
  expect(screen.queryByRole('button', { name: /trigger unknown contact/i }))
    .not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /zoom into dradis panel/i }));
  await user.click(screen.getByRole('button', { name: /trigger unknown contact/i }));

  expect(triggerDradisContact).toHaveBeenCalledOnce();
});

it('eases the GM DRADIS through both expansion and collapse', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const dradis = await screen.findByRole('region', { name: /fleet dradis/i });
  const compact = { left: 600, top: 180, width: 320, height: 420 } as DOMRect;
  const expanded = { left: 0, top: 0, width: 1200, height: 800 } as DOMRect;
  const measure = vi.spyOn(dradis, 'getBoundingClientRect')
    .mockReturnValueOnce(compact)
    .mockReturnValueOnce(expanded)
    .mockReturnValueOnce(expanded)
    .mockReturnValueOnce(compact);
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
  Object.defineProperty(dradis, 'animate', { configurable: true, value: animate });

  await user.click(screen.getByRole('button', { name: /zoom into dradis panel/i }));

  expect(animate).toHaveBeenNthCalledWith(1, [
    { transform: 'translate(600px, 180px) scale(0.26666666666666666, 0.525)' },
    { transform: 'none' },
  ], { duration: 200, easing: 'ease-in-out' });

  await user.click(screen.getByRole('button', { name: /close dradis/i }));

  expect(cancel).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenNthCalledWith(2, [
    { transform: 'translate(-600px, -180px) scale(3.75, 1.9047619047619047)' },
    { transform: 'none' },
  ], { duration: 200, easing: 'ease-in-out' });
  expect(measure).toHaveBeenCalledTimes(4);
});

it('keeps Capybara convoy setup under a GM Console Setup subsection', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const setup = await screen.findByRole('button', { name: /^setup$/i });
  expect(setup).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: /disable capybara/i })).not.toBeInTheDocument();

  await user.click(setup);

  expect(setup).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: /disable capybara/i })).toBeInTheDocument();
});

it.each([
  { pressEnabled: true, pressClaimed: true, liveInstances: [local] },
  { pressEnabled: false, pressClaimed: false, liveInstances: [local, other] },
])('shows the same copy-only Capybara balance guidance regardless of Press occupancy or GM count', async ({
  pressEnabled, pressClaimed, liveInstances,
}) => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances(liveInstances);
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected a session fixture.');
  useSessionStore.getState().setSession({
    ...activeSession,
    activeRoleIds: recommendedRoleIds(19),
    expansion: 'capybara',
    capybaraEnabled: true,
    pressEnabled,
    pressClaimed,
  });

  renderConsole();

  expect(await screen.findByText(/Capybara balance/)).toHaveTextContent(
    'Capybara balance // Consider +6 Wolf damage capacity per attack. '
    + 'The facilitator chooses the adjustment; this reminder does not change attacks.',
  );
  expect(setWolfAttackWindow).not.toHaveBeenCalled();
  expect(stageWolfAttackPreparation).not.toHaveBeenCalled();
  expect(declareWolfAttack).not.toHaveBeenCalled();
});

it('does not show Capybara expansion balance guidance for the base Capybara configuration', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected a session fixture.');
  useSessionStore.getState().setSession({
    ...activeSession,
    activeRoleIds: recommendedRoleIds(18),
    expansion: 'base',
    capybaraEnabled: true,
    pressEnabled: true,
    pressClaimed: true,
  });

  renderConsole();

  await screen.findByRole('region', { name: /fleet dradis/i });
  expect(screen.queryByText(/Capybara balance/)).not.toBeInTheDocument();
});

it('gives an authorized GM a deliberate Press availability control', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  vi.mocked(setPressEnabled).mockResolvedValue('applied');
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /disable press/i }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent(/disable.*press/i);
  const confirm = screen.getByRole('button', { name: /are you sure.*disable press/i });
  expect(confirm).toHaveClass('cic-action-button--confirm');
  await user.click(confirm);

  expect(setPressEnabled).toHaveBeenCalledWith(false);
  expect(screen.getByRole('status', { name: /press gm projection/i }))
    .toHaveTextContent(/2 active gm instances/i);
});

it('shows server-committed Press state and accepts a second GM update independently', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  vi.mocked(setPressEnabled).mockImplementation(async (enabled) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) {
      useSessionStore.getState().setSession({
        ...activeSession,
        pressEnabled: enabled,
        pressAvailabilityRevision: (activeSession.pressAvailabilityRevision ?? 0) + 1,
      });
    }
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const pressToggle = screen.getByRole('button', { name: /disable press/i });
  await user.click(pressToggle);
  await user.click(screen.getByRole('button', { name: /are you sure.*disable press/i }));

  expect(await screen.findByRole('status', { name: /press availability status/i }))
    .toHaveAttribute('data-state', 'committed');
  expect(screen.getByRole('button', { name: /enable press/i })).toHaveTextContent(/offline/i);

  act(() => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) useSessionStore.getState().setSession({
      ...activeSession,
      pressEnabled: true,
      pressAvailabilityRevision: (activeSession.pressAvailabilityRevision ?? 0) + 1,
    });
  });
  expect(screen.getByRole('button', { name: /disable press/i })).toHaveTextContent(/available/i);
});

it('announces Press availability while pending and after a stale CAS rejection', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  let resolveChange: ((value: 'applied') => void) | undefined;
  vi.mocked(setPressEnabled).mockImplementation(() => new Promise((resolve) => {
    resolveChange = resolve;
  }));
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /disable press/i }));
  await user.click(screen.getByRole('button', { name: /are you sure.*disable press/i }));
  expect(screen.getByRole('status', { name: /press availability status/i }))
    .toHaveAttribute('data-state', 'pending');
  resolveChange?.('applied');
  await waitFor(() => expect(screen.getByRole('status', { name: /press availability status/i }))
    .toHaveAttribute('data-state', 'committed'));

  vi.mocked(setPressEnabled).mockRejectedValueOnce({
    code: 'functions/failed-precondition',
    message: 'Press availability changed. Wait for the live update and try again.',
    details: { commandError: 'stale-revision' },
  });
  await user.click(screen.getByRole('button', { name: /disable press/i }));
  await user.click(screen.getByRole('button', { name: /are you sure.*disable press/i }));
  expect(await screen.findByRole('status', { name: /press availability status/i }))
    .toHaveAttribute('data-state', 'stale');
});

it('announces a non-CAS Press rejection as rejected', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setPressEnabled).mockRejectedValueOnce({
    code: 'functions/permission-denied',
    message: 'This GM instance is no longer active.',
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /disable press/i }));
  await user.click(screen.getByRole('button', { name: /are you sure.*disable press/i }));

  expect(await screen.findByRole('status', { name: /press availability status/i }))
    .toHaveAttribute('data-state', 'rejected');
});

it('traps Press confirmation focus, cancels on Escape, and restores the trigger focus', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const trigger = screen.getByRole('button', { name: /disable press/i });
  await user.click(trigger);
  const dialog = screen.getByRole('alertdialog', { name: /change press availability/i });
  const cancel = within(dialog).getByRole('button', { name: /cancel press change/i });
  const confirm = within(dialog).getByRole('button', { name: /are you sure.*disable press/i });
  expect(cancel).toHaveFocus();
  await user.tab();
  expect(confirm).toHaveFocus();
  await user.tab();
  expect(cancel).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog', { name: /change press availability/i }))
    .not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('keeps roster edits local until the GM confirms one complete configuration', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(confirmSetup).mockImplementation(async (setup) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) useSessionStore.getState().setSession({
      ...activeSession,
      activeRoleIds: setup.activeRoleIds,
      playerCount: setup.playerCount,
      chartId: setup.chartId,
      expansion: setup.expansion,
      turnLimit: setup.turnLimit,
      dioneEnabled: setup.dioneEnabled,
      capybaraEnabled: setup.capybaraEnabled,
    });
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const playerCount = screen.getByRole('combobox', { name: /^recommended player count$/i });
  expect(screen.getByText(/edit the roster locally, then confirm it once/i)).toBeInTheDocument();
  expect(screen.getByText(/union replacements are available only in their printed low-count roster rows/i)).toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: /press officer role availability/i }))
    .not.toBeInTheDocument();
  expect(screen.queryByRole('switch', {
    name: /quellon \/ refinery engineer role availability/i,
  })).not.toBeInTheDocument();

  await user.selectOptions(playerCount, '14');
  expect(confirmSetup).not.toHaveBeenCalled();
  expect(screen.getByText(/unconfirmed changes/i)).toBeInTheDocument();
  expect(screen.getByRole('switch', {
    name: /quellon \/ refinery engineer role availability/i,
  })).toBeChecked();
  for (const switchControl of screen.getAllByRole('switch', {
    name: /^engineer role availability$/i,
  })) {
    expect(switchControl).not.toBeChecked();
  }

  await user.selectOptions(playerCount, '19');
  expect(confirmSetup).not.toHaveBeenCalled();
  expect(screen.getByText('Unconfirmed changes // 19 roles staged')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /capybara captain role availability/i }))
    .toBeChecked();
  expect(screen.getByRole('switch', { name: /capybara recycler role availability/i }))
    .toBeChecked();

  await user.selectOptions(playerCount, '20');
  expect(screen.queryByRole('switch', {
    name: /quellon \/ refinery engineer role availability/i,
  })).not.toBeInTheDocument();

  await user.click(screen.getByRole('switch', { name: /executive officer role availability/i }));
  expect(confirmSetup).not.toHaveBeenCalled();
  expect(screen.getByText(/^custom$/i)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /confirm roster/i }));
  expect(confirmSetup).toHaveBeenCalledOnce();
  const confirmedRoleIds = vi.mocked(confirmSetup).mock.calls[0]?.[0]?.activeRoleIds ?? [];
  expect(confirmedRoleIds).toEqual(expect.arrayContaining(
    recommendedRoleIds(20).filter((roleId) => roleId !== 'executive-officer'),
  ));
  expect(confirmedRoleIds).toHaveLength(19);
  expect(confirmedRoleIds).not.toContain('executive-officer');
  await waitFor(() => expect(screen.getByText(/roster synchronized/i)).toBeInTheDocument());
});

it('explains every supported roster effect before the facilitator locks setup', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const playerCount = screen.getByRole('combobox', { name: /^recommended player count$/i });
  expect(within(playerCount).getAllByRole('option').map((option) => option.textContent)).toEqual([
    'Custom roster',
    ...Array.from({ length: 13 }, (_, offset) => `${offset + 8} players`),
  ]);

  await user.selectOptions(playerCount, '8');
  let effects = screen.getByRole('region', { name: /configuration effects before lock/i });
  expect(effects).toHaveTextContent('DioneUnavailable below 12 players');
  expect(effects).toHaveTextContent('Wolf pool1 private Wolf card');
  expect(effects).toHaveTextContent(/Union.*printed replacement stations/i);
  expect(effects).toHaveTextContent('ExpansionBase Capybara configuration');

  await user.selectOptions(playerCount, '14');
  effects = screen.getByRole('region', { name: /configuration effects before lock/i });
  expect(effects).toHaveTextContent('DioneIn convoy');
  expect(effects).toHaveTextContent('Wolf pool2 private Wolf cards');

  await user.selectOptions(playerCount, '19');
  effects = screen.getByRole('region', { name: /configuration effects before lock/i });
  expect(effects).toHaveTextContent('ExpansionFull Capybara expansion');
  expect(effects).toHaveTextContent('Capybara Captain and Recycler roles staged');
});

it('stages one explicit optional loyalty mode and blocks Wolf Cult below two-Wolf rows', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(confirmSetup).mockResolvedValue('applied');
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const playerCount = screen.getByRole('combobox', { name: /^recommended player count$/i });
  await user.selectOptions(playerCount, '14');
  const arbour = screen.getByRole('button', { name: /enable universal arbour/i });
  const cult = screen.getByRole('button', { name: /enable wolf cult/i });
  await user.click(arbour);
  expect(arbour).toHaveAttribute('aria-pressed', 'true');
  await user.click(cult);
  expect(cult).toHaveAttribute('aria-pressed', 'true');
  expect(arbour).toHaveAttribute('aria-pressed', 'false');
  await user.click(screen.getByRole('button', { name: /confirm roster/i }));
  expect(confirmSetup).toHaveBeenCalledWith(expect.objectContaining({
    universalArbourEnabled: false,
    wolfCultEnabled: true,
  }));

  await user.selectOptions(playerCount, '13');
  expect(screen.getByRole('button', { name: /enable wolf cult/i })).toBeDisabled();
});

it('lets the facilitator clear Wolf Cult after a custom roster drops below two-Wolf rows', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(confirmSetup).mockResolvedValue('applied');
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const playerCount = screen.getByRole('combobox', { name: /^recommended player count$/i });
  await user.selectOptions(playerCount, '14');
  const cult = screen.getByRole('button', { name: /enable wolf cult/i });
  await user.click(cult);
  const firstRoleSwitch = screen.getAllByRole('switch', { name: /role availability/i })[0];
  if (!firstRoleSwitch) throw new Error('Expected an active role switch.');
  await user.click(firstRoleSwitch);

  const stagedCult = screen.getByRole('button', { name: /disable wolf cult/i });
  expect(stagedCult).toBeEnabled();
  await user.click(stagedCult);
  expect(stagedCult).toHaveAttribute('aria-pressed', 'false');
});

it('stages a correction when an older roster has an invalid Union replacement', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    activeRoleIds: [...recommendedRoleIds(20), 'joint-engineering-quellon-refinery'],
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));

  expect(screen.getByText(/unconfirmed changes/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /confirm roster/i })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /confirm roster/i }));

  const correctedRoleIds = vi.mocked(confirmSetup).mock.calls[0]?.[0]?.activeRoleIds ?? [];
  expect(correctedRoleIds).toEqual(expect.arrayContaining([...recommendedRoleIds(20)]));
  expect(correctedRoleIds).toHaveLength(recommendedRoleIds(20).length);
});

it('submits the staged player count and expansion for an already configured session', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  const currentRoleIds = recommendedRoleIds(14);
  useSessionStore.getState().setSession({
    ...activeSession,
    playerCount: 14,
    chartId: 'B',
    expansion: 'base',
    turnLimit: 7,
    dioneEnabled: false,
    capybaraEnabled: true,
    universalArbourEnabled: false,
    wolfCultEnabled: false,
    activeRoleIds: currentRoleIds,
    setupRevision: 12,
    setup: {
      playerCount: 14,
      chartId: 'B',
      expansion: 'base',
      turnLimit: 7,
      dioneEnabled: false,
      capybaraEnabled: true,
      universalArbourEnabled: false,
      wolfCultEnabled: false,
      activeRoleIds: currentRoleIds,
      activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(confirmSetup).mockResolvedValue('applied');
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: /^recommended player count$/i }),
    '19',
  );
  await user.click(screen.getByRole('button', { name: /confirm roster/i }));

  expect(confirmSetup).toHaveBeenCalledWith({
    playerCount: 19,
    chartId: 'B',
    expansion: 'capybara',
    turnLimit: 7,
    dioneEnabled: false,
    capybaraEnabled: true,
    universalArbourEnabled: false,
    wolfCultEnabled: false,
    activeRoleIds: recommendedRoleIds(19),
  });
});

it('groups setup roles by ship and labels every ship with its flag', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));

  const activeRoles = screen.getByRole('group', { name: /^active roles$/i });
  for (const shipName of [
    'AEGIS', 'Dione', 'Icebreaker', 'Capybara', 'Shepherd', 'Quellon', 'Refinery 124',
  ]) {
    const ship = within(activeRoles).getByRole('group', { name: `${shipName} roles` });
    expect(within(ship).getByRole('img', { name: `${shipName} flag` })).toBeInTheDocument();
  }
  expect(within(
    within(activeRoles).getByRole('group', { name: 'AEGIS roles' }),
  ).getByRole('switch', { name: /admiral role availability/i })).toBeInTheDocument();
  expect(within(
    within(activeRoles).getByRole('group', { name: 'Dione roles' }),
  ).getByRole('switch', { name: /captain role availability/i })).toBeInTheDocument();

  expect(screen.queryByRole('group', { name: /^wolf eligibility$/i })).not.toBeInTheDocument();
});

it('sends only the final draft after a GM confirms it', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await userEvent.setup().click(await screen.findByRole('button', { name: /^setup$/i }));
  const playerCount = screen.getByRole('combobox', { name: /^recommended player count$/i });
  fireEvent.change(playerCount, { target: { value: '18' } });

  expect(confirmSetup).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: /confirm roster/i }));
  expect(confirmSetup).toHaveBeenCalledOnce();
  expect(vi.mocked(confirmSetup).mock.calls[0]?.[0]?.activeRoleIds)
    .toEqual(expect.arrayContaining([...recommendedRoleIds(18)]));
});

it('exposes ordinary production start and retires caller-controlled Wolf assignment', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({ ...activeSession, phase: 'casting', currentTurn: 0 });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  expect(screen.queryByRole('button', { name: /randomly assign/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: /manual wolf assignment/i })).not.toBeInTheDocument();
  const start = screen.getByRole('button', { name: /start production/i });
  expect(start).toBeEnabled();
  await user.click(start);
  expect(screen.getByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1' })).toBeInTheDocument();
});

it('commits ordinary production only on the second click and renders the private receipt', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({ ...activeSession, phase: 'casting', currentTurn: 0 });
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmSetupReceipt(productionReceipt);
  streamInstances([local]);
  vi.mocked(startGame).mockResolvedValue(productionReply());
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const start = screen.getByRole('button', { name: /start production/i });
  await user.click(start);
  expect(startGame).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1' }));

  expect(startGame).toHaveBeenCalledOnce();
  expect(await screen.findByText(/Start committed \/\/ Cycle 1/)).toBeInTheDocument();
  const receipt = await screen.findByRole('region', { name: /production start receipt/i });
  expect(receipt).toHaveTextContent(/Source/);
  expect(receipt).toHaveTextContent(/routine-start/);
  expect(receipt).toHaveTextContent(/base \/\/ 8 core/);
  expect(receipt).toHaveTextContent(/one-wolf-at-8-13 \/\/ 1 \/\/ 8 private cards/);
  expect(receipt).toHaveTextContent(/Press input/);
  expect(receipt).toHaveTextContent(/Setup revisions/);
  expect(screen.getByRole('button', { name: /skip to cycle 1/i })).toBeInTheDocument();
});

it('stacks production receipt fields at the narrowest phone breakpoint', () => {
  const index = readFileSync('src/index.css', 'utf8');

  expect(index).toMatch(
    /@media \(max-width: 30rem\)\s*\{[^]*?\.gm-start-receipt__list div\s*\{\s*grid-template-columns: 1fr;\s*\}/,
  );
});

it('shows pending production state and ignores a second submit while the callable is unresolved', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({ ...activeSession, phase: 'casting', currentTurn: 0 });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  let resolveStart: ((value: unknown) => void) | undefined;
  const pending = new Promise((resolve) => { resolveStart = resolve; });
  vi.mocked(startGame).mockImplementation(() => pending as never);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /start production/i }));
  const confirm = screen.getByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1' });
  await user.click(confirm);
  expect(await screen.findByText(/Start pending \/\/ validating/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /starting production/i })).toBeDisabled();
  expect(startGame).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: /starting production/i }));
  expect(startGame).toHaveBeenCalledOnce();
  resolveStart?.(productionReply());
  expect(await screen.findByText(/Start committed \/\/ Cycle 1/)).toBeInTheDocument();
});

it('renders structured stale and replayed start dispositions and cancels confirmation on Escape', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({ ...activeSession, phase: 'casting', currentTurn: 0 });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(startGame).mockResolvedValue({
    status: 'stale', sessionId: 's1', requestId: 'start-ui',
    expectedSetupRevision: 0, currentSetupRevision: 1,
  } as never);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /start production/i }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /start production/i }));
  await user.click(screen.getByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1' }));
  expect(await screen.findByText(/Start stale \/\/ setup revision 1 superseded/i)).toBeInTheDocument();
  expect(startGame).toHaveBeenCalledOnce();
});

it('shows a replayed production receipt without changing the Skip control', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (activeSession) useSessionStore.getState().setSession({ ...activeSession, phase: 'casting', currentTurn: 0 });
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmSetupReceipt(productionReceipt);
  streamInstances([local]);
  vi.mocked(startGame).mockResolvedValue(productionReply('replayed'));
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /start production/i }));
  await user.click(screen.getByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1' }));
  expect(await screen.findByText(/Start replayed \/\/ the existing Cycle 1 result was preserved/i)).toBeInTheDocument();
  expect(await screen.findByRole('region', { name: /production start receipt/i })).toHaveTextContent(/replayed/i);
  expect(screen.getByRole('button', { name: /skip to cycle 1/i })).toBeInTheDocument();
});

it('toggles Capybara off for the session and removes its perspective', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  expect(screen.getByRole('button', { name: /disable capybara/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view dradis from capybara/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /disable capybara/i }));

  expect(setCapybaraEnabled).not.toHaveBeenCalled();
  const trigger = screen.getByRole('button', { name: /disable capybara/i });
  const dialog = screen.getByRole('alertdialog', { name: /change convoy manifest/i });
  expect(dialog).toHaveTextContent(/remove capybara/i);
  const cancel = within(dialog).getByRole('button', { name: /cancel convoy change/i });
  const confirm = within(dialog).getByRole('button', { name: /confirm remove capybara/i });
  expect(cancel).toHaveFocus();
  await user.tab();
  expect(confirm).toHaveFocus();
  await user.tab();
  expect(cancel).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog', { name: /change convoy manifest/i })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();

  await user.click(trigger);
  expect(screen.getByRole('alertdialog', { name: /change convoy manifest/i }))
    .toHaveTextContent(/remove capybara/i);
  await user.click(screen.getByRole('button', { name: /confirm remove capybara/i }));

  expect(setCapybaraEnabled).not.toHaveBeenCalled();
  expect(confirmSetup).not.toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: /enable capybara/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /view dradis from capybara/i }))
    .not.toBeInTheDocument();
});

it('toggles Dione off for the session and removes its perspective', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  expect(screen.getByRole('button', { name: /disable dione/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view dradis from dione/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /disable dione/i }));

  expect(setDioneEnabled).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog', { name: /change convoy manifest/i }))
    .toHaveTextContent(/remove dione/i);
  await user.click(screen.getByRole('button', { name: /confirm remove dione/i }));

  expect(setDioneEnabled).not.toHaveBeenCalled();
  expect(confirmSetup).not.toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: /enable dione/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /view dradis from dione/i }))
    .not.toBeInTheDocument();
});

it('can cancel adding Capybara back to the convoy', async () => {
  const user = userEvent.setup();
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...session, capybaraEnabled: false });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /enable capybara/i }));
  expect(screen.getByRole('alertdialog', { name: /change convoy manifest/i }))
    .toHaveTextContent(/add capybara/i);
  await user.click(screen.getByRole('button', { name: /cancel convoy change/i }));

  expect(setCapybaraEnabled).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /enable capybara/i })).toBeInTheDocument();
});

it('keeps additional authorized GM registration available from the GM surface', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  expect(await screen.findByText(/additional authorized gms.*role select/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /gm registration/i })).not.toBeInTheDocument();
  expect(setGmControlsLocked).not.toHaveBeenCalled();
  const setup = screen.getByRole('button', { name: /^setup$/i });
  expect(setup).toBeEnabled();
});

it('shows endgame evaluation and removes GM advance controls after the final turn', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'debrief',
    currentTurn: 6,
    turnLimit: 6,
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const turnControls = await screen.findByRole('region', { name: /cycle controls/i });
  expect(turnControls).toHaveTextContent(
    /final cycle complete.*endgame evaluation active.*advance and skip controls are disabled/i,
  );
  expect(within(turnControls).queryByRole('button', { name: /advance to cycle/i })).not.toBeInTheDocument();
  expect(within(turnControls).queryByRole('button', { name: /skip to cycle/i })).not.toBeInTheDocument();
  expect(advanceTurn).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /gm registration/i })).not.toBeInTheDocument();
  expect(screen.getByText(/additional authorized gms.*role select/i)).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: /^setup$/i }));
  expect(screen.getByRole('button', { name: /disable press/i })).toBeDisabled();
  expect(screen.getByRole('status', { name: /press availability status/i })).toHaveTextContent(
    /endgame evaluation.*press availability controls are frozen/i,
  );
});

it('shows the pursuit failure outcome and freezes cycle and setup mutations', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'failure',
    currentTurn: 3,
    gameOutcome: {
      type: 'game-outcome', result: 'failure', cause: 'pursuit-limit', cycle: 3,
      navigationRevision: 9, occurredAt: '2026-09-06T12:20:07.000Z',
    },
  });
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setGmLoyaltyCensus({
    revision: 7,
    entries: [
      { uid: 'u2', kind: 'universal-arbour', suspicion: 10, note: 'Hold position' },
      { uid: 'u3', kind: 'wolf-cult', suspicion: 15 },
      { uid: 'u4', kind: 'wolf-agent', suspicion: 0 },
    ],
  });
  streamInstances([local]);
  renderConsole();

  const cycleControls = await screen.findByRole('region', { name: /cycle controls/i });
  expect(cycleControls).toHaveTextContent(
    /pursuit reached 10 in cycle 3.*endgame evaluation active.*advance and skip controls are disabled/i,
  );
  expect(within(cycleControls).queryByRole('button', { name: /advance to cycle/i })).not.toBeInTheDocument();
  expect(within(cycleControls).queryByRole('button', { name: /skip to cycle/i })).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole('button', { name: /^setup$/i }));
  expect(screen.getByRole('button', { name: /confirm setup.*confirm roster/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /disable capybara/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /disable dione/i })).toBeDisabled();
  const census = screen.getByRole('region', { name: /private loyalty census/i });
  expect(within(census).getByLabelText(/facilitator note for u2/i)).toBeDisabled();
  expect(within(census).getAllByRole('button', { name: /save note/i })[0]).toBeDisabled();
  const cultIntel = screen.getByRole('region', { name: /wolf cult intelligence delivery/i });
  expect(within(cultIntel).getByLabelText(/active wolf fortress coordinate/i)).toBeDisabled();
  expect(within(cultIntel).getByRole('button', { name: /deliver private wolf intel/i })).toBeDisabled();
  const arbour = screen.getByRole('region', { name: /universal arbour facilitator call/i });
  expect(within(arbour).getByLabelText(/facilitator call/i)).toBeDisabled();
  expect(within(arbour).getByRole('button', { name: /publish private call/i })).toBeDisabled();
  const ruleCall = screen.getByRole('region', { name: /facilitator rule call/i });
  expect(within(ruleCall).getByLabelText(/question or ambiguity/i)).toBeDisabled();
  expect(within(ruleCall).getByRole('button', { name: /record rule call/i })).toBeDisabled();
  expect(confirmSetup).not.toHaveBeenCalled();
  expect(advanceTurn).not.toHaveBeenCalled();
  expect(setFacilitatorCensusNote).not.toHaveBeenCalled();
  expect(deliverWolfCultIntelligence).not.toHaveBeenCalled();
  expect(authorUniversalArbourVision).not.toHaveBeenCalled();
  expect(authorFacilitatorRuleCall).not.toHaveBeenCalled();
});

it('distinguishes total fleet loss while retaining survivors and small craft for evaluation', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'failure',
    currentTurn: 2,
    shipSurvivors: { aegis: 2500 },
    shuttleCargo: { starlight: { food: 2 } },
    smallShipStates: { gorgoneion: { id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2, population: 1_000, unrest: 1, cycle: { step: 1, revision: 3, results: { '1': 'Rations applied.' }, charges: [], turn: 1 } } },
    gameOutcome: {
      type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss', cycle: 2,
      occurredAt: '2026-09-20T14:30:00.000Z',
    },
  });
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const cycleControls = await screen.findByRole('region', { name: /cycle controls/i });
  expect(cycleControls).toHaveTextContent(
    /all full fleet ships lost in cycle 2.*survivors, escape pods, and small craft remain available/i,
  );
  expect(within(cycleControls).queryByRole('button', { name: /advance to cycle/i })).not.toBeInTheDocument();
});

it('closes the Press availability dialog if endgame evaluation starts', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /disable press/i }));
  expect(screen.getByRole('alertdialog', { name: /change press availability/i })).toBeInTheDocument();

  useSessionStore.getState().setSession({ ...activeSession, phase: 'debrief' });

  await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /change press availability/i })).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: /disable press/i })).toBeDisabled();
  expect(setPressEnabled).not.toHaveBeenCalled();
});

it('requires a deliberate second GM advance while either phase timer is active', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 3,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as never);
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(advanceTurn).mockResolvedValue(undefined);
  renderConsole();

  expect(screen.getByText('Cycle 3')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Advance to Cycle 4' }));
  expect(advanceTurn).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'ARE YOU SURE? // Advance to Cycle 4' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'ARE YOU SURE? // Advance to Cycle 4' }));
  expect(advanceTurn).toHaveBeenCalledOnce();
  expect(advanceTurn).toHaveBeenCalledWith({ overridePhaseTimer: true });
});

it('requires a second click before extending the restricted airspace window', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 3,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(extendAirspaceWindow).mockResolvedValue(undefined);
  renderConsole();

  const restricted = await screen.findByRole('button', {
    name: /add 5 minutes \/\/ airspace restricted/i,
  });
  const open = screen.getByRole('button', { name: /add 5 minutes \/\/ airspace open/i });
  expect(restricted).toBeEnabled();
  expect(open).toBeDisabled();

  await user.click(restricted);
  expect(extendAirspaceWindow).not.toHaveBeenCalled();
  expect(screen.getByRole('button', {
    name: 'ARE YOU SURE? // Add 5 minutes // Airspace restricted',
  })).toHaveClass('cic-action-button--confirm');

  await user.click(screen.getByRole('button', {
    name: 'ARE YOU SURE? // Add 5 minutes // Airspace restricted',
  }));
  expect(extendAirspaceWindow).toHaveBeenCalledWith('restricted');
});

it('allows the same confirmed control for the live open airspace window', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 3,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: new Date(Date.now() - 1_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(extendAirspaceWindow).mockResolvedValue(undefined);
  renderConsole();

  const open = await screen.findByRole('button', {
    name: /add 5 minutes \/\/ airspace open/i,
  });
  expect(open).toBeEnabled();
  expect(screen.getByRole('button', { name: /add 5 minutes \/\/ airspace restricted/i }))
    .toBeDisabled();

  await user.click(open);
  const confirm = screen.getByRole('button', {
    name: 'ARE YOU SURE? // Add 5 minutes // Airspace open',
  });
  expect(extendAirspaceWindow).not.toHaveBeenCalled();
  await user.click(confirm);
  expect(extendAirspaceWindow).toHaveBeenCalledWith('open');
});

it('lets the facilitator mark and resolve the approximate Wolf window without starting combat', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({ ...activeSession, phase: 'active', currentTurn: 1 });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setWolfAttackWindow)
    .mockResolvedValueOnce({ status: 'due', turn: 1, revision: 1 })
    .mockResolvedValueOnce({ status: 'resolved', turn: 1, revision: 2 });
  renderConsole();

  const turnControls = await screen.findByRole('region', { name: /cycle controls/i });
  expect(turnControls).toHaveTextContent(/wolf-attack timing \/\/ planned/i);
  expect(turnControls).toHaveTextContent(/no automatic attack, combat resolution, or cycle advance/i);
  const mark = within(turnControls).getByRole('button', { name: 'Mark timing due' });
  expect(mark).toBeEnabled();

  await user.click(mark);
  expect(setWolfAttackWindow).toHaveBeenCalledWith('due', 0);
  const resolve = await within(turnControls).findByRole('button', { name: 'Resolve timing' });
  expect(resolve).toBeEnabled();
  expect(turnControls).toHaveTextContent(/wolf-attack timing \/\/ due \/\/ cycle 1 \/\/ revision 1/i);

  await user.click(resolve);
  expect(setWolfAttackWindow).toHaveBeenLastCalledWith('resolved', 1);
  await waitFor(() => expect(turnControls).toHaveTextContent(
    /wolf-attack timing \/\/ resolved \/\/ cycle 1 \/\/ revision 2/i,
  ));
});

it('stages a private card and target draft through the GM-only preparation panel', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active',
    currentTurn: 1,
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(stageWolfAttackPreparation).mockResolvedValue({
    turn: 1,
    revision: 1,
    shipIds: [...Array<string>(10).fill('wolf-fighter-wing'), ...Array<string>(5).fill('wolf-assault-transport')],
    targetMode: 'manual',
    targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
    modifiers: [],
    notes: 'Private setup',
  });
  renderConsole();

  const preparation = await screen.findByRole('region', { name: 'Private Wolf attack preparation' });
  expect(preparation).toHaveTextContent(/players receive no cards/i);
  await user.clear(within(preparation).getByRole('spinbutton', { name: 'Fighter Wing count' }));
  await user.type(within(preparation).getByRole('spinbutton', { name: 'Fighter Wing count' }), '10');
  await user.selectOptions(within(preparation).getByRole('combobox', { name: 'Target for Wolf card 1' }), 'aegis');
  await user.click(within(preparation).getByRole('button', { name: 'Save private attack draft' }));

  await waitFor(() => expect(stageWolfAttackPreparation).toHaveBeenCalledWith(expect.objectContaining({
    turn: 1,
    targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
  }), 0));
});

it('activates the GM declaration control with Enter after the due window and draft are live', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    phase: 'active',
    currentTurn: 1,
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(Date.now() - 1_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeGmWolfAttackWindow).mockImplementation((_sessionId, onWindow) => {
    onWindow({ status: 'due', turn: 1, revision: 3 });
    return vi.fn();
  });
  vi.mocked(subscribeGmWolfAttackPreparation).mockImplementation((_sessionId, onPreparation) => {
    onPreparation({
      turn: 1,
      revision: 4,
      shipIds: ['wolf-fighter-wing'],
      targetMode: 'manual',
      targetAssignments: [],
      modifiers: [],
      notes: 'ready',
    });
    return vi.fn();
  });
  vi.mocked(declareWolfAttack).mockResolvedValue({
    status: 'committed',
    type: 'wolf-attack-declaration',
    sessionId: 's1',
    requestId: 'declare-ui',
    turn: 1,
    revision: 1,
    currentStep: 'targeting',
    deadlineAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    airspaceLocked: true,
    parkedCraftCount: 2,
    announcementId: 'wolf-attack-declare-ui',
  });
  renderConsole();

  const preparation = await screen.findByRole('region', { name: 'Private Wolf attack preparation' });
  const declare = within(preparation).getByRole('button', { name: 'Declare Wolf attack' });
  const declarationStatus = within(preparation).getByRole('status');
  expect(declare).toBeEnabled();
  expect(declarationStatus).toHaveAttribute('aria-live', 'off');
  declare.focus();
  await user.keyboard('{Enter}');

  await waitFor(() => expect(declareWolfAttack).toHaveBeenCalledWith(4));
  expect(preparation).toHaveTextContent(/declared \/\/ cycle 1 \/\/ targeting step \/\/ airspace locked \/\/ 2 craft parked/i);
  expect(declarationStatus).toHaveAttribute('aria-live', 'polite');
});

it('requires three deliberate confirmations to pause and resume the emergency timer', async () => {
  const user = userEvent.setup();
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...activeSession,
    currentTurn: 3,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setEmergencyTimerPaused).mockImplementation(async (paused) => {
    const session = useSessionStore.getState().session;
    if (!session?.turnPhase) return;
    if (paused) {
      useSessionStore.getState().setSession({
        ...session,
        turnPhase: {
          ...session.turnPhase,
          timerPause: {
            window: 'restricted',
            remainingMs: 180_000,
            pausedAt: new Date().toISOString(),
          },
        },
      } as never);
      return;
    }
    const { timerPause: _timerPause, ...resumed } = session.turnPhase as unknown as Record<string, unknown>;
    void _timerPause;
    useSessionStore.getState().setSession({ ...session, turnPhase: resumed } as never);
  });
  renderConsole();

  const region = await screen.findByRole('region', { name: /emergency timer control/i });
  await user.click(within(region).getByRole('button', { name: /disarm interlock \/\/ pause timer/i }));
  expect(setEmergencyTimerPaused).not.toHaveBeenCalled();
  expect(within(region).getByRole('button', { name: /2 confirmations remaining/i })).toBeVisible();
  await user.click(within(region).getByRole('button', { name: /2 confirmations remaining/i }));
  expect(setEmergencyTimerPaused).not.toHaveBeenCalled();
  expect(within(region).getByRole('button', { name: /1 confirmation remaining/i })).toBeVisible();
  await user.click(within(region).getByRole('button', { name: /1 confirmation remaining/i }));
  await waitFor(() => expect(setEmergencyTimerPaused).toHaveBeenCalledWith(true));
  expect(await within(region).findByText(/emergency timer paused/i)).toBeVisible();
  expect(useSessionStore.getState().session?.turnPhase).toHaveProperty('timerPause');
  expect(screen.getByRole('button', { name: /add 5 minutes \/\/ airspace restricted/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /add 5 minutes \/\/ airspace open/i })).toBeDisabled();

  await user.click(within(region).getByRole('button', { name: /re-arm interlock \/\/ resume timer/i }));
  await user.click(within(region).getByRole('button', { name: /2 confirmations remaining/i }));
  await user.click(within(region).getByRole('button', { name: /1 confirmation remaining/i }));
  await waitFor(() => expect(setEmergencyTimerPaused).toHaveBeenLastCalledWith(false));
  expect(setEmergencyTimerPaused).toHaveBeenCalledTimes(2);
});

it('requires a deliberate second press to lower the finale, then lets the GM retract it', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(setDebriefMode).mockImplementation(async (active) => {
    const activeSession = useSessionStore.getState().session;
    if (activeSession) {
      const revision = activeSession.debriefMode?.revision ?? 0;
      useSessionStore.getState().setSession({
        ...activeSession,
        debriefMode: { active, revision: revision + 1 },
      });
    }
    return 'applied';
  });
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /finale.*enable debrief mode/i }));
  expect(setDebriefMode).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /are you sure.*enable finale/i })).toBeVisible();

  await user.click(screen.getByRole('button', { name: /are you sure.*enable finale/i }));
  expect(setDebriefMode).toHaveBeenCalledWith(true);
  expect(await screen.findByRole('button', { name: /retract finale.*stop confetti/i })).toBeVisible();

  await user.click(screen.getByRole('button', { name: /retract finale.*stop confetti/i }));
  expect(setDebriefMode).toHaveBeenLastCalledWith(false);
});

it('shows Emergency Bridge Confetti Dispenser activations in the console log', async () => {
  let publish: ((events: readonly [{
    id: string; sessionId: string; type: 'ship-confetti'; shipId: string;
    shipName: string; actorName: string; actorRoleName: string; createdAt: string;
  }]) => void) | undefined;
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    publish = onEvents;
    onEvents([]);
    return vi.fn();
  });
  renderConsole();
  await waitFor(() => expect(publish).toBeDefined());

  act(() => publish?.([{
      id: 'event-1', sessionId: 's1', type: 'ship-confetti', shipId: 'quellon',
      shipName: 'Quellon', actorName: 'Player', actorRoleName: 'Explorer',
      createdAt: '2026-01-01T00:02:00.000Z',
  }]));

  await screen.findByText(/quellon.*emergency bridge confetti dispenser.*explorer.*player/i);
  expect(screen.getByRole('list', { name: /gm event log/i })).toHaveTextContent(
    /quellon.*emergency bridge confetti dispenser.*explorer.*player/i,
  );
});

it('relays maintenance cycle starts and completions to the GM event log', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    onEvents([
      {
        id: 'maintenance-complete', sessionId: 's1', type: 'maintenance',
        shipId: 'aegis', shipName: 'AEGIS', action: 'end',
        results: {},
        createdAt: '2026-01-01T00:04:00.000Z',
      },
      {
        id: 'maintenance-start', sessionId: 's1', type: 'maintenance',
        shipId: 'aegis', shipName: 'AEGIS', action: 'begin',
        results: {},
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    return vi.fn();
  });

  renderConsole();

  const log = await screen.findByRole('list', { name: /gm event log/i });
  expect(log).toHaveTextContent(/aegis.*maintenance cycle completed/i);
  expect(log).toHaveTextContent(/aegis.*maintenance cycle started/i);
});

it('flags maintenance cycles that remain incomplete for five minutes', async () => {
  vi.setSystemTime('2026-01-01T00:06:00.000Z');
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    maintenanceCycles: {
      aegis: {
        step: 3, revision: 3, results: {}, charges: [], refuelled: [],
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  });

  renderConsole();

  const alert = await screen.findByRole('alert', { name: /overdue maintenance/i });
  expect(alert).toHaveTextContent(/aegis.*incomplete for 6 minutes/i);
  vi.useRealTimers();
});

it('shows damage draws in the GM log obscured until hover or keyboard focus', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeDamageDraws).mockImplementation((_sessionId, onDraws) => {
    onDraws([{
      id: 'draw-1', sessionId: 's1', type: 'ship-damage', shipId: 'aegis', card: '10♥',
      systemId: 'reactor', systemName: 'Reactor', recycled: false,
      createdAt: '2026-01-01T00:02:00.000Z',
    }]);
    return vi.fn();
  });

  renderConsole();

  const concealed = await screen.findByText(/10♥.*reactor/i);
  expect(concealed).toHaveClass('gm-damage-draw__secret');
  expect(concealed).toHaveAttribute('tabindex', '0');
});

it('mirrors an in-game fullscreen alert as a red GM activity banner', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(subscribeSessionEvents).mockImplementation((_sessionId, onEvents) => {
    onEvents([{
      id: 'alert-1', sessionId: 's1', type: 'fullscreen-alert',
      sourceRoleName: 'Admiral', message: 'Reactor containment failure',
      createdAt: '2026-01-01T00:03:00.000Z',
    }]);
    return vi.fn();
  });
  renderConsole();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/admiral.*reactor containment failure/i);
  expect(alert).toHaveClass('gm-event-alert--critical');
  expect(screen.getByRole('list', { name: /gm event log/i })).toHaveTextContent(
    /reactor containment failure/i,
  );
});

it('moves survivors by printed steps through GM controls and locks pending thresholds', async () => {
  streamInstances([local]);
  useSessionStore.getState().setGmInstance(local);
  renderConsole();
  const controls = screen.getByRole('group', { name: 'Capybara resource controls' });
  expect(within(controls).getByRole('button', { name: 'Increase Survivor Population' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /ship numbers write mode/i }));
  const decreasePopulation = within(controls).getByRole('button', { name: 'Decrease Survivor Population' });
  fireEvent.click(decreasePopulation);
  fireEvent.click(decreasePopulation);
  fireEvent.click(decreasePopulation);
  fireEvent.click(decreasePopulation);
  expect(within(controls).getByLabelText('Survivor Population: 15000, pending transmission'))
    .toBeInTheDocument();
  expect(within(controls).getByRole('button', { name: 'Decrease Survivor Population' })).toBeDisabled();
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    shipSurvivors: { capybara: 15000 },
    populationAlerts: { capybara: { shipId: 'capybara', shipName: 'Capybara', population: 15000, targetGmInstanceIds: [local.id], createdAt: 'now' } },
  }));
  expect(within(controls).getByRole('button', { name: 'Decrease Survivor Population' })).toBeDisabled();
});


it('uses the role workspace with a separate persistent GM instrument rail', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  const workspace = screen.getByRole('region', { name: 'GM operations console' });
  expect(within(workspace).getByRole('heading', { name: 'Fleet oversight' })).toBeVisible();
  expect(within(workspace).getByText('Available ships')).toBeVisible();
  expect(within(workspace).getByRole('region', { name: 'Fleet resource controls' })).toBeVisible();
  const instruments = screen.getByRole('complementary', { name: 'GM instruments' });
  expect(within(instruments).getByRole('region', { name: 'Fleet DRADIS' })).toBeVisible();
  expect(within(workspace).queryByRole('region', { name: 'Fleet DRADIS' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Back to role selection' }));
  expect(screen.getByText('Role selection route')).toBeVisible();
});

it('shows one-GM dual responsibility lanes and confirms the whole setup tuple', async () => {
  const user = userEvent.setup();
  const activeRoleIds = recommendedRoleIds(8);
  const setup = {
    playerCount: 8,
    chartId: 'A' as const,
    expansion: 'base' as const,
    turnLimit: 6 as const,
    dioneEnabled: false,
    capybaraEnabled: false,
    universalArbourEnabled: false,
    wolfCultEnabled: false,
    activeRoleIds,
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
  };
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    setupRevision: 4,
    setup,
    activeVesselIds: setup.activeVesselIds,
    playerCount: setup.playerCount,
    chartId: setup.chartId,
    expansion: setup.expansion,
    turnLimit: setup.turnLimit,
    dioneEnabled: setup.dioneEnabled,
    capybaraEnabled: setup.capybaraEnabled,
    activeRoleIds,
  });
  useSessionStore.getState().setGmInstance({
    ...local,
    responsibilities: ['main', 'assistant'],
  });
  streamInstances([{ ...local, responsibilities: ['main', 'assistant'] }]);
  vi.mocked(confirmSetup).mockResolvedValue('applied');
  vi.mocked(setFacilitatorResponsibility).mockResolvedValue('applied');
  renderConsole();

  expect(await screen.findByText(/MAIN FACILITATOR/i)).toBeInTheDocument();
  expect(screen.getByText(/ASSISTANT FACILITATOR/i)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /^setup$/i }));
  await user.click(screen.getByRole('button', { name: /confirm setup/i }));

  expect(confirmSetup).toHaveBeenCalledWith(expect.objectContaining({
    playerCount: 8,
    chartId: 'A',
    expansion: 'base',
    turnLimit: 6,
    dioneEnabled: false,
    capybaraEnabled: false,
    activeRoleIds,
  }));
});

it('keeps optional GM lane sharing and handoff visible without making a second GM required', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance({ ...local, responsibilities: ['main', 'assistant'] });
  streamInstances([
    { ...local, responsibilities: ['main', 'assistant'] },
    { ...other, responsibilities: [] },
  ]);
  vi.mocked(setFacilitatorResponsibility).mockResolvedValue('applied');
  renderConsole();

  expect(await screen.findByText('Tablet')).toBeInTheDocument();
  const shareMain = screen.getByRole('button', { name: /share main facilitator/i });
  const handoffAssistant = screen.getByRole('button', { name: /hand off assistant facilitator/i });
  expect(shareMain).toBeEnabled();
  expect(handoffAssistant).toBeEnabled();

  await user.click(shareMain);
  expect(setFacilitatorResponsibility).toHaveBeenCalledWith(expect.objectContaining({
    responsibility: 'main', mode: 'share', targetInstanceId: 'other-1',
  }));
});

it('shows one facilitator the complete current setup queue without requiring another GM', async () => {
  const activeSession = useSessionStore.getState().session;
  if (!activeSession) throw new Error('Expected the test session.');
  const sessionWithoutSetup = { ...activeSession };
  delete sessionWithoutSetup.setup;
  useSessionStore.getState().setSession({
    ...sessionWithoutSetup,
    phase: 'casting',
    currentTurn: 0,
  });
  useSessionStore.getState().setGmInstance({ ...local, responsibilities: ['main', 'assistant'] });
  streamInstances([local]);
  renderConsole();

  const queue = await screen.findByRole('region', { name: 'Facilitator next actions' });
  expect(within(queue).getByText('Confirm setup')).toBeInTheDocument();
  expect(within(queue).getByText('Start production')).toBeInTheDocument();
  expect(queue).toHaveTextContent(/one GM owns every required step/i);
});

it('stages a star chart locally and locks it through explicit setup confirmation', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  vi.mocked(confirmSetup).mockImplementation(async (setup) => {
    const current = useSessionStore.getState().session!;
    useSessionStore.getState().setSession({ ...current, chartId: setup.chartId, chartSelectionLocked: setup.lockChart === true });
    return 'applied';
  });
  renderConsole();
  await user.click(await screen.findByRole('button', { name: /^setup$/i }));
  const select = screen.getByRole('combobox', { name: 'Star chart' });
  await user.selectOptions(select, 'C');
  expect(confirmSetup).not.toHaveBeenCalled();
  expect(screen.getByRole('status', { name: 'Star chart lock status' })).toHaveTextContent('Chart C staged');
  await user.click(screen.getByRole('button', { name: 'Lock star chart' }));
  expect(confirmSetup).toHaveBeenCalledWith(expect.objectContaining({ chartId: 'C', lockChart: true }));
  expect(select).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Lock star chart' })).toBeDisabled();
  expect(screen.getByRole('status', { name: 'Star chart lock status' })).toHaveTextContent('Current chart C // Locked');
  expect(screen.getByRole('combobox', { name: 'Recommended player count' })).not.toBeDisabled();
});


it('labels outbreak fields as public and submits them separately from private notes', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(transitionCrisis).mockResolvedValue('applied');
  streamInstances([local]);
  renderConsole();
  const panel = await screen.findByRole('region', { name: 'Crisis state machine' });
  await user.selectOptions(within(panel).getByRole('combobox', { name: 'Crisis kind' }), 'disease-outbreak');
  expect(within(panel).getByText('Outbreak report — visible to all session members on delivery')).toBeVisible();
  await user.click(within(panel).getByRole('checkbox', { name: /AEGIS/ }));
  await user.type(within(panel).getByLabelText('Reported work restrictions (public)'), 'Affected crew cannot work.');
  await user.type(within(panel).getByLabelText('Escalation risk (public)'), 'Further spread is possible.');
  await user.type(within(panel).getByLabelText('Crisis title'), 'Outbreak');
  await user.type(within(panel).getByLabelText('Crisis facilitator notes'), 'Private adjudication.');
  await user.click(within(panel).getByRole('button', { name: 'Mark draft' }));
  await waitFor(() => expect(transitionCrisis).toHaveBeenCalledWith(
    'crisis-1', 'draft', 'Outbreak', 'Private adjudication.',
    { crisisKind: 'disease-outbreak', configurationOverride: '', diseaseOutbreak: {
      affectedShipIds: ['aegis'], workRestrictions: 'Affected crew cannot work.', escalationRisk: 'Further spread is possible.',
    } },
  ));
});

it('activates and releases quarantine while stating that communications remain available', async () => {
  const user = userEvent.setup();
  const outbreak = {
    ...liveCrisis, state: 'delivered' as const, revision: 2,
    crisisKind: 'disease-outbreak' as const,
    diseaseOutbreak: {
      affectedShipIds: ['aegis'], workRestrictions: 'Limited work.', escalationRisk: 'Further spread.',
    },
  };
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, publish) => {
    publish(outbreak);
    return vi.fn();
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, phase: 'active', activeVesselIds: ['aegis'],
  });
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(setDiseaseQuarantine).mockResolvedValue('applied');
  streamInstances([local]);
  renderConsole();
  const policy = await screen.findByRole('region', { name: 'Disease quarantine docking policy' });
  expect(within(policy).getByText(/Fleet communications remain available/)).toBeVisible();
  await user.click(within(policy).getByRole('button', { name: 'Activate quarantine' }));
  await waitFor(() => expect(setDiseaseQuarantine).toHaveBeenCalledWith('activate'));

  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    quarantineDocking: {
      type: 'quarantine-docking', status: 'active', crisisId: outbreak.crisisId,
      crisisRevision: 2, revision: 1, affectedShipIds: ['aegis'],
      acceptedByShip: {}, communications: 'allowed',
    },
  }));
  await user.click(within(policy).getByRole('button', { name: 'Release quarantine' }));
  await waitFor(() => expect(setDiseaseQuarantine).toHaveBeenCalledWith('release'));
});


it('allows removing an affected ship disabled after drafting before delivering the corrected outbreak', async () => {
  const user = userEvent.setup();
  const diseaseOutbreak = { affectedShipIds: ['dione'], workRestrictions: 'Affected crew cannot work.', escalationRisk: 'Further spread.' };
  vi.mocked(subscribeGmCrisisState).mockImplementation((_sessionId, publish) => {
    publish({ ...liveCrisis, crisisKind: 'disease-outbreak', diseaseOutbreak });
    return vi.fn();
  });
  useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, phase: 'active', activeVesselIds: ['aegis', 'dione'], dioneEnabled: true });
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(transitionCrisis).mockResolvedValue('applied');
  streamInstances([local]);
  renderConsole();
  const panel = await screen.findByRole('region', { name: 'Crisis state machine' });
  expect(await within(panel).findByRole('checkbox', { name: /^Dione$/i })).toBeChecked();
  act(() => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, activeVesselIds: ['aegis'], dioneEnabled: false }));
  const inactive = await within(panel).findByRole('checkbox', { name: /Dione.*inactive/i });
  expect(inactive).toBeChecked();
  await user.click(inactive);
  expect(within(panel).queryByRole('checkbox', { name: /Dione/i })).not.toBeInTheDocument();
  await user.click(within(panel).getByRole('checkbox', { name: /AEGIS/ }));
  await user.click(within(panel).getByRole('button', { name: 'Mark delivered' }));
  await waitFor(() => expect(transitionCrisis).toHaveBeenCalledWith(
    liveCrisis.crisisId, 'delivered', liveCrisis.title, liveCrisis.details,
    { crisisKind: 'disease-outbreak', configurationOverride: '', diseaseOutbreak: { ...diseaseOutbreak, affectedShipIds: ['aegis'] } },
  ));
});
