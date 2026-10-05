import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GameSession, Player } from '@/types/game';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => { window.history.replaceState(null, '', '/'); });

it('hydrates neither the GM cache nor another actor outbox into a cold actor document', async () => {
  localStorage.setItem('dow-new-eden-session', JSON.stringify({ version: 1, state: {
    session: { id: 'ordinary-session' }, me: { uid: 'gm', role: 'gm' },
    gmInstance: { id: 'gm-instance' }, gmAccessAuthenticatedAt: Date.now(),
    pendingCommands: [{ id: 'gm-command', kind: 'assignRole' }],
  } }));
  window.history.replaceState(null, '', '/?demoActor=session-a~admiral');
  const first = await import('./useSessionStore');
  expect(first.useSessionStore.getState().me).toBeNull();
  expect(first.useSessionStore.getState().pendingCommands).toEqual([]);
  first.useSessionStore.getState().setIdentity({ id: 'session-a' } as GameSession, { uid: 'auth-admiral', role: 'player' } as Player);
  first.useSessionStore.getState().enqueueCommand({ id: 'actor-command', kind: 'claimSeat', createdAt: 'now', payload: { sessionId: 'session-a', seatId: 'aegis:admiral', requestId: 'actor-command', expectedSetupRevision: 0 } });
  vi.resetModules();
  window.history.replaceState(null, '', '/?demoActor=session-a~wing-commander');
  const second = await import('./useSessionStore');
  expect(second.useSessionStore.getState().me).toBeNull();
  expect(second.useSessionStore.getState().pendingCommands).toEqual([]);
  expect(second.useSessionStore.getState().gmAccessAuthenticatedAt).toBeNull();
  expect(second.useSessionStore.getState().privateLoyalty).toBeNull();
  vi.resetModules();
  window.history.replaceState(null, '', '/?demoActor=session-a~admiral');
  const returning = await import('./useSessionStore');
  expect(returning.useSessionStore.getState().me?.uid).toBe('auth-admiral');
  expect(returning.useSessionStore.getState().pendingCommands.map(command => command.id)).toEqual(['actor-command']);
  expect(returning.useSessionStore.getState().privateLoyalty).toBeNull();
  expect(JSON.parse(localStorage.getItem('dow-new-eden-session') ?? '{}').state.me.uid).toBe('gm');
});
