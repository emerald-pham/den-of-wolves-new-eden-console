import type { ChildProcess } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import type { CoordinationReservation } from './emulator-resource-registry.mjs';

export function runCommand(
  command: string,
  args: readonly string[],
  options?: {
    spawnProcess?: (command: string, args: readonly string[], options: Record<string, unknown>) => ChildProcess;
    signalSource?: EventEmitter;
    terminateProcessTree?: (child: ChildProcess, signal: NodeJS.Signals) => void | Promise<void>;
    onSpawn?: (child: ChildProcess) => void | Promise<void>;
  },
): Promise<void>;

export function runWithReservation(options: {
  slot: number;
  kind: string;
  command: string;
  ports: readonly number[];
  args: readonly string[];
  filePath?: string;
  reserve?: (options: Record<string, unknown>) => Promise<CoordinationReservation>;
  release?: (reservation: CoordinationReservation, filePath?: string) => Promise<void>;
  runner?: typeof runCommand;
  attachChild?: (
    reservation: CoordinationReservation,
    childPid: number,
    filePath?: string,
  ) => Promise<CoordinationReservation>;
}): Promise<void>;
