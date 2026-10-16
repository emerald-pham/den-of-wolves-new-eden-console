import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GameSession, Player } from '@/types/game';
import type * as DemoActorContext from '@/lib/demoActorContext';
import { useSessionStore } from '@/store/useSessionStore';
import { acknowledgeSessionWaiver } from '@/lib/sessionWaiver';
import DemoActorManager from './DemoActorManager';

const api = vi.hoisted(() => ({ profile: { sessionId: 'demo-session', roleId: 'controller' },
  prepare: vi.fn(), readRoster: vi.fn(() => []), switchActor: vi.fn(), waitForReady: vi.fn() }));
vi.mock('@/lib/demoActorProfiles', () => ({
  prepareDemoActors: api.prepare,
  readDemoActorRoster: api.readRoster,
  switchDemoActor: api.switchActor,
  waitForDemoPreparationReady: api.waitForReady,
  demoSessionStatus: (session: { fullGameDemo?: { status: string } } | null) => session?.fullGameDemo?.status ?? null,
  assertSelectedDemoActorIdentity: vi.fn(async () => undefined),
}));
vi.mock('@/lib/demoActorContext', async importOriginal => ({
  ...await importOriginal<typeof DemoActorContext>(),
  activeDemoActorProfile: api.profile,
  demoActorJoinCode: () => '482100',
}));
vi.mock('@/lib/sessionService', () => ({ joinSession: vi.fn(), connect: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ auth: () => ({ currentUser: { uid: 'controller-auth' } }) }));

const session = {
  id: 'demo-session', name: 'Solo rehearsal', joinCode: '482100', phase: 'casting', currentTurn: 0,
  fullGameDemo: { status: 'preparing', progression: 'manual' },
} as unknown as GameSession;

beforeEach(() => {
  vi.clearAllMocks(); api.profile.roleId = 'controller'; localStorage.clear(); acknowledgeSessionWaiver();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, { uid: 'controller-auth', sessionId: session.id, role: 'player' } as Player);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

function show() {
  render(<MemoryRouter initialEntries={['/demo-actors']}><Routes>
    <Route path="/demo-actors" element={<DemoActorManager />} />
    <Route path="/console" element={<p>Station catalog returned</p>} />
  </Routes></MemoryRouter>);
}

it('prepares the crew with one user action and exposes a visible return route', async () => {
  api.prepare.mockResolvedValue([{ sessionId: session.id, roleId: 'admiral', uid: 'admiral-auth', label: 'Admiral' }]);
  show();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare demo crew' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Prepare demo crew' }));
  await waitFor(() => expect(api.prepare).toHaveBeenCalledWith(session, expect.anything()));
  expect(await screen.findByRole('button', { name: /Admiral/i })).toBeInTheDocument();
  expect(screen.getByText(/simulated crew/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Back to stations' }));
  expect(screen.getByText('Station catalog returned')).toBeInTheDocument();
});

it('does not prepare an ordinary session or claim that its actors are human attendees', async () => {
  const ordinary = { ...session } as GameSession & { fullGameDemo?: unknown };
  delete ordinary.fullGameDemo;
  useSessionStore.getState().setSession(ordinary);
  show();
  expect(screen.queryByRole('button', { name: 'Prepare demo crew' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/GM.*prepare/i));
  expect(api.prepare).not.toHaveBeenCalled();
});

it('blocks preparation until live authority returns', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  show();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare demo crew' })).toBeDisabled());
  expect(api.prepare).not.toHaveBeenCalled();
});

it('binds an in-progress readiness wait to the original controller and current SDK identity', async () => {
  api.prepare.mockImplementation(async (_session, options) => {
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    expect(options.waitForReady).toBeTypeOf('function');
    await options.waitForReady();
    return [];
  });
  api.waitForReady.mockImplementation(async options => {
    expect(options.profile).toEqual(api.profile);
    expect(options.expectedUid).toBe('controller-auth');
    expect(options.read()).toMatchObject({ mounted: true, session: { id: session.id },
      me: { uid: 'controller-auth', role: 'player' }, authenticatedUid: 'controller-auth', freshness: 'cache' });
    useSessionStore.getState().setSessionSnapshotFreshness('server');
  });
  show();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare demo crew' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Prepare demo crew' }));
  await waitFor(() => expect(api.waitForReady).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('returns replacement extra-ship actors to the ordinary station catalog', async () => {
  api.profile.roleId = 'admiral';
  useSessionStore.getState().setMe({ uid: 'admiral-auth', sessionId: session.id,
    role: 'player', replacementRoleId: 'warrior-captain' } as Player);
  await act(async () => { show(); });
  const entry = screen.getByRole('link', { name: "Enter this actor's stations" });
  expect(entry).toHaveAttribute('href', '/console');
  fireEvent.click(entry);
  expect(screen.getByText('Station catalog returned')).toBeInTheDocument();
});
