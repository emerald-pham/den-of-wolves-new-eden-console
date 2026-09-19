/**
 * Server-owned escape state for players whose authoritative ship was
 * destroyed.  This is deliberately a small transition record: it identifies
 * the destruction that removed the player's ship authority, while leaving the
 * printed role, loyalty secret, resources, and craft ledgers untouched.
 */

export type EscapeStatus = 'pending' | 'fled';

export interface PlayerEscapeState {
  readonly status: EscapeStatus;
  readonly shipId: string;
  readonly destructionEventId: string;
  readonly revision: number;
  readonly fleeRequestId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePlayerEscapeState(value: unknown): PlayerEscapeState | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || (value.status !== 'pending' && value.status !== 'fled') ||
      typeof value.shipId !== 'string' || value.shipId.length === 0 ||
      typeof value.destructionEventId !== 'string' || value.destructionEventId.length === 0 ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      (value.fleeRequestId !== undefined &&
        (typeof value.fleeRequestId !== 'string' || value.fleeRequestId.length === 0))) {
    return undefined;
  }
  return {
    status: value.status,
    shipId: value.shipId,
    destructionEventId: value.destructionEventId,
    revision: value.revision as number,
    ...(typeof value.fleeRequestId === 'string' ? { fleeRequestId: value.fleeRequestId } : {}),
  };
}

export function escapeStateForDestruction(
  shipId: string,
  destructionEventId: string,
  revision: number,
): PlayerEscapeState {
  return { status: 'pending', shipId, destructionEventId, revision };
}

export function fleePlayerEscapeState(
  state: PlayerEscapeState,
  fleeRequestId: string,
): PlayerEscapeState {
  return { ...state, status: 'fled', fleeRequestId };
}
