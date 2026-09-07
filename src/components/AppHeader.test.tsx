import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { APP_VERSION } from '@/version';
import { SESSION_WAIVER_STORAGE_KEY } from '@/lib/sessionWaiver';
import type { Player } from '@/types/game';
import AppHeader from './AppHeader';

vi.mock('@/lib/sessionService', () => ({
  releaseConsoleRole: vi.fn(),
  releaseGmInstance: vi.fn(),
  disconnectFromSession: vi.fn(),
  loginGmAccess: vi.fn(),
  logoutGmAccess: vi.fn(),
}));
vi.mock('@/lib/firestore', () => ({
  subscribeConnectedPlayers: vi.fn(),
}));
const {
  disconnectFromSession,
  loginGmAccess,
  logoutGmAccess,
  releaseConsoleRole,
  releaseGmInstance,
} =
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
  vi.mocked(disconnectFromSession).mockResolvedValue('applied');
  vi.mocked(loginGmAccess).mockResolvedValue('applied');
  vi.mocked(logoutGmAccess).mockResolvedValue('applied');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

it('shows a blue iris-authentication status while Turn 0 systems are still booting', async () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({ ...session, currentTurn: 0 });
  useSessionStore.getState().setMe(connectedPlayer('u1'));
  useSessionStore.getState().setConnection('live');

  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await screen.findByText('2 connected to CIC');

  const indicator = screen.getByRole('status', {
    name: /connected to firebase and awaiting iris authentication during turn 0/i,
  });
  expect(indicator).toHaveTextContent('Connected, Awaiting Iris Authentication');
  expect(indicator).toHaveAttribute('data-status', 'blue');

  act(() => useSessionStore.getState().setSession({ ...session, currentTurn: 1 }));
  expect(indicator).toHaveTextContent('In session');
  expect(indicator).toHaveAttribute('data-status', 'green');
});

it('keeps a cached session light green for thirty seconds while a refreshed browser reconnects', async () => {
  vi.useFakeTimers();
  useSessionStore.getState().setMe(connectedPlayer('u1'));

  render(<MemoryRouter><AppHeader /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });

  const indicator = screen.getByRole('status');
  expect(indicator).toHaveAttribute('data-status', 'green');

  act(() => vi.advanceTimersByTime(29_999));
  expect(indicator).toHaveAttribute('data-status', 'green');
  act(() => vi.advanceTimersByTime(1));
  expect(indicator).toHaveAttribute('data-status', 'red');
});

it('restores the cached session light for thirty seconds when a background tab returns', async () => {
  vi.useFakeTimers();
  useSessionStore.getState().setMe(connectedPlayer('u1'));
  useSessionStore.getState().setConnection('live');
  render(<MemoryRouter><AppHeader /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  act(() => useSessionStore.getState().setConnection('offline'));
  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'green');
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'red');

  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'green');
  act(() => vi.advanceTimersByTime(29_999));
  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'green');
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'red');
  Reflect.deleteProperty(document, 'visibilityState');
});

it('holds the last session light during a passive connection loss', async () => {
  vi.useFakeTimers();
  useSessionStore.getState().setMe(connectedPlayer('u1'));
  useSessionStore.getState().setConnection('live');

  render(<MemoryRouter><AppHeader /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });

  act(() => useSessionStore.getState().setConnection('offline'));

  const indicator = screen.getByRole('status');
  expect(indicator).toHaveAttribute('data-status', 'green');
  act(() => vi.advanceTimersByTime(30_000));
  expect(indicator).toHaveAttribute('data-status', 'red');
});

it('shows the disconnected state immediately after player interaction', async () => {
  vi.useFakeTimers();
  useSessionStore.getState().setMe(connectedPlayer('u1'));
  useSessionStore.getState().setConnection('live');

  render(<MemoryRouter><AppHeader /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });

  act(() => useSessionStore.getState().setConnection('offline'));
  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'green');

  fireEvent.click(screen.getByRole('button', { name: /settings/i }));

  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'red');
});

