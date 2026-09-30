import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as SessionService from '@/lib/sessionService';
import { beforeEach, expect, it, vi } from 'vitest';
import PC06ReviewScene from './PC06ReviewScene';

vi.mock('@/lib/sessionService', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionService>();
  return { ...actual, jumpShip: vi.fn() };
});

const { jumpShip } = await import('@/lib/sessionService');

beforeEach(() => vi.mocked(jumpShip).mockClear());

it('labels PC06 as a one-sitting synthetic review with an explicit local-only boundary', () => {
  render(<PC06ReviewScene />);

  expect(screen.getByRole('heading', { name: /PC06.*vessel.*review/i })).toBeVisible();
  expect(screen.getByRole('note', { name: /synthetic review boundary/i })).toHaveTextContent(
    /local-only simulation.*no live session.*callable.*firestore write/i,
  );
  const steps = screen.getByRole('navigation', { name: 'PC06 review steps' });
  for (const label of ['1 Movement', '2 Cargo and trade', '3 Scouting', '4 Away mission']) {
    expect(within(steps).getByRole('button', { name: label })).toBeVisible();
  }
  expect(screen.getByRole('link', { name: /return to new eden console/i })).toHaveAttribute('href', '/#/');
});

it('supports accessible forward and back navigation through the review steps', async () => {
  const user = userEvent.setup();
  render(<PC06ReviewScene />);

  const steps = screen.getByRole('navigation', { name: 'PC06 review steps' });
  expect(screen.getByRole('heading', { name: 'Move a vessel and account for its host' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Next review step' }));
  expect(screen.getByRole('heading', { name: 'Keep ship stores, craft cargo, and held tokens distinct' })).toBeVisible();
  expect(within(steps).getByRole('button', { name: '2 Cargo and trade' })).toHaveAttribute('aria-pressed', 'true');

  await user.click(screen.getByRole('button', { name: 'Previous review step' }));
  expect(screen.getByRole('heading', { name: 'Move a vessel and account for its host' })).toBeVisible();
  expect(within(steps).getByRole('button', { name: '1 Movement' })).toHaveAttribute('aria-pressed', 'true');
});

it('simulates docking and a legal destination using the production movement panel', async () => {
  const user = userEvent.setup();
  render(<PC06ReviewScene />);

  const movement = screen.getByRole('region', { name: 'Voyage 33-0 movement' });
  expect(within(movement).getByLabelText('Facilitator connection LIVE')).toBeVisible();
  expect(screen.getByText(/LIVE link label is a synthetic control-enabling value.*no facilitator connection is open/i)).toBeVisible();
  await user.click(within(movement).getByRole('button', { name: 'Dock with Dione' }));
  expect(within(movement).getByText(/Dione.*0101.*host fuel.*operational/i)).toBeVisible();

  await user.click(within(movement).getByRole('button', { name: /Jump to Pallas/i }));
  expect(within(movement).getByText('0102 // Pallas')).toBeVisible();
  expect(within(movement).getByText(/Dione.*0102.*7 host fuel/i)).toBeVisible();
  expect(screen.getByRole('status', { name: 'Movement sample result' })).toHaveTextContent(
    /local review only.*no production movement occurred/i,
  );
});

it('previews blind-jump presentation while keeping the production launch control disabled', async () => {
  const user = userEvent.setup();
  render(<PC06ReviewScene />);

  const drive = screen.getByRole('region', { name: 'AEGIS Jump Drive control' });
  await user.click(within(drive).getByRole('button', { name: 'Enable blind jump' }));
  expect(within(drive).getByRole('button', { name: 'Blind jump' })).toBeDisabled();
  expect(within(drive).getByRole('status')).toHaveTextContent(/presentation preview.*jump commands are disabled/i);
  expect(within(drive).getByLabelText('Blind destination hidden until server resolution')).toBeVisible();
  expect(jumpShip).not.toHaveBeenCalled();
});

it('keeps cargo, ship stores, and consented same-table trade in separate local samples', async () => {
  const user = userEvent.setup();
  render(<PC06ReviewScene />);
  await user.click(screen.getByRole('button', { name: '2 Cargo and trade' }));

  const cargo = screen.getByRole('region', { name: 'Small-craft cargo sample' });
  await user.click(within(cargo).getByRole('button', { name: 'Load 1 food onto Capybara' }));
  expect(within(cargo).getByText('Food 1')).toBeVisible();
  expect(within(cargo).getByText('Food 2')).toBeVisible();
  expect(within(cargo).getByRole('status')).toHaveTextContent(/local simulation.*no production cargo transfer/i);

  const trade = screen.getByRole('region', { name: 'Same-table trade' });
  const holdings = within(trade).getByRole('region', { name: 'Your held tokens' });
  await user.click(within(trade).getByRole('button', { name: 'Accept exact offer from Juno Reyes' }));
  expect(holdings).toHaveTextContent('Fuel 3');
  expect(within(trade).getByRole('status')).toHaveTextContent(/local review only.*no live transfer/i);

  await user.selectOptions(within(trade).getByLabelText('Recipient'), 'juno-reyes');
  await user.type(within(trade).getByLabelText('Materials amount'), '1');
  await user.click(within(trade).getByRole('button', { name: 'Send exact offer' }));
  expect(within(trade).getByRole('listitem', { name: /Offer to Juno Reyes/i })).toHaveTextContent(/local sample only/i);
  expect(holdings).toHaveTextContent('Materials 4');
});

it('reveals a prepared scout result locally while keeping the other group sample separate', async () => {
  const user = userEvent.setup();
  render(<PC06ReviewScene />);
  await user.click(screen.getByRole('button', { name: '3 Scouting' }));

  expect(screen.getByRole('status', { name: 'Scout sample state' })).toHaveTextContent(/pending sample/i);
  await user.click(screen.getByRole('button', { name: 'Reveal Hummingbird scout at 6798' }));
  expect(screen.getByRole('region', { name: 'Hummingbird scout report' })).toHaveTextContent('Site L');
  const otherGroup = screen.getByRole('region', { name: 'Fleet 1 sample view' });
  expect(otherGroup).toHaveTextContent(/no Fleet-2 scout result is included/i);
  expect(otherGroup).not.toHaveTextContent('Site L');
  expect(screen.getByRole('status', { name: 'Scout sample state' })).toHaveTextContent(
    /local review only.*group-local view illustration.*not a privacy proof/i,
  );
});

it('follows private mission cards through local assignment, results, rewards, and drop-off', async () => {
  const user = userEvent.setup();
  render(<PC06ReviewScene />);
  await user.click(screen.getByRole('button', { name: '4 Away mission' }));

  const mission = screen.getByRole('region', { name: 'Away mission sample path' });
  expect(mission).toHaveTextContent(/fleet group fleet-2.*system 6798/i);
  const hand = within(mission).getByRole('region', { name: 'Your private mission cards' });
  expect(within(hand).getByRole('article', { name: 'Private card A♥' })).toBeVisible();
  expect(within(mission).queryByText('K♠')).not.toBeInTheDocument();

  await user.selectOptions(within(hand).getByLabelText('Opportunity for A♥'), 'explore');
  await user.selectOptions(within(hand).getByLabelText('Opportunity for 4♣'), 'recover');
  await user.click(within(hand).getByRole('button', { name: 'Submit mission assignments' }));
  expect(await within(mission).findByText(/critical success.*total 17/i)).toBeVisible();
  expect(mission).toHaveTextContent(/failure.*total 0/i);
  expect(mission).toHaveTextContent(/Reward.*materials 2/i);
  expect(mission).toHaveTextContent(/continuing after Team Phase/i);

  await user.click(within(mission).getByRole('button', { name: 'Drop mission rewards at selected ship' }));
  expect(within(mission).getByRole('status', { name: 'Mission sample result' })).toHaveTextContent(
    /local review only.*rewards shown at aegis.*no mission result was written/i,
  );
  expect(mission).toHaveTextContent(/rewards shown at aegis.*local sample/i);
  expect(within(mission).queryByRole('button', { name: 'Drop mission rewards at selected ship' })).not.toBeInTheDocument();
});
