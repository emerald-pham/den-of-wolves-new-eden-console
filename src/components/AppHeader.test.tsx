import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { APP_VERSION } from '@/version';
import type { Player } from '@/types/game';
import AppHeader from './AppHeader';

vi.mock('@/lib/sessionService', () => ({
  releaseConsoleRole: vi.fn(),
  releaseGmInstance: vi.fn(),
  disconnectFromSession: vi.fn(),
}));
vi.mock('@/lib/firestore', () => ({
  subscribeConnectedPlayers: vi.fn(),
}));
const { releaseConsoleRole, releaseGmInstance } =
  await import('@/lib/sessionService');
const { subscribeConnectedPlayers } = await import('@/lib/firestore');

const connectedPlayer = (uid: string): Player => ({
  uid,
  sessionId: 's1',
  displayName: `Player ${uid}`,
  role: 'player',
  seatId: null,
  activeConsoleRoleId: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([connectedPlayer('u1'), connectedPlayer('u2')]);
    return vi.fn();
  });
});

afterEach(() => vi.restoreAllMocks());

it('shows the current session personnel count in the top-right header', async () => {
  let publish: ((players: readonly Player[]) => void) | undefined;
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    publish = onPlayers;
    onPlayers([connectedPlayer('u1'), connectedPlayer('u2'), connectedPlayer('u3')]);
    return vi.fn();
  });
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  expect(await screen.findByText('3 connected to CIC')).toBeVisible();
  act(() => publish?.([
    connectedPlayer('u1'), connectedPlayer('u2'), connectedPlayer('u3'), connectedPlayer('u4'),
  ]));
  expect(screen.getByText('4 connected to CIC')).toBeVisible();
});

it('shows the last-player warning inside settings', async () => {
  const user = userEvent.setup();
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([connectedPlayer('u1')]);
    return vi.fn();
  });
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));

  expect(screen.getAllByLabelText('Session code 4821')).toHaveLength(2);
  expect(screen.getAllByText('1 connected to CIC')).toHaveLength(2);
  expect(await screen.findByText(/you.re the last player to leave the server/i))
    .toHaveTextContent('After seven days of inactivity, this session will be deleted.');
  expect(screen.getByText(`Build ${APP_VERSION}`)).toBeInTheDocument();
});

it('shows the system motion setting and lets a player override it', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));

  expect(screen.getByText(/system reduced motion is off/i)).toBeInTheDocument();
  const reduceMotion = screen.getByRole('checkbox', { name: /reduce motion/i });
  await user.click(reduceMotion);
  expect(reduceMotion).toBeChecked();
  expect(screen.getByText(/overriding your system setting/i)).toBeInTheDocument();
});

it('focuses the dialog, closes it with Escape, and restores settings focus', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  const settings = screen.getByRole('button', { name: /settings/i });
  await user.click(settings);
  expect(screen.getByRole('button', { name: /close settings/i })).toHaveFocus();

  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(settings).toHaveFocus();
});

it('releases this browser GM role from settings', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance({
    id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(releaseGmInstance).mockImplementation(async () => {
    useSessionStore.getState().setGmInstance(null);
    return 'applied';
  });
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));
  await user.click(screen.getByRole('button', { name: /release gm role/i }));

  expect(releaseGmInstance).toHaveBeenCalledOnce();
  expect(useSessionStore.getState().gmInstance).toBeNull();
});

it('releases a command role through settings and returns to role selection', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setMe({
    uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    activeConsoleRoleId: 'admiral', joinedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(releaseConsoleRole).mockResolvedValue(undefined);
  render(
    <MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <AppHeader />
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: /settings/i }));
  await user.click(screen.getByRole('button', { name: /release role/i }));

  expect(releaseConsoleRole).toHaveBeenCalledOnce();
});

it('measures wrapped header rows and updates the shared instrument offset', () => {
  let resize: ResizeObserverCallback = () => undefined;
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const height = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ height: 92 } as DOMRect);
  const { unmount } = render(<MemoryRouter><AppHeader /></MemoryRouter>);
  expect(document.documentElement.style.getPropertyValue('--app-header-height')).toBe('92px');
  height.mockReturnValue({ height: 48 } as DOMRect);
  act(() => resize([], {} as ResizeObserver));
  expect(document.documentElement.style.getPropertyValue('--app-header-height')).toBe('48px');
  unmount();
  expect(disconnect).toHaveBeenCalled();
  vi.unstubAllGlobals();
});
