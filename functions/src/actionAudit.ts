import type { LifecyclePhase } from './lifecycle';

/**
 * How a committed outcome was decided: a server random draw, a facilitator
 * ruling, or the server applying printed rules to the actor's explicit choice
 * (no draw and no ruling).
 */
export type ActionAuditResolutionSource = 'server-random' | 'facilitator' | 'server-rules';
export const ACTION_AUDIT_RESOLUTION_SOURCE_BY_ACTION = {
  'highwall-mining': 'server-random',
  'ship-damage': 'server-random',
  'facilitator-rule-call': 'facilitator',
  'ship-store-scavenge': 'facilitator',
  'ship-resource-adjustment': 'facilitator',
  'ship-unrest-adjustment': 'facilitator',
  'ship-population-adjustment': 'facilitator',
  'ship-counter-batch': 'facilitator',
  'fighter-wing-count': 'facilitator',
  'repair-damage': 'facilitator',
  'fighter-construction': 'server-rules',
  'shuttle-cargo-transfer': 'server-rules',
  'service-shuttle-recharge': 'server-rules',
  'blacksmith-repair': 'server-rules',
  'philia-repair': 'server-rules',
  'macaw-repair': 'server-rules',
  'chacau-repair': 'server-rules',
  'ally-repair': 'server-rules',
} as const satisfies Readonly<Record<string, ActionAuditResolutionSource>>;

export type ActionAuditAction = keyof typeof ACTION_AUDIT_RESOLUTION_SOURCE_BY_ACTION;

export type ActionAuditRecord = Readonly<{
  schemaVersion: 1;
  sessionId: string;
  actorUid: string;
  actorRoleId: string | null;
  action: ActionAuditAction;
  phase: LifecyclePhase;
  requestId: string;
  revision: number;
  outcome: 'committed';
  resolutionSource: ActionAuditResolutionSource;
  redactionPolicy: 'action-audit-metadata-only-v1';
  createdAt: unknown;
}>;

export type BuildActionAuditRecordInput = Readonly<{
  sessionId: unknown;
  actorUid: unknown;
  actorRoleId: unknown;
  action: unknown;
  phase: unknown;
  requestId: unknown;
  revision: unknown;
  outcome: unknown;
  resolutionSource: unknown;
  createdAt: unknown;
}>;

const LIFECYCLE_PHASES: readonly LifecyclePhase[] = [
  'lobby', 'casting', 'briefing', 'active', 'success', 'failure', 'debrief', 'closed',
  'retained-empty',
];

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function isActionAuditAction(value: string): value is ActionAuditAction {
  return Object.prototype.hasOwnProperty.call(ACTION_AUDIT_RESOLUTION_SOURCE_BY_ACTION, value);
}

/** Build the bounded metadata-only record shared by migrated action producers. */
export function buildActionAuditRecord(input: BuildActionAuditRecordInput): ActionAuditRecord {
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const actorUid = requiredText(input.actorUid, 'actorUid');
  const action = requiredText(input.action, 'action');
  if (!isActionAuditAction(action)) throw new Error('action is not registered for standardized audit');
  if (input.actorRoleId !== null &&
      (typeof input.actorRoleId !== 'string' || input.actorRoleId.trim().length === 0)) {
    throw new Error('actorRoleId must be null or a non-empty string');
  }
  if (typeof input.phase !== 'string' || !LIFECYCLE_PHASES.includes(input.phase as LifecyclePhase)) {
    throw new Error('phase must be a known lifecycle phase');
  }
  const requestId = requiredText(input.requestId, 'requestId');
  if (!/^[\w-]{1,128}$/.test(requestId)) throw new Error('requestId must be a bounded request identifier');
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0) {
    throw new Error('revision must be a non-negative safe integer');
  }
  if (input.outcome !== 'committed') throw new Error('outcome must be committed');
  const resolutionSource = ACTION_AUDIT_RESOLUTION_SOURCE_BY_ACTION[action];
  if (input.resolutionSource !== resolutionSource) {
    throw new Error(`resolutionSource for ${action} must be ${resolutionSource}`);
  }
  if (input.createdAt === undefined || input.createdAt === null) {
    throw new Error('createdAt must be server supplied');
  }

  return {
    schemaVersion: 1,
    sessionId,
    actorUid,
    actorRoleId: input.actorRoleId as string | null,
    action,
    phase: input.phase as LifecyclePhase,
    requestId,
    revision: input.revision as number,
    outcome: 'committed',
    resolutionSource,
    redactionPolicy: 'action-audit-metadata-only-v1',
    createdAt: input.createdAt,
  };
}

/** The request-bound facts a private command receipt can prove about its audit. */
export type ReceiptBoundActionAudit = Readonly<{
  sessionId: string;
  actorUid: string;
  action: ActionAuditAction;
  requestId: string;
  revision: number;
}>;

/**
 * Normalize a server-owned role field into audit attribution. Missing or
 * malformed role data is recorded as null rather than guessed.
 */
export function actionAuditRoleId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * The role a player acts as for audit attribution: a replacement role first,
 * then the original assignment, then the active console role.
 */
