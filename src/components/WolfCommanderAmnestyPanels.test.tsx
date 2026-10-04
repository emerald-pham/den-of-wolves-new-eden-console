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

function setCommander(): void {
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 4,
      activeVesselIds: ['dione', 'aegis'], ownerUid: 'gm1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { uid: 'u1', sessionId: 's1', displayName: 'Commander', role: 'player', seatId: null,
      assignedRoleId: null, replacementRoleId: 'wolf-commander', fleetGroupId: 'fleet-1',
      joinedAt: '2026-01-01T00:00:00.000Z' },
  );
}

function setCaptain(): void {
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 4,
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { uid: 'captain', sessionId: 's1', displayName: 'Dione captain', role: 'player', seatId: null,
      assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
      joinedAt: '2026-01-01T00:00:00.000Z' },
  );
}

function setGm(): void {
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 4,
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
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
  mocks.address.mockReset().mockResolvedValue({ cycle: 4, eventId: 'wolf-commander-address-4' });
  mocks.offer.mockReset().mockResolvedValue({ status: 'offered', cycle: 4, targetShipId: 'dione', revision: 1 });
  mocks.respond.mockReset().mockResolvedValue({ status: 'accepted-pending-facilitator', revision: 2, response: 'accept' });
  mocks.consequence.mockReset().mockResolvedValue({ status: 'facilitator-ruled', revision: 3,
    ruling: 'The facilitator records the consequence.' });
  setCommander();
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('requires a live address before offering the printed condition to an active ship', async () => {
  const user = userEvent.setup();
  render(<WolfCommanderAddressAmnestyPanel />);

  expect(await screen.findByRole('heading', { name: 'Commander address and amnesty' })).toBeVisible();
  const offerButton = screen.getByRole('button', { name: 'Offer amnesty' });
  expect(offerButton).toBeDisabled();
  await user.type(screen.getByRole('textbox', { name: 'Fleet address' }), 'The fleet has one chance to yield.');
  await user.click(screen.getByRole('button', { name: 'Address fleet for 30 seconds' }));
  await waitFor(() => expect(mocks.address).toHaveBeenCalledWith('The fleet has one chance to yield.', 4));
  expect(await screen.findByText(/address is live for 30 seconds/i)).toBeVisible();

  await user.selectOptions(screen.getByRole('combobox', { name: 'Target ship' }), 'dione');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Response deadline' }), '10');
  await user.click(screen.getByRole('button', { name: 'Offer amnesty' }));
  await waitFor(() => expect(mocks.offer).toHaveBeenCalledWith('dione', 4, 10));
  expect(await screen.findByText(/surrender by medium jump to 0101/i)).toBeVisible();
  expect(screen.getByText(/Response due/i)).toBeVisible();
  expect(screen.queryByText(/targetUid|damage capacity|fleet composition/i)).not.toBeInTheDocument();
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
  expect(await screen.findByText(/awaiting facilitator ruling/i)).toBeVisible();
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
  expect(await screen.findByText(text)).toBeVisible();

  const expired = { ...currentOffer, responseDeadline: new Date(Date.now() - 60_000).toISOString() };
  mocks.get.mockResolvedValue({ type: 'wolf-amnesty-view', sessionId: 's1', offer: expired });
  await user.click(screen.getByRole('button', { name: 'Refresh amnesty record' }));
  expect(await screen.findByText(/no response before the deadline/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Record facilitator consequence' })).toBeEnabled();
});
