import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {expect, it} from 'vitest';
import PC09ReviewScene from './PC09ReviewScene';
import {useSessionStore} from '@/store/useSessionStore';

it('offers five accessible PC09 checks and a visible return to the real chooser', () => {
  render(<PC09ReviewScene />);
  expect(screen.getByRole('note', {name: 'Prepared review boundary'})).toHaveTextContent('No live session writes');
  const navigation = screen.getByRole('navigation', {name: 'PC09 review steps'});
  const steps = within(navigation).getAllByRole('button');
  expect(steps).toHaveLength(5);
  for (const step of steps) {
    fireEvent.click(step);
    expect(step).toHaveAttribute('aria-pressed', 'true');
  }
  fireEvent.click(screen.getByRole('button', {name: 'Previous review step'}));
  expect(within(navigation).getByRole('button', {name: '4 Specialist and President'})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', {name: 'Return to station and console chooser'})).toHaveAttribute('href', '/#/');
});

it('uses the real detector and VIP presenters with local committed samples and preserves session identity', async () => {
  const original = useSessionStore.getState();
  render(<PC09ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '3 Investigation and arrest'}));
  const detector = screen.getByRole('region', {name: 'Wolf Agent Detector'});
  expect(detector).toHaveTextContent('2 tests remain');
  fireEvent.click(within(detector).getByRole('button', {name: 'Run detector test'}));
  await waitFor(() => expect(detector).toHaveTextContent('Alex // Report: Wolf'));
  expect(detector).toHaveTextContent('1 test remains');
  fireEvent.click(screen.getByRole('button', {name: '4 Specialist and President'}));
  const host = screen.getByRole('region', {name: 'VIP Host maintenance benefit'});
  fireEvent.click(within(host).getByRole('button', {name: 'Record ship visit'}));
  await waitFor(() => expect(within(host).getByRole('button', {name: 'Reroll one maintenance die'})).toBeEnabled());
  fireEvent.click(within(host).getByRole('button', {name: 'Reroll one maintenance die'}));
  await waitFor(() => expect(host).toHaveTextContent('reroll has been used'));
  expect(useSessionStore.getState().session).toBe(original.session);
  expect(useSessionStore.getState().me).toBe(original.me);
  expect(useSessionStore.getState().gmInstance).toBe(original.gmInstance);
});

it('keeps the Press publication decision explicit in the prepared audience sample', () => {
  render(<PC09ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '2 Crew, GM and Press'}));
  const desk = screen.getByRole('region', {name: 'Press dispatch desk'});
  expect(desk).toHaveTextContent('No active dispatches');
  fireEvent.change(within(desk).getByRole('textbox', {name: 'Dispatch'}), {
    target: {value: 'The fleet completed the attack and recovered supplies.'},
  });
  fireEvent.click(within(desk).getByRole('button', {name: 'Publish dispatch'}));
  expect(desk).toHaveTextContent('Current dispatches // 1');
  expect(screen.getByRole('status', {name: 'Prepared audience result'})).toHaveTextContent('LOCAL SIMULATION');
});
