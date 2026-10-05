import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';

const submit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/gmLoyaltyAssignmentService', () => ({ submitExplicitGmLoyaltyAssignment: submit }));

import GmLoyaltySetupPanel from './GmLoyaltySetupPanel';

const roster = [
  { uid: 'u1', sessionId: 's1', displayName: 'Aegis', role: 'player', assignedRoleId: 'aegis-engineer', replacementStatus: null },
  { uid: 'u2', sessionId: 's1', displayName: 'Dione', role: 'player', assignedRoleId: 'dione-engineer', replacementStatus: null },
  { uid: 'u3', sessionId: 's1', displayName: 'Asterion', role: 'player', assignedRoleId: 'asterion-engineer', replacementStatus: null },
  { uid: 'press', sessionId: 's1', displayName: 'Press', role: 'player', assignedRoleId: 'press-officer', replacementStatus: null },
] as never;

function prepareGm({
  universalArbourEnabled = false,
  wolfCultEnabled = false,
  setupConfirmed = true,
  phase = 'casting',
  configurationLocked = false,
} = {}) {
  const session = {
    id: 's1', name: 'Fleet', joinCode: '1234', phase, currentTurn: 0,
    setupConfirmed, configurationLocked, setupRevision: 4, playerCount: 14,
    universalArbourEnabled, wolfCultEnabled,
    activeRoleIds: ['aegis-engineer', 'dione-engineer', 'asterion-engineer'],
  };
  useSessionStore.getState().setIdentity(session as never, {
    uid: 'gm-1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
  } as never);
  useSessionStore.getState().setGmInstance({ id: 'gm-instance-1', sessionId: 's1', uid: 'gm-1' } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.setState({ gmLoyaltyCensus: { revision: 4, entries: [] } } as never);
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
    render(<GmLoyaltySetupPanel players={roster} />);
    expect(screen.getByRole('region', { name: /explicit loyalty setup/i })).toHaveTextContent(/ordinary Wolf designation is automatic/i);
    expect(screen.getByText(/select an optional printed scenario/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign private loyalty/i })).not.toBeInTheDocument();
  });

  it('renders only source-allowed choices for the configured scenario and aggregate coverage', () => {
    prepareGm({ universalArbourEnabled: true });
    render(<GmLoyaltySetupPanel players={roster} />);
    const kind = screen.getByRole('combobox', { name: 'Private loyalty type' });
    expect(kind).toHaveDisplayValue('Fleet Loyalist');
    expect(screen.getByRole('option', { name: 'Universal Arbour' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Wolf Agent' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Wolf Cult' })).not.toBeInTheDocument();
    expect(screen.getByText(/explicit printed configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/0 of 3 current holders configured/i)).toBeInTheDocument();
    expect(screen.getByText(/every current role holder needs a private record before start/i)).toBeInTheDocument();
  });

  it('offers reciprocal Friend selection from other current holders and uses source suspicion', async () => {
    const user = userEvent.setup();
    prepareGm({ wolfCultEnabled: true });
    render(<GmLoyaltySetupPanel players={roster} />);
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
    render(<GmLoyaltySetupPanel players={roster} />);
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
    expect(await screen.findByRole('status')).toHaveTextContent(/committed by the server/i);
  });

  it('ignores a late callable reply after session or GM identity changes', async () => {
    const user = userEvent.setup();
    prepareGm({ universalArbourEnabled: true });
    let resolveCall!: (value: unknown) => void;
    submit.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
    render(<GmLoyaltySetupPanel players={roster} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Loyalty holder' }), 'u1');
    await user.click(screen.getByRole('button', { name: 'Assign private loyalty' }));
    useSessionStore.getState().setMe({ uid: 'another-gm', sessionId: 's1', role: 'gm' } as never);
    resolveCall({ setupRevision: 5 });
    await waitFor(() => expect(screen.queryByText(/committed by the server/i)).not.toBeInTheDocument());
  });

  it('keeps pending assignments out of browser persistence and reports no private card mapping', async () => {
    const user = userEvent.setup();
    prepareGm({ universalArbourEnabled: true });
    submit.mockRejectedValue(Object.assign(new Error('offline'), { code: 'functions/unavailable' }));
    render(<GmLoyaltySetupPanel players={roster} />);
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
    prepareGm({ universalArbourEnabled: true, setupConfirmed: false });
    const { rerender } = render(<GmLoyaltySetupPanel players={roster} />);
    expect(screen.getByText(/confirm the optional choice before entering private records/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Private loyalty type' })).not.toBeInTheDocument();
    prepareGm({ universalArbourEnabled: true });
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    rerender(<GmLoyaltySetupPanel players={roster} />);
    expect(screen.getByText(/live GM session authority is required/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign private loyalty' })).not.toBeInTheDocument();
  });

  it('never offers a Wolf kind in ordinary automatic mode and handles missing canonical holders as a blocker', () => {
    prepareGm();
    const { rerender } = render(<GmLoyaltySetupPanel players={[]} />);
    expect(screen.getByText(/ordinary Wolf designation is automatic/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Wolf Agent' })).not.toBeInTheDocument();
    prepareGm({ wolfCultEnabled: true });
    rerender(<GmLoyaltySetupPanel players={[]} />);
    expect(screen.getByText(/assign current core roles before configuring loyalty/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign private loyalty' })).not.toBeInTheDocument();
  });
});
