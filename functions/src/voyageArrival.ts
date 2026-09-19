import { VOYAGE_33_ID, type Voyage33Admission } from './voyageAdmission';
import { isCanonicalRequestId } from './requestGuards';

/** Roles that receive the source-defined Voyage 33-0 motivation privately. */
export const VOYAGE_33_MOTIVATED_ROLE_IDS = [
  'refinery-124-captain',
  'refinery-124-engineer',
  'refinery-124-pdf-colonel',
  'doctor',
] as const;

export type Voyage33MotivatedRoleId = typeof VOYAGE_33_MOTIVATED_ROLE_IDS[number];

/**
 * This is a private brief addition. It states the source-defined priority
 * without granting a role, choosing a host, or authorizing a resource write.
 */
export const VOYAGE_33_MOTIVATION =
  'Support Voyage 33-0\'s survivors as the vessel reaches a host that can provide its printed maintenance support.';

export function voyage33MotivationForRole(
  roleId: string,
  admitted: boolean,
): string | undefined {
  return admitted && (VOYAGE_33_MOTIVATED_ROLE_IDS as readonly string[]).includes(roleId)
    ? VOYAGE_33_MOTIVATION
    : undefined;
}

export interface Voyage33ArrivalActivation {
  readonly type: 'voyage-arrival-activation';
  readonly sessionId: string;
  readonly vesselId: typeof VOYAGE_33_ID;
  readonly crisisId: string;
  readonly crisisRevision: number;
  readonly admissionRequestId: string;
  readonly motivatedRoleIds: readonly Voyage33MotivatedRoleId[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
}

/** Parse the GM-only activation marker and fail closed on malformed state. */
export function parseVoyage33ArrivalActivation(
  value: unknown,
  sessionId: string,
): Voyage33ArrivalActivation | undefined {
  const raw = record(value);
  const roleIds = Array.isArray(raw?.motivatedRoleIds)
    ? raw.motivatedRoleIds.filter((roleId): roleId is Voyage33MotivatedRoleId =>
      (VOYAGE_33_MOTIVATED_ROLE_IDS as readonly string[]).includes(String(roleId)))
    : undefined;
  if (!raw || raw.type !== 'voyage-arrival-activation' || raw.sessionId !== sessionId ||
      raw.vesselId !== VOYAGE_33_ID || !safeId(raw.crisisId) ||
      !safeNonNegativeInteger(raw.crisisRevision) || !isCanonicalRequestId(raw.admissionRequestId) ||
      !Array.isArray(raw.motivatedRoleIds) || roleIds === undefined ||
      roleIds.length !== raw.motivatedRoleIds.length ||
      new Set(roleIds).size !== roleIds.length) return undefined;
  return {
    type: 'voyage-arrival-activation',
    sessionId,
    vesselId: VOYAGE_33_ID,
    crisisId: raw.crisisId,
    crisisRevision: raw.crisisRevision,
    admissionRequestId: raw.admissionRequestId,
    motivatedRoleIds: roleIds,
  };
}

export function arrivalActivationForAdmission(
  admission: Voyage33Admission,
  admissionRequestId: string,
  motivatedRoleIds: readonly string[],
): Voyage33ArrivalActivation {
  const roleIds = motivatedRoleIds.filter((roleId): roleId is Voyage33MotivatedRoleId =>
    (VOYAGE_33_MOTIVATED_ROLE_IDS as readonly string[]).includes(roleId));
  return {
    type: 'voyage-arrival-activation',
    sessionId: admission.sessionId,
    vesselId: VOYAGE_33_ID,
    crisisId: admission.crisisId,
    crisisRevision: admission.crisisRevision,
    admissionRequestId,
    motivatedRoleIds: [...new Set(roleIds)],
  };
}
