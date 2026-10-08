import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import {
  GmWolfAmnestyPanel,
  WolfAmnestyCaptainPanel,
  WolfCommanderAddressAmnestyPanel,
} from './WolfCommanderAmnestyPanels';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), address: vi.fn(), offer: vi.fn(), respond: vi.fn(), consequence: vi.fn(),
}));

vi.mock('@/lib/sessionService', () => ({
  getWolfAmnestyView: mocks.get,
  publishWolfCommanderAddress: mocks.address,
  createWolfAmnestyOffer: mocks.offer,
  respondToWolfAmnesty: mocks.respond,
  recordWolfAmnestyConsequence: mocks.consequence,
}));

const currentOffer = {
  type: 'wolf-amnesty-offer' as const,
  offerId: 'amnesty-4-a', cycle: 4, revision: 1, targetShipId: 'dione',
  condition: 'surrender-by-medium-jump-to-0101' as const,
  responseDeadline: new Date(Date.now() + 60_000).toISOString(), status: 'offered' as const,
};

function setCommander(manualDemo = false): void {
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 4,
      activeVesselIds: ['dione', 'aegis'], ownerUid: 'gm1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      ...(manualDemo ? { fullGameDemo: { status: 'active' as const, progression: 'manual' as const } } : {}) },
    { uid: 'u1', sessionId: 's1', displayName: 'Commander', role: 'player', seatId: null,
      assignedRoleId: null, replacementRoleId: 'wolf-commander', fleetGroupId: 'fleet-1',
      joinedAt: '2026-01-01T00:00:00.000Z' },
  );
}

function setCaptain(manualDemo = false): void {
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 4,
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      ...(manualDemo ? { fullGameDemo: { status: 'active' as const, progression: 'manual' as const } } : {}) },
    { uid: 'captain', sessionId: 's1', displayName: 'Dione captain', role: 'player', seatId: null,
      assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
      joinedAt: '2026-01-01T00:00:00.000Z' },
  );
}

function setGm(manualDemo = false): void {
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 4,
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      ...(manualDemo ? { fullGameDemo: { status: 'active' as const, progression: 'manual' as const } } : {}) },
    { uid: 'gm1', sessionId: 's1', displayName: 'Facilitator', role: 'gm', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z' },
  );
  useSessionStore.getState().setGmInstance({
    id: 'gm-browser', sessionId: 's1', uid: 'gm1', name: 'Bridge', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
}

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.get.mockReset().mockResolvedValue({
    type: 'wolf-amnesty-view', sessionId: 's1', offer: null, commanderAddressPublished: false,
  });
  mocks.address.mockReset().mockResolvedValue({ cycle: 4, eventId: 'wolf-commander-address-4',
    expiresAt: new Date(Date.now() + 30_000).toISOString() });
  mocks.offer.mockReset().mockResolvedValue({ status: 'offered', cycle: 4, targetShipId: 'dione', revision: 1 });
  mocks.respond.mockReset().mockResolvedValue({ status: 'accepted-pending-facilitator', revision: 2, response: 'accept' });
  mocks.consequence.mockReset().mockResolvedValue({ status: 'facilitator-ruled', revision: 3,
    ruling: 'The facilitator records the consequence.' });
  setCommander();
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('offers the printed condition without publishing an address first', async () => {
  const user = userEvent.setup();
  render(<WolfCommanderAddressAmnestyPanel />);

  expect(await screen.findByRole('heading', { name: 'Commander address and amnesty' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Fleet address' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Address fleet for 30 seconds' })).toBeVisible();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Target ship' }), 'dione');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Response deadline' }), '10');
  await user.click(screen.getByRole('button', { name: 'Offer amnesty' }));
  await waitFor(() => expect(mocks.offer).toHaveBeenCalledWith('dione', 4, 10));
  expect(mocks.address).not.toHaveBeenCalled();
  expect((await screen.findAllByText(/surrender by medium jump to 0101/i)).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(/purge survivors based on potential Wolf loyalty and keep the ship undamaged/i)).toBeVisible();
  expect(screen.getByText(/Response due/i)).toBeVisible();
  expect(screen.queryByText(/targetUid|damage capacity|fleet composition/i)).not.toBeInTheDocument();
});

it('shows the committed address when the initial private read loses its authority checkpoint', async () => {
  mocks.get.mockRejectedValueOnce(new Error('The session or player authority changed before this private view arrived.'));
  const user = userEvent.setup();
  render(<WolfCommanderAddressAmnestyPanel />);

  expect(await screen.findByRole('alert')).toHaveTextContent(/authority changed before this private view arrived/i);
  await user.type(screen.getByRole('textbox', { name: 'Fleet address' }), 'The fleet has one chance to yield.');
  await user.click(screen.getByRole('button', { name: 'Address fleet for 30 seconds' }));
  await waitFor(() => expect(mocks.address).toHaveBeenCalledWith('The fleet has one chance to yield.', 4));
  expect(await screen.findByText(/Fleet address published for 30 seconds/i)).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Offer amnesty' })).toBeVisible();
});

