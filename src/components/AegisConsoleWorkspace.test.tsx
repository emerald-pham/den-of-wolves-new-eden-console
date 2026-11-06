import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AegisConsoleWorkspace from './AegisConsoleWorkspace';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('@/lib/airspaceService', () => ({ unlockPressAirspace: vi.fn() }));
const { unlockPressAirspace } = await import('@/lib/airspaceService');
vi.mock(import('@/lib/sessionService'), async (importOriginal) => ({
  ...await importOriginal(),
  buildFighter: vi.fn(),
  exchangeFighterWings: vi.fn(),
}));
const { buildFighter, exchangeFighterWings } = await import('@/lib/sessionService');
const attackFeed = vi.hoisted(() => ({ listeners: [] as Array<(view: unknown) => void> }));
vi.mock('@/lib/firestore', () => ({
  subscribeWolfAttackMemberView: vi.fn((_sessionId: string, onView: (view: unknown) => void) => {
    attackFeed.listeners.push(onView);
    onView(null);
    return () => { attackFeed.listeners = attackFeed.listeners.filter((listener) => listener !== onView); };
  }),
}));
type FighterBuildReply = Awaited<ReturnType<typeof buildFighter>>;
type FighterWingExchangeReply = Awaited<ReturnType<typeof exchangeFighterWings>>;

beforeEach(() => {
  window.sessionStorage.clear();
  attackFeed.listeners = [];
  vi.mocked(buildFighter).mockReset();
  vi.mocked(exchangeFighterWings).mockReset();
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
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('routes the Admiral to the bounded fleet policy and defence coordination workspace', async () => {
  const user = userEvent.setup();
  render(<AegisConsoleWorkspace roleId="admiral" galacticCoordinate="0000" fuel={3} />);

  await user.click(screen.getByRole('button', { name: 'Fleet directives' }));
  const workspace = screen.getByRole('region', { name: 'Admiral policy and defence coordination' });
  expect(workspace).toHaveTextContent('This channel does not grant facilitator controls.');
  expect(screen.getByLabelText('Fleet policy')).toBeEnabled();
  expect(screen.getByLabelText('Defence coordination')).toBeEnabled();
  expect(screen.queryByRole('button', { name: /gm|facilitator/i })).not.toBeInTheDocument();
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

it('holds the Press exception when no matching authoritative airspace phase exists', async () => {
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

it('describes the Starlight fuel readout as tracked at its console', () => {
  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} /></MemoryRouter>);

  expect(screen.getByText('Tracked at the console')).toBeVisible();
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

function stageWingConstruction(overrides: Record<string, unknown> = {}) {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected a session.');
  useSessionStore.getState().setSession({
    ...session,
    maintenanceCycles: {
      aegis: { step: 5, revision: 3, results: {}, charges: ['construction-bay'], refuelled: [] },
    },
    shipUpgrades: { aegis: [] },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 2, securityTeams: 9 } },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 3, revision: 0 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    },
    vesselActionRevisions: { aegis: 0 },
    ...overrides,
  } as never);
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'wing-commander' });
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function renderWingCard(name: 'Fighter Wing Alpha' | 'Fighter Wing Bravo' = 'Fighter Wing Alpha') {
  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} /></MemoryRouter>);
  const card = screen.getByRole('heading', { name }).closest('article');
  if (!(card instanceof HTMLElement)) throw new Error(`Expected the ${name} card.`);
  return card;
}

