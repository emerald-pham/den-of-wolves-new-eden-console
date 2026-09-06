import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import ShipPlot from './ShipPlot';

vi.mock('@/lib/sessionService', () => ({ triggerDradisContact: vi.fn() }));

const { triggerDradisContact } = await import('@/lib/sessionService');

beforeEach(() => {
  useSessionStore.getState().reset();
  vi.clearAllMocks();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

it('offers every registered DRADIS effect in any expanded console to an active GM', async () => {
  const user = userEvent.setup();
  const session = {
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby' as const, ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  useSessionStore.getState().setIdentity(session, {
    uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'Mac / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(triggerDradisContact).mockResolvedValue(undefined);
  render(<ShipPlot hostile={false} aboard viewerId="aegis" ambientSession={session} />);

  expect(screen.queryByRole('region', { name: /gm dradis effects/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /zoom into dradis/i }));
  const effects = screen.getByRole('region', { name: /gm dradis effects/i });
  await user.click(within(effects).getByRole('button', { name: /trigger unknown contact/i }));

  expect(triggerDradisContact).toHaveBeenCalledOnce();
});

it('keeps expanded DRADIS effect controls hidden from non-GMs', async () => {
  const user = userEvent.setup();
  render(<ShipPlot hostile={false} aboard viewerId="aegis" />);

  await user.click(screen.getByRole('button', { name: /zoom into dradis/i }));
  expect(screen.queryByRole('region', { name: /gm dradis effects/i })).not.toBeInTheDocument();
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

it('shows the current galactic coordinate only in the expanded display', async () => {
  const user = userEvent.setup();
  render(
    <ShipPlot
      hostile={false}
      aboard
      viewerId="aegis"
      shipGalacticCoordinates={{ aegis: '0042' }}
    />,
  );

  const zoom = screen.getByRole('button', { name: /zoom into dradis/i });
  expect(screen.queryByText('GALACTIC COORDINATES')).not.toBeInTheDocument();
  expect(screen.queryByText('0042')).not.toBeInTheDocument();

  await user.click(zoom);
  expect(screen.getByText('GALACTIC COORDINATES').parentElement)
    .toHaveTextContent('GALACTIC COORDINATES // 0042');
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