it('treats a page re-entry event as passive reconnect context', async () => {
  vi.useFakeTimers();
  useSessionStore.getState().setMe(connectedPlayer('u1'));
  useSessionStore.getState().setConnection('live');

  render(<MemoryRouter><AppHeader /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  act(() => useSessionStore.getState().setConnection('offline'));
  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'green');
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole('status')).toHaveAttribute('data-status', 'red');

  act(() => {
    window.dispatchEvent(new Event('pageshow'));
  });

  const indicator = screen.getByRole('status');
  expect(indicator).toHaveAttribute('data-status', 'green');
  act(() => vi.advanceTimersByTime(30_000));
  expect(indicator).toHaveAttribute('data-status', 'red');
});

it('keeps fleet broadcasts in the same measured header row as the session code', async () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setMe(connectedPlayer('u1'));
  useSessionStore.getState().setSession({
    ...session,
    fleetRedAlert: { active: true, revision: 1 },
  });

  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  const header = screen.getByRole('banner');
  expect(header).toContainElement(screen.getByLabelText('Session code 4821'));
  expect(header).toContainElement(screen.getByRole('status', { name: /icsn admiral \/\/ red alert/i }));
  expect(await screen.findByText('2 connected to CIC')).toBeVisible();
});

it('keeps the header clear before the Press Officer releases a dispatch', async () => {
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  const header = screen.getByRole('banner');
  expect(within(header).queryByLabelText('Fleet broadcasts')).not.toBeInTheDocument();
  expect(await screen.findByText('2 connected to CIC')).toBeVisible();
});

it('keeps the settings gear available on the launcher without session-only readouts', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().reset();
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));

  expect(screen.getByRole('dialog', { name: /session settings/i })).toBeInTheDocument();
  expect(screen.getByText(`Build ${APP_VERSION}`)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /gm access/i })).toBeVisible();
  expect(screen.queryByText(/disconnect this device from session/i)).not.toBeInTheDocument();
});

it('shows the player command rank in the top-right header', async () => {
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([connectedPlayer('u1')]);
    return vi.fn();
  });
  useSessionStore.getState().setMe({
    ...connectedPlayer('u1'),
    activeConsoleRoleId: 'admiral',
  });

  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  expect(screen.getByText('Rank: Admiral')).toBeVisible();
  expect(await screen.findByText('1 connected to CIC')).toBeVisible();
});

it('shows GM followed by the secondary role when both are active', async () => {
  useSessionStore.getState().setGmInstance({
    id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setMe({
    ...connectedPlayer('u1'),
    activeConsoleRoleId: 'admiral',
  });

  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  expect(screen.getByText('Rank: GM / Admiral')).toBeVisible();
  expect(await screen.findByText('2 connected to CIC')).toBeVisible();
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

it('shows the GM access request instructions inside settings', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));

  expect(screen.getByRole('heading', { name: /gm access/i })).toBeVisible();
  const contact = screen.getByRole('link', { name: /emerald\.pham@hey\.com/i });
  expect(contact).toHaveAttribute('href', 'mailto:emerald.pham@hey.com');
  expect(screen.getByText(/proof.*original den of wolves: new eden product/i)).toBeVisible();
  expect(screen.getByText('🔐')).toBeVisible();
  expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
});

it('logs in to GM access from settings and shows the active login', async () => {
  const user = userEvent.setup();
  vi.mocked(loginGmAccess).mockImplementation(async () => {
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    return 'applied';
  });
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));
  await user.type(screen.getByLabelText(/gm access password/i), 'bananasplit');
  await user.click(screen.getByRole('button', { name: /log in/i }));

  expect(loginGmAccess).toHaveBeenCalledWith('bananasplit');
  expect(screen.getByText('🔓')).toBeVisible();
  expect(screen.getByText(/login is remembered in this browser/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /log out gm access/i })).toBeVisible();
});

