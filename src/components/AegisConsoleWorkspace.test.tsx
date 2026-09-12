import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AegisConsoleWorkspace from './AegisConsoleWorkspace';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('@/lib/airspaceService', () => ({ unlockPressAirspace: vi.fn() }));
const { unlockPressAirspace } = await import('@/lib/airspaceService');

beforeEach(() => {
  const now = Date.now();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'u1',
    createdAt: '2026-09-06T12:00:00.000Z', updatedAt: '2026-09-06T12:00:00.000Z',
    currentTurn: 1,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(now + 10 * 60_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 30 * 60_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as never, {
    uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player', seatId: null,
    activeConsoleRoleId: 'admiral', joinedAt: '2026-09-06T12:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
});

it('keeps the Press airspace exception under AEGIS systems control and makes timer authority read-only', async () => {
  const user = userEvent.setup();
  render(<AegisConsoleWorkspace roleId="admiral" galacticCoordinate="0000" fuel={3} />);

  await user.click(screen.getByText('Systems control'));
  const control = screen.getByRole('region', { name: 'Airspace control' });
  expect(screen.getByRole('button', { name: /unlock airspace.*press/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /airspace closed timer.*no manual control/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /airspace open timer.*no manual control/i })).toBeDisabled();
  expect(control).toHaveTextContent(/non-affiliated vessels.*closed/i);
  await user.click(screen.getByRole('button', { name: /unlock airspace.*press/i }));
  expect(unlockPressAirspace).toHaveBeenCalledOnce();
});

it('holds the Press exception at Turn 0 for a non-GM Admiral', async () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected a session.');
  useSessionStore.getState().setSession({ ...session, currentTurn: 0 });
  const user = userEvent.setup();
  render(<AegisConsoleWorkspace roleId="admiral" galacticCoordinate="0000" fuel={3} />);

  await user.click(screen.getByText('Systems control'));
  expect(screen.getByRole('button', { name: /unlock airspace.*press/i })).toBeDisabled();
});

it('shows live Fighter Wing counts separately from bay status and effective capacity', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected a session.');
  useSessionStore.getState().setSession({
    ...session,
    maintenanceCycles: {
      aegis: { step: 5, revision: 1, results: {}, charges: ['fighter-bay-alpha'], refuelled: [] },
    },
    shipUpgrades: { aegis: ['construction-bay'] },
    shipDamage: {
      aegis: { damagedSystemIds: ['fighter-bay-bravo'], destroyed: false },
    },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 4, revision: 1 },
      'fighter-wing-bravo': { count: 2, revision: 2 },
    },
  });
  useSessionStore.getState().setSessionSnapshotFreshness('server');

  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} /></MemoryRouter>);

  const alpha = screen.getByRole('heading', { name: 'Fighter Wing Alpha' }).closest('article');
  const bravo = screen.getByRole('heading', { name: 'Fighter Wing Bravo' }).closest('article');
  if (!alpha || !bravo) throw new Error('Expected both fighter-wing cards.');
  expect(alpha).toHaveTextContent(/live server snapshot.*effective capacity.*6 fighters.*construction bay upgraded/i);
  expect(alpha).toHaveTextContent(/live strength.*4 fighters.*revision 1/i);
  expect(alpha).toHaveTextContent(/launch eligibility.*eligible.*bay charged and operational/i);
  expect(alpha).toHaveTextContent(/assigned system.*fighter bay alpha.*condition.*operational.*charge.*charged.*upgrade source.*construction bay.*upgraded/i);
  expect(bravo).toHaveTextContent(/live strength.*2 fighters.*revision 2/i);
  expect(bravo).toHaveTextContent(/launch eligibility.*blocked.*bay damaged/i);
  expect(bravo).toHaveTextContent(/condition.*damaged.*charge.*not charged/i);
  expect(bravo).not.toHaveTextContent(/tracked at the table/i);
});

it('keeps fighter status unavailable while reconnecting from a cached session', () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  useSessionStore.getState().setConnection('offline');

  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} /></MemoryRouter>);

  const alpha = screen.getByRole('heading', { name: 'Fighter Wing Alpha' }).closest('article');
  if (!alpha) throw new Error('Expected the Alpha fighter-wing card.');
  expect(alpha).toHaveTextContent(/unavailable.*reconnect required.*effective capacity.*unavailable.*live strength.*awaiting fighter count from the server/i);
  expect(alpha).toHaveTextContent(/launch eligibility.*unavailable.*awaiting live bay state.*condition.*unavailable/i);
});
