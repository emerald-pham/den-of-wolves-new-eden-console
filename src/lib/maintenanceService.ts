import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

export interface MaintenanceChoices {
  readonly foodLevel?: number;
  readonly waterLevel?: number;
  readonly consoles?: readonly string[];
  readonly refuels?: Readonly<Record<string, string>>;
}

interface PendingMaintenanceRequest {
  readonly sessionId: string;
  readonly instanceId: string | null;
  readonly shipId: string;
  readonly action: string;
  readonly expectedRevision: number;
  readonly choices: string;
  readonly consoleRoleId: string | null;
  readonly requestId: string;
}

interface PendingRollbackRequest {
  readonly sessionId: string;
  readonly instanceId: string;
  readonly shipId: string;
  readonly expectedRevision: number;
  readonly requestId: string;
}

let pendingMaintenanceRequest: PendingMaintenanceRequest | null = null;
let pendingRollbackRequest: PendingRollbackRequest | null = null;

function commandId(): string {
  return window.crypto.randomUUID();
}

function maintenanceChoicesFingerprint(choices: MaintenanceChoices): string {
  return JSON.stringify({
    foodLevel: choices.foodLevel ?? null,
    waterLevel: choices.waterLevel ?? null,
    consoles: [...(choices.consoles ?? [])],
    refuels: Object.entries(choices.refuels ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  });
}

function sameMaintenanceAttempt(
  pending: PendingMaintenanceRequest | null,
  expected: Omit<PendingMaintenanceRequest, 'requestId'>,
): pending is PendingMaintenanceRequest {
  return pending !== null &&
    pending.sessionId === expected.sessionId &&
    pending.instanceId === expected.instanceId &&
    pending.shipId === expected.shipId &&
    pending.action === expected.action &&
    pending.expectedRevision === expected.expectedRevision &&
    pending.choices === expected.choices &&
    pending.consoleRoleId === expected.consoleRoleId;
}

function sameRollbackAttempt(
  pending: PendingRollbackRequest | null,
  expected: Omit<PendingRollbackRequest, 'requestId'>,
): pending is PendingRollbackRequest {
  return pending !== null &&
    pending.sessionId === expected.sessionId &&
    pending.instanceId === expected.instanceId &&
    pending.shipId === expected.shipId &&
    pending.expectedRevision === expected.expectedRevision;
}

function maintenanceErrorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  return typeof cause.code === 'string' ? cause.code.replace(/^functions\//, '') : undefined;
}

const TRANSIENT_MAINTENANCE_ERRORS = new Set([
  'unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal', 'unknown',
]);

export async function runMaintenance(
  shipId: string,
  action: string,
  expectedRevision: number,
  choices: MaintenanceChoices = {},
  consoleRoleId?: string,
  requestId?: string,
): Promise<unknown> {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before running maintenance.');
  requireFreshSessionAuthority();
  const expectedAttempt = {
    sessionId: session.id,
    instanceId: gmInstance?.id ?? null,
    shipId, action, expectedRevision,
    choices: maintenanceChoicesFingerprint(choices),
    consoleRoleId: consoleRoleId ?? null,
  };
  const stableRequestId = requestId ?? (
    sameMaintenanceAttempt(pendingMaintenanceRequest, expectedAttempt)
      ? pendingMaintenanceRequest.requestId
      : commandId()
  );
  pendingMaintenanceRequest = { ...expectedAttempt, requestId: stableRequestId };
  const payload = {
    sessionId: session.id, shipId, action, expectedRevision, requestId: stableRequestId, ...choices,
    ...(consoleRoleId ? { consoleRoleId } : {}),
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  };
  try {
    const reply = await httpsCallable<typeof payload, unknown>(functions(), 'runMaintenance')(payload);
    if (pendingMaintenanceRequest?.requestId === stableRequestId) pendingMaintenanceRequest = null;
    return reply.data;
  } catch (cause) {
    if (!TRANSIENT_MAINTENANCE_ERRORS.has(maintenanceErrorCode(cause) ?? '')) {
      if (pendingMaintenanceRequest?.requestId === stableRequestId) pendingMaintenanceRequest = null;
    }
    throw cause;
  }
  // Only the live session snapshot advances the UI, including when another
  // console submits a step or the reply arrives before the snapshot.
}

export async function rollbackMaintenance(
  shipId: string,
  expectedRevision: number,
  requestId?: string,
): Promise<unknown> {
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || me?.role !== 'gm' || !gmInstance) {
    throw new Error('A connected GM instance is required to roll back maintenance.');
  }
  requireFreshSessionAuthority();
  const expectedAttempt = {
    sessionId: session.id,
    instanceId: gmInstance.id,
    shipId,
    expectedRevision,
  };
  const stableRequestId = requestId ?? (
    sameRollbackAttempt(pendingRollbackRequest, expectedAttempt)
      ? pendingRollbackRequest.requestId
      : commandId()
  );
  pendingRollbackRequest = { ...expectedAttempt, requestId: stableRequestId };
  const payload = {
    sessionId: session.id,
    shipId,
    expectedRevision,
    requestId: stableRequestId,
    instanceId: gmInstance.id,
  };
  try {
    const reply = await httpsCallable<typeof payload, unknown>(functions(), 'rollbackMaintenance')(payload);
    if (pendingRollbackRequest?.requestId === stableRequestId) pendingRollbackRequest = null;
    return reply.data;
  } catch (cause) {
    if (!TRANSIENT_MAINTENANCE_ERRORS.has(maintenanceErrorCode(cause) ?? '') &&
      pendingRollbackRequest?.requestId === stableRequestId) {
      pendingRollbackRequest = null;
    }
    throw cause;
  }
}
