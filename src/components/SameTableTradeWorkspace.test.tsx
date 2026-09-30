import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  subscribeInventory: vi.fn(),
  subscribeOffers: vi.fn(),
  createOffer: vi.fn(),
  acceptOffer: vi.fn(),
}));

vi.mock('@/lib/sameTableTradeService', () => ({
  subscribeSameTableTradeInventory: mocks.subscribeInventory,
  subscribeSameTableTradeOffers: mocks.subscribeOffers,
  createSameTableTradeOffer: mocks.createOffer,
  acceptSameTableTradeOffer: mocks.acceptOffer,
}));

import SameTableTradeWorkspace from './SameTableTradeWorkspace';

const balances = {
  ore: 4, fuel: 2, food: 3, water: 1, materials: 5, securityTeams: 2,
} as const;
const nextBalances = { ...balances, ore: 3, fuel: 3 } as const;
const offer = {
  id: '3f23b456-789a-4abc-8def-0123456789ab',
  fromUid: 'bob', toUid: 'alice', tableId: 'aegis', revision: 1,
  quantities: { ore: 1 }, status: 'pending' as const,
};
let emitInventory: ((inventory: { revision: number; balances: typeof balances } | null) => void) | undefined;
let failInventory: (() => void) | undefined;
let emitOffers: ((offers: { incoming: typeof offer[]; outgoing: typeof offer[] }) => void) | undefined;
let failOffers: (() => void) | undefined;

function renderWorkspace() {
  return render(<SameTableTradeWorkspace
    sessionId="s1"
    currentPlayerUid="alice"
    currentPlayerName="Alice"
    fleetGroupId="fleet-1"
    counterparties={[{ id: 'bob', name: 'Bob' }]}
  />);
}

function publishLiveData() {
  emitInventory?.({ revision: 1, balances });
  emitOffers?.({ incoming: [offer], outgoing: [] });
}

beforeEach(() => {
  mocks.subscribeInventory.mockReset();
  mocks.subscribeOffers.mockReset();
  mocks.createOffer.mockReset();
  mocks.acceptOffer.mockReset();
  emitInventory = undefined;
  failInventory = undefined;
  emitOffers = undefined;
  failOffers = undefined;
  mocks.subscribeInventory.mockImplementation((_sessionId, _uid, onInventory, onError) => {
    emitInventory = onInventory;
    failInventory = onError;
    return vi.fn();
  });
  mocks.subscribeOffers.mockImplementation((_sessionId, _uid, _group, onOffers, onError) => {
    emitOffers = onOffers;
    failOffers = onError;
    return vi.fn();
  });
  mocks.createOffer.mockResolvedValue({ status: 'created', sessionId: 's1' });
  mocks.acceptOffer.mockResolvedValue({
    status: 'committed', sessionId: 's1', offerId: offer.id, revision: 2,
    inventory: { revision: 2, balances: nextBalances },
  });
});

it('waits for its own live inventory and explains when no physical baseline has been attested', () => {
  renderWorkspace();
  expect(screen.getByRole('status')).toHaveTextContent(/checking your private held-token counts/i);

  emitInventory?.(null);
  expect(screen.getByText(/ask your facilitator to record the exact tokens already in your possession/i)).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Same-table trade' })).not.toBeInTheDocument();
});

it('reuses one offer ID after a retry and submits only the exact player-entered quantity', async () => {
  const user = userEvent.setup();
  mocks.createOffer.mockRejectedValueOnce(new Error('temporary network failure'))
    .mockResolvedValueOnce({ status: 'created', sessionId: 's1' });
  renderWorkspace();
  emitInventory?.({ revision: 1, balances });
  emitOffers?.({ incoming: [], outgoing: [] });

  await user.selectOptions(screen.getByRole('combobox', { name: 'Recipient' }), 'bob');
  await user.type(screen.getByRole('spinbutton', { name: 'Ore amount' }), '1');
  await user.click(screen.getByRole('button', { name: 'Send exact offer' }));
  await screen.findByRole('alert');
  await user.type(screen.getByRole('spinbutton', { name: 'Ore amount' }), '1');
  await user.click(screen.getByRole('button', { name: 'Send exact offer' }));

  await waitFor(() => expect(mocks.createOffer).toHaveBeenCalledTimes(2));
  const firstRequest = mocks.createOffer.mock.calls[0] as [string, string, { ore: number }];
  const secondRequest = mocks.createOffer.mock.calls[1] as [string, string, { ore: number }];
  expect(firstRequest[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(secondRequest).toEqual(firstRequest);
  expect(firstRequest.slice(1)).toEqual(['bob', { ore: 1 }]);
  expect(await screen.findByRole('status')).toHaveTextContent(/offer sent to bob/i);
});

it('accepts the exact incoming offer and refreshes only this player’s returned balance', async () => {
  const user = userEvent.setup();
  renderWorkspace();
  publishLiveData();

  await user.click(screen.getByRole('button', { name: 'Accept exact offer from Bob' }));
  await waitFor(() => expect(mocks.acceptOffer).toHaveBeenCalledWith(offer.id));
  expect(await screen.findByRole('status')).toHaveTextContent(/trade confirmed/i);
  expect(screen.getByLabelText('Your held tokens')).toHaveTextContent('3');
  expect(screen.getByLabelText('Your held tokens')).toHaveTextContent('3');
  expect(screen.getByText(/resource stores are tracked separately/i)).toBeVisible();
});

it('clears private inventory when a listener loses live authority', () => {
  renderWorkspace();
  emitInventory?.({ revision: 1, balances });
  expect(screen.getByRole('heading', { name: 'Same-table trade' })).toBeVisible();

  failInventory?.();
  expect(screen.getByRole('alert')).toHaveTextContent(/private counts are unavailable/i);
  expect(screen.queryByRole('heading', { name: 'Same-table trade' })).not.toBeInTheDocument();
});
