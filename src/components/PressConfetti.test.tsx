import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import PressConfetti from './PressConfetti';

vi.mock('@/lib/sessionService', () => ({ popShipConfetti: vi.fn() }));
const { popShipConfetti } = await import('@/lib/sessionService');

beforeEach(() => {
  vi.mocked(popShipConfetti).mockReset().mockResolvedValue('applied');
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

it('fires newspaper confetti from the SNN shuttle dispenser', async () => {
  const user = userEvent.setup();
  const { container } = render(<PressConfetti />);
  await user.click(screen.getByRole('button', { name: /open newspaper confetti cover/i }));
  await user.click(screen.getByRole('button', { name: /activate newspaper confetti/i }));
  expect(popShipConfetti).toHaveBeenCalledWith('snn-press-shuttle');
  expect(container.querySelectorAll('.confetti-burst__piece--newspaper').length).toBeGreaterThan(0);
});