it.each([
  ['the Construction Bay is not charged', { maintenanceCycles: { aegis: { step: 5, revision: 3, results: {}, charges: [], refuelled: [] } } },
    /build unavailable \/\/ construction bay not charged\. next actor \/\/ aegis admiral or executive officer charges it through maintenance/i],
  ['the Construction Bay is damaged', { shipDamage: { aegis: { damagedSystemIds: ['construction-bay'], destroyed: false } } },
    /build unavailable \/\/ construction bay damaged\. next actor \/\/ an engineering shuttle repairs it/i],
  ['AEGIS has no materials', { shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 0, securityTeams: 9 } } },
    /build unavailable \/\/ 1 material required/i],
  ['the game has not reached Cycle 1', { currentTurn: 0 },
    /build unavailable \/\/ cycle 1 required\. next actor \/\/ gm completes the normal start/i],
  ['Team Phase has ended', { turnPhase: {
    turn: 1, teamPhaseEndsAt: '2026-01-01T00:10:00.000Z', openAirspaceEndsAt: '2099-01-01T00:30:00.000Z',
    airspace: { state: 'open', tickerActive: true, pressAccess: true },
  } }, /build unavailable \/\/ team phase required/i],
])('explains the blocker and next actor when %s', (_case, overrides, guidance) => {
  stageWingConstruction(overrides);
  const alpha = renderWingCard();

  expect(within(alpha).getByText(guidance)).toBeVisible();
  expect(within(alpha).getByRole('button', { name: /build 1 fighter/i })).toBeDisabled();
});

it('explains a full wing separately from an eligible wing and its one-material cost', () => {
  stageWingConstruction();
  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} /></MemoryRouter>);
  const alpha = screen.getByRole('heading', { name: 'Fighter Wing Alpha' }).closest('article');
  const bravo = screen.getByRole('heading', { name: 'Fighter Wing Bravo' }).closest('article');
  if (!(alpha instanceof HTMLElement) || !(bravo instanceof HTMLElement)) throw new Error('Expected both cards.');

  expect(within(alpha).getByText(/2 materials available\. next actor \/\/ wing commander builds one fighter for one material/i)).toBeVisible();
  expect(within(alpha).getByRole('button', { name: /build 1 fighter/i })).toBeEnabled();
  expect(within(bravo).getByText(/build unavailable \/\/ wing at capacity \(4 fighters\)/i)).toBeVisible();
  expect(within(bravo).getByRole('button', { name: /build 1 fighter/i })).toBeDisabled();
});

it('shows the pending build and then the committed wing strength and material cost', async () => {
  stageWingConstruction();
  let resolveBuild: (reply: FighterBuildReply) => void = () => undefined;
  vi.mocked(buildFighter).mockImplementation(() => new Promise((resolve) => { resolveBuild = resolve; }));
  const user = userEvent.setup();
  const alpha = renderWingCard();

  await user.click(within(alpha).getByRole('button', { name: /build 1 fighter/i }));
  expect(buildFighter).toHaveBeenCalledWith('fighter-wing-alpha');
  expect(within(alpha).getByText(/build pending \/\/ awaiting the server commit/i)).toBeVisible();

  resolveBuild({ status: 'committed', wingId: 'fighter-wing-alpha', count: 4, fighterWingRevision: 1, materials: 1, capacity: 4 });
  expect(await within(alpha).findByText(
    /last build committed \/\/ fighter wing alpha now 4 fighters \(revision 1\) \/\/ 1 material spent \/\/ 1 material remains/i,
  )).toBeVisible();
  expect(within(alpha).queryByText(/build pending/i)).not.toBeInTheDocument();
});

it.each([
  ['a stale reply', { status: 'stale', wingId: 'fighter-wing-alpha', capacity: 4, currentRevision: 3 } as const,
    /last build not committed \/\/ aegis state changed before the build committed\. no material was spent/i],
  ['no confirmed reply', null,
    /last build not confirmed \/\/ check live strength and materials before building again/i],
])('reports %s without claiming a committed fighter', async (_case, reply, notice) => {
  stageWingConstruction();
  vi.mocked(buildFighter).mockResolvedValue(reply);
  const user = userEvent.setup();
  const alpha = renderWingCard();

  await user.click(within(alpha).getByRole('button', { name: /build 1 fighter/i }));
  expect(await within(alpha).findByText(notice)).toBeVisible();
  expect(within(alpha).queryByText(/last build committed/i)).not.toBeInTheDocument();
});