export function actionAuditActorRoleId(player: { get(field: string): unknown }): string | null {
  for (const field of ['replacementRoleId', 'assignedRoleId', 'activeConsoleRoleId']) {
    const roleId = actionAuditRoleId(player.get(field));
    if (roleId !== null) return roleId;
  }
  return null;
}

/** Build the committed metadata for a receipt-bound action at its original phase. */
export function buildReceiptBoundActionAuditRecord(
  binding: ReceiptBoundActionAudit,
  actorRoleId: unknown,
  phase: LifecyclePhase,
  createdAt: unknown,
): ActionAuditRecord {
  return buildActionAuditRecord({
    ...binding,
    actorRoleId: actionAuditRoleId(actorRoleId),
    phase,
    outcome: 'committed',
    resolutionSource: ACTION_AUDIT_RESOLUTION_SOURCE_BY_ACTION[binding.action],
    createdAt,
  });
}

/**
 * The one comparator for a stored metadata audit: the same fields with the same
 * values, except that `createdAt` is any server-supplied (non-null) time.
 */
export function actionAuditRecordMatches(stored: unknown, expected: ActionAuditRecord): boolean {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return false;
  const record = stored as Record<string, unknown>;
  const keys = Object.keys(expected).sort();
  const storedKeys = Object.keys(record).sort();
  return storedKeys.length === keys.length &&
    storedKeys.every((key, index) => key === keys[index]) &&
    keys.every((key) => key === 'createdAt'
      ? record.createdAt !== undefined && record.createdAt !== null
      : record[key] === (expected as Record<string, unknown>)[key]);
}

/**
 * True only when a stored record is exactly the committed metadata its receipt
 * binds. Phase and role come from the stored original, never from replay time.
 */
export function actionAuditMatchesReceipt(stored: unknown, binding: ReceiptBoundActionAudit): boolean {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return false;
  const record = stored as Record<string, unknown>;
  let expected: ActionAuditRecord;
  try {
    expected = buildActionAuditRecord({
      ...binding,
      actorRoleId: record.actorRoleId,
      phase: record.phase,
      outcome: 'committed',
      resolutionSource: ACTION_AUDIT_RESOLUTION_SOURCE_BY_ACTION[binding.action],
      createdAt: record.createdAt,
    });
  } catch {
    return false;
  }
  return actionAuditRecordMatches(record, expected);
}

/** A JSON value a durable Firestore receipt stores without loss. */
export type ActionAuditDetailValue =
  | null | boolean | number | string
  | readonly ActionAuditDetailValue[]
  | { readonly [key: string]: ActionAuditDetailValue };

/**
 * The facilitator-only companion to an action audit. The metadata record stays
 * payload-free; this record keeps the actor's explicit choice and the
 * committed, source-defined result (calculation and consequences) so the GM
 * can query them. Players keep only their own callable reply and the
 * allow-listed member event.
 */
export type ActionAuditDetailRecord = Readonly<{
  schemaVersion: 1;
  sessionId: string;
  actorUid: string;
  action: ActionAuditAction;
  requestId: string;
  revision: number;
  resolutionSource: ActionAuditResolutionSource;
  audience: 'facilitator';
  choice: Readonly<Record<string, ActionAuditDetailValue>>;
  result: Readonly<Record<string, ActionAuditDetailValue>>;
  redactionPolicy: 'action-audit-gm-detail-v1';
  createdAt: unknown;
}>;

export type ActionAuditDetail = Readonly<{ choice: unknown; result: unknown }>;

function isDetailValue(value: unknown, depth = 0): value is ActionAuditDetailValue {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isDetailValue(entry, depth + 1));
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every((entry) => isDetailValue(entry, depth + 1));
}

function detailRecord(value: unknown, field: string): Readonly<Record<string, ActionAuditDetailValue>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !isDetailValue(value)) {
    throw new Error(`${field} must be a plain JSON record`);
  }
  return value as Readonly<Record<string, ActionAuditDetailValue>>;
}

/** Build the facilitator-only choice and result receipt for a committed action. */
export function buildActionAuditDetailRecord(
  binding: ReceiptBoundActionAudit,
  detail: ActionAuditDetail,
  createdAt: unknown,
): ActionAuditDetailRecord {
  // The metadata builder owns the shared identity validation.
  const metadata = buildActionAuditRecord({
    ...binding,
    actorRoleId: null,
    phase: 'active',
    outcome: 'committed',
    resolutionSource: ACTION_AUDIT_RESOLUTION_SOURCE_BY_ACTION[binding.action as ActionAuditAction],
    createdAt,
  });
  return {
    schemaVersion: 1,
    sessionId: metadata.sessionId,
    actorUid: metadata.actorUid,
    action: metadata.action,
    requestId: metadata.requestId,
    revision: metadata.revision,
    resolutionSource: metadata.resolutionSource,
    audience: 'facilitator',
    choice: detailRecord(detail.choice, 'choice'),
    result: detailRecord(detail.result, 'result'),
    redactionPolicy: 'action-audit-gm-detail-v1',
    createdAt,
  };
}
