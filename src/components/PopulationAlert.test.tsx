import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import PopulationAlert from './PopulationAlert';

vi.mock('@/lib/sessionService', () => ({ dismissPopulationAlert: vi.fn() }));
const { dismissPopulationAlert } = await import('@/lib/sessionService');

beforeEach(() => {
  vi.mocked(dismissPopulationAlert).mockReset();
  vi.mocked(dismissPopulationAlert).mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'active', ownerUid: 'u1',
    populationAlerts: {
      capybara: {
        population: 15000, shipId: 'capybara', shipName: 'Capybara', targetGmInstanceIds: ['gm-1'],
        createdAt: '2026-09-05T12:00:00.000Z',
      },
    },
    createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
    joinedAt: '2026-09-05T00:00:00.000Z',
  });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'Bridge', deviceLabel: 'Test',
    claimedAt: '2026-09-05T00:00:00.000Z',
  });
});

it('blocks an active GM with a fullscreen alert until they dismiss it', async () => {
  const user = userEvent.setup();
  render(<PopulationAlert />);

  const alert = screen.getByRole('alertdialog', { name: /survivor population threshold reached/i });
  expect(alert).toHaveTextContent(/capybara.*15,000/i);
  await user.click(screen.getByRole('button', { name: /dismiss population alert/i }));
  expect(dismissPopulationAlert).toHaveBeenCalledWith('capybara');
});

it('lets the GM retry when acknowledgement cannot reach the server', async () => {
  vi.mocked(dismissPopulationAlert).mockRejectedValueOnce(new Error('offline'));
  const user = userEvent.setup();
  render(<PopulationAlert />);

  const button = screen.getByRole('button', { name: /dismiss population alert/i });
  await user.click(button);
  expect(button).toBeEnabled();
});
