import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PC07AttackReview } from './PC07ReviewParts';

const native = vi.hoisted(() => ({ commit: vi.fn(), read: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/lib/sessionService', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sessionService')>(),
  commitWolfForceFieldChoice: native.commit, getWolfForceFieldChoice: native.read,
  commitWolfRangeActionChoice: native.commit, commitWolfRangeTargets: native.commit,
  getWolfRangeActionChoice: native.read, commitWolfBoardingDefenceChoice: native.commit,
  getWolfBoardingDefenceChoice: native.read,
}));
vi.mock('@/lib/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/firestore')>(), subscribeWolfAttackMemberView: native.subscribe,
}));

it('lets the owner choose a local Captain target in the actual prepared presenter', () => {
  render(<PC07AttackReview />);
  expect(screen.getByRole('note', { name: 'Prepared choice examples' })).toHaveTextContent('Independent local examples');
  const captain = screen.getByRole('region', { name: 'Gorgoneion Force Field Projector' });
  fireEvent.click(within(captain).getByRole('radio', { name: 'AEGIS' }));
  fireEvent.click(within(captain).getByRole('button', { name: 'Protect selected ship' }));
  expect(captain).toHaveTextContent('Force Field protects AEGIS');
  expect(screen.getByRole('status', { name: 'Prepared choice callback result' })).toHaveTextContent('Local Captain choice: AEGIS');
  expect(native.commit).not.toHaveBeenCalled(); expect(native.read).not.toHaveBeenCalled(); expect(native.subscribe).not.toHaveBeenCalled();
});

it('retains the real explicit range pass and target assignment controls', () => {
  render(<PC07AttackReview />);
  const range = screen.getByRole('region', { name: 'AEGIS range weapons' });
  fireEvent.click(within(range).getByRole('button', { name: 'Pass this range' }));
  expect(screen.getByRole('status', { name: 'Prepared choice callback result' })).toHaveTextContent('Local range pass');
  fireEvent.click(screen.getByRole('button', { name: 'Show locked hit targets sample' }));
  fireEvent.change(within(range).getByRole('combobox', { name: 'Missile launchers hit 1' }), { target: { value: 'local-contact-1' } });
  fireEvent.change(within(range).getByRole('combobox', { name: 'Missile launchers hit 2' }), { target: { value: 'local-contact-2' } });
  fireEvent.click(within(range).getByRole('button', { name: 'Commit target assignments' }));
  expect(screen.getByRole('status', { name: 'Prepared choice callback result' })).toHaveTextContent('2 local contacts; 1 hit unused');
  expect(native.commit).not.toHaveBeenCalled();
});

it('requires an explicit boarding count including zero in the real prepared presenter', () => {
  render(<PC07AttackReview />);
  const crew = screen.getByRole('region', { name: 'AEGIS boarding defence' });
  expect(within(crew).getByRole('button', { name: 'Commit defence' })).toBeDisabled();
  fireEvent.change(within(crew).getByRole('combobox', { name: 'Security Teams committed' }), { target: { value: '0' } });
  fireEvent.click(within(crew).getByRole('button', { name: 'Commit defence' }));
  expect(crew).toHaveTextContent('0 Security Teams committed');
  expect(native.commit).not.toHaveBeenCalled();
});

it('shows truthful readonly GM presence and withdraws the prepared private summary offline', () => {
  render(<PC07AttackReview />);
  const gm = screen.getByRole('region', { name: 'Current attack choices' });
  expect(gm).toHaveTextContent('Prepared EO // Reconnect pending');
  expect(gm).toHaveTextContent('Presence reflects the last server update');
  expect(within(gm).queryByRole('button')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Offline decision summary sample' }));
  expect(gm).not.toHaveTextContent('Prepared EO');
  expect(gm).toHaveTextContent('Reconnect for current attack choices');
  fireEvent.click(screen.getByRole('button', { name: 'Restore choice examples' }));
  expect(gm).toHaveTextContent('Prepared EO');
  expect(native.subscribe).not.toHaveBeenCalled();
});


it('uses the actual local Commander presenter for a selected reroll and explicit finish', () => {
  render(<PC07AttackReview />);
  const commander = screen.getByRole('region', { name: 'Targeting dice' });
  fireEvent.click(within(commander).getAllByRole('checkbox')[0]!);
  fireEvent.click(within(commander).getByRole('button', { name: 'Reroll selected dice' }));
  expect(screen.getByRole('status', { name: 'Prepared choice callback result' }))
    .toHaveTextContent('Local Commander reroll: 1 die');
  fireEvent.click(within(commander).getByRole('button', { name: 'Finish rerolls' }));
  expect(commander).toHaveTextContent('Reroll window is closed');
  expect(native.commit).not.toHaveBeenCalled(); expect(native.read).not.toHaveBeenCalled();
});

it('uses the actual optional C&C presenter with an explicit prepared pass', () => {
  render(<PC07AttackReview />);
  const cnc = screen.getByRole('region', { name: 'Command and Control' });
  fireEvent.click(within(cnc).getByRole('button', { name: 'Pass Command and Control' }));
  expect(cnc).toHaveTextContent('no redirect made');
  expect(within(cnc).queryByRole('radio')).toBeNull();
  expect(screen.getByRole('status', { name: 'Prepared choice callback result' }))
    .toHaveTextContent('Local C&C pass');
  expect(native.commit).not.toHaveBeenCalled(); expect(native.read).not.toHaveBeenCalled();
});
