import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import { BASE_CAPYBARA_CARGO_TYPES } from './baseCapybaraCargoLedger';

export interface BaseCapybaraCargoTransferCommand {
  readonly requestId: string;
  readonly expectedCycle: number;
  readonly expectedRevision: number;
  readonly expectedDockingRevision: number;
  readonly expectedHostShipId: string;
  readonly resourceId: (typeof BASE_CAPYBARA_CARGO_TYPES)[number];
  readonly direction: 'load' | 'unload';
  readonly amount: number;
}

export interface BaseCapybaraCargoTransferResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly resourceId: (typeof BASE_CAPYBARA_CARGO_TYPES)[number];
  readonly direction: 'load' | 'unload';
  readonly amount: number;
  readonly cycle: number;
  readonly cargoRevision: number;
}

export interface BaseCapybaraCargoTransferStaleResult {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedCycle: number;
  readonly currentCycle: number;
  readonly expectedHostShipId: string;
  readonly currentHostShipId: string;
  readonly expectedDockingRevision: number;
  readonly currentDockingRevision: number;
  readonly resourceId: (typeof BASE_CAPYBARA_CARGO_TYPES)[number];
  readonly direction: 'load' | 'unload';
  readonly amount: number;
  readonly expectedRevision: number;
  readonly currentCargoRevision: number;
}

export type BaseCapybaraCargoTransferServiceResult =
  | BaseCapybaraCargoTransferResult
  | BaseCapybaraCargoTransferStaleResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStaleTransferReply(
  value: unknown,
  sessionId: string,
  command: BaseCapybaraCargoTransferCommand,
): value is BaseCapybaraCargoTransferStaleResult {
  const keys = [
    'status', 'sessionId', 'requestId', 'expectedCycle', 'currentCycle',
    'expectedHostShipId', 'currentHostShipId', 'expectedDockingRevision',
    'currentDockingRevision', 'resourceId', 'direction', 'amount',
    'expectedRevision', 'currentCargoRevision',
  ].sort().join(',');
  return isRecord(value) && Object.keys(value).sort().join(',') === keys &&
    value.status === 'stale' && value.sessionId === sessionId &&
    value.requestId === command.requestId &&
    value.expectedCycle === command.expectedCycle && value.currentCycle === command.expectedCycle &&
    value.expectedHostShipId === command.expectedHostShipId &&
    value.currentHostShipId === command.expectedHostShipId &&
    value.expectedDockingRevision === command.expectedDockingRevision &&
    value.currentDockingRevision === command.expectedDockingRevision &&
    value.resourceId === command.resourceId && value.direction === command.direction &&
    value.amount === command.amount && value.expectedRevision === command.expectedRevision &&
    Number.isSafeInteger(value.currentCargoRevision) &&
    (value.currentCargoRevision as number) > command.expectedRevision;
}

export async function transferBaseCapybaraCargo(
  command: BaseCapybaraCargoTransferCommand,
): Promise<BaseCapybaraCargoTransferServiceResult> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before transferring Capybara cargo.');
  requireFreshSessionAuthority();
  if (!/^[\w-]{1,128}$/.test(command.requestId) ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 ||
      command.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(command.expectedDockingRevision) || command.expectedDockingRevision < 1 ||
      !/^[\w-]{1,128}$/.test(command.expectedHostShipId) ||
      !BASE_CAPYBARA_CARGO_TYPES.includes(command.resourceId) ||
      (command.direction !== 'load' && command.direction !== 'unload') ||
      !Number.isSafeInteger(command.amount) || command.amount < 1) {
    throw new Error('The Cargo Transfer request is invalid. Refresh the console and try again.');
  }
  const payload = { sessionId: session.id, ...command };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'transferBaseCapybaraCargo',
  )(payload);
  const value = response.data;
  if (isStaleTransferReply(value, session.id, command)) return value;
  if (isRecord(value) && value.status === 'stale') {
    throw new Error('The Cargo Transfer stale response was malformed or mismatched.');
  }
  if (!isRecord(value) ||
      (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== session.id || value.requestId !== command.requestId ||
      value.hostShipId !== command.expectedHostShipId || value.resourceId !== command.resourceId ||
      value.direction !== command.direction || value.amount !== command.amount ||
      value.cycle !== command.expectedCycle || !Number.isSafeInteger(value.cargoRevision) ||
      value.cargoRevision !== command.expectedRevision + 1) {
    throw new Error('The Cargo Transfer response was malformed.');
  }
  return {
    status: value.status,
    hostShipId: value.hostShipId as string,
    resourceId: value.resourceId as BaseCapybaraCargoTransferResult['resourceId'],
    direction: value.direction as 'load' | 'unload',
    amount: value.amount as number,
    cycle: value.cycle as number,
    cargoRevision: value.cargoRevision as number,
  };
}
