import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  propose: vi.fn(),
  consent: vi.fn(),
  revoke: vi.fn(),
  apply: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('@/lib/permissionedDismantlingService', () => ({
  proposePermissionedDismantling: mocks.propose,
  consentToPermissionedDismantling: mocks.consent,
  revokePermissionedDismantlingConsent: mocks.revoke,
  applyPermissionedDismantling: mocks.apply,
  subscribePermissionedDismantlingInbox: mocks.subscribe,
}));

import PermissionedDismantlingPanel from './PermissionedDismantlingPanel';

const pendingInbox = {
  type: 'permissioned-dismantling-inbox' as const,
  sessionId: 's1', targetShipId: 'dione', proposalId: 'proposal-1', proposerUid: 'engineer',
  craftId: 'philia' as const, targetConsoleId: 'reactor', targetRevision: 9, materialGain: 3 as const,
  status: 'pending' as const, consentId: null, materialsAfter: null,
  updatedAt: new Date('2026-09-30T17:00:00.000Z'),
};

beforeEach(() => {
  mocks.propose.mockReset().mockResolvedValue({ status: 'proposed', targetRevision: 9 });
  mocks.consent.mockReset().mockResolvedValue({ status: 'consented' });
  mocks.revoke.mockReset().mockResolvedValue({ status: 'revoked' });
  mocks.apply.mockReset().mockResolvedValue({ status: 'applied', materialsAfter: 8 });
  mocks.subscribe.mockReset().mockImplementation((_sessionId, _shipId, handlers) => {
    handlers.onInbox(pendingInbox);
    return vi.fn();
  });
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'stable-request-id') });
});

it('lets the current docked craft holder choose an undamaged target system and retry with one stable proposal id', async () => {
  const user = userEvent.setup();
  render(<PermissionedDismantlingPanel mode="proposer" sessionId="s1" craftId="philia"
    targetShipId="dione" targetSystems={[{ id: 'reactor', name: 'Reactor' }, { id: 'storage', name: 'Storage' }]}
    damagedSystemIds={['storage']} connection="live" canAct />);

  const panel = screen.getByRole('region', { name: /permissioned dismantling proposal/i });
  expect(within(panel).getByRole('option', { name: 'Storage // already damaged' })).toBeDisabled();
  await user.selectOptions(within(panel).getByLabelText('Undamaged target console'), 'reactor');
  await user.click(within(panel).getByRole('button', { name: /request target-player permission/i }));

  await waitFor(() => expect(mocks.propose).toHaveBeenCalledWith({
    proposalId: 'stable-request-id', craftId: 'philia', targetShipId: 'dione', targetConsoleId: 'reactor',
  }));
  expect(within(panel).getByText(/awaiting the dione player/i)).toBeInTheDocument();
  expect(mocks.subscribe).toHaveBeenCalledWith('s1', 'dione', expect.any(Object));
});

it('shows the exact request to the target player, permits consent, then allows the proposer to apply it', async () => {
  const user = userEvent.setup();
  let handlers: { onInbox: (value: unknown) => void } | undefined;
  mocks.subscribe.mockImplementation((_sessionId, _shipId, value) => {
    handlers = value;
    return vi.fn();
  });
  const { rerender } = render(<PermissionedDismantlingPanel mode="target" sessionId="s1" targetShipId="dione" />);
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());
  handlers?.onInbox(pendingInbox);
  expect(screen.getByText(/philia.*reactor.*3 materials/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /grant permission/i }));
  expect(mocks.consent).toHaveBeenCalledWith({ inbox: pendingInbox, consentId: 'stable-request-id' });

  mocks.subscribe.mockImplementation((_sessionId, _shipId, value) => {
    handlers = value;
    return vi.fn();
  });
  rerender(<PermissionedDismantlingPanel mode="proposer" sessionId="s1" craftId="philia"
    targetShipId="dione" targetSystems={[{ id: 'reactor', name: 'Reactor' }]}
    damagedSystemIds={[]} connection="live" canAct />);
  await waitFor(() => expect(mocks.subscribe).toHaveBeenLastCalledWith('s1', 'dione', expect.any(Object)));
  handlers?.onInbox({ ...pendingInbox, status: 'consented', consentId: 'stable-request-id' });
  await user.click(await screen.findByRole('button', { name: /apply consented dismantling/i }));
  expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({
    inbox: expect.objectContaining({ status: 'consented', consentId: 'stable-request-id' }),
    requestId: 'stable-request-id',
  }));
});

it('keeps controls unavailable when the live facilitator link or current authority is missing', () => {
  render(<PermissionedDismantlingPanel mode="proposer" sessionId="s1" craftId="philia"
    targetShipId="dione" targetSystems={[{ id: 'reactor', name: 'Reactor' }]}
    damagedSystemIds={[]} connection="offline" canAct={false} />);
  expect(screen.getByRole('button', { name: /request target-player permission/i })).toBeDisabled();
  expect(screen.getByText(/live facilitator connection and current shuttle authority/i)).toBeInTheDocument();
});
