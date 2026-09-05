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

it('keeps rotation locked and presents galactic orientation as a non-interactive 3D instrument', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <ShipPlot hostile={false} aboard viewerId="aegis" />,
  );
  await user.click(screen.getByRole('button', { name: /zoom into dradis/i }));

  const viewport = container.querySelector<HTMLElement>('.ship-plot__viewport');
  const rig = container.querySelector<HTMLElement>('.contact-plot__rig');
  expect(viewport).toBeInTheDocument();
  expect(rig?.style.getPropertyValue('--view-pitch')).toBe('14deg');
  expect(rig?.style.getPropertyValue('--view-yaw')).toBe('0deg');

  if (!viewport) throw new Error('Expected a DRADIS viewport.');
  fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 140, clientY: 125 });
  fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 140, clientY: 125 });
  fireEvent.keyDown(viewport, { key: 'ArrowRight' });

  expect(rig?.style.getPropertyValue('--view-pitch')).toBe('14deg');
  expect(rig?.style.getPropertyValue('--view-yaw')).toBe('0deg');
  expect(screen.queryByRole('application', { name: /rotatable dradis/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reset.*galactic orientation/i }))
    .not.toBeInTheDocument();

  const compass = screen.getByRole('img', { name: /3d galactic orientation/i });
  expect(compass).toHaveTextContent(/north/i);
  expect(compass).toHaveTextContent(/south/i);
  expect(compass).toHaveTextContent(/east/i);
  expect(compass).toHaveTextContent(/west/i);
});

it('keeps contacts, names, and altitude indicators inside the oriented 3D rig', () => {
  const { container } = render(
    <ShipPlot hostile={false} aboard viewerId="aegis" />,
  );
  const rig = container.querySelector('.contact-plot__rig');

  expect(rig).toContainElement(container.querySelector('.contact-plot__blip'));
  expect(rig).toContainElement(container.querySelector('.contact-plot__tag'));
  expect(rig).toContainElement(container.querySelector('.contact-plot__drop'));
});
