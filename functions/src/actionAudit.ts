import type { LifecyclePhase } from './lifecycle';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

export type ActionAuditResolutionSource = 'server-random' | 'server-calculated' | 'facilitator';
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
  'fighter-build': 'server-calculated',
  'shuttle-cargo': 'server-calculated',
  'shuttle-recharge': 'server-calculated',
  'blacksmith-repair': 'server-calculated',
  'philia-repair': 'server-calculated',
  'macaw-repair': 'server-calculated',
  'macaw-consented-dismantling': 'server-calculated',
  'boa-mission-reclamation-choice': 'server-calculated',
  'chacau-repair': 'server-calculated',
  'ally-repair': 'server-calculated',
  'boa-recycling': 'server-calculated',
  'gorgoneion-drone-repair': 'server-calculated',
  'warrior-drone-repair': 'server-calculated',
  'base-capybara-cargo': 'server-calculated',
  'warrior-cargo': 'server-calculated',
  'candidate-action': 'server-calculated',
  'candidate-nebula-jump': 'server-random',
  'candidate-edition-selection': 'facilitator',
  'game-ending': 'server-calculated',
  'debrief-freeze': 'server-calculated',
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

export type ProcedureAuditValue = string | number | boolean | null |
  readonly ProcedureAuditValue[] | { readonly [key: string]: ProcedureAuditValue };
export type ProcedureAuditDetails = Readonly<{
  sourceId: string;
  requiredChoices: readonly Readonly<{ actor: 'player' | 'facilitator'; kind: string; value: ProcedureAuditValue }>[];
  calculation: Readonly<Record<string, ProcedureAuditValue>>;
  consequences: Readonly<Record<string, ProcedureAuditValue>>;
  audience: Readonly<{ operational: 'actor' | 'group' | 'members'; groupId?: string }>;
}>;

function boundedAuditValue(value: unknown, depth = 0): ProcedureAuditValue {
  if (depth > 5) throw new Error('Procedure audit value is too deep.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.length <= 2000) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.length <= 100) return value.map(entry => boundedAuditValue(entry, depth + 1));
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const entries = Object.entries(value);
    if (entries.length <= 100 && entries.every(([key]) => /^[\w-]{1,128}$/.test(key))) {
      return Object.fromEntries(entries.map(([key, entry]) => [key, boundedAuditValue(entry, depth + 1)]));
    }
  }
  throw new Error('Procedure audit value must be bounded JSON data.');
}

/** Full server calculation stays GM-private, separately from queryable action metadata. */
export function buildProcedureAuditRecord(input: BuildActionAuditRecordInput, value: unknown) {
  const metadata = buildActionAuditRecord(input);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid procedure audit.');
  const details = value as Record<string, unknown>;
  const keys = ['sourceId', 'requiredChoices', 'calculation', 'consequences', 'audience'];
  if (Object.keys(details).length !== keys.length || Object.keys(details).some(key => !keys.includes(key)) ||
      typeof details.sourceId !== 'string' || !/^[\w-]{1,128}$/.test(details.sourceId) ||
      !Array.isArray(details.requiredChoices) || details.requiredChoices.length > 30) throw new Error('Invalid procedure audit.');
  const choices = details.requiredChoices.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid required choice.');
    const choice = value as Record<string, unknown>;
    if (Object.keys(choice).length !== 3 || !['player', 'facilitator'].includes(String(choice.actor)) ||
        typeof choice.kind !== 'string' || !/^[\w-]{1,80}$/.test(choice.kind) || !Object.hasOwn(choice, 'value')) {
      throw new Error('Invalid required choice.');
    }
    return { actor: choice.actor as 'player' | 'facilitator', kind: choice.kind, value: boundedAuditValue(choice.value) };
  });
  const audience = details.audience as Record<string, unknown> | undefined;
  if (!audience || typeof audience !== 'object' || Array.isArray(audience) ||
      Object.keys(audience).some(key => !['operational', 'groupId'].includes(key)) ||
      !['actor', 'group', 'members'].includes(String(audience.operational)) ||
      (audience.operational === 'group' && (typeof audience.groupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(audience.groupId))) ||
      (audience.operational !== 'group' && audience.groupId !== undefined)) throw new Error('Invalid procedure audience.');
  for (const key of ['calculation', 'consequences']) {
    if (!details[key] || typeof details[key] !== 'object' || Array.isArray(details[key])) throw new Error('Invalid procedure calculation.');
  }
  const record = {
    ...metadata, type: 'procedure-audit' as const, sourceId: details.sourceId, requiredChoices: choices,
    calculation: boundedAuditValue(details.calculation), consequences: boundedAuditValue(details.consequences),
    audience: boundedAuditValue(audience), redactionPolicy: 'procedure-audit-gm-private-v1' as const,
  };
  if (JSON.stringify({ ...record, createdAt: null }).length > 32_000) throw new Error('Procedure audit exceeds its bound.');
  return record;
}

/** Caller must handle its bound receipt/CAS first. Create preconditions make races atomic. */
export function writeStandardActionAudit(
  tx: Pick<Transaction, 'create'>, db: Pick<Firestore, 'doc'>,
  input: BuildActionAuditRecordInput, procedure?: unknown,
): void {
  const metadata = buildActionAuditRecord(input);
  if (!/^[\w-]{1,128}$/.test(metadata.sessionId)) throw new Error('Invalid audit session ID.');
  // Validate all details before queuing either write in the transaction.
  const details = procedure === undefined ? undefined : buildProcedureAuditRecord(input, procedure);
  tx.create(db.doc(`sessions/${metadata.sessionId}/actionAudits/${metadata.requestId}`), metadata);
  if (details) tx.create(db.doc(`sessions/${metadata.sessionId}/procedureAudits/${metadata.requestId}`), details);
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
