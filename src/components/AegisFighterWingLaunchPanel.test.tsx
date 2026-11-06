import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';

const mocks = vi.hoisted(() => ({
  getLaunch: vi.fn(),
  subscribe: vi.fn(),
  receive: undefined as undefined | ((view: WolfAttackMemberView | null) => void),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeWolfAttackMemberView: mocks.subscribe,
}));
vi.mock('@/lib/sessionService', () => ({
  getAegisFighterWingLaunch: (sourceId: string) => mocks.getLaunch(sourceId),
  launchAegisFighterWing: vi.fn(),
  passWolfFighterLaunchChoice: vi.fn(),
}));
vi.mock('./PdfFighterAcePermissionControl', () => ({
  default: ({ sourceId }: { sourceId: string }) => <div data-testid={`ace-permission-${sourceId}`} />,
}));

import AegisFighterWingLaunchPanel, { AegisFighterWingLaunchPanelView } from './AegisFighterWingLaunchPanel';

const alpha = {
  type: 'aegis-fighter-wing-launch-view', sessionId: 's1', wingId: 'fighter-wing-alpha',
  turn: 1, attackId: 'wolf-1', revision: 4, wingRevision: 0, fighters: 4,
  launched: false, eligible: true,
} as const;
const bravo = {
  ...alpha, wingId: 'fighter-wing-bravo', eligible: false, reason: 'uncharged',
} as const;

function audience(overrides: Partial<WolfAttackMemberView> = {}): WolfAttackMemberView {
  return {
    type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'wolf-1',
    turn: 1, revision: 4, status: 'declared', phase: 'active', currentStep: 'medium-range', range: 'medium',
    deadlineAt: '2026-10-04T12:05:00.000Z', serverTime: '2026-10-04T12:00:00.000Z',
    visibility: 'members', redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
    results: [], ...overrides,
  };
}

function initialAudience(view: WolfAttackMemberView | null) {
  mocks.subscribe.mockImplementation((_id, receive) => {
    mocks.receive = receive;
    receive(view);
    return vi.fn();
  });
}

beforeEach(() => {
  mocks.receive = undefined;
  mocks.getLaunch.mockReset().mockImplementation(async (wingId: string) => ({ ...alpha, wingId }));
  mocks.subscribe.mockReset();
  initialAudience(audience());
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', currentTurn: 1, ownerUid: 'gm',
    createdAt: '2026-10-04T12:00:00.000Z', updatedAt: '2026-10-04T12:00:00.000Z',
  }, {
    uid: 'wing', sessionId: 's1', displayName: 'Wing Commander', role: 'player', seatId: 'wing-seat',
    activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-main', connected: true,
    joinedAt: '2026-10-04T12:00:00.000Z',
  });
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
});

it('keeps Alpha and Bravo launch choices independent and explains an uncharged bay', () => {
  const onLaunch = vi.fn();
  render(<AegisFighterWingLaunchPanelView views={{
    'fighter-wing-alpha': alpha,
    'fighter-wing-bravo': bravo,
  }} onLaunch={onLaunch} />);

  expect(screen.getByRole('region', { name: /aegis fighter wing launches/i })).toBeVisible();
  expect(screen.getByText('Fighter Wing Alpha')).toBeVisible();
  expect(screen.getByText('Fighter Wing Bravo')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /launch fighter wing alpha/i }));
  expect(onLaunch).toHaveBeenCalledWith('fighter-wing-alpha', alpha);
  expect(screen.getByRole('button', { name: /launch fighter wing bravo/i })).toBeDisabled();
  expect(screen.getByText(/charge Fighter Bay Bravo/i)).toBeVisible();
});

it('offers an explicit pass for each eligible independent wing choice', () => {
  const onLaunch = vi.fn();
  const onPass = vi.fn();
  render(<AegisFighterWingLaunchPanelView views={{
    'fighter-wing-alpha': alpha,
    'fighter-wing-bravo': bravo,
  }} onLaunch={onLaunch} onPass={onPass} />);

  fireEvent.click(screen.getByRole('button', { name: /pass fighter wing alpha/i }));
  expect(onPass).toHaveBeenCalledWith('fighter-wing-alpha', alpha);
  expect(screen.queryByRole('button', { name: /pass fighter wing bravo/i })).not.toBeInTheDocument();
});

it('mounts source-officer Fighter Ace permission controls for launched AEGIS wings', async () => {
  mocks.getLaunch.mockImplementation(async (wingId: string) => ({
    ...alpha, wingId, launched: true, eligible: false, reason: 'already-launched',
  }));

  render(<AegisFighterWingLaunchPanel />);

  expect(await screen.findByTestId('ace-permission-fighter-wing-alpha')).toBeInTheDocument();
  expect(await screen.findByTestId('ace-permission-fighter-wing-bravo')).toBeInTheDocument();
  expect(mocks.getLaunch).toHaveBeenCalledTimes(2);
});

it('waits for the first attack audience before reading launch authority', async () => {
  initialAudience(null);
  render(<AegisFighterWingLaunchPanel />);
  await act(async () => { await Promise.resolve(); });
  expect(mocks.getLaunch).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: /aegis fighter wing launches/i })).not.toBeInTheDocument();

  act(() => mocks.receive?.(audience({ currentStep: 'targeting', range: null })));
  await waitFor(() => expect(screen.getByRole('button', { name: /launch fighter wing alpha/i })).toBeEnabled());
  expect(mocks.getLaunch).toHaveBeenCalledTimes(2);
});

