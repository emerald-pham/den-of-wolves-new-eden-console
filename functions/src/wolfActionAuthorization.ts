import { ROLE_IDS } from './roleConfiguration';

export const WOLF_ACTION_KINDS = [
  'sabotage-console',
  'sabotage-supplies',
  'homing-beacon',
  'provide-intel',
] as const;

export type WolfActionKind = typeof WOLF_ACTION_KINDS[number];

export interface WolfActionAuthorizationInput {
  readonly actorUid: string;
  readonly active: boolean;
  readonly connectedRole: unknown;
  readonly assignedRoleId: unknown;
  readonly activeConsoleRoleId: unknown;
  readonly replacementRoleId: unknown;
  readonly escapeState: unknown;
  readonly loyaltyAudience: unknown;
  readonly loyaltyPayload: unknown;
  readonly wolfAssignmentPayload: unknown;
}

export type WolfActionAuthorizationDecision =
  | { readonly allowed: true; readonly coverRoleId: string }
  | { readonly allowed: false; readonly reason: 'inactive' | 'not-player' | 'replaced' | 'displaced' | 'not-wolf' | 'cover-mismatch' };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bind a private Wolf card to the live player and the cover role selected by
 * the authoritative setup receipt. Effects remain owned by their action
 * prompts; this decision only controls whether the actor may spend the cycle's
 * single Wolf-action slot.
 */
export function wolfActionAuthorization(
  input: WolfActionAuthorizationInput,
): WolfActionAuthorizationDecision {
  if (!input.active) return { allowed: false, reason: 'inactive' };
  if (input.connectedRole !== 'player') return { allowed: false, reason: 'not-player' };
  if (input.replacementRoleId !== undefined && input.replacementRoleId !== null) {
    return { allowed: false, reason: 'replaced' };
  }
  if (input.escapeState !== undefined && input.escapeState !== null) {
    return { allowed: false, reason: 'displaced' };
  }
  const coverRoleId = input.assignedRoleId === null || input.assignedRoleId === undefined
    ? input.activeConsoleRoleId === 'press-officer' ? 'press-officer' : undefined
    : typeof input.assignedRoleId === 'string' && input.assignedRoleId !== 'press-officer' &&
      (ROLE_IDS as readonly string[]).includes(input.assignedRoleId)
      ? input.assignedRoleId
      : undefined;
  const coreConsoleMismatch = coverRoleId !== undefined && coverRoleId !== 'press-officer' &&
    input.activeConsoleRoleId !== undefined && input.activeConsoleRoleId !== null &&
    input.activeConsoleRoleId !== coverRoleId;
  if (!coverRoleId || coreConsoleMismatch) {
    return { allowed: false, reason: 'cover-mismatch' };
  }
  if (!Array.isArray(input.loyaltyAudience) || input.loyaltyAudience.length !== 1 ||
      input.loyaltyAudience[0] !== input.actorUid || !isRecord(input.loyaltyPayload) ||
      input.loyaltyPayload.type !== 'loyalty' ||
      (input.loyaltyPayload.kind !== 'wolf-agent' && input.loyaltyPayload.kind !== 'wolf-cult') ||
      !Number.isSafeInteger(input.loyaltyPayload.suspicion) ||
      (input.loyaltyPayload.suspicion as number) < 0) {
    return { allowed: false, reason: 'not-wolf' };
  }
  if (!isRecord(input.wolfAssignmentPayload) || input.wolfAssignmentPayload.type !== 'wolf-assignment' ||
      !Array.isArray(input.wolfAssignmentPayload.roleIds) ||
      input.wolfAssignmentPayload.roleIds.length < 1 || input.wolfAssignmentPayload.roleIds.length > 2 ||
      input.wolfAssignmentPayload.roleIds.some((roleId) =>
        typeof roleId !== 'string' || !(ROLE_IDS as readonly string[]).includes(roleId)) ||
      new Set(input.wolfAssignmentPayload.roleIds).size !== input.wolfAssignmentPayload.roleIds.length ||
      !input.wolfAssignmentPayload.roleIds.includes(coverRoleId)) {
    return { allowed: false, reason: 'cover-mismatch' };
  }
  return { allowed: true, coverRoleId };
}

export function isWolfActionKind(value: unknown): value is WolfActionKind {
  return typeof value === 'string' && (WOLF_ACTION_KINDS as readonly string[]).includes(value);
}
