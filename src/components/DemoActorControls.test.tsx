import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { acknowledgeSessionWaiver, resetSessionWaiver } from '@/lib/sessionWaiver';
import type { GameSession, Player } from '@/types/game';
import DemoActorControls from './DemoActorControls';

const api = vi.hoisted(() => ({
  profile: { sessionId: 'demo-session', roleId: 'controller' },
  actors: [] as { sessionId: string; roleId: string; uid: string; label: string }[],
  renew: vi.fn(async () => []), switchActor: vi.fn(async () => undefined),
}));
vi.mock('@/lib/demoActorContext', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/demoActorContext')>(),
  activeDemoActorProfile: api.profile,
}));
vi.mock('@/lib/demoActorProfiles', () => ({
  readDemoActorRoster: () => api.actors, renewDemoActorPresence: api.renew, switchDemoActor: api.switchActor,
  demoSessionStatus: (session: { fullGameDemo?: { status: string } } | null) => session?.fullGameDemo?.status ?? null,
}));

const session = { id: 'demo-session', joinCode: '482100', phase: 'casting', currentTurn: 0,
  fullGameDemo: { status: 'preparing', progression: 'manual' } } as unknown as GameSession;

beforeEach(() => {
  vi.clearAllMocks(); api.actors = []; api.profile.roleId = 'controller'; localStorage.clear(); acknowledgeSessionWaiver();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, { uid: 'controller', role: 'player', sessionId: session.id } as Player);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});
function show() { render(<MemoryRouter><DemoActorControls /></MemoryRouter>); }
function prepareActor() {
  api.actors = [{ sessionId: session.id, roleId: 'admiral', uid: 'real-admiral', label: 'AEGIS // Admiral' }];
  act(() => { window.dispatchEvent(new Event('dow-new-eden-demo-actors-changed')); });
}

it('exposes newly prepared actors in the selector without another document reload', async () => {
  show();
  expect(screen.getByLabelText('Current actor')).toBeDisabled();
  prepareActor();
  await waitFor(() => expect(screen.getByLabelText('Current actor')).toBeEnabled());
  expect(screen.getByRole('option', { name: 'AEGIS // Admiral // persona' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Current actor'), { target: { value: 'admiral' } });
  await waitFor(() => expect(api.switchActor).toHaveBeenCalledWith(api.actors[0], '482100'));
});

it('keeps actor switching behind the existing browser waiver', async () => {
  resetSessionWaiver(); show(); prepareActor();
  await waitFor(() => expect(screen.getByLabelText('Current actor')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Current actor'), { target: { value: 'admiral' } });
  expect(api.switchActor).not.toHaveBeenCalled();
});

it('leaves completed sessions out of operational presence renewal', () => {
  useSessionStore.getState().setSession({ ...session, phase: 'debrief',
    fullGameDemo: { status: 'complete', progression: 'manual' } } as GameSession);
  show();
  expect(api.renew).not.toHaveBeenCalled();
});

it.each([
  { replacementRoleId: 'doctor', expected: 'Quellon // Doctor' },
  { replacementRoleId: 'warrior-captain', expected: 'RSS Warrior // Warrior Captain' },
  { assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', expected: 'Wing Commander' },
])('keeps the original persona identity while disclosing its current $expected station', player => {
  api.profile.roleId = 'admiral';
  prepareActor();
  const { expected, ...fields } = player;
  useSessionStore.getState().setMe({ uid: 'real-admiral', sessionId: session.id, role: 'player',
    assignedRoleId: 'admiral', ...fields } as Player);
  show();
  expect(screen.getByRole('option', { name: 'AEGIS // Admiral // persona' })).toBeInTheDocument();
  expect(screen.getByText(/Current station:/)).toHaveTextContent(expected);
  expect(screen.getByText(/Persona identity:/)).toHaveTextContent('AEGIS // Admiral');
  expect(api.switchActor).not.toHaveBeenCalled();
});

it.each([
  { replacementStatus: 'awaiting-re-role', expected: 'awaiting GM role assignment' },
  { escapeState: { status: 'pending' }, expected: 'awaiting escape' },
  { activeConsoleRoleId: null, assignedRoleId: null, seatId: null, expected: 'not selected' },
])('explains $expected without restoring the persona original station', player => {
  api.profile.roleId = 'admiral'; prepareActor();
  const { expected, ...fields } = player;
  useSessionStore.getState().setMe({ uid: 'real-admiral', sessionId: session.id, role: 'player', ...fields } as Player);
  show();
  expect(screen.getByText(/Current station:/)).toHaveTextContent(expected);
  expect(api.switchActor).not.toHaveBeenCalled();
});
