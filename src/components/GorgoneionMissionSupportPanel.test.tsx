import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import GorgoneionMissionSupportPanel from './GorgoneionMissionSupportPanel';

const topFiveCardIds = ['Q♣', 'A♥', '5♦', 'K♥', '4♥'];

it('classifies the projected cards and submits both destination lists in source order', () => {
  const onPartitionChange = vi.fn();
  const onSubmit = vi.fn();
  const view = render(
    <GorgoneionMissionSupportPanel
      projection={{ cardIds: topFiveCardIds }}
      topCardIds={topFiveCardIds}
      bottomCardIds={[]}
      onPartitionChange={onPartitionChange}
      onSubmit={onSubmit}
    />,
  );

  const cardTwo = screen.getByRole('group', { name: 'Card 2' });
  fireEvent.click(within(cardTwo).getByLabelText('Move to bottom'));

  expect(onPartitionChange).toHaveBeenCalledWith(
    ['Q♣', '5♦', 'K♥', '4♥'],
    ['A♥'],
  );
  expect(view.container).not.toHaveTextContent(/Q♣|A♥|5♦|K♥|4♥/);
  expect(view.container.querySelector('[value="Q♣"], [value="A♥"], [value="5♦"], [value="K♥"], [value="4♥"]'))
    .toBeNull();

  view.rerender(
    <GorgoneionMissionSupportPanel
      projection={{ cardIds: topFiveCardIds }}
      topCardIds={['Q♣', '5♦', 'K♥', '4♥']}
      bottomCardIds={['A♥']}
      onPartitionChange={onPartitionChange}
      onSubmit={onSubmit}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Apply deck support' }));
  expect(onSubmit).toHaveBeenCalledWith(['Q♣', '5♦', 'K♥', '4♥'], ['A♥']);
});

it('renders a disabled unavailable state when no current projection is supplied', () => {
  render(
    <GorgoneionMissionSupportPanel
      projection={null}
      topCardIds={[]}
      bottomCardIds={[]}
      onPartitionChange={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent(/deck support unavailable/i);
  expect(screen.getByRole('button', { name: 'Apply deck support' })).toBeDisabled();
  expect(screen.queryByRole('group', { name: 'Card 1' })).toBeNull();
});

it('keeps submission disabled until the supplied cards form an exact partition', () => {
  render(
    <GorgoneionMissionSupportPanel
      projection={{ cardIds: topFiveCardIds }}
      topCardIds={topFiveCardIds.slice(0, 4)}
      bottomCardIds={[]}
      onPartitionChange={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );

  expect(screen.getByRole('button', { name: 'Apply deck support' })).toBeDisabled();
});
