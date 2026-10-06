import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FIGHTER_WING_CAPACITY } from '../../functions/src/fighterWings';
import { useSessionStore } from '@/store/useSessionStore';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import type * as SessionService from '@/lib/sessionService';
import type { GameSession } from '@/types/game';
import AegisConsoleWorkspace from './AegisConsoleWorkspace';

const service = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock('@/lib/sessionService', async importOriginal => ({
  ...await importOriginal<typeof SessionService>(), buildFighter: service.build,
}));

beforeEach(() => {
  useSessionStore.getState().reset();
  service.build.mockReset().mockResolvedValue(undefined);
  const now = Date.now();
  useSessionStore.getState().setIdentity({ id: 'guidance-session', phase: 'active', currentTurn: 2,
    turnPhase: { turn: 2, teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 1_800_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    maintenanceCycles: { aegis: { step: 5, revision: 1, results: {},
      charges: ['construction-bay', 'fighter-bay-alpha', 'fighter-bay-bravo'], refuelled: [] } },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shipResources: { aegis: { materials: 2 } }, shipUpgrades: { aegis: [] },
    fighterWingCounts: { 'fighter-wing-alpha': { count: 2, revision: 1 },
      'fighter-wing-bravo': { count: 2, revision: 1 } },
  } as unknown as GameSession, { uid: 'wing-actor', sessionId: 'guidance-session', displayName: 'Wing',
    role: 'player', assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
    seatId: null, connectionGeneration: 1, joinedAt: '2026-10-06T12:00:00.000Z' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});
afterEach(() => { cleanup(); useSessionStore.getState().reset(); });

function patchSession(patch: Partial<GameSession>) {
  useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, ...patch });
}
function mount(writable = true) {
  render(<MemoryRouter><ConsoleAccessContext.Provider value={{ writable, roleId: 'wing-commander' }}>
    <AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} />
  </ConsoleAccessContext.Provider></MemoryRouter>);
}
function alpha() {
  const article = screen.getByRole('heading', { name: 'Fighter Wing Alpha' }).closest('article');
  if (!article) throw new Error('Expected the production Alpha card.');
  return within(article);
}
function blocked() {
  const card = alpha();
  expect(card.getByRole('button', { name: 'Build 1 fighter // 1 material' })).toBeDisabled();
  expect(service.build).not.toHaveBeenCalled();
  return card;
}

it('names Construction Bay charging and the maintenance actor even when the launch bay is already charged', () => {
  patchSession({ maintenanceCycles: { aegis: { step: 5, revision: 1, results: {},
    charges: ['fighter-bay-alpha'], refuelled: [] } } });
  mount(); const card = blocked();
  expect(card.getByText(/Eligible.*bay charged and operational/)).toBeVisible();
  expect(card.getByText(/Build unavailable.*Construction Bay.*not charged.*Admiral.*Executive Officer.*maintenance/i)).toBeVisible();
});

it('names Construction Bay damage independently of the undamaged launch bay', () => {
  patchSession({ shipDamage: { aegis: { damagedSystemIds: ['construction-bay'], destroyed: false } } });
  mount(); const card = blocked();
  expect(card.getByText(/Eligible.*bay charged and operational/)).toBeVisible();
  expect(card.getByText(/Build unavailable.*Construction Bay.*damaged.*Admiral.*Executive Officer.*repair/i)).toBeVisible();
});

it('reports the actual zero-material blocker and keeps the one-material build price', () => {
  patchSession({ shipResources: { aegis: { materials: 0 } } as unknown as NonNullable<GameSession['shipResources']> });
  mount(); const card = blocked();
  expect(card.getByText('0 materials')).toBeVisible();
  expect(card.getByText(/Build unavailable.*1 material.*AEGIS crew/i)).toBeVisible();
});

it('waits for an absent construction resource projection without inventing zero stock', () => {
  patchSession({ shipResources: {} });
  mount(); const card = blocked();
  expect(card.getByText(/Unavailable.*awaiting live resource state/)).toBeVisible();
  expect(card.getByText(/Build unavailable.*materials.*not published.*server/i)).toBeVisible();
});

