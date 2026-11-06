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
    onView(null);
    return vi.fn();
  }),
}));

const { selectConsoleRole } = await import('@/lib/sessionService');

const PDF_ROLE = 'refinery-124-pdf-colonel';
const colonel: Player = {
  uid: 'u1', sessionId: 's1', displayName: 'Colonel', role: 'player', seatId: PDF_ROLE,
  assignedRoleId: PDF_ROLE, activeConsoleRoleId: null, joinedAt: '2026-11-05T00:00:00.000Z',
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
