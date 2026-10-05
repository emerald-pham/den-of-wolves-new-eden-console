import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';

const submit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/gmLoyaltyAssignmentService', () => ({ submitExplicitGmLoyaltyAssignment: submit }));

import GmLoyaltySetupPanel from './GmLoyaltySetupPanel';

const coreRoster = [
  { uid: 'u1', sessionId: 's1', displayName: 'Aegis', role: 'player', assignedRoleId: 'aegis-engineer', replacementStatus: null, connected: true },
  { uid: 'u2', sessionId: 's1', displayName: 'Dione', role: 'player', assignedRoleId: 'dione-engineer', replacementStatus: null, connected: true },
  { uid: 'u3', sessionId: 's1', displayName: 'Asterion', role: 'player', assignedRoleId: 'asterion-engineer', replacementStatus: null, connected: true },
] as never;

const rosterWithPress = [
  ...coreRoster,
  { uid: 'press', sessionId: 's1', displayName: 'Press', role: 'player', assignedRoleId: null, seatId: null, replacementStatus: null, replacementRoleId: null, escapeState: null, connected: true, activeConsoleRoleId: 'press-officer' },
] as never;

function prepareGm({
  universalArbourEnabled = false,
  wolfCultEnabled = false,
  setupConfirmed = true,
  phase = 'casting',
  configurationLocked = false,
  pressEnabled = true,
  pressClaimed = false,
  playerCount = 14,
} = {}) {
  const session = {
    id: 's1', name: 'Fleet', joinCode: '1234', phase, currentTurn: 0,
    setupConfirmed, configurationLocked, setupRevision: 4, playerCount,
    universalArbourEnabled, wolfCultEnabled,
    pressEnabled, pressClaimed,
    activeRoleIds: ['aegis-engineer', 'dione-engineer', 'asterion-engineer'],
  };
  useSessionStore.getState().setIdentity(session as never, {
    uid: 'gm-1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
  } as never);
  useSessionStore.getState().setGmInstance({ id: 'gm-instance-1', sessionId: 's1', uid: 'gm-1' } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.setState({ gmLoyaltyCensus: { revision: 4, entries: [] }, gmLoyaltyCensusStatus: 'present' } as never);
}

describe('connected GM loyalty setup panel', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    submit.mockReset();
    prepareGm();
  });

  afterEach(() => {
    cleanup();
    useSessionStore.getState().reset();
  });

  it('explains that ordinary Wolves remain automatic and does not open an explicit loyalty form', () => {
    render(<GmLoyaltySetupPanel players={coreRoster} />);
    expect(screen.getByRole('region', { name: /explicit loyalty setup/i })).toHaveTextContent(/Wolf designation and routine loyalty are assigned automatically/i);
    expect(screen.getByText(/select an optional printed scenario/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign private loyalty/i })).not.toBeInTheDocument();
  });

  it('renders only source-allowed choices for the configured scenario and aggregate coverage', () => {
    prepareGm({ universalArbourEnabled: true });
    render(<GmLoyaltySetupPanel players={coreRoster} />);
    const kind = screen.getByRole('combobox', { name: 'Private loyalty type' });
    expect(kind).toHaveDisplayValue('Fleet Loyalist');
    expect(screen.getByRole('option', { name: 'Universal Arbour' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Wolf Agent' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Wolf Cult' })).not.toBeInTheDocument();
    expect(screen.getByText(/explicit printed configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/Current core holders \/\/ 0 of 3 configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Every current core role holder and claimed Press Officer needs a private record before start/i)).toBeInTheDocument();
  });

  it('allows the first explicit assignment after a server-confirmed empty census', async () => {
    const user = userEvent.setup();
    prepareGm({ universalArbourEnabled: true });
    useSessionStore.setState({ gmLoyaltyCensus: null, gmLoyaltyCensusStatus: 'empty' } as never);
    render(<GmLoyaltySetupPanel players={coreRoster} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Loyalty holder' }), 'u1');
    expect(screen.getByRole('combobox', { name: 'Private loyalty type' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign private loyalty' })).toBeEnabled();
    expect(screen.getByLabelText('Explicit loyalty coverage')).toHaveTextContent('All current holders // 0 of 3 configured');
  });

  it.each(['loading', 'error'] as const)('keeps the editor blocked while the live census is %s', (status) => {
    prepareGm({ universalArbourEnabled: true });
    useSessionStore.setState({ gmLoyaltyCensus: null, gmLoyaltyCensusStatus: status } as never);
    render(<GmLoyaltySetupPanel players={coreRoster} />);

    expect(screen.queryByRole('combobox', { name: 'Loyalty holder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign private loyalty' })).not.toBeInTheDocument();
  });

  it('offers reciprocal Friend selection from other current holders and uses source suspicion', async () => {
    const user = userEvent.setup();
    prepareGm({ wolfCultEnabled: true });
    render(<GmLoyaltySetupPanel players={coreRoster} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Private loyalty type' }), 'friend');
    const partner = screen.getByRole('combobox', { name: 'Reciprocal Friend partner' });
    expect(partner).toHaveDisplayValue('Choose another current holder');
    expect(screen.queryByRole('option', { name: /Press/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Wolf Cult' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Suspicion' })).toHaveDisplayValue('0');
  });

  it('submits a bound request only through the existing service and retries the exact request id and payload', async () => {
    const user = userEvent.setup();
    prepareGm({ universalArbourEnabled: true });
    submit.mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'functions/unavailable' }));
    submit.mockResolvedValueOnce({ setupRevision: 5 });
    render(<GmLoyaltySetupPanel players={coreRoster} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Loyalty holder' }), 'u1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Private loyalty type' }), 'universal-arbour');
    await user.click(screen.getByRole('button', { name: 'Assign private loyalty' }));
    await screen.findByRole('button', { name: 'Retry exact request' });
    const original = submit.mock.calls[0]?.[0];
    expect(original).toMatchObject({
      sessionId: 's1', instanceId: 'gm-instance-1', targetUid: 'u1', kind: 'universal-arbour', suspicion: 10,
    });
    expect(original.requestId).toEqual(expect.any(String));
    await user.click(screen.getByRole('button', { name: 'Retry exact request' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1]?.[0]).toEqual(original);
    expect(await screen.findByText(/Private record committed by the server/i)).toBeInTheDocument();
  });

  it('ignores a late callable reply after session or GM identity changes', async () => {
    const user = userEvent.setup();
    prepareGm({ universalArbourEnabled: true });
    let resolveCall!: (value: unknown) => void;
    submit.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    render(<GmLoyaltySetupPanel players={coreRoster} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Loyalty holder' }), 'u1');
    await user.click(screen.getByRole('button', { name: 'Assign private loyalty' }));
    act(() => useSessionStore.getState().setMe({ uid: 'another-gm', sessionId: 's1', role: 'gm' } as never));
    resolveCall({ setupRevision: 5 });
    await waitFor(() => expect(screen.queryByText(/committed by the server/i)).not.toBeInTheDocument());
  });

  it('keeps pending assignments out of browser persistence and reports no private card mapping', async () => {
    const user = userEvent.setup();
    prepareGm({ universalArbourEnabled: true });
    submit.mockRejectedValue(Object.assign(new Error('offline'), { code: 'functions/unavailable' }));
    render(<GmLoyaltySetupPanel players={coreRoster} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Loyalty holder' }), 'u1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Private loyalty type' }), 'universal-arbour');
    await user.click(screen.getByRole('button', { name: 'Assign private loyalty' }));
    await screen.findByRole('button', { name: 'Retry exact request' });
    const persisted = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? '').join('\n');
    expect(persisted).not.toContain('bound-loyalty-request');
    expect(persisted).not.toContain('Universal Arbour');
    expect(screen.getByRole('region', { name: /explicit loyalty setup/i })).not.toHaveTextContent(/u1/);
    expect(screen.getByRole('region', { name: /explicit loyalty setup/i })).not.toHaveTextContent(/assignedUids|partnerUid|private card/i);
  });

  it('disables the editor until the optional tuple is confirmed and while authority is stale', () => {
    act(() => prepareGm({ universalArbourEnabled: true, setupConfirmed: false }));
    const { rerender } = render(<GmLoyaltySetupPanel players={coreRoster} />);
    expect(screen.getByText(/confirm the optional choice before entering private records/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Private loyalty type' })).not.toBeInTheDocument();
    act(() => {
      prepareGm({ universalArbourEnabled: true });
      useSessionStore.getState().setSessionSnapshotFreshness('cache');
    });
    rerender(<GmLoyaltySetupPanel players={coreRoster} />);
    expect(screen.getByText(/live GM session authority is required/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign private loyalty' })).not.toBeInTheDocument();
  });

  it('never offers a Wolf kind in ordinary automatic mode and handles missing canonical holders as a blocker', () => {
    prepareGm();
    const { rerender } = render(<GmLoyaltySetupPanel players={[]} />);
    expect(screen.getByText(/Wolf designation and routine loyalty are assigned automatically/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Wolf Agent' })).not.toBeInTheDocument();
    act(() => prepareGm({ wolfCultEnabled: true }));
    rerender(<GmLoyaltySetupPanel players={[]} />);
    expect(screen.getByText(/assign current core roles before configuring loyalty/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign private loyalty' })).not.toBeInTheDocument();
  });

  it('offers a claimed Press holder as an explicit target while keeping core counts separate', () => {
    prepareGm({ universalArbourEnabled: true, pressClaimed: true });
    render(<GmLoyaltySetupPanel players={rosterWithPress} />);
    expect(screen.getByText(/Current core holders \/\/ 0 of 3 configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Press holder \/\/ private record required/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Press Officer — Press/ })).toBeInTheDocument();
  });

  it('blocks Press loyalty when the claim is not stable and authoritative', () => {
    prepareGm({ universalArbourEnabled: true, pressClaimed: true });
    const stalePress = [
      ...coreRoster,
      { uid: 'press', sessionId: 's1', displayName: 'Press', role: 'player', assignedRoleId: null, seatId: 'press-officer', replacementStatus: null, replacementRoleId: null, escapeState: null, connected: true, activeConsoleRoleId: 'press-officer' },
    ] as never;
    render(<GmLoyaltySetupPanel players={stalePress} />);
    expect(screen.getByText(/refresh or reconcile the claimed Press holder before configuring private loyalty/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Press Officer — Press/ })).not.toBeInTheDocument();
  });

  it('keeps the Wolf count source-derived and shows the additional Arbour blocker before start', () => {
    prepareGm({ universalArbourEnabled: true, playerCount: 8 });
    render(<GmLoyaltySetupPanel players={coreRoster} />);
    expect(screen.getByText(/Wolf roles \/\/ 0 of 1 required/i)).toBeInTheDocument();
    expect(screen.getByText(/assign 1 Wolf role record before start/i)).toBeInTheDocument();
  });

  it('blocks the editor when both optional printed loyalty scenarios are enabled', () => {
    prepareGm({ universalArbourEnabled: true, wolfCultEnabled: true });
    render(<GmLoyaltySetupPanel players={coreRoster} />);
    expect(screen.getByText(/choose exactly one explicit printed loyalty scenario/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Private loyalty type' })).not.toBeInTheDocument();
  });
});
