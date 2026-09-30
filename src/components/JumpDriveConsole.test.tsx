import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import { useSessionStore } from '@/store/useSessionStore';
import JumpDriveConsole from './JumpDriveConsole';

vi.mock('@/lib/sessionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sessionService')>();
  return {
    ...actual,
    jumpShip: vi.fn(),
    createJumpShipAttempt: vi.fn((shipId: string, destination: string | undefined, options?: {
      readonly emergency?: boolean; readonly failureRequestId?: string; readonly blind?: true;
    }) => ({
      sessionId: 's1', shipId, ...(destination === undefined ? {} : { destination }),
      requestId: '30400000-0000-4000-8000-000000000001', expectedRevision: 3,
      instanceId: 'bridge',
      ...(options?.emergency ? { emergency: true } : {}),
      ...(options?.failureRequestId ? { failureRequestId: options.failureRequestId } : {}),
      ...(options?.blind ? { blind: true as const } : {}),
    })),
  };
});

const { jumpShip } = await import('@/lib/sessionService');
const jumpAttempt = {
  sessionId: 's1',
  shipId: 'aegis',
  destination: '1000',
  requestId: '30400000-0000-4000-8000-000000000001',
  expectedRevision: 3,
  instanceId: 'bridge',
};
const { createJumpShipAttempt } = await import('@/lib/sessionService');

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
vi.mocked(createJumpShipAttempt).mockReset().mockImplementation((shipId, destination, options) => ({
    sessionId: 's1', shipId, ...(destination === undefined ? {} : { destination }),
    requestId: '30400000-0000-4000-8000-000000000001', expectedRevision: 3,
    instanceId: 'bridge',
    ...(options?.emergency ? { emergency: true } : {}),
    ...(options?.failureRequestId ? { failureRequestId: options.failureRequestId } : {}),
    ...(options?.blind ? { blind: true as const } : {}),
  }));
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
  expect(jumpShip).toHaveBeenCalledWith(expect.objectContaining({ shipId: 'aegis', destination: '2000' }));
});

it('submits blind travel without a candidate and retries the same request until the server reveals arrival', async () => {
  const user = userEvent.setup();
  const blindAttempt = {
    sessionId: 's1', shipId: 'aegis', blind: true as const,
    requestId: '30400000-0000-4000-8000-000000000007', expectedRevision: 3, instanceId: 'bridge',
  };
  vi.mocked(createJumpShipAttempt).mockReturnValue(blindAttempt);
  vi.mocked(jumpShip)
    .mockRejectedValueOnce({ code: 'functions/unavailable' })
    .mockResolvedValueOnce({
      status: 'jumped', shipId: 'aegis', origin: '0000', destination: '1413',
      length: 'short', fuelCost: 2, remainingFuel: 2,
    });
  renderConsole();

  await user.click(screen.getByRole('button', { name: 'Enable blind jump' }));
  expect(screen.getByLabelText('Blind destination hidden until server resolution')).toHaveTextContent('BLIND');
  await user.click(screen.getByRole('button', { name: 'Arm blind jump' }));
  fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
  await user.click(screen.getByRole('button', { name: 'Blind jump' }));

  expect(createJumpShipAttempt).toHaveBeenCalledWith('aegis', undefined, { blind: true });
  expect(jumpShip).toHaveBeenNthCalledWith(1, blindAttempt);
  expect(await screen.findByRole('button', { name: 'Retry blind-jump confirmation' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Retry blind-jump confirmation' }));

  expect(createJumpShipAttempt).toHaveBeenCalledTimes(1);
  expect(jumpShip).toHaveBeenNthCalledWith(2, blindAttempt);
  expect(await screen.findByText(/blind jump complete.*0000 → 1413/i)).toBeInTheDocument();
  expect(screen.getByLabelText('Locked destination coordinates')).toHaveTextContent('1413');
});

it('scrambles blind digits in four staggered updates every 500 ms and clears timers on resolution', async () => {
  vi.useFakeTimers();
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.51);
  let resolveJump!: (reply: {
    status: 'jumped'; shipId: string; origin: string; destination: string;
    length: 'short'; fuelCost: number; remainingFuel: number;
  }) => void;
  vi.mocked(jumpShip).mockReturnValueOnce(new Promise((resolve) => { resolveJump = resolve; }));
  const { container, unmount } = renderConsole();
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Enable blind jump' }));
    fireEvent.click(screen.getByRole('button', { name: 'Arm blind jump' }));
    fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Blind jump' }));
      await Promise.resolve();
    });

    const readout = () => container.querySelector('[data-blind-digit-readout]');
    expect(readout()?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByLabelText('Blind destination pending server selection')).toHaveTextContent('BLIND');
    expect(readout()?.textContent).toBe('0000');
    await act(async () => { vi.advanceTimersByTime(24); });
    expect(readout()?.textContent).toBe('0000');
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(readout()?.textContent).toBe('5000');
    await act(async () => { vi.advanceTimersByTime(75); });
    expect(readout()?.textContent).toBe('5500');
    await act(async () => { vi.advanceTimersByTime(75); });
    expect(readout()?.textContent).toBe('5550');
    await act(async () => { vi.advanceTimersByTime(75); });
    expect(readout()?.textContent).toBe('5555');
    expect(readout()?.textContent).toMatch(/^[0-9]{4}$/);
    expect(random).toHaveBeenCalledTimes(8);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(random).toHaveBeenCalledTimes(12);
    await act(async () => { vi.advanceTimersByTime(25); });
    expect(random).toHaveBeenCalledTimes(13);

    await act(async () => {
      resolveJump({
        status: 'jumped', shipId: 'aegis', origin: '0000', destination: '1413',
        length: 'short', fuelCost: 2, remainingFuel: 2,
      });
      await Promise.resolve();
    });
    expect(screen.getByLabelText('Locked destination coordinates')).toHaveTextContent('1413');
    expect(vi.getTimerCount()).toBe(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    random.mockRestore();
    vi.useRealTimers();
  }
});

