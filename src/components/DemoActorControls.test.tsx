import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { acknowledgeSessionWaiver, resetSessionWaiver } from '@/lib/sessionWaiver';
import type { GameSession, Player } from '@/types/game';
import DemoActorControls from './DemoActorControls';

const api = vi.hoisted(() => ({
  actors: [] as { sessionId: string; roleId: string; uid: string; label: string }[],
  renew: vi.fn(async () => []), switchActor: vi.fn(async () => undefined),
}));
vi.mock('@/lib/demoActorContext', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/demoActorContext')>(),
  activeDemoActorProfile: { sessionId: 'demo-session', roleId: 'controller' },
}));
vi.mock('@/lib/demoActorProfiles', () => ({
  readDemoActorRoster: () => api.actors, renewDemoActorPresence: api.renew, switchDemoActor: api.switchActor,
  demoSessionStatus: (session: { fullGameDemo?: { status: string } } | null) => session?.fullGameDemo?.status ?? null,
}));

const session = { id: 'demo-session', joinCode: '482100', phase: 'casting', currentTurn: 0,
  fullGameDemo: { status: 'preparing', progression: 'manual' } } as unknown as GameSession;

beforeEach(() => {
  vi.clearAllMocks(); api.actors = []; localStorage.clear(); acknowledgeSessionWaiver();
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
  expect(screen.getByRole('option', { name: 'AEGIS // Admiral' })).toBeInTheDocument();
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
