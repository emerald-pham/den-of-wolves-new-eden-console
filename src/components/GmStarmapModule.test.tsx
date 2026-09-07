import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { GameSession } from '@/types/game';
import GmStarmapModule from './GmStarmapModule';

vi.mock('@/lib/sessionService', () => ({
  moveShipToLocation: vi.fn().mockResolvedValue({
    shipId: 'aegis', origin: '0000', destination: '5143', stardate: '2026.250.130409',
  }),
}));

const { moveShipToLocation } = await import('@/lib/sessionService');

const session = {
  id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm',
  createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z',
  currentTurn: 1,
  shipGalacticCoordinates: { aegis: '0000', dione: '0000' },
  shipNavigationLogs: { aegis: [], dione: [] },
} as unknown as GameSession;

it('lets the GM select a ship, click a system, and move that ship there', async () => {
  const user = userEvent.setup();
  render(<GmStarmapModule session={session} />);

  const module = screen.getByRole('region', { name: 'GM starmap' });
  await user.selectOptions(within(module).getByRole('combobox', { name: /ship to move/i }), 'aegis');
  await user.click(within(module).getByRole('button', { name: /system 5143/i }));
  await user.click(within(module).getByRole('button', { name: /move ship to location/i }));

  expect(moveShipToLocation).toHaveBeenCalledWith('aegis', '5143');
});
