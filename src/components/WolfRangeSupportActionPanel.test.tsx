import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { WolfRangeSupportActionChoiceView } from '@/types/game';
import { WolfRangeSupportActionPanelView } from './WolfRangeSupportActionPanel';

function supportView(
  sourceId: WolfRangeSupportActionChoiceView['sourceId'],
): WolfRangeSupportActionChoiceView {
  const actorRoleId = sourceId === 'highwall' ? 'icebreaker-miner'
    : sourceId === 'boa' ? 'capybara-recycler' : 'gorgoneion-captain';
  return {
    type: 'wolf-range-support-action-choice-view', sessionId: 'session-1', attackId: 'attack-1',
    turn: 4, revision: 19, range: 'short-range', sourceId, actorRoleId, choiceStatus: 'pending',
    eligible: true, actionAvailable: true, ...(sourceId === 'boa' ? { scrapAvailable: 2 } : {}),
    deadlineAt: '2026-10-03T12:10:00.000Z', contacts: [
      { contactId: 'contact-1', targetShipId: 'aegis', available: true },
      { contactId: 'contact-2', targetShipId: 'wolf-fighter-wing', available: false },
    ],
  };
}

it('offers a source action or a deliberate pass using the current range choice', () => {
  const onUse = vi.fn();
  const onPass = vi.fn();
  render(<WolfRangeSupportActionPanelView view={supportView('highwall')} onUse={onUse} onPass={onPass} />);

  expect(screen.getByText(/three damage/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /use Highwall Cannon/i }));
  fireEvent.click(screen.getByRole('button', { name: /pass this range/i }));
  expect(onUse).toHaveBeenCalledTimes(1);
  expect(onPass).toHaveBeenCalledTimes(1);
});

it('requires an available opaque contact before the Boa spends Scrap', () => {
  const onUse = vi.fn();
  const view = supportView('boa');
  render(<WolfRangeSupportActionPanelView view={view} onUse={onUse} onPass={vi.fn()} />);

  expect(screen.getByText(/one Scrap/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /use Boa Scrap Strike/i })).toBeDisabled();
  expect(screen.queryByRole('option', { name: /contact-2/i })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: /boa target/i }), { target: { value: 'contact-1' } });
  fireEvent.click(screen.getByRole('button', { name: /use Boa Scrap Strike/i }));
  expect(onUse).toHaveBeenCalledWith('contact-1');
});
