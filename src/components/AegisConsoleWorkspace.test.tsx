import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AegisConsoleWorkspace from './AegisConsoleWorkspace';
import { useSessionStore } from '@/store/useSessionStore';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { provePoliticsAndPress } from '../../scripts/pc10-politics-press-proof.mjs';

const politicsContractMock = vi.hoisted(() => ({ enterPreparedRoleStation: vi.fn() }));
vi.mock('../../scripts/pc10-political-crisis-arrest-proof-contracts.mjs', async importOriginal => ({
  ...await importOriginal(),
  enterPreparedRoleStation: politicsContractMock.enterPreparedRoleStation,
}));

vi.mock('@/lib/airspaceService', () => ({ unlockPressAirspace: vi.fn() }));
const { unlockPressAirspace } = await import('@/lib/airspaceService');
const exchangeMock = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock('@/lib/sessionService', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/sessionService')>();
  return { ...original, exchangeAegisFighterWings: exchangeMock.exchange };
});

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
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  exchangeMock.exchange.mockReset().mockResolvedValue({ amount: 1 });
  politicsContractMock.enterPreparedRoleStation.mockReset();
});

function mountedLocator(find: () => HTMLElement | null, user: ReturnType<typeof userEvent.setup>) {
  return {
    async waitFor() {
      await waitFor(() => expect(find()).toBeInTheDocument(), { timeout: 80, interval: 5 });
    },
    getByRole(role: string, options: { name?: string; exact?: boolean }) {
      return mountedLocator(() => {
        const parent = find();
        return parent ? within(parent).queryByRole(role as never, options as never) as HTMLElement | null : null;
      }, user);
    },
    getByLabel(label: string, options: { exact?: boolean }) {
      return mountedLocator(() => {
        const parent = find();
        return parent ? within(parent).queryByLabelText(label, options) as HTMLElement | null : null;
      }, user);
    },
    async fill(value: string) {
      const element = find();
      if (!element) throw new Error('The mounted control is not present.');
      fireEvent.change(element, { target: { value } });
    },
    async click() {
      const element = find();
      if (!element) throw new Error('The mounted control is not present.');
      await user.click(element);
    },
    async isVisible() { return Boolean(find()); },
    async isEnabled() {
      const element = find();
      return Boolean(element) && !(element as HTMLButtonElement).disabled;
    },
  };
}

it('selects the Admiral policy page through its visible control before waiting for the mounted proof region', async () => {
  const user = userEvent.setup();
  const evidenceDirectory = await mkdtemp(join(tmpdir(), 'pc10-politics-navigation-'));
  try {
    const gm = {
      sameActor: true, sessionId: 's1', uidHash: 'gm-source-hash', cycle: 1, phase: 'active',
      turnStatePhase: 'team', playerRole: 'gm', fullGameDemo: { status: 'active', progression: 'manual' },
      gmInstanceOwned: true, instanceId: 'gm-instance', connection: 'live', freshness: 'server',
    };
    const initial = { sessionId: 's1' };
    const roster = [{ roleId: 'admiral', uidHash: 'original-admiral-hash', displayName: 'Admiral' }];
    politicsContractMock.enterPreparedRoleStation.mockImplementation(async ({ initial: selectedInitial, roster: selectedRoster, roleId }) => {
      const actor = selectedRoster.find((entry: { roleId: string }) => entry.roleId === roleId);
      if (!actor) throw new Error(`Missing original actor for ${roleId}.`);
      return { actor: { actorKind: 'player', sessionId: selectedInitial.sessionId, uidHash: actor.uidHash,
        roleId, assignedRoleId: roleId, cycle: 1, phase: 'active', turnStatePhase: 'team' } };
    });

    render(<AegisConsoleWorkspace roleId="admiral" galacticCoordinate="0000" fuel={3} consoleLocked />);
    const page = {
      getByRole(role: string, options: { name?: string; exact?: boolean }) {
        return mountedLocator(() => screen.queryByRole(role as never, options as never) as HTMLElement | null, user);
      },
    };
    const context = {
      initial, started: gm, roster, directory: evidenceDirectory,
      gm: { observe: async () => gm }, crew: { page },
    };

    const result = await provePoliticsAndPress(context, { admiralDirective: 'Keep the fleet coordinated.' });

    expect(screen.getByRole('button', { name: 'Fleet directives' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Admiral policy and defence coordination' })).toBeVisible();
    expect(result.blocked).toContainEqual(expect.objectContaining({ branch: 'admiral-directive',
      blockerCodes: ['source-control-currently-disabled'] }));
    expect(politicsContractMock.enterPreparedRoleStation).toHaveBeenCalledWith(expect.objectContaining({
      initial, roster, roleId: 'admiral',
    }));
    const state = useSessionStore.getState();
    expect(state.session).toMatchObject({ id: 's1', phase: 'active', currentTurn: 1 });
    expect(state.me).toMatchObject({ sessionId: 's1', activeConsoleRoleId: 'admiral' });
    expect(state.connection).toBe('live');
    expect(state.sessionSnapshotFreshness).toBe('server');
  } finally {
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
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

it('offers and invokes the live paired fighter exchange during Team', async () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected a session.');
  useSessionStore.getState().setIdentity({
    ...session,
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 3, revision: 4 },
      'fighter-wing-bravo': { count: 2, revision: 7 },
    },
  }, {
    uid: 'wing', sessionId: 's1', displayName: 'Wing Commander', role: 'player', seatId: 'wing-commander',
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
    joinedAt: '2026-09-06T12:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');

  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} /></MemoryRouter>);

  const exchange = screen.getByRole('region', { name: /fighter wing exchange/i });
  expect(exchange).toBeVisible();
  expect(exchange).toHaveTextContent(/Alpha.*3 fighters.*Bravo.*2 fighters/i);
  const transfer = screen.getByRole('button', { name: /transfer fighter/i });
  expect(transfer).toBeEnabled();
  await userEvent.setup().click(transfer);
  await waitFor(() => expect(exchangeMock.exchange).toHaveBeenCalledWith('fighter-wing-alpha', 1));
});

it('disables the live Fighter Wing exchange while the restricted Team clock is paused', () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected a session.');
  useSessionStore.getState().setIdentity({
    ...session,
    currentTurn: 2,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: new Date(Date.now() + 60_000).toISOString(),
      openAirspaceEndsAt: new Date(Date.now() + 120_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      timerPause: {
        window: 'restricted', remainingMs: 60_000,
        pausedAt: new Date().toISOString(), reason: 'turn-interstitial',
      },
    },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 3, revision: 4 },
      'fighter-wing-bravo': { count: 2, revision: 7 },
    },
  }, {
    uid: 'wing', sessionId: 's1', displayName: 'Wing Commander', role: 'player', seatId: 'wing-commander',
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
    joinedAt: '2026-09-06T12:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');

  render(<MemoryRouter><AegisConsoleWorkspace roleId="wing-commander" galacticCoordinate="0000" fuel={3} /></MemoryRouter>);

  const exchange = screen.getByRole('region', { name: /fighter wing exchange/i });
  expect(exchange).toBeVisible();
  expect(screen.getByRole('button', { name: /transfer fighter/i })).toBeDisabled();
  expect(exchange).toHaveTextContent(/fighters can be exchanged during the current team phase/i);
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
