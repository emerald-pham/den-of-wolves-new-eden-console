import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import type { PdfEscortWingLaunchView, PdfEscortWingMemberView, Player, WolfAttackMemberView } from '@/types/game';
import type * as FirebaseModule from '@/lib/firebase';
import type * as FirestoreModule from '@/lib/firestore';
import type * as SessionServiceModule from '@/lib/sessionService';
import ShipConsole from './ShipConsole';
import ShipRoleSelect from './ShipRoleSelect';
import SessionMode from './SessionMode';

const launchService = vi.hoisted(() => ({ read: vi.fn(), launch: vi.fn(), pass: vi.fn() }));
const aceService = vi.hoisted(() => ({ read: vi.fn(), grant: vi.fn() }));
const rangeService = vi.hoisted(() => ({ read: vi.fn(), commit: vi.fn() }));
// Mimics the member Wolf attack listener: each subscription starts from the latest published view.
const attackFeed = vi.hoisted(() => ({
  latest: null as unknown,
  listeners: new Set<(view: unknown) => void>(),
  publish(view: unknown): void {
    attackFeed.latest = view;
    for (const listener of attackFeed.listeners) listener(view);
  },
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/lib/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof FirebaseModule>()),
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));
vi.mock('@/lib/sessionService', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionServiceModule>()),
  selectConsoleRole: vi.fn(),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  getPdfEscortWingLaunch: launchService.read,
  launchPdfEscortWing: launchService.launch,
  passWolfFighterLaunchChoice: launchService.pass,
}));
vi.mock('@/lib/pdfFighterAceService', () => ({
  getPdfFighterAcePermissionView: aceService.read,
  grantPdfFighterAcePermission: aceService.grant,
}));
vi.mock('@/lib/wolfEscortRangeService', () => ({
  getWolfEscortRangeActionChoice: rangeService.read,
  commitWolfEscortRangeActionChoice: rangeService.commit,
}));
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof FirestoreModule>()),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeShipConfetti: vi.fn(() => vi.fn()),
  subscribeDamageDraws: vi.fn((_sessionId, onDraws: (draws: never[]) => void) => {
    onDraws([]);
    return vi.fn();
  }),
  subscribeVipCards: vi.fn(() => vi.fn()),
  subscribeWolfAttackMemberView: vi.fn((_sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    const listener = (view: unknown) => onView(view as WolfAttackMemberView | null);
    attackFeed.listeners.add(listener);
    listener(attackFeed.latest);
    return () => { attackFeed.listeners.delete(listener); };
  }),
}));

const { selectConsoleRole } = await import('@/lib/sessionService');

const PDF_ROLE = 'refinery-124-pdf-colonel';
const colonel: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Colonel', role: 'player', seatId: PDF_ROLE,
  assignedRoleId: PDF_ROLE, activeConsoleRoleId: null, fleetGroupId: 'fleet-1', joinedAt: '2026-11-05T00:00:00.000Z',
};
const wingAtRest: PdfEscortWingMemberView = {
  type: 'pdf-escort-fighter-wing-view', revision: 0, cycle: 1, capacity: 4, fighters: 4,
  launched: false, mediumResolved: false, mediumActionCount: 0,
  shortResolved: false, shortRollCount: 0, losses: 0,
};
const eligible: PdfEscortWingLaunchView = {
  type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 1,
  revision: 1, wingRevision: 0, launched: false, eligible: true,
};

function seedColonelSession(): void {
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
    currentTurn: 1, activeRoleIds: [PDF_ROLE], activeVesselIds: ['refinery-124'],
    pdfEscortWing: wingAtRest,
    createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
  } as never, colonel);
  state.setMode('console');
  state.setConnection('live');
  state.setSessionSnapshotFreshness('server');
}

function ColonelRoutes({ initial }: { readonly initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/console" element={<SessionMode mode="console" />} />
        <Route path="/ships/:shipId/roles" element={<ShipRoleSelect />} />
        <Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  launchService.read.mockReset();
  launchService.launch.mockReset();
  launchService.pass.mockReset();
  aceService.read.mockReset().mockResolvedValue(null);
  aceService.grant.mockReset();
  rangeService.read.mockReset();
  rangeService.commit.mockReset();
  attackFeed.latest = null;
  attackFeed.listeners.clear();
  vi.mocked(selectConsoleRole).mockReset().mockImplementation(async (roleId) => {
    const me = useSessionStore.getState().me;
    if (me) useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: roleId });
  });
  seedColonelSession();
});

