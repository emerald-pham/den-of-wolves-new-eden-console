import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import PrimaryStatus from './PrimaryStatus';

beforeEach(() => useSessionStore.getState().reset());

it('renders all six named fields on the current ship route from the session projection', () => {
  useSessionStore.getState().setIdentity({
    id: 's1',
    name: 'Table one',
    joinCode: '4821',
    phase: 'active',
    currentTurn: 2,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-22T14:05:00.000Z',
      openAirspaceEndsAt: '2026-09-22T14:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  } as GameSession, {
    uid: 'u1',
    sessionId: 's1',
    displayName: 'Player one',
    role: 'player',
    seatId: 'admiral',
    assignedRoleId: 'admiral',
    activeConsoleRoleId: 'admiral',
    joinedAt: '2026-09-22T14:00:00.000Z',
  } as Player);
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setConnection('live');

  render(
    <MemoryRouter initialEntries={['/ships/aegis/observer']}>
      <PrimaryStatus />
    </MemoryRouter>,
  );

  expect(screen.getByRole('region', { name: 'Primary game status' })).toBeInTheDocument();
  for (const label of ['Cycle', 'Phase', 'Location', 'Authority', 'Next action', 'Failure state']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getByText('CYCLE 2')).toBeInTheDocument();
  expect(screen.getByText('ACTIVE // COORDINATION PHASE // AIRSPACE OPEN')).toBeInTheDocument();
  expect(screen.getByText('OBSERVER // FACILITATOR AUTHORITY REQUIRED')).toBeInTheDocument();
});

it('stays absent before a session is joined', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <PrimaryStatus />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('region', { name: 'Primary game status' })).not.toBeInTheDocument();
});