it('identifies the published standard capacity and next Wing actor without asking another build', () => {
  patchSession({ fighterWingCounts: { 'fighter-wing-alpha': { count: FIGHTER_WING_CAPACITY.standard, revision: 2 },
    'fighter-wing-bravo': { count: 2, revision: 1 } } });
  mount(); const card = blocked();
  expect(card.getByText(/Build unavailable.*wing.*capacity.*4.*Wing Commander/i)).toBeVisible();
});

it('uses the real upgraded capacity rather than treating four fighters as full', async () => {
  patchSession({ shipUpgrades: { aegis: ['construction-bay'] }, fighterWingCounts: {
    'fighter-wing-alpha': { count: 4, revision: 2 }, 'fighter-wing-bravo': { count: 2, revision: 1 } } });
  mount(); const card = alpha();
  expect(card.getByText(/6 fighters.*Construction Bay upgraded/)).toBeVisible();
  await userEvent.click(card.getByRole('button', { name: 'Build 1 fighter // 1 material' }));
  expect(service.build).toHaveBeenCalledExactlyOnceWith('fighter-wing-alpha');
  expect(card.getByText(/2 materials available.*Next actor.*Wing Commander/i)).toBeVisible();
});

it('reports the cycle-zero GM-start blocker without enabling construction', () => {
  patchSession({ currentTurn: 0 });
  mount(); const card = blocked();
  expect(card.getByText(/Build unavailable.*Cycle 1.*GM.*start/i)).toBeVisible();
});

it('reports the Team Phase blocker with the GM as phase actor', () => {
  const session = useSessionStore.getState().session!;
  patchSession({ turnPhase: { ...session.turnPhase!, progression: 'manual', airspace: {
    state: 'lifted', tickerActive: true, pressAccess: false } } });
  mount(); const card = blocked();
  expect(card.getByText(/Build unavailable.*Team Phase.*GM/i)).toBeVisible();
});

it('keeps a published snapshot offline until the original member reconnects', () => {
  useSessionStore.getState().setConnection('offline');
  mount(); const card = blocked();
  expect(card.getByText(/Build unavailable.*reconnect.*Wing Commander/i)).toBeVisible();
});

it('keeps a cached high stock/count projection unverified rather than naming an actionable maintenance cause', () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  mount(); const card = blocked();
  expect(card.getByText(/Build unavailable.*live server state.*Next actor.*Wing Commander/i)).toBeVisible();
  expect(card.queryByText(/Build unavailable.*bay damaged/i)).not.toBeInTheDocument();
});

it('describes read-only access without granting construction to that viewer', () => {
  mount(false); const card = blocked();
  expect(card.getByText(/Build unavailable.*read-only.*current.*console actor/i)).toBeVisible();
});

it('holds unpublished fighter strength and describes the source wait rather than a GM strength edit', () => {
  patchSession({ fighterWingCounts: {} });
  mount(); const card = blocked();
  expect(card.getByText(/Build unavailable.*fighter strength.*not published.*server/i)).toBeVisible();
  expect(card.queryByText(/GM.*add fighters/i)).not.toBeInTheDocument();
});

it('changes the derived explanation after the same current actor receives a real Construction Bay charge', async () => {
  patchSession({ maintenanceCycles: { aegis: { step: 5, revision: 1, results: {}, charges: [], refuelled: [] } } });
  mount(); const card = blocked();
  expect(card.getByText(/Build unavailable.*Construction Bay.*not charged/i)).toBeVisible();
  act(() => patchSession({ maintenanceCycles: { aegis: { step: 5, revision: 2, results: {},
    charges: ['construction-bay'], refuelled: [] } } }));
  expect(card.getByRole('button', { name: 'Build 1 fighter // 1 material' })).toBeEnabled();
  await userEvent.click(card.getByRole('button', { name: 'Build 1 fighter // 1 material' }));
  expect(service.build).toHaveBeenCalledExactlyOnceWith('fighter-wing-alpha');
  expect(card.getByText(/2 materials available.*Next actor.*Wing Commander/i)).toBeVisible();
});