it('rebuilds a wing after combat losses and recovers from an unconfirmed reply without inventing the result', async () => {
  // Alpha came back from combat with one fighter; AEGIS holds three materials.
  stageWingConstruction({
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 1, revision: 4 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    },
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 3, securityTeams: 9 } },
  });
  vi.mocked(buildFighter)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      status: 'committed', wingId: 'fighter-wing-alpha', count: 2, fighterWingRevision: 5, materials: 2, capacity: 4,
    });
  const user = userEvent.setup();
  const alpha = renderWingCard();

  expect(alpha).toHaveTextContent(/live strength.*1 fighter \/\/ revision 4/i);
  expect(within(alpha).getByText(/3 materials available\. next actor \/\/ wing commander builds one fighter for one material/i)).toBeVisible();
  await user.click(within(alpha).getByRole('button', { name: /build 1 fighter/i }));
  expect(await within(alpha).findByText(
    /last build not confirmed \/\/ check live strength and materials before building again\. building this wing again resends the same request and cannot spend a second material/i,
  )).toBeVisible();
  // Nothing is claimed until the server confirms: strength and materials still show the live snapshot.
  expect(alpha).toHaveTextContent(/live strength.*1 fighter \/\/ revision 4.*construction materials.*3 materials/i);

  await user.click(within(alpha).getByRole('button', { name: /build 1 fighter/i }));
  expect(await within(alpha).findByText(
    /last build committed \/\/ fighter wing alpha now 2 fighters \(revision 5\) \/\/ 1 material spent \/\/ 2 materials remain/i,
  )).toBeVisible();
  expect(buildFighter).toHaveBeenCalledTimes(2);
});

it('shows the server wing state, not a lost pending build, after the console reloads', () => {
  stageWingConstruction({
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 2, revision: 5 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    },
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 2, securityTeams: 9 } },
  });
  const alpha = renderWingCard();

  expect(alpha).toHaveTextContent(/live strength.*2 fighters \/\/ revision 5.*construction materials.*2 materials/i);
  expect(within(alpha).queryByText(/build pending/i)).not.toBeInTheDocument();
  expect(within(alpha).queryByText(/last build/i)).not.toBeInTheDocument();
  expect(within(alpha).getByRole('button', { name: /build 1 fighter/i })).toBeEnabled();
});

function stageWingExchange(overrides: Record<string, unknown> = {}) {
  stageWingConstruction({
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 4, revision: 2 },
      'fighter-wing-bravo': { count: 1, revision: 5 },
    },
    ...overrides,
  });
}

function renderExchange() {
  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} /></MemoryRouter>);
  return screen.getByRole('region', { name: 'Fighter Wing exchange' });
}

it('offers only exchanges the receiving wing can hold and shows the pending then committed counts', async () => {
  stageWingExchange();
  let resolveExchange: (reply: FighterWingExchangeReply) => void = () => undefined;
  vi.mocked(exchangeFighterWings).mockImplementation(() => new Promise((resolve) => { resolveExchange = resolve; }));
  const user = userEvent.setup();
  const panel = renderExchange();

  expect(panel).toHaveTextContent(/alpha.*4 fighters.*bravo.*1 fighter.*capacity 4 per wing/i);
  const amount = within(panel).getByRole('combobox', { name: 'Fighters to move' });
  expect(within(amount).getAllByRole('option').map((option) => option.textContent)).toEqual(['1', '2', '3']);
  await user.selectOptions(amount, '2');
  await user.click(within(panel).getByRole('button', { name: 'Move 2 fighters from Alpha to Bravo' }));
  expect(exchangeFighterWings).toHaveBeenCalledWith('fighter-wing-alpha', 2);
  expect(within(panel).getByText(/exchange pending \/\/ awaiting the server commit/i)).toBeVisible();
  expect(within(panel).getByRole('button', { name: /move 2 fighters/i })).toBeDisabled();

  resolveExchange({
    status: 'committed', sourceWingId: 'fighter-wing-alpha', targetWingId: 'fighter-wing-bravo', amount: 2,
    capacity: 4, turn: 1,
    counts: { 'fighter-wing-alpha': { count: 2, revision: 3 }, 'fighter-wing-bravo': { count: 3, revision: 6 } },
  });
  expect(await within(panel).findByText(
    /exchange committed \/\/ 2 fighters moved from alpha to bravo \/\/ alpha now 2 fighters, bravo now 3 fighters/i,
  )).toBeVisible();
});

