import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { GmInstance, Player } from '@/types/game';
import { recommendedRoleIds } from '@/data/rolePresets';
import { activeFleetShipIds } from '@/data/roles';
import { normalizeSessionConfiguration } from '../../functions/src/gameSetup';
import { useSessionStore } from '@/store/useSessionStore';
import { sessionFrom } from '@/lib/firestore';
import GmConsole from './GmConsole';

const io = vi.hoisted(() => ({
  call: vi.fn(),
  auth: { currentUser: { uid: 'original-setup-gm' }, authStateReady: vi.fn() },
}));
vi.mock('@/lib/firebase', () => ({ auth: () => io.auth, functions: () => ({}), app: () => ({}) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_service: unknown, name: string) => (data: unknown) => io.call(name, data),
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));

// Reuse the existing mounted GM fixture's listener boundaries, retaining the
// real parser, store, setup controls and normal sessionService command path.
let connected: ((players: readonly Player[]) => void) | undefined;
let allPlayers: ((players: readonly Player[]) => void) | undefined;
vi.mock('@/lib/firestore', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/firestore')>();
  const absent = (_sessionId: string, callback: (value: null) => void) => {
    callback(null); return vi.fn();
  };
  const empty = (_sessionId: string, callback: (value: readonly never[]) => void) => {
    callback([]); return vi.fn();
  };
  return {
    ...actual,
    subscribeGmInstances: (_sessionId: string, callback: (value: readonly GmInstance[]) => void) => {
      callback([local]); return vi.fn();
    },
    subscribeConnectedPlayers: (_sessionId: string, callback: (value: readonly Player[]) => void) => {
      connected = callback; callback([]); return vi.fn();
    },
    subscribeSessionPlayers: (_sessionId: string, callback: (value: readonly Player[]) => void) => {
      allPlayers = callback; callback([]); return vi.fn();
    },
    subscribeReplacementEligibility: empty,
    subscribeSessionEvents: empty,
    subscribeDamageDraws: empty,
    subscribeGmWolfAttackWindow: absent,
    subscribeGmWolfAttackPreparation: absent,
    subscribeGmWolfAttackState: absent,
    subscribeWolfAttackMemberView: absent,
    subscribeGmWolfAssignment: absent,
    subscribeGmWolfActionReceipt: absent,
    subscribeGmWolfSuspicionHistory: empty,
    subscribeGmWolfClueDisclosure: absent,
    subscribeGmWolfCultIntelligence: absent,
    subscribeGmArbourVision: absent,
    subscribeGmFacilitatorRuleCall: absent,
    subscribeGmCrisisState: absent,
    subscribeGmApproachingVesselResponse: absent,
    subscribeGmZealotryResponse: absent,
    subscribeGmCivilUnrestResolution: absent,
    subscribeGmArrestPosseCalculation: absent,
    subscribeGmArrestCase: absent,
    subscribeGmMissionOpportunities: empty,
    subscribeGmMissionStartSnapshots: empty,
  };
});
vi.mock('@/lib/vipHostService', () => ({
  attestVipHostVisit: vi.fn(),
  subscribeGmVipHostVisit: (_sessionId: string, _cycle: number, callback: (value: null) => void) => {
    callback(null); return vi.fn();
  },
}));
// Unrelated lazy workspaces do not define any setup/start predicate.
vi.mock('@/components/Voyage33MovementWorkspace', () => ({ default: () => null }));
vi.mock('@/components/SameTableTradeBaselineWorkspace', () => ({ default: () => null }));
vi.mock('@/components/GmStarmapModule', () => ({ default: () => null }));
vi.mock('@/components/GmScoutRevealController', () => ({ default: () => null }));
vi.mock('@/components/SmallShipOperations', () => ({ default: () => null }));
vi.mock('@/components/AwayMissionStartPanel', () => ({ default: () => null }));
vi.mock('@/components/BoardingSecurityTeamWorkspace', () => ({ default: () => null }));

const sessionId = 'native-setup-current';
const local: GmInstance = {
  id: 'original-setup-claim', sessionId, uid: 'original-setup-gm', name: 'Original GM',
  deviceLabel: 'native mounted fixture', claimedAt: '2026-10-06T00:00:00.000Z', responsibilities: [],
};
const gm: Player = {
  uid: local.uid, sessionId, displayName: 'Original GM', role: 'gm', connected: true,
  joinedAt: '2026-10-06T00:00:00.000Z',
};
let raw: Record<string, unknown>;

function canonicalSetup(playerCount: number) {
  const configuration = normalizeSessionConfiguration({ playerCount, chartId: 'A', expansion: 'base',
    turnLimit: 6, capybaraEnabled: false, dioneEnabled: playerCount >= 12 });
  const activeRoleIds = [...recommendedRoleIds(playerCount)];
  return { ...configuration, activeRoleIds, activeVesselIds: activeFleetShipIds(activeRoleIds, undefined) };
}
function currentSource(playerCount: number, revision: number) {
  const setup = canonicalSetup(playerCount);
  raw = { ...raw, ...setup, setup, setupRevision: revision };
  return sessionFrom(sessionId, raw);
}
async function mounted(playerCount = 8, strict = false) {
  const source = currentSource(playerCount, 17);
  useSessionStore.getState().setIdentity(source, gm);
  useSessionStore.getState().setGmInstance(local);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  const tree = <MemoryRouter initialEntries={['/gm']}><GmConsole /></MemoryRouter>;
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Setup' }));
  expect(screen.getByRole('combobox', { name: 'Recommended player count' })).toHaveValue(String(playerCount));
  expect(start()).toBeEnabled();
  return user;
}
const start = () => screen.getByRole('button', { name: 'Start full-game demo // Advance to Cycle 1' });
const setupRegion = () => screen.getByRole('region', { name: 'Setup' });

