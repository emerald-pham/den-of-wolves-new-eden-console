import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import PresidentWorkspace from './PresidentWorkspace';
import { useSessionStore } from '@/store/useSessionStore';

const { record, capital, visit } = vi.hoisted(() => ({ record: vi.fn(), capital: vi.fn(), visit: vi.fn() }));
vi.mock('@/lib/presidentWorkspaceService', () => ({
  recordPresidentAction: (...args: unknown[]) => record(...args),
  updatePoliticalCapital: (...args: unknown[]) => capital(...args),
  recordPresidentialVisit: (...args: unknown[]) => visit(...args),
}));

beforeEach(() => {
  record.mockReset().mockResolvedValue(undefined);
  capital.mockReset().mockResolvedValue(undefined);
  visit.mockReset().mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Session', joinCode: '123456', phase: 'active', ownerUid: 'u1',
    createdAt: '', updatedAt: '', currentTurn: 2,
    presidentWorkspace: { revision: 1, entries: [{ id: 'one', kind: 'crisis',
      text: 'Accept the negotiated settlement.', cycle: 2, recordedAt: '2026-09-21T21:00:00.000Z' }] },
    politicalCapital: { revision: 1, balance: 1, entries: [{ id: 'capital-one', action: 'gain',
      amount: 1, balanceAfter: 1, crisisId: 'crisis-0', crisisRevision: 3,
      crisisTitle: 'Earlier crisis', cycle: 1, recordedAt: '2026-09-21T20:00:00.000Z' }] },
    resolvedCrisisOutcome: { crisisId: 'crisis-1', revision: 4, title: 'Approaching vessel' },
    activeVesselIds: ['dione', 'shepherd'], shipUnrest: { dione: 0, shepherd: 3 },
    turnPhase: { turn: 2, teamPhaseEndsAt: '2026-10-04T10:00:00Z', openAirspaceEndsAt: '2026-10-04T10:20:00Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    turnState: { currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 2,
      startedAt: '2026-10-04T10:00:00Z', endsAt: '2026-10-04T10:20:00Z' },
  }, { uid: 'u1', sessionId: 's1', displayName: 'President', role: 'player', seatId: null,
    activeConsoleRoleId: 'dione-president', joinedAt: '' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('shows the server balance and authorizes one exact gain or spend', async () => {
  const user = userEvent.setup();
  render(<PresidentWorkspace writable />);
  expect(screen.getByText('These records document session decisions. Mechanical effects resolve through their dedicated controls.')).toBeVisible();
  expect(screen.getByLabelText('Political capital balance')).toHaveTextContent('1 / 8');
  expect(screen.getByText('Resolved crisis // Approaching vessel')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Gain 1' }));
  expect(capital).toHaveBeenCalledWith('gain');
  expect(screen.getByText('Political capital gained.')).toBeVisible();
});

it('records each selected action family while history waits for server projection', async () => {
  const user = userEvent.setup();
  render(<PresidentWorkspace writable />);
  await user.selectOptions(screen.getByLabelText('Action family'), 'visit');
  await user.type(screen.getByLabelText('Decision record'), 'Visit Shepherd during Team Time.');
  await user.click(screen.getByRole('button', { name: 'Record presidential visit' }));
  expect(record).toHaveBeenCalledWith('visit', 'Visit Shepherd during Team Time.');
  expect(screen.getByText('Presidential visit recorded.')).toBeVisible();
  expect(screen.getByRole('list', { name: 'President action history' })).toHaveTextContent('Crisis decision // Cycle 2');
});

it('presents a no-confirmation Coordination visit for one active ship with unrest', async () => {
  const user = userEvent.setup();
  render(<PresidentWorkspace writable />);
  const visitSection = screen.getByRole('region', { name: 'Presidential visit' });
  expect(within(visitSection).getByRole('combobox', { name: 'Ship to visit' })).toHaveValue('shepherd');
  const action = within(visitSection).getByRole('button', { name: 'Spend 1 and reduce unrest' });
  expect(action).toBeEnabled();
  await user.click(action);
  await waitFor(() => expect(visitSection).toHaveTextContent('Visit committed'));
  expect(visitSection).toHaveTextContent('Coordination');
  expect(within(visitSection).queryByRole('dialog')).not.toBeInTheDocument();
  expect(visitSection).toBeVisible();
  expect(visit()).toHaveBeenCalledWith('shepherd');
});

it('keeps the Coordination visit unavailable during Team phase', () => {
  act(() => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnState: { ...useSessionStore.getState().session!.turnState!, phase: 'team' },
    turnPhase: { ...useSessionStore.getState().session!.turnPhase!, airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
  }));
  render(<PresidentWorkspace writable />);
  expect(screen.getByRole('button', { name: 'Spend 1 and reduce unrest' })).toBeDisabled();
});

it('requires role write authority and a fresh live session', () => {
  act(() => useSessionStore.getState().setSessionSnapshotFreshness('cache'));
  render(<PresidentWorkspace writable={false} />);
  expect(screen.getByLabelText('Action family')).toBeDisabled();
  expect(screen.getByText(/active President authority and live connection required/i)).toBeVisible();
});
