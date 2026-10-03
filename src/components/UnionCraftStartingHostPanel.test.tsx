import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnionCraftStartingHostPanelView } from './UnionCraftStartingHostPanel';

it('requires an explicit legal starting-host choice and shows the current saved host', async () => {
  const onChoose = vi.fn(), user = userEvent.setup();
  render(<UnionCraftStartingHostPanelView craftId="wobbly" hostShipIds={['quellon', 'refinery-124']} currentHostId={null} onChoose={onChoose} />);
  expect(screen.getByRole('button', { name: /save wobbly starting host/i })).toBeDisabled();
  expect(screen.queryByRole('option', { name: /aegis/i })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: /wobbly starting host/i }), 'quellon');
  await user.click(screen.getByRole('button', { name: /save wobbly starting host/i }));
  expect(onChoose).toHaveBeenCalledWith('quellon');
});
it('retains the saved host while unavailable and never offers an offline mutation', () => {
  render(<UnionCraftStartingHostPanelView craftId="ally" hostShipIds={['shepherd', 'icebreaker']} currentHostId="shepherd" disabled onChoose={vi.fn()} />);
  expect(screen.getByText(/saved host: shepherd/i)).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByRole('button')).toBeDisabled();
});