beforeEach(() => {
  useSessionStore.getState().reset();
  connected = undefined; allPlayers = undefined;
  io.call.mockReset(); io.auth.currentUser = { uid: local.uid };
  raw = { name: 'Native normal setup', joinCode: '123456', phase: 'casting', currentTurn: 0,
    setupConfirmed: true, configurationLocked: false, pressEnabled: false,
    fullGameDemo: { status: 'preparing', progression: 'manual' },
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z' };
  io.call.mockImplementation(async (endpoint: string, data: { sessionId: string; setup?: Record<string, unknown>;
    expectedSetupRevision?: number; requestId?: string }) => {
    if (endpoint !== 'confirmSetup') throw new Error(`Unexpected native callable ${endpoint}`);
    expect(data.sessionId).toBe(sessionId);
    const count = Number(data.setup?.playerCount);
    const setup = canonicalSetup(count);
    return { data: { status: 'committed', sessionId, requestId: data.requestId,
      setupConfirmed: true, setupRevision: Number(data.expectedSetupRevision) + 1, setup,
      expectedSetupRevision: data.expectedSetupRevision } };
  });
});
afterEach(() => {
  console.info(JSON.stringify({ kind: 'native-gm-setup-readiness', test: expect.getState().currentTestName,
    sessionRoleCount: useSessionStore.getState().session?.activeRoleIds?.length,
    draftPlayerCount: screen.queryByRole('combobox', { name: 'Recommended player count' })?.getAttribute('value'),
    nativeCommandCount: io.call.mock.calls.length,
    sourceOriginalUid: useSessionStore.getState().me?.uid === local.uid,
    sourceOriginalInstance: useSessionStore.getState().gmInstance?.id === local.id }));
  useSessionStore.getState().reset();
});

describe('normal mounted full-game setup readiness', () => {
  it('keeps the exact confirmed eight-role source enabled through fresh same-role projections and assigned-but-unselected players', async () => {
    await mounted();
    for (let revision = 18; revision <= 25; revision++) {
      const roleId = recommendedRoleIds(8)[revision - 18]!;
      const player: Player = { uid: `native-${roleId}`, sessionId, displayName: `Native ${roleId}`, role: 'player',
        assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: null, connected: true,
        joinedAt: '2026-10-06T00:00:00.000Z' };
      act(() => {
        connected!([gm, player]); allPlayers!([gm, player]);
        useSessionStore.getState().setSession(currentSource(8, revision));
      });
      expect(start()).toBeEnabled();
      expect(screen.getByRole('combobox', { name: 'Recommended player count' })).toHaveValue('8');
      expect(screen.queryByText(/unconfirmed changes/i)).not.toBeInTheDocument();
    }
    expect(io.call).not.toHaveBeenCalled();
  });

  it.each([false, true])('adopts a normal canonical server roster change without manufacturing an edited draft (StrictMode=%s)', async strict => {
    await mounted(8, strict);
    act(() => {
      connected!([gm]); allPlayers!([gm]);
      useSessionStore.getState().setSession(currentSource(14, 18));
    });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Recommended player count' })).toHaveValue('14'));
    expect(start()).toBeEnabled();
    expect(within(setupRegion()).getByText('Roster synchronized // 14 roles active')).toBeInTheDocument();
    expect(io.call).not.toHaveBeenCalled();
  });

  it('preserves a genuine unconfirmed local draft when a different normal canonical server roster arrives', async () => {
    const user = await mounted();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Recommended player count' }), '9');
    expect(start()).toBeDisabled();
    act(() => useSessionStore.getState().setSession(currentSource(14, 18)));
    expect(screen.getByRole('combobox', { name: 'Recommended player count' })).toHaveValue('9');
    expect(start()).toBeDisabled();
    expect(io.call).not.toHaveBeenCalled();
  });

  it('enables the current original GM only after its exact locally staged eight-role normal confirmation commits', async () => {
    const user = await mounted(18);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Recommended player count' }), '8');
    expect(start()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Confirm setup // Confirm roster' }));
    await waitFor(() => expect(start()).toBeEnabled());
    expect(io.call).toHaveBeenCalledOnce();
    expect(io.call).toHaveBeenCalledWith('confirmSetup', expect.objectContaining({
      sessionId, instanceId: local.id, expectedSetupRevision: 17,
      setup: expect.objectContaining({ activeRoleIds: [...recommendedRoleIds(8)] }),
    }));
    expect(useSessionStore.getState().session?.activeRoleIds).toEqual(recommendedRoleIds(8));
    expect(within(setupRegion()).getByRole('status', { name: 'Roster confirmation status' }))
      .toHaveTextContent('Roster synchronized // server receipt committed.');
  });
});