it('logs out of GM access from settings', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
  vi.mocked(logoutGmAccess).mockImplementation(async () => {
    useSessionStore.getState().clearGmAccess();
    return 'applied';
  });
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));
  await user.click(screen.getByRole('button', { name: /log out gm access/i }));

  expect(logoutGmAccess).toHaveBeenCalledOnce();
  expect(screen.getByText('🔐')).toBeVisible();
  expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
});

it('lets logged-in GM access reset the code of conduct checklist from settings', async () => {
  const user = userEvent.setup();
  localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(Date.now()));
  useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));

  const reset = screen.getByRole('button', { name: /reset code of conduct checklist/i });
  expect(reset).toBeVisible();
  await user.click(reset);

  expect(localStorage.getItem(SESSION_WAIVER_STORAGE_KEY)).toBeNull();
});

it('offers reduce motion as a simple on-off setting', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));

  expect(screen.getByText(/system reduced motion is off/i)).toBeInTheDocument();
  const reduceMotion = screen.getByRole('checkbox', { name: /reduce motion/i });
  await user.click(reduceMotion);
  expect(reduceMotion).toBeChecked();
  expect(screen.queryByText(/overriding your system setting/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /use system setting/i })).not.toBeInTheDocument();
  await user.click(reduceMotion);
  expect(reduceMotion).not.toBeChecked();
});

it('opens a readable changelog in a bounded scroll region from settings', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));
  const toggle = screen.getByRole('button', { name: /view changelog/i });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await user.click(toggle);

  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('heading', { name: 'Changelog' })).toBeVisible();
  expect(screen.getByRole('region', { name: /changelog entries/i })).toBeVisible();
  expect(screen.getByRole('heading', { name: `Build ${APP_VERSION}` })).toBeVisible();
  expect(screen.getByText(/read what changed without leaving your session/i)).toBeVisible();
  expect(screen.queryByText(/component|refactor|typescript/i)).not.toBeInTheDocument();
});

it('keeps the long settings changelog independently scrollable', () => {
  const stylesheet = readFileSync('src/index.css', 'utf8');
  const changelogRule = stylesheet.match(/\.settings-changelog__entries\s*\{([^}]*)\}/)?.[1];

  expect(changelogRule).toMatch(/max-height:/);
  expect(changelogRule).toMatch(/overflow-y:\s*auto/);
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

it('requires a red confirmation before disconnecting this device from its session', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));
  await user.click(screen.getByRole('button', { name: /^disconnect$/i }));

  expect(disconnectFromSession).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: /^are you sure\?$/i });
  expect(confirm).toHaveStyle({
    color: 'var(--cic-danger)',
    borderColor: 'var(--cic-danger)',
  });

  await user.click(confirm);

  expect(disconnectFromSession).toHaveBeenCalledOnce();
});

it('cancels the disconnect confirmation when it loses focus or receives Escape', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));
  await user.click(screen.getByRole('button', { name: /^disconnect$/i }));
  await user.keyboard('{Escape}');

  expect(screen.getByRole('dialog', { name: /session settings/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeVisible();
  expect(disconnectFromSession).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: /^disconnect$/i }));
  await user.click(screen.getByRole('button', { name: /view changelog/i }));

  expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeVisible();
  expect(disconnectFromSession).not.toHaveBeenCalled();
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

it('hides rank until a role is selected and hides it again after release', async () => {
  useSessionStore.getState().setMe(connectedPlayer('u1'));
  render(<MemoryRouter><AppHeader /></MemoryRouter>);
  await screen.findByText('2 connected to CIC');
  expect(screen.queryByText(/^Rank:/)).not.toBeInTheDocument();
  act(() => useSessionStore.getState().setMe({ ...connectedPlayer('u1'), activeConsoleRoleId: 'admiral' }));
  expect(screen.getByText('Rank: Admiral')).toBeVisible();
  act(() => useSessionStore.getState().setMe(connectedPlayer('u1')));
  await screen.findByText('2 connected to CIC');
  expect(screen.queryByText(/^Rank:/)).not.toBeInTheDocument();
});