it('lets the P.D.F. Colonel enter from the station catalog, launch from the charged Fighter Bay and return', async () => {
  const user = userEvent.setup();
  // The server read reflects the committed launch, and the member snapshot lands first.
  const launched: PdfEscortWingLaunchView = {
    ...eligible, revision: 2, wingRevision: 1, launched: true, eligible: false, reason: 'already-launched',
  };
  let committed = false;
  launchService.read.mockImplementation(async () => committed ? launched : eligible);
  launchService.launch.mockImplementation(async () => {
    committed = true;
    act(() => {
      const session = useSessionStore.getState().session!;
      useSessionStore.getState().setSession({ ...session, pdfEscortWing: { ...wingAtRest, revision: 1, launched: true } });
    });
    return { ...launched, status: 'committed', requestId: 'launch-1' };
  });
  render(<ColonelRoutes initial="/console" />);

  await user.click(screen.getByRole('link', { name: /refinery 124 \/\/ p\.d\.f\. colonel/i }));
  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith(PDF_ROLE));
  await user.click(await screen.findByRole('button', { name: 'Ship systems' }));

  const wing = await screen.findByRole('region', { name: 'PDF Escort Fighter Wing' });
  const control = within(wing).getByLabelText('PDF Escort Wing launch control');
  const launch = within(control).getByRole('button', { name: 'Launch PDF Escort Wing' });
  await waitFor(() => expect(launch).toBeEnabled());
  expect(launch).toHaveAccessibleDescription(/Refinery 8♦ Fighter Bay charged and operational/);
  expect(launchService.read).toHaveBeenCalledTimes(1);

  await user.click(launch);
  expect(launchService.launch).toHaveBeenCalledWith(1, 1, 0);
  expect(await within(control).findByText('Launched // Cycle 1')).toBeVisible();
  expect(within(control).getByRole('button', { name: 'PDF Escort Wing launched' })).toBeDisabled();
  expect(within(control).queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
  expect(within(wing).getByText('Launch state').nextElementSibling).toHaveTextContent('Launched');

  await user.click(screen.getByRole('link', { name: 'View ship consoles' }));
  expect(await screen.findByRole('heading', { name: /refinery 124 \/\/ station overview/i })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Back to fleet' }));
  expect(await screen.findByRole('heading', { name: /stations and consoles/i })).toBeInTheDocument();
});

it('shows the uncharged Fighter Bay denial on the Colonel route without offering a launch', async () => {
  const user = userEvent.setup();
  launchService.read.mockResolvedValue({ ...eligible, eligible: false, reason: 'uncharged' });
  render(<ColonelRoutes initial="/console" />);

  await user.click(screen.getByRole('link', { name: /refinery 124 \/\/ p\.d\.f\. colonel/i }));
  await user.click(await screen.findByRole('button', { name: 'Ship systems' }));
  const control = within(await screen.findByRole('region', { name: 'PDF Escort Fighter Wing' }))
    .getByLabelText('PDF Escort Wing launch control');
  expect(await within(control).findByText('Refinery 8♦ Fighter Bay uncharged // launch denied')).toBeVisible();
  expect(within(control).getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
  expect(within(control).queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
  expect(launchService.launch).not.toHaveBeenCalled();
});

function memberView(step: 'targeting' | 'medium-range' | 'short-range', revision: number): WolfAttackMemberView {
  return {
    type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'attack-1',
    turn: 1, revision, status: 'declared', phase: 'active', currentStep: step,
    range: step === 'medium-range' ? 'medium' : step === 'short-range' ? 'short' : 'long',
    deadlineAt: '2099-01-01T12:00:00Z', serverTime: '2099-01-01T12:00:00Z', visibility: 'members',
    redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'], results: [],
  } as WolfAttackMemberView;
}

function publishWing(wing: Partial<PdfEscortWingMemberView>): void {
  act(() => {
    const session = useSessionStore.getState().session!;
    useSessionStore.getState().setSession({ ...session, pdfEscortWing: { ...session.pdfEscortWing!, ...wing } });
  });
}

it('carries the launched P.D.F. Escort Wing through committed Medium and Short results on the Colonel route', async () => {
  const user = userEvent.setup();
  let step: 'targeting' | 'medium-range' | 'short-range' = 'targeting';
  let committed = false;
  const launched: PdfEscortWingLaunchView = {
    ...eligible, revision: 2, wingRevision: 1, launched: true, eligible: false, reason: 'already-launched',
  };
  // Outside targeting the server read only reports 'waiting'; the member projection keeps the launch.
  launchService.read.mockImplementation(async () => step !== 'targeting'
    ? { ...eligible, revision: 0, wingRevision: 1, eligible: false, reason: 'waiting' }
    : committed ? launched : eligible);
  launchService.launch.mockImplementation(async () => {
    committed = true;
    publishWing({ revision: 1, launched: true });
    return { ...launched, status: 'committed', requestId: 'launch-1' };
  });
  const rangeChoice = (range: 'medium-range' | 'short-range', revision: number, choiceStatus: 'pending' | 'committed') => ({
    type: 'wolf-fighter-range-action-view', sessionId: 's1', attackId: 'attack-1', turn: 1, revision,
    wingId: 'pdf-escort-fighter-wing', wingLabel: 'P.D.F. Escort Fighter Wing', range, choiceStatus,
    fighters: [{ fighterIndex: 0 }, { fighterIndex: 1 }, { fighterIndex: 2 }, { fighterIndex: 3 }],
    targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 4 }], launched: true,
  });
  const rangeStatus: Record<string, 'pending' | 'committed'> = { 'medium-range': 'pending', 'short-range': 'pending' };
  rangeService.read.mockImplementation(async (range: 'medium-range' | 'short-range') =>
    rangeChoice(range, range === 'medium-range' ? 3 : 4, rangeStatus[range]!));
  rangeService.commit.mockImplementation(async (view: { range: 'medium-range' | 'short-range' }) => {
    rangeStatus[view.range] = 'committed';
    publishWing(view.range === 'medium-range'
      ? { revision: 2, mediumResolved: true, mediumActionCount: 1 }
      : { revision: 3, shortResolved: true, shortRollCount: 2, fighters: 3, losses: 1 });
    return { status: 'committed' };
  });
  act(() => attackFeed.publish(memberView('targeting', 1)));
  render(<ColonelRoutes initial="/console" />);

  await user.click(screen.getByRole('link', { name: /refinery 124 \/\/ p\.d\.f\. colonel/i }));
  await user.click(await screen.findByRole('button', { name: 'Ship systems' }));
  const wing = await screen.findByRole('region', { name: 'PDF Escort Fighter Wing' });
  const control = within(wing).getByLabelText('PDF Escort Wing launch control');
  const launch = within(control).getByRole('button', { name: 'Launch PDF Escort Wing' });
  await waitFor(() => expect(launch).toBeEnabled());
  await user.click(launch);
  expect(await within(control).findByText('Launched // Cycle 1')).toBeVisible();
  expect(screen.queryByRole('region', { name: /P\.D\.F\. Escort Fighter Wing Medium Range actions/ })).not.toBeInTheDocument();

  step = 'medium-range';
  act(() => attackFeed.publish(memberView('medium-range', 3)));
  const medium = await screen.findByRole('region', { name: 'P.D.F. Escort Fighter Wing Medium Range actions' });
  await user.selectOptions(within(medium).getByLabelText('Fighter 1 action'), 'attack');
  await user.selectOptions(within(medium).getByLabelText('Fighter 1 target'), 'contact-1');
  await user.click(within(medium).getByRole('button', { name: 'Resolve Medium actions' }));
  expect(rangeService.commit).toHaveBeenCalledWith(expect.objectContaining({ range: 'medium-range', revision: 3 }),
    'pdf-escort-fighter-wing', [{ fighterIndex: 0, kind: 'attack', targetInstanceId: 'contact-1' }]);
  expect(await within(await screen.findByRole('region', { name: 'P.D.F. Escort Fighter Wing Medium Range actions' }))
    .findByText(/This range is committed/)).toBeVisible();
  expect(within(wing).getByText('Medium Range').nextElementSibling).toHaveTextContent('Resolved // 1 fighter actions');
  expect(within(control).getByText('Launched // Cycle 1')).toBeVisible();
  expect(within(control).getByRole('button', { name: 'PDF Escort Wing launched' })).toBeDisabled();

  step = 'short-range';
  act(() => attackFeed.publish(memberView('short-range', 4)));
  const short = await screen.findByRole('region', { name: 'P.D.F. Escort Fighter Wing Short Range actions' });
  await user.click(within(short).getByRole('checkbox', { name: 'Fighter 1 Short attack' }));
  await user.click(within(short).getByRole('checkbox', { name: 'Fighter 2 Short attack' }));
  await user.click(within(short).getByRole('button', { name: 'Resolve selected Short attacks' }));
  expect(rangeService.commit).toHaveBeenLastCalledWith(expect.objectContaining({ range: 'short-range', revision: 4 }),
    'pdf-escort-fighter-wing', [0, 1]);
  expect(await within(await screen.findByRole('region', { name: 'P.D.F. Escort Fighter Wing Short Range actions' }))
    .findByText(/This range is committed/)).toBeVisible();
  expect(within(wing).getByText('Short Range').nextElementSibling).toHaveTextContent('Resolved // 2 fighter rolls');
  expect(within(wing).getByText('Fighters remaining').nextElementSibling).toHaveTextContent('3 of 4');
  expect(within(wing).getByText('Wing losses').nextElementSibling).toHaveTextContent('1');
  expect(launchService.launch).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole('link', { name: 'View ship consoles' }));
  expect(await screen.findByRole('heading', { name: /refinery 124 \/\/ station overview/i })).toBeInTheDocument();
});
