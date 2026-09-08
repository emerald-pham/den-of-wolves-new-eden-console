import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import { useSessionStore } from '@/store/useSessionStore';
import JumpDriveConsole from './JumpDriveConsole';

vi.mock('@/lib/sessionService', () => ({ jumpShip: vi.fn() }));

const { jumpShip } = await import('@/lib/sessionService');

function renderConsole(props: Partial<ComponentProps<typeof JumpDriveConsole>> = {}) {
  return render(
    <ConsoleAccessContext.Provider value={{ writable: true, roleId: 'aegis' }}>
      <JumpDriveConsole
        shipId="aegis"
        shipName="AEGIS"
        currentCoordinate="0000"
        fuel={4}
        jumpCosts={[2, 3, 6]}
        charged
        damaged={false}
        upgraded={false}
        {...props}
      />
    </ConsoleAccessContext.Provider>,
  );
}

beforeEach(() => {
  useSessionStore.getState().reset();
  vi.mocked(jumpShip).mockReset();
  vi.mocked(jumpShip).mockResolvedValue({
    status: 'jumped',
    shipId: 'aegis',
    origin: '0000',
    destination: '5143',
    length: 'short',
    fuelCost: 2,
    remainingFuel: 2,
  });
});

it('edits four digits, locks the destination, powers the rail, and submits the jump', async () => {
  const user = userEvent.setup();
  renderConsole();

  await user.click(screen.getByRole('button', { name: 'Increase coordinate digit 1' }));
  await user.click(screen.getByRole('button', { name: 'Increase coordinate digit 1' }));
  expect(screen.getByLabelText('Locked destination coordinates')).toHaveTextContent('2000');

  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  expect(screen.getByRole('button', { name: /unlock destination coordinates/i })).toBeInTheDocument();

  const power = screen.getByRole('slider', { name: /jump drive power/i });
  fireEvent.change(power, { target: { value: '100' } });
  expect(power).toHaveValue('100');
  expect(screen.getByRole('button', { name: /jump to 2000/i })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: /jump to 2000/i }));
  expect(jumpShip).toHaveBeenCalledWith('aegis', '2000');
});

it('shows the server-owned one-hour integrity lockout and disables the drive', () => {
  renderConsole({ integrityLockedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() });

  expect(screen.getByRole('status', { name: /jump drive integrity locked/i })).toHaveTextContent(
    /jump drive integrity locked/i,
  );
  expect(screen.getByRole('button', { name: /lock destination coordinates/i })).toBeDisabled();
  expect(screen.getByRole('slider', { name: /jump drive power/i })).toBeDisabled();
});