it.each([
  ['resolved', { status: 'resolved' as const, currentStep: 'resolved' as const }],
  ['an old cycle', { turn: 0 }],
  ['another session', { sessionId: 's2' }],
])('does not read fighter launch state for %s attack audiences', async (_label, overrides) => {
  initialAudience(audience(overrides));
  render(<AegisFighterWingLaunchPanel />);
  await act(async () => { await Promise.resolve(); });
  expect(mocks.getLaunch).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: /aegis fighter wing launches/i })).not.toBeInTheDocument();
});

it('removes combat choices after resolution without another launch read', async () => {
  mocks.getLaunch.mockImplementation(async (wingId: string) => ({ ...alpha, wingId, launched: true, eligible: false }));
  render(<AegisFighterWingLaunchPanel />);
  expect(await screen.findByTestId('ace-permission-fighter-wing-alpha')).toBeInTheDocument();
  act(() => mocks.receive?.(audience({ status: 'resolved', currentStep: 'resolved', revision: 5 })));
  expect(screen.queryByTestId('ace-permission-fighter-wing-alpha')).not.toBeInTheDocument();
  expect(mocks.getLaunch).toHaveBeenCalledTimes(2);
});

it('does not restore launched-wing controls from a read that completes after resolution', async () => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  mocks.getLaunch.mockImplementation(async (wingId: string) => {
    await pending;
    return { ...alpha, wingId, launched: true, eligible: false };
  });
  render(<AegisFighterWingLaunchPanel />);
  await waitFor(() => expect(mocks.getLaunch).toHaveBeenCalledTimes(2));
  act(() => mocks.receive?.(audience({ status: 'resolved', currentStep: 'resolved', revision: 5 })));
  await act(async () => { release?.(); await pending; });
  expect(screen.queryByTestId('ace-permission-fighter-wing-alpha')).not.toBeInTheDocument();
});

it('shows a committed Bravo launch after the attack leaves targeting while Alpha stays unlaunched', async () => {
  mocks.getLaunch.mockImplementation(async (wingId: string) => wingId === 'fighter-wing-bravo'
    ? { ...alpha, wingId, fighters: 3, launched: true, eligible: false, choiceStatus: 'launched', reason: 'waiting' }
    : { ...alpha, wingId, eligible: false, reason: 'waiting' });

  render(<AegisFighterWingLaunchPanel />);

  const bravoWing = await screen.findByRole('article', { name: 'Fighter Wing Bravo' });
  expect(await within(bravoWing).findByText('Fighter Wing Bravo is launched for this attack.')).toBeVisible();
  expect(within(bravoWing).getByText('3 fighters remaining')).toBeVisible();
  expect(within(bravoWing).getByRole('button', { name: /launch fighter wing bravo/i })).toBeDisabled();
  const alphaWing = screen.getByRole('article', { name: 'Fighter Wing Alpha' });
  expect(within(alphaWing).getByText('Waiting for the current Wolf attack targeting step.')).toBeVisible();
  expect(screen.getByTestId('ace-permission-fighter-wing-bravo')).toBeInTheDocument();
  expect(screen.queryByTestId('ace-permission-fighter-wing-alpha')).not.toBeInTheDocument();
});

it('keeps a passed Bravo choice explained after targeting without blocking Alpha', () => {
  render(<AegisFighterWingLaunchPanelView views={{
    'fighter-wing-alpha': { ...alpha, launched: true, eligible: false, choiceStatus: 'launched', reason: 'already-launched' },
    'fighter-wing-bravo': { ...alpha, wingId: 'fighter-wing-bravo', eligible: false, choiceStatus: 'passed', reason: 'waiting' },
  }} onLaunch={vi.fn()} />);

  const alphaWing = screen.getByRole('article', { name: 'Fighter Wing Alpha' });
  expect(within(alphaWing).getByText('Fighter Wing Alpha is launched for this attack.')).toBeVisible();
  const bravoWing = screen.getByRole('article', { name: 'Fighter Wing Bravo' });
  expect(within(bravoWing).getByText('Launch choice passed for this attack.')).toBeVisible();
  expect(within(bravoWing).getByRole('button', { name: /launch fighter wing bravo/i })).toBeDisabled();
});

it.each([
  ['damaged', 'Fighter Bay Bravo is damaged and cannot launch this wing.'],
  ['no-fighters', 'No fighters remain in Bravo.'],
  ['destroyed', 'A destroyed AEGIS cannot launch its fighter wings.'],
] as const)('explains why Bravo cannot launch when its bay is %s while Alpha remains launchable', (reason, text) => {
  render(<AegisFighterWingLaunchPanelView views={{
    'fighter-wing-alpha': alpha,
    'fighter-wing-bravo': { ...bravo, reason },
  }} onLaunch={vi.fn()} onPass={vi.fn()} />);

  const bravoWing = screen.getByRole('article', { name: 'Fighter Wing Bravo' });
  expect(within(bravoWing).getByRole('status')).toHaveTextContent(text);
  expect(within(bravoWing).getByRole('button', { name: /launch fighter wing bravo/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /launch fighter wing alpha/i })).toBeEnabled();
});
