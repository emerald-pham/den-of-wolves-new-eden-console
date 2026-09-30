import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import SameTableTradePanel, {
  type SameTableTradePanelProps,
} from './SameTableTradePanel';

const balances: SameTableTradePanelProps['balances'] = {
  ore: 3,
  fuel: 2,
  food: 4,
  water: 1,
  materials: 5,
  securityTeams: 2,
};

function renderPanel(overrides: Partial<SameTableTradePanelProps> = {}) {
  const props: SameTableTradePanelProps = {
    currentPlayerName: 'Commander Hale',
    balances,
    counterparties: [
      { id: 'player-vale', name: 'Captain Vale' },
      { id: 'player-reyes', name: 'Juno Reyes' },
    ],
    incomingOffers: [],
    outgoingOffers: [],
    onCreateOffer: vi.fn(),
    onAcceptOffer: vi.fn(),
    ...overrides,
  };

  return { props, ...render(<SameTableTradePanel {...props} />) };
}

it('shows the current player-held token counts and keeps the ship-store boundary clear', () => {
  renderPanel();

  const holdings = screen.getByRole('region', { name: 'Your held tokens' });
  expect(holdings).toHaveTextContent('Ore 3');
  expect(holdings).toHaveTextContent('Fuel 2');
  expect(holdings).toHaveTextContent('Food 4');
  expect(holdings).toHaveTextContent('Water 1');
  expect(holdings).toHaveTextContent('Materials 5');
  expect(holdings).toHaveTextContent('Security Teams 2');
  expect(screen.getByText(/ship stores are tracked separately/i)).toBeVisible();
  expect(screen.getByRole('region', { name: 'Same-table trade' })).toHaveTextContent(
    /cannot move tokens between tables/i,
  );
});

it('creates an exact multi-resource offer only after the sender submits it', async () => {
  const user = userEvent.setup();
  const { props } = renderPanel();
  const trade = screen.getByRole('region', { name: 'Same-table trade' });

  await user.selectOptions(within(trade).getByRole('combobox', { name: 'Recipient' }), 'player-vale');
  await user.type(within(trade).getByRole('spinbutton', { name: 'Ore amount' }), '2');
  await user.type(within(trade).getByRole('spinbutton', { name: 'Food amount' }), '1');

  expect(props.onCreateOffer).not.toHaveBeenCalled();
  await user.click(within(trade).getByRole('button', { name: 'Send exact offer' }));

  expect(props.onCreateOffer).toHaveBeenCalledExactlyOnceWith({
    recipientId: 'player-vale',
    amounts: { ore: 2, food: 1 },
  });
});

it('requires a recipient and a positive whole quantity without allowing overdraw', async () => {
  const user = userEvent.setup();
  const { props } = renderPanel();
  const trade = screen.getByRole('region', { name: 'Same-table trade' });
  const send = within(trade).getByRole('button', { name: 'Send exact offer' });

  expect(send).toBeDisabled();
  await user.selectOptions(within(trade).getByRole('combobox', { name: 'Recipient' }), 'player-vale');
  await user.type(within(trade).getByRole('spinbutton', { name: 'Ore amount' }), '4');
  expect(send).toBeDisabled();
  expect(props.onCreateOffer).not.toHaveBeenCalled();

  await user.clear(within(trade).getByRole('spinbutton', { name: 'Ore amount' }));
  await user.type(within(trade).getByRole('spinbutton', { name: 'Ore amount' }), '3');
  expect(send).toBeEnabled();
});

it('requires the recipient to accept the exact pending offer', async () => {
  const user = userEvent.setup();
  const { props } = renderPanel({
    incomingOffers: [{
      id: 'offer-17',
      participantName: 'Captain Vale',
      amounts: { fuel: 1, materials: 2 },
    }],
  });
  const offer = screen.getByRole('listitem', { name: /offer from captain vale/i });

  expect(offer).toHaveTextContent('Fuel 1');
  expect(offer).toHaveTextContent('Materials 2');
  expect(props.onAcceptOffer).not.toHaveBeenCalled();

  await user.click(within(offer).getByRole('button', { name: 'Accept exact offer from Captain Vale' }));

  expect(props.onAcceptOffer).toHaveBeenCalledExactlyOnceWith('offer-17');
});

it('shows outgoing offers without exposing another participant inventory', () => {
  renderPanel({
    outgoingOffers: [{
      id: 'offer-18',
      participantName: 'Juno Reyes',
      amounts: { water: 1 },
    }],
  });

  const offer = screen.getByRole('listitem', { name: /offer to juno reyes/i });
  expect(offer).toHaveTextContent('Water 1');
  expect(offer).toHaveTextContent(/awaiting response/i);
  expect(offer).not.toHaveTextContent(/balance|holds/i);
});

it('exposes a supplied unavailable reason and disables offer and acceptance actions', () => {
  renderPanel({
    disabledReason: 'Reconnect to the live session before trading.',
    incomingOffers: [{ id: 'offer-19', participantName: 'Captain Vale', amounts: { food: 1 } }],
  });

  expect(screen.getByRole('status')).toHaveTextContent('Reconnect to the live session before trading.');
  expect(screen.getByRole('button', { name: 'Send exact offer' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Accept exact offer from Captain Vale' })).toBeDisabled();
});

it('supports keyboard-only offer composition and displays parent status feedback', async () => {
  const user = userEvent.setup();
  const { props } = renderPanel({ statusMessage: 'Offer sent. Waiting for the recipient.' });
  const recipient = screen.getByRole('combobox', { name: 'Recipient' });
  recipient.focus();
  await user.keyboard('{ArrowDown}{Enter}');
  await user.tab();
  await user.type(screen.getByRole('spinbutton', { name: 'Ore amount' }), '1');
  await user.tab();

  const send = screen.getByRole('button', { name: 'Send exact offer' });
  expect(send).toHaveFocus();
  expect(send).toBeEnabled();
  expect(screen.getByRole('status')).toHaveTextContent('Offer sent. Waiting for the recipient.');
  expect(props.onCreateOffer).not.toHaveBeenCalled();
});
