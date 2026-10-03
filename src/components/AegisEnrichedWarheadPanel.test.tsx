import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AegisEnrichedWarheadPanelView } from './AegisEnrichedWarheadPanel';

const pending = { type: 'aegis-enriched-warhead-view' as const, sessionId: 's1', attackId: 'a1',
  turn: 2, revision: 5, choiceStatus: 'pending' as const, eligible: true, oreCost: 5 as const };

it('makes the printed cost and whole-attack effect visible before the Executive Officer pays', async () => {
  const onChoose = vi.fn();
  render(<AegisEnrichedWarheadPanelView view={pending} onChoose={onChoose} />);
  expect(screen.getByText(/five ore.*Long Range.*Medium Range/i)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Enrich warheads // 5 ore' }));
  expect(onChoose).toHaveBeenCalledExactlyOnceWith('enrich');
});

it('offers an explicit pass and removes payment controls for the committed attack', async () => {
  const onChoose = vi.fn();
  const { rerender } = render(<AegisEnrichedWarheadPanelView view={pending} onChoose={onChoose} />);
  await userEvent.click(screen.getByRole('button', { name: 'Pass enriched warheads' }));
  expect(onChoose).toHaveBeenCalledExactlyOnceWith('pass');
  rerender(<AegisEnrichedWarheadPanelView view={{ ...pending, eligible: false, choiceStatus: 'enriched' }} onChoose={onChoose} />);
  expect(screen.queryByRole('button', { name: /Enrich warheads/ })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Five ore paid once');
});

it('withdraws spend and pass actions while the current server authority is locked', () => {
  render(<AegisEnrichedWarheadPanelView view={pending} onChoose={vi.fn()} busy />);
  expect(screen.getByRole('button', { name: 'Enrich warheads // 5 ore' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Pass enriched warheads' })).toBeDisabled();
});