it('moves fighters the other way within the upgraded six-fighter capacity', async () => {
  stageWingExchange({ shipUpgrades: { aegis: ['construction-bay'] } });
  vi.mocked(exchangeFighterWings).mockResolvedValue(null);
  const user = userEvent.setup();
  const panel = renderExchange();

  await user.selectOptions(within(panel).getByRole('combobox', { name: 'Move fighters from' }), 'fighter-wing-bravo');
  await user.click(within(panel).getByRole('button', { name: 'Move 1 fighter from Bravo to Alpha' }));
  expect(exchangeFighterWings).toHaveBeenCalledWith('fighter-wing-bravo', 1);
});

it.each([
  ['the receiving wing is full', { fighterWingCounts: {
    'fighter-wing-alpha': { count: 4, revision: 2 }, 'fighter-wing-bravo': { count: 4, revision: 5 },
  } }, /exchange unavailable \/\/ bravo already holds 4 fighters, its capacity\. both wings are full\.$/i],
  ['only the other direction can move fighters', { fighterWingCounts: {
    'fighter-wing-alpha': { count: 3, revision: 2 }, 'fighter-wing-bravo': { count: 4, revision: 5 },
  } }, /exchange unavailable \/\/ bravo already holds 4 fighters, its capacity\. choose bravo to alpha instead\./i],
  ['Team Phase has ended', { turnPhase: {
    turn: 1, teamPhaseEndsAt: '2026-01-01T00:10:00.000Z', openAirspaceEndsAt: '2099-01-01T00:30:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  } }, /exchange unavailable \/\/ team phase required\. next actor \/\/ wing commander waits for the next team phase/i],
  ['the Team clock is paused', { turnPhase: {
    turn: 1, teamPhaseEndsAt: '2099-01-01T00:10:00.000Z', openAirspaceEndsAt: '2099-01-01T00:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    timerPause: { window: 'restricted', remainingMs: 60_000, pausedAt: '2026-01-01T00:05:00.000Z' },
  } }, /exchange unavailable \/\/ team phase clock paused\. next actor \/\/ gm resumes the clock/i],
  ['the game has not reached Cycle 1', { currentTurn: 0 }, /exchange unavailable \/\/ cycle 1 required/i],
])('explains why the exchange is unavailable when %s', (_case, overrides, guidance) => {
  stageWingExchange(overrides);
  const panel = renderExchange();

  expect(within(panel).getByText(guidance)).toBeVisible();
  expect(within(panel).getByRole('button', { name: /move \d fighters? from/i })).toBeDisabled();
});

it('explains that the exchange waits while a Wolf attack is in progress, and reopens once it resolves', async () => {
  stageWingExchange();
  const panel = renderExchange();
  const exchange = within(panel).getByRole('button', { name: 'Move 1 fighter from Alpha to Bravo' });
  expect(exchange).toBeEnabled();

  const member = { type: 'wolf-attack-member-view', sessionId: 's1', attackId: 'attack-1', turn: 1, revision: 3,
    status: 'declared', currentStep: 'medium-range', range: 'medium' };
  act(() => attackFeed.listeners.forEach((listener) => listener(member)));
  expect(within(panel).getByText(
    /exchange unavailable \/\/ wolf attack active; the wings are at the combat table\. next actor \/\/ wing commander waits for the attack to resolve/i,
  )).toBeVisible();
  expect(exchange).toBeDisabled();

  act(() => attackFeed.listeners.forEach((listener) => listener({ ...member, status: 'resolved', currentStep: 'resolved', range: null })));
  expect(within(panel).queryByText(/wolf attack active/i)).not.toBeInTheDocument();
  expect(exchange).toBeEnabled();
});

it('keeps the exchange unavailable while reconnecting from a cached session', () => {
  stageWingExchange();
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  useSessionStore.getState().setConnection('offline');
  const panel = renderExchange();

  expect(within(panel).getByText(/exchange unavailable \/\/ awaiting live server state/i)).toBeVisible();
  expect(within(panel).getByRole('button', { name: /move \d fighters? from/i })).toBeDisabled();
});

it.each([
  ['a stale reply', {
    status: 'stale', sourceWingId: 'fighter-wing-alpha', targetWingId: 'fighter-wing-bravo', amount: 1,
    capacity: 4, turn: 1,
    counts: { 'fighter-wing-alpha': { count: 3, revision: 3 }, 'fighter-wing-bravo': { count: 1, revision: 5 } },
  } as const, /exchange not committed \/\/ the wing counts changed first\. no fighters moved; review the live counts and try again/i],
  ['no confirmed reply', null,
    /exchange not confirmed \/\/ check the live counts\. retrying the same choice resends the same request and cannot move fighters twice/i],
])('reports %s without claiming fighters moved', async (_case, reply, notice) => {
  stageWingExchange();
  vi.mocked(exchangeFighterWings).mockResolvedValue(reply);
  const user = userEvent.setup();
  const panel = renderExchange();

  await user.click(within(panel).getByRole('button', { name: 'Move 1 fighter from Alpha to Bravo' }));
  expect(await within(panel).findByText(notice)).toBeVisible();
  expect(within(panel).queryByText(/exchange committed/i)).not.toBeInTheDocument();
});

it('tells the Wing Commander when a retry found the exchange already committed', async () => {
  stageWingExchange();
  vi.mocked(exchangeFighterWings).mockResolvedValue({
    status: 'replayed', sourceWingId: 'fighter-wing-alpha', targetWingId: 'fighter-wing-bravo', amount: 1,
    capacity: 4, turn: 1,
    counts: { 'fighter-wing-alpha': { count: 3, revision: 3 }, 'fighter-wing-bravo': { count: 2, revision: 6 } },
  });
  const user = userEvent.setup();
  const panel = renderExchange();

  await user.click(within(panel).getByRole('button', { name: 'Move 1 fighter from Alpha to Bravo' }));
  expect(await within(panel).findByText(
    /exchange already committed \/\/ 1 fighter moved from alpha to bravo \/\/ alpha now 3 fighters, bravo now 2 fighters/i,
  )).toBeVisible();
});

it('keeps the exchange blocked by an unresolved attack carried from an earlier cycle, as the server does', () => {
  const now = Date.now();
  stageWingExchange({ currentTurn: 2, turnPhase: {
    turn: 2, teamPhaseEndsAt: new Date(now + 10 * 60_000).toISOString(),
    openAirspaceEndsAt: new Date(now + 30 * 60_000).toISOString(),
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  } });
  const panel = renderExchange();
  const exchange = within(panel).getByRole('button', { name: 'Move 1 fighter from Alpha to Bravo' });

  act(() => attackFeed.listeners.forEach((listener) => listener({
    type: 'wolf-attack-member-view', sessionId: 's1', attackId: 'attack-1', turn: 1, revision: 9,
    status: 'declared', currentStep: 'boarding', range: null,
  })));
  expect(within(panel).getByText(/exchange unavailable \/\/ wolf attack active/i)).toBeVisible();
  expect(exchange).toBeDisabled();
});

it('explains that a replacement build waits while a Wolf attack holds the wings at the combat table', () => {
  stageWingConstruction();
  const alpha = renderWingCard();
  const build = within(alpha).getByRole('button', { name: /build 1 fighter/i });
  expect(build).toBeEnabled();

  act(() => attackFeed.listeners.forEach((listener) => listener({
    type: 'wolf-attack-member-view', sessionId: 's1', attackId: 'attack-1', turn: 1, revision: 3,
    status: 'declared', currentStep: 'medium-range', range: 'medium',
  })));
  expect(within(alpha).getByText(
    /build unavailable \/\/ wolf attack active; the wings are at the combat table\. next actor \/\/ wing commander waits for the attack to resolve/i,
  )).toBeVisible();
  expect(build).toBeDisabled();
});
