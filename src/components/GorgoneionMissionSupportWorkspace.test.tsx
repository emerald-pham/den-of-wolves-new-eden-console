import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  apply: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  onProjection: undefined as ((projection: unknown) => void) | undefined,
}));

vi.mock('@/lib/gorgoneionMissionSupportService', () => ({
  getGorgoneionMissionSupportProjection: mocks.get,
  applyGorgoneionMissionSupport: mocks.apply,
  subscribeGorgoneionMissionSupportProjection: mocks.subscribe,
}));

import GorgoneionMissionSupportWorkspace from './GorgoneionMissionSupportWorkspace';

const projection = {
  sessionId: 's1', actorUid: 'captain', hostShipId: 'aegis', dockingRevision: 2,
  dealtCount: 0, cardIds: ['Q♣', 'A♥', '5♦', 'K♥', '4♥'],
};

function installSession(): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'captain', sessionId: 's1', displayName: 'Captain', role: 'player', seatId: null,
    assignedRoleId: 'admiral', replacementRoleId: 'gorgoneion-captain',
    replacementStatus: null, activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, phase: 'active', activeVesselIds: ['aegis'],
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2,
        population: 1_000, unrest: 0,
        cycle: {
          step: 0, revision: 1, results: {}, charges: [], turn: 1,
          chargingSkipped: false, startedAt: '',
        },
      },
    },
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(projection);
  mocks.apply.mockReset().mockResolvedValue({ status: 'committed' });
  mocks.unsubscribe.mockReset();
  mocks.subscribe.mockReset().mockImplementation((_sessionId, _actorUid, onProjection) => {
    mocks.onProjection = onProjection;
    return mocks.unsubscribe;
  });
  installSession();
});

afterEach(() => vi.unstubAllGlobals());

it('loads a current private projection and removes its faces when the server invalidates it', async () => {
  render(<GorgoneionMissionSupportWorkspace />);
  const panel = await screen.findByRole('region', { name: 'Gorgoneion mission support' });
  expect(await within(panel).findByRole('group', { name: 'Card 1 — Queen of clubs' })).toBeVisible();
  expect(mocks.get).toHaveBeenCalledWith();
  expect(mocks.subscribe).toHaveBeenCalledWith('s1', 'captain', expect.any(Function));

  act(() => mocks.onProjection?.(null));
  await waitFor(() => expect(within(panel).queryByRole('group', { name: 'Card 1 — Queen of clubs' }))
    .not.toBeInTheDocument());
  expect(mocks.unsubscribe).toHaveBeenCalled();
});

it('submits the exact source-order partition and clears the one-use workspace after commit', async () => {
  render(<GorgoneionMissionSupportWorkspace />);
  const panel = await screen.findByRole('region', { name: 'Gorgoneion mission support' });
  const ace = within(panel).getByRole('group', { name: 'Card 2 — Ace of hearts' });
  fireEvent.click(within(ace).getByLabelText('Move to bottom'));
  fireEvent.click(within(panel).getByRole('button', { name: 'Apply deck support' }));

  await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith({
    projection,
    topCardIds: ['Q♣', '5♦', 'K♥', '4♥'],
    bottomCardIds: ['A♥'],
  }));
  await waitFor(() => expect(within(panel).getByRole('status')).toHaveTextContent(/cannot be repeated/i));
  expect(within(panel).queryByRole('group', { name: 'Card 2 — Ace of hearts' })).not.toBeInTheDocument();
});

it('does not contact the callable before active gameplay and a current docked Captain snapshot', () => {
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, phase: 'casting',
  });
  render(<GorgoneionMissionSupportWorkspace />);
  expect(screen.getByRole('status')).toHaveTextContent(/unavailable/i);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.subscribe).not.toHaveBeenCalled();
});