it('uses a stable readable blind-jump display when reduced motion is enabled', async () => {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  });
  vi.useFakeTimers();
  const random = vi.spyOn(Math, 'random');
  vi.mocked(jumpShip).mockReturnValueOnce(new Promise(() => undefined));
  try {
    renderConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Enable blind jump' }));
    fireEvent.click(screen.getByRole('button', { name: 'Arm blind jump' }));
    fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Blind jump' }));
      await Promise.resolve();
    });
    const readout = screen.getByLabelText('Blind destination pending server selection');
    expect(readout).toHaveTextContent('BLIND');
    expect(document.querySelector('[data-blind-digit-readout]')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(random).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    random.mockRestore();
    vi.useRealTimers();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
  }
});

it('offers an emergency jump at pursuit 10 without requiring the drive power rail', async () => {
  const user = userEvent.setup();
  renderConsole({ pursuitValue: 10, pursuitEmergencyWindowStatus: 'offered' });

  await user.click(screen.getByRole('button', { name: 'Increase coordinate digit 1' }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  expect(screen.getByRole('slider', { name: /jump drive power/i })).toHaveValue('0');

  await user.click(screen.getByRole('button', { name: /emergency jump to 1000/i }));
  expect(jumpShip).toHaveBeenCalledWith(expect.objectContaining({
    shipId: 'aegis', destination: '1000', emergency: true,
  }));
});

it('keeps an uncertain emergency request on its emergency retry control', async () => {
  const user = userEvent.setup();
  vi.mocked(createJumpShipAttempt).mockReturnValue({ ...jumpAttempt, emergency: true });
  vi.mocked(jumpShip).mockRejectedValueOnce({ code: 'functions/unavailable' });
  renderConsole({ pursuitValue: 10, pursuitEmergencyWindowStatus: 'offered' });

  await user.click(screen.getByRole('button', { name: 'Increase coordinate digit 1' }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
  await user.click(screen.getByRole('button', { name: /emergency jump to 1000/i }));

  expect(screen.getByRole('button', { name: /emergency jump pending/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /retry emergency jump confirmation/i })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /retry emergency jump confirmation/i }));
  expect(jumpShip).toHaveBeenNthCalledWith(2, expect.objectContaining({ emergency: true }));
});

it('keeps an uncertain emergency retry available after the fresh projection marks it used', async () => {
  const user = userEvent.setup();
  vi.mocked(createJumpShipAttempt).mockReturnValue({ ...jumpAttempt, emergency: true });
  vi.mocked(jumpShip).mockRejectedValueOnce({ code: 'functions/unavailable' });
  const view = renderConsole({ pursuitValue: 10, pursuitEmergencyWindowStatus: 'offered' });

  await user.click(screen.getByRole('button', { name: 'Increase coordinate digit 1' }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  await user.click(screen.getByRole('button', { name: /emergency jump to 1000/i }));

  view.rerender(
    <ConsoleAccessContext.Provider value={{ writable: true, roleId: 'aegis' }}>
      <JumpDriveConsole
        shipId="aegis" shipName="AEGIS" currentCoordinate="0000" fuel={0}
        jumpCosts={[2, 3, 6]} charged={false} damaged={false} upgraded={false}
        pursuitValue={10} emergencyJumpUsed lastFailureRequestId="jump-failure"
        pursuitEmergencyWindowStatus="offered"
      />
    </ConsoleAccessContext.Provider>,
  );

  expect(screen.getByRole('button', { name: /retry emergency jump confirmation/i })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /retry emergency jump confirmation/i }));
  expect(jumpShip).toHaveBeenNthCalledWith(2, expect.objectContaining({
    requestId: jumpAttempt.requestId, emergency: true,
  }));
});

it('waits for the facilitator offer before enabling pursuit-10 emergency jump', () => {
  renderConsole({ pursuitValue: 10, pursuitEmergencyWindowStatus: 'awaiting-gm-decision' });

  expect(screen.getByRole('status', { name: 'Pursuit emergency decision' }))
    .toHaveTextContent(/waiting for the facilitator to offer/i);
  expect(screen.queryByRole('button', { name: /emergency jump to/i })).not.toBeInTheDocument();
});

it('does not show a pursuit-10 emergency action before a facilitator offer exists', () => {
  renderConsole({ pursuitValue: 10 });

  expect(screen.queryByRole('button', { name: /emergency jump to/i })).not.toBeInTheDocument();
});

it('shows the effective fuel bands after the Jump Drive upgrade', () => {
  renderConsole({ upgraded: true });

  expect(screen.getByLabelText('Jump drive telemetry')).toHaveTextContent('Cost bands // S 1 // M 2 // L 5');
});

it('allows local coordinate preview without exposing a jump mutation', async () => {
  const user = userEvent.setup();
  render(
    <ConsoleAccessContext.Provider value={{ writable: false }}>
      <JumpDriveConsole
        shipId="aegis" shipName="AEGIS" currentCoordinate="0000" fuel={4}
        jumpCosts={[2, 3, 6]} charged damaged={false} upgraded={false} presentationOnly
      />
    </ConsoleAccessContext.Provider>,
  );

  await user.click(screen.getByRole('button', { name: /increase coordinate digit 1/i }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));

  expect(screen.getByLabelText('Locked destination coordinates')).toHaveTextContent('1000');
  expect(screen.getByRole('button', { name: /unlock destination coordinates/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /jump to 1000/i })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(/presentation preview.*local controls only/i);
  expect(jumpShip).not.toHaveBeenCalled();
});

it('prefers a newer server lockout projection to the local reply projection', async () => {
  const user = userEvent.setup();
  const localLockout = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const serverLockout = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  vi.mocked(jumpShip).mockResolvedValueOnce({
    status: 'integrity-lockout',
    shipId: 'aegis',
    origin: '0000',
    destination: '2000',
    integrityLockedUntil: localLockout,
    state: { integrityLockedUntil: localLockout },
  });
  const view = renderConsole({ integrityLockedUntil: undefined });

  await user.click(screen.getByRole('button', { name: /increase coordinate digit 1/i }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
  await user.click(screen.getByRole('button', { name: /jump to 1000/i }));

  view.rerender(
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
        integrityLockedUntil={serverLockout}
      />
    </ConsoleAccessContext.Provider>,
  );

  expect(screen.getByRole('status', { name: /jump drive integrity locked/i })).toHaveTextContent(
    /20:\d{2} until drive integrity reestablishes/i,
  );
});

it('reports a stale server result as stale instead of a drive failure', async () => {
  const user = userEvent.setup();
  vi.mocked(jumpShip).mockResolvedValueOnce({
    status: 'stale',
    shipId: 'aegis',
    currentRevision: 4,
    revision: 4,
  });
  renderConsole();

  await user.click(screen.getByRole('button', { name: /increase coordinate digit 1/i }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
  await user.click(screen.getByRole('button', { name: /jump to 1000/i }));

  expect(await screen.findByText(/jump not committed.*live ship state changed/i)).toBeInTheDocument();
});

it('retries an uncertain jump with the same exact command identity', async () => {
  const user = userEvent.setup();
  vi.mocked(createJumpShipAttempt).mockReturnValue(jumpAttempt);
  vi.mocked(jumpShip)
    .mockRejectedValueOnce({ code: 'functions/unavailable' })
    .mockResolvedValueOnce({
      status: 'jumped', shipId: 'aegis', origin: '0000', destination: '2000',
      length: 'short', fuelCost: 2, remainingFuel: 2,
    });
  renderConsole();

  await user.click(screen.getByRole('button', { name: /increase coordinate digit 1/i }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
  await user.click(screen.getByRole('button', { name: /jump to 1000/i }));

  expect(await screen.findByText(/jump status unconfirmed.*retry.*same request/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /retry jump confirmation/i }));

  expect(createJumpShipAttempt).toHaveBeenCalledTimes(1);
  expect(jumpShip).toHaveBeenNthCalledWith(1, expect.objectContaining({
    requestId: '30400000-0000-4000-8000-000000000001', expectedRevision: 3,
  }));
  expect(jumpShip).toHaveBeenNthCalledWith(2, expect.objectContaining({
    requestId: '30400000-0000-4000-8000-000000000001', expectedRevision: 3,
  }));
});

it.each([
  ['a cancelled callable response', { code: 'functions/cancelled', message: 'Request cancelled.' }],
  ['an unclassified transport error', new Error('Connection closed before acknowledgement.')],
])('retains the exact jump attempt after %s', async (_label, failure) => {
  const user = userEvent.setup();
  vi.mocked(createJumpShipAttempt).mockReturnValue(jumpAttempt);
  vi.mocked(jumpShip)
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({
      status: 'jumped', shipId: 'aegis', origin: '0000', destination: '1000',
      length: 'short', fuelCost: 2, remainingFuel: 2,
    });
  renderConsole();

  await user.click(screen.getByRole('button', { name: /increase coordinate digit 1/i }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
  await user.click(screen.getByRole('button', { name: /jump to 1000/i }));

  expect(await screen.findByText(/jump status unconfirmed.*retry.*same request/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /retry jump confirmation/i }));

  expect(createJumpShipAttempt).toHaveBeenCalledTimes(1);
  expect(jumpShip).toHaveBeenNthCalledWith(1, jumpAttempt);
  expect(jumpShip).toHaveBeenNthCalledWith(2, jumpAttempt);
});

it('clears the attempt after a structured callable denial', async () => {
  const user = userEvent.setup();
  const retryAttempt = { ...jumpAttempt, requestId: '30400000-0000-4000-8000-000000000002' };
  vi.mocked(createJumpShipAttempt)
    .mockReturnValueOnce(jumpAttempt)
    .mockReturnValueOnce(retryAttempt);
  vi.mocked(jumpShip)
    .mockRejectedValueOnce({ code: 'functions/permission-denied', message: 'Not authorized.' })
    .mockResolvedValueOnce({
      status: 'jumped', shipId: 'aegis', origin: '0000', destination: '1000',
      length: 'short', fuelCost: 2, remainingFuel: 2,
    });
  renderConsole();

  await user.click(screen.getByRole('button', { name: /increase coordinate digit 1/i }));
  await user.click(screen.getByRole('button', { name: /lock destination coordinates/i }));
  fireEvent.change(screen.getByRole('slider', { name: /jump drive power/i }), { target: { value: '100' } });
  await user.click(screen.getByRole('button', { name: /jump to 1000/i }));

  expect(await screen.findByText(/jump request rejected.*authority or drive conditions changed/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /jump to 1000/i }));

  expect(createJumpShipAttempt).toHaveBeenCalledTimes(2);
  expect(jumpShip).toHaveBeenNthCalledWith(1, jumpAttempt);
  expect(jumpShip).toHaveBeenNthCalledWith(2, retryAttempt);
});

it('shows the server-owned one-hour integrity lockout and disables the drive', () => {
  renderConsole({ integrityLockedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() });

  expect(screen.getByRole('status', { name: /jump drive integrity locked/i })).toHaveTextContent(
    /jump drive integrity locked/i,
  );
  expect(screen.getByRole('button', { name: /lock destination coordinates/i })).toBeDisabled();
  expect(screen.getByRole('slider', { name: /jump drive power/i })).toBeDisabled();
});

it('keeps players waiting until the facilitator offers the pursuit emergency jump', () => {
  renderConsole({
    pursuitValue: 10,
    pursuitEmergencyWindowStatus: 'awaiting-gm-decision',
  } as Partial<ComponentProps<typeof JumpDriveConsole>>);

  expect(screen.getByRole('status', { name: /pursuit emergency/i }))
    .toHaveTextContent(/waiting for the facilitator to offer an emergency jump/i);
  expect(screen.queryByRole('button', { name: /emergency jump to/i })).not.toBeInTheDocument();
});

it('offers the emergency drive only after the facilitator decision is live', () => {
  renderConsole({
    pursuitValue: 10,
    pursuitEmergencyWindowStatus: 'offered',
  } as Partial<ComponentProps<typeof JumpDriveConsole>>);

  expect(screen.getByRole('button', { name: /emergency jump to/i })).toBeInTheDocument();
});
