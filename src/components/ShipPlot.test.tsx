import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import ShipPlot from './ShipPlot';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

it('opens the shipboard DRADIS with a discrete control and closes it explicitly', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <ShipPlot hostile={false} aboard viewerId="aegis" />,
  );
  const plot = container.querySelector('.ship-plot');

  expect(plot).toHaveAttribute('data-expanded', 'false');
  await user.click(screen.getByRole('button', { name: /zoom into dradis/i }));

  expect(plot).toHaveAttribute('data-expanded', 'true');
  expect(screen.getByRole('button', { name: /close dradis/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /close dradis/i }));
  expect(plot).toHaveAttribute('data-expanded', 'false');
});

it('rotates the expanded DRADIS by pointer and resets from its galactic legend', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <ShipPlot hostile={false} aboard viewerId="aegis" />,
  );
  await user.click(screen.getByRole('button', { name: /zoom into dradis/i }));

  const viewport = screen.getByRole('application', { name: /rotatable dradis/i });
  const rig = container.querySelector<HTMLElement>('.contact-plot__rig');
  expect(rig?.style.getPropertyValue('--view-pitch')).toBe('14deg');
  expect(rig?.style.getPropertyValue('--view-yaw')).toBe('0deg');

  fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 140, clientY: 125 });
  fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 140, clientY: 125 });

  expect(rig?.style.getPropertyValue('--view-pitch')).not.toBe('14deg');
  expect(rig?.style.getPropertyValue('--view-yaw')).not.toBe('0deg');

  const legend = screen.getByRole('button', { name: /reset.*galactic orientation/i });
  expect(legend).toHaveTextContent(/north/i);
  expect(legend).toHaveTextContent(/south/i);
  expect(legend).toHaveTextContent(/east/i);
  expect(legend).toHaveTextContent(/west/i);
  await user.click(legend);

  expect(rig?.style.getPropertyValue('--view-pitch')).toBe('14deg');
  expect(rig?.style.getPropertyValue('--view-yaw')).toBe('0deg');
});