it('lets only the target captain answer and leaves the accepted offer pending for the facilitator', async () => {
  setCaptain();
  mocks.get.mockResolvedValue({ type: 'wolf-amnesty-view', sessionId: 's1', offer: currentOffer });
  const user = userEvent.setup();
  render(<WolfAmnestyCaptainPanel shipId="dione" />);

  expect(await screen.findByText(/surrender by medium jump to 0101/i)).toBeVisible();
  expect(screen.getByText(/Response due/i)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Accept offer' }));
  await waitFor(() => expect(mocks.respond).toHaveBeenCalledWith(1, 'accept'));
  expect(await screen.findByText(/awaiting facilitator ruling on the consequence/i)).toBeVisible();
  expect(screen.queryByText(/surrender completed|ship state changed/i)).not.toBeInTheDocument();
});

it('requires facilitator text for an accepted offer and for an unanswered expired offer', async () => {
  setGm();
  mocks.get.mockResolvedValue({ type: 'wolf-amnesty-view', sessionId: 's1', offer: {
    ...currentOffer, status: 'accepted-pending-facilitator', response: 'accept', targetUid: 'captain',
  } });
  const user = userEvent.setup();
  render(<GmWolfAmnestyPanel />);

  expect(await screen.findByRole('heading', { name: 'Facilitator amnesty ruling' })).toBeVisible();
  const text = 'The Dione crew remains bound by the stated surrender condition.';
  await user.type(screen.getByRole('textbox', { name: 'Facilitator consequence' }), text);
  await user.click(screen.getByRole('button', { name: 'Record facilitator consequence' }));
  await waitFor(() => expect(mocks.consequence).toHaveBeenCalledWith(1, text));
  expect(await screen.findByRole('status')).toHaveTextContent('The facilitator records the consequence.');

  const expired = { ...currentOffer, responseDeadline: new Date(Date.now() - 60_000).toISOString() };
  mocks.get.mockResolvedValue({ type: 'wolf-amnesty-view', sessionId: 's1', offer: expired });
  await user.click(screen.getByRole('button', { name: 'Refresh amnesty record' }));
  expect(await screen.findByText(/no response before the deadline/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Record facilitator consequence' })).toBeEnabled();
});

it('keeps a target captain response available after the recorded deadline in manual full-game demo', async () => {
  setCaptain(true);
  const expiredOffer = { ...currentOffer, responseDeadline: '2000-01-01T00:00:00.000Z' };
  mocks.get.mockResolvedValue({ type: 'wolf-amnesty-view', sessionId: 's1', offer: expiredOffer });
  const user = userEvent.setup();
  render(<WolfAmnestyCaptainPanel shipId="dione" />);

  expect(await screen.findByRole('region', { name: 'Wolf amnesty offer' })).toHaveTextContent(/no wall-clock expiry/i);
  expect(screen.queryByText(/response deadline passed/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept offer' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Accept offer' }));
  await waitFor(() => expect(mocks.respond).toHaveBeenCalledWith(1, 'accept'));
});

it('allows a current GM to make an explicit manual demo amnesty ruling without a timer expiry', async () => {
  setGm(true);
  mocks.get.mockResolvedValue({ type: 'wolf-amnesty-view', sessionId: 's1', offer: {
    ...currentOffer, responseDeadline: '2099-01-01T00:00:00.000Z', targetUid: 'captain',
  } });
  const user = userEvent.setup();
  render(<GmWolfAmnestyPanel />);

  expect(await screen.findByText(/manual full-game demo.*no response countdown/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Record facilitator consequence' })).toBeDisabled();
  const consequence = 'A deliberate training consequence after a captain review.';
  await user.type(screen.getByRole('textbox', { name: 'Facilitator consequence' }), consequence);
  expect(screen.getByRole('button', { name: 'Record facilitator consequence' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Record facilitator consequence' }));
  await waitFor(() => expect(mocks.consequence).toHaveBeenCalledWith(1, consequence));
});

it('removes the unused response deadline control from a manual full-game demo offer', async () => {
  setCommander(true);
  mocks.get.mockResolvedValue({
    type: 'wolf-amnesty-view', sessionId: 's1', offer: null, commanderAddressPublished: true,
  });
  render(<WolfCommanderAddressAmnestyPanel />);

  expect(await screen.findByRole('heading', { name: 'Commander address and amnesty' })).toBeVisible();
  expect(screen.getByText(/no wall-clock expiry in this manual full-game demo/i)).toBeVisible();
  expect(screen.queryByRole('combobox', { name: 'Response deadline' })).not.toBeInTheDocument();
});
