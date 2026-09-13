import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import CommissarPurgePanel from './CommissarPurgePanel';

const { consentCommissarPurge, applyCommissarPurge, refreshCommissarPurgeAuthority } = vi.hoisted(() => ({
  consentCommissarPurge: vi.fn().mockResolvedValue({ status: 'committed', turn: 1, revision: 0 }),
  applyCommissarPurge: vi.fn().mockResolvedValue({
    status: 'committed', turn: 1, revision: 1, survivorsRemoved: 3000, unrestReduced: 1,
  }),
  refreshCommissarPurgeAuthority: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sessionService', () => ({ consentCommissarPurge, applyCommissarPurge, refreshCommissarPurgeAuthority }));

const baseSession = {
  id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 1,
  activeRoleIds: ['icebreaker-captain'], activeVesselIds: ['aegis', 'icebreaker', 'dione'],
  vesselActionRevisions: { aegis: 0, icebreaker: 0, dione: 0 },
  shipSurvivors: { icebreaker: 40000 }, shipUnrest: { icebreaker: 2 },
  createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z',
};

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(baseSession as never, {
    uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: 'icebreaker-captain',
    replacementRoleId: null, joinedAt: '2026-09-13T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  consentCommissarPurge.mockClear();
  applyCommissarPurge.mockClear();
  refreshCommissarPurgeAuthority.mockClear();
});

it('offers captain consent as an accessible 44px action and activates it with Enter', async () => {
  const user = userEvent.setup();
  render(<CommissarPurgePanel shipId="icebreaker" />);
  const button = screen.getByRole('button', { name: /consent to commissar purge/i });
  expect(button).toBeVisible();
  expect(button).toHaveAttribute('type', 'button');
  button.focus();
  await user.keyboard('{Enter}');
  expect(consentCommissarPurge).toHaveBeenCalledWith('icebreaker');
});

it('lets the replacement select a consented active ship and submit the purge with Enter', async () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected session fixture.');
  useSessionStore.getState().setIdentity({
    ...session,
  }, {
    ...useSessionStore.getState().me!, replacementRoleId: 'commissar', activeConsoleRoleId: null,
  });
  useSessionStore.getState().setCommissarPurgeAuthority({
    sessionId: 's1', role: 'commissar', revision: 0,
    consents: { icebreaker: { turn: 1, vesselRevision: 0 } }, ledger: {},
  } as never);
  refreshCommissarPurgeAuthority.mockResolvedValue(useSessionStore.getState().commissarPurgeAuthority);
  const user = userEvent.setup();
  render(<CommissarPurgePanel shipId="icebreaker" />);
  expect(screen.getByRole('combobox', { name: /target ship/i })).toBeVisible();
  const button = screen.getByRole('button', { name: /purge survivors and reduce unrest/i });
  await waitFor(() => expect(button).not.toBeDisabled());
  button.focus();
  await user.keyboard('{Enter}');
  expect(applyCommissarPurge).toHaveBeenCalledWith('icebreaker');
});

it('shows a plain unavailable state after the once-per-turn receipt is present', async () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected session fixture.');
  useSessionStore.getState().setIdentity({
    ...session,
  }, {
    ...useSessionStore.getState().me!, replacementRoleId: 'commissar', activeConsoleRoleId: null,
  });
  useSessionStore.getState().setCommissarPurgeAuthority({
    sessionId: 's1', role: 'commissar', revision: 1,
    consents: { icebreaker: { turn: 1, vesselRevision: 0 } },
    ledger: { icebreaker: { turn: 1, revision: 1 } },
  } as never);
  refreshCommissarPurgeAuthority.mockResolvedValue(useSessionStore.getState().commissarPurgeAuthority);
  render(<CommissarPurgePanel shipId="icebreaker" />);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/already used its purge this turn/i));
  expect(screen.getByRole('button', { name: /purge survivors/i })).toBeDisabled();
});
