import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import LastPlayerWarning from './LastPlayerWarning';

vi.mock('@/lib/sessionService', () => ({
  getSessionPresence: vi.fn(),
}));
const { getSessionPresence } = await import('@/lib/sessionService');

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

it('shows warning automatically when this is the last connected player', async () => {
  vi.mocked(getSessionPresence).mockResolvedValue({ connectedPlayers: 1 });
  render(<LastPlayerWarning />);

  expect(await screen.findByText(/you.re the last player to leave the server/i))
    .toHaveTextContent('After seven days of inactivity, this session will be deleted.');
});

it('does not show warning when there are multiple players', async () => {
  vi.mocked(getSessionPresence).mockResolvedValue({ connectedPlayers: 2 });
  render(<LastPlayerWarning />);

  expect(screen.queryByText(/you.re the last player to leave the server/i)).not.toBeInTheDocument();
});
