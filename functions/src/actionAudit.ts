import type { LifecyclePhase } from './lifecycle';

export type ActionAuditResolutionSource = 'server-random' | 'facilitator';
export const ACTION_AUDIT_RESOLUTION_SOURCE_BY_ACTION = {
  'highwall-mining': 'server-random',
  'facilitator-rule-call': 'facilitator',
  'ship-store-scavenge': 'facilitator',
  'ship-resource-adjustment': 'facilitator',
  'ship-unrest-adjustment': 'facilitator',
  'ship-population-adjustment': 'facilitator',
  'ship-counter-batch': 'facilitator',
  'fighter-wing-count': 'facilitator',
  'repair-damage': 'facilitator',
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
