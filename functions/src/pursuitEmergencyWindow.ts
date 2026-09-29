import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { commandError } from './commandErrors';

export interface PursuitEmergencyWindowMarker {
  readonly type: 'pursuit-emergency-window';
  readonly status: 'awaiting-gm-decision' | 'offered';
  readonly cycle: number;
  readonly openedAt: string;
}

export interface PursuitEmergencyWindowAuthority extends PursuitEmergencyWindowMarker {
  readonly navigationRevision: number;
  readonly groupIds: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function markerFieldsAreValid(value: Record<string, unknown>): boolean {
  return value.type === 'pursuit-emergency-window' &&
    (value.status === 'awaiting-gm-decision' || value.status === 'offered') &&
    Number.isSafeInteger(value.cycle) && (value.cycle as number) >= 1 &&
    typeof value.openedAt === 'string' && Number.isFinite(Date.parse(value.openedAt));
}

export function isPursuitEmergencyWindowMarker(value: unknown): value is PursuitEmergencyWindowMarker {
  return isRecord(value) && Object.keys(value).length === 4 &&
    Object.keys(value).every((key) => ['type', 'status', 'cycle', 'openedAt'].includes(key)) &&
    markerFieldsAreValid(value);
}

export function isPursuitEmergencyWindowAuthority(value: unknown): value is PursuitEmergencyWindowAuthority {
  return isRecord(value) && Object.keys(value).length === 6 &&
    Object.keys(value).every((key) => [
      'type', 'status', 'cycle', 'openedAt', 'navigationRevision', 'groupIds',
    ].includes(key)) && markerFieldsAreValid(value) &&
    Number.isSafeInteger(value.navigationRevision) && (value.navigationRevision as number) >= 0 &&
    Array.isArray(value.groupIds) && value.groupIds.length > 0 &&
    value.groupIds.every((id) => typeof id === 'string' && /^fleet-[1-9][0-9]*$/.test(id)) &&
    new Set(value.groupIds).size === value.groupIds.length;
}

export function pursuitEmergencyWindowMarker(
  session: Pick<DocumentSnapshot, 'get'>,
): PursuitEmergencyWindowMarker | undefined {
  const value = session.get('pursuitEmergencyWindow');
  if (value === undefined) return undefined;
  if (!isPursuitEmergencyWindowMarker(value)) {
    throw commandError(
      'failed-precondition',
      'The stored pursuit emergency decision is malformed.',
      'malformed-input',
    );
  }
  return value;
}

export function pursuitEmergencyWindowAuthority(
  navigation: Pick<DocumentSnapshot, 'get'>,
): PursuitEmergencyWindowAuthority | undefined {
  const value = navigation.get('pursuitEmergencyWindow');
  if (value === undefined) return undefined;
  if (!isPursuitEmergencyWindowAuthority(value)) {
    throw commandError(
      'failed-precondition',
      'The protected pursuit emergency decision is malformed.',
      'malformed-input',
    );
  }
  return value;
}

export function publicPursuitEmergencyWindow(
  authority: PursuitEmergencyWindowAuthority,
): PursuitEmergencyWindowMarker {
  return {
    type: authority.type,
    status: authority.status,
    cycle: authority.cycle,
    openedAt: authority.openedAt,
  };
}

export function requirePursuitEmergencyWindowAbsent(
  session: Pick<DocumentSnapshot, 'get'>,
): void {
  if (!pursuitEmergencyWindowMarker(session)) return;
  throw commandError(
    'failed-precondition',
    'Gameplay is paused while the facilitator decides whether to offer an emergency jump.',
    'invalid-phase',
  );
}
