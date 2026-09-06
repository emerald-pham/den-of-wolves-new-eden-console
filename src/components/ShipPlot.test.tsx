import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
afterEach(() => vi.useRealTimers());

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
  useSessionStore.getState().setConnection('live');
  vi.mocked(triggerDradisContact).mockResolvedValue(undefined);
  render(<ShipPlot hostile={false} aboard viewerId="aegis" ambientSession={session} />);

  expect(screen.queryByRole('region', { name: /gm dradis effects/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /zoom into dradis/i }));
  const effects = screen.getByRole('region', { name: /gm dradis effects/i });
  await user.click(within(effects).getByRole('button', { name: /trigger unknown contact/i }));

  expect(triggerDradisContact).toHaveBeenCalledOnce();
});

it('keeps expanded DRADIS effects disabled while the connection is unavailable', async () => {
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
  useSessionStore.getState().setConnection('offline');

  render(<ShipPlot hostile={false} aboard viewerId="aegis" ambientSession={session} />);
  await user.click(screen.getByRole('button', { name: /zoom into dradis/i }));
  const trigger = screen.getByRole('button', { name: /trigger unknown contact/i });

  expect(trigger).toBeDisabled();
  await user.click(trigger);
  expect(triggerDradisContact).not.toHaveBeenCalled();
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
it('reserves space above the bottom-left warning for the expanded DRADIS compass', () => {
  const css = readFileSync('src/index.css', 'utf8');
  expect(css).toMatch(/\.ship-plot:has\(\.contact-plot__red-alert\) \.ship-plot__compass\s*\{[^}]*bottom:\s*calc\(max\(0\.75rem, env\(safe-area-inset-bottom\)\) \+ 2\.75rem\)/);
});

it('shows the blue team-phase countdown at the bottom-left of DRADIS', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  const turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false },
  };

  render(<ShipPlot hostile={false} aboard viewerId="aegis" turnPhase={turnPhase} />);

  const countdown = screen.getByRole('status', { name: 'Team phase // 10:00 remaining' });
  expect(countdown).toHaveAttribute('data-tone', 'blue');
  const css = readFileSync('src/index.css', 'utf8');
  expect(css).toMatch(/\.turn-phase-timer\[data-tone=['"]blue['"]\][^}]*color:\s*var\(--cic-cyan-hot\)/);
});
