import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

type FakeChild = EventEmitter & {
  pid: number;
  exitCode: number | null;
  killed: boolean;
};

type RunCommand = (
  command: string,
  args: readonly string[],
  options?: {
    spawnProcess?: (command: string, args: readonly string[], options: Record<string, unknown>) => FakeChild;
    signalSource?: EventEmitter;
    terminateProcessTree?: (child: FakeChild, signal: NodeJS.Signals) => void | Promise<void>;
  },
) => Promise<void>;

type RunWithReservation = (options: {
  slot: number;
  kind: string;
  command: string;
  ports: readonly number[];
  args: readonly string[];
  filePath?: string;
  reserve?: () => Promise<{ id: string }>;
  release?: (reservation: { id: string }, filePath: string) => Promise<void>;
  runner?: (command: string, args: readonly string[], options?: {
    onSpawn?: (child: FakeChild) => void | Promise<void>;
  }) => Promise<void>;
  attachChild?: (reservation: { id: string }, childPid: number, filePath: string) => Promise<unknown>;
}) => Promise<void>;

const wrapper = await import('../../scripts/run-emulator-command.mjs') as unknown as {
  runCommand: RunCommand;
  runWithReservation: RunWithReservation;
};

function childProcess(pid = 1234): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.pid = pid;
  child.exitCode = null;
  child.killed = false;
  return child;
}

describe('emulator command process lifecycle', () => {
  it('records the spawned child PID on the owning reservation', async () => {
    const attachChild = vi.fn(async () => undefined);
    await wrapper.runWithReservation({
      slot: 4, kind: 'rules', command: 'npm run test:rules', ports: [5001],
      args: ['fake-command'], filePath: '/tmp/coordination.json',
      reserve: async () => ({ id: 'lease-1' }),
      release: async () => undefined,
      attachChild,
      runner: async (_command, _args, options) => {
        await options?.onSpawn?.(childProcess(4321));
      },
    } as Parameters<RunWithReservation>[0]);

    expect(attachChild).toHaveBeenCalledWith({ id: 'lease-1' }, 4321, '/tmp/coordination.json');
  });
  it.each([
    ['SIGINT' as const],
    ['SIGTERM' as const],
  ])('forwards %s only to the spawned process tree and cleans its handler', async (signal) => {
    const child = childProcess();
    const unrelatedChild = childProcess(5678);
    const signals = new EventEmitter();
    const spawnProcess = vi.fn(() => child);
    const terminateProcessTree = vi.fn();

    const command = wrapper.runCommand('npx', ['fake-command'], {
      spawnProcess,
      signalSource: signals,
      terminateProcessTree,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      'npx',
      ['fake-command'],
      expect.objectContaining({ cwd: expect.any(String), stdio: 'inherit' }),
    );

    signals.emit(signal);
    expect(terminateProcessTree).toHaveBeenCalledTimes(1);
    expect(terminateProcessTree).toHaveBeenCalledWith(child, signal);
    expect(terminateProcessTree).not.toHaveBeenCalledWith(unrelatedChild, signal);

    child.emit('exit', null, signal);
    await expect(command).rejects.toThrow(signal);
    expect(signals.listenerCount(signal)).toBe(0);
  });

  it('propagates a non-zero child exit and resolves a clean exit', async () => {
    const failedChild = childProcess();
    const failedSignals = new EventEmitter();
    const failedCommand = wrapper.runCommand('npx', ['fake-command'], {
      spawnProcess: () => failedChild,
      signalSource: failedSignals,
      terminateProcessTree: vi.fn(),
    });
    failedChild.emit('exit', 7, null);
    await expect(failedCommand).rejects.toThrow(/code 7/);

    const successfulChild = childProcess();
    const successfulSignals = new EventEmitter();
    const successfulCommand = wrapper.runCommand('npx', ['fake-command'], {
      spawnProcess: () => successfulChild,
      signalSource: successfulSignals,
      terminateProcessTree: vi.fn(),
    });
    successfulChild.emit('exit', 0, null);
    await expect(successfulCommand).resolves.toBeUndefined();
  });

  it.each([
    ['SIGINT' as const],
    ['SIGTERM' as const],
  ])('releases the owning lease after %s termination', async (signal) => {
    const child = childProcess();
    const signals = new EventEmitter();
    const released: Array<{ id: string; filePath: string }> = [];
    const task = wrapper.runWithReservation({
      slot: 4,
      kind: 'emulators',
      command: 'npm run emulators',
      ports: [5001],
      args: ['fake-command'],
      filePath: '/tmp/coordination.json',
      reserve: async () => ({ id: 'lease-1' }),
      release: async (reservation, filePath) => {
        released.push({ ...reservation, filePath });
      },
      runner: () => wrapper.runCommand('npx', ['fake-command'], {
        spawnProcess: () => child,
        signalSource: signals,
        terminateProcessTree: vi.fn(),
      }),
    });

    await Promise.resolve();
    signals.emit(signal);
    child.emit('exit', null, signal);
    await expect(task).rejects.toThrow(signal);
    expect(released).toEqual([{ id: 'lease-1', filePath: '/tmp/coordination.json' }]);
  });
});
