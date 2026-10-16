import { isWireSafeEntityId } from './identifiers';
/** Only this bounded record enters the facilitator's existing private audit log. */
export const PLAYER_REMOVAL_CAUSES = [
  'ship-destroyed', 'fighter-ace-death', 'boarding-death', 'gm-removal',
  'mutiny-replacement', 'execution', 'candidate-loss',
] as const;
export type PlayerRemovalCause = typeof PLAYER_REMOVAL_CAUSES[number];
export interface PlayerRemovalEvent {
  readonly type: 'player-removal';
  readonly sessionId: string;
  readonly sourceId: string;
  readonly playerUid: string;
  readonly playerName: string;
  readonly roleId: string | null;
  readonly roleName: string;
  readonly cause: PlayerRemovalCause;
  readonly shipId: string | null;
  readonly cycle: number;
  readonly createdAt: string;
}

/** No unrecognized field, private calculation or arbitrary cause text survives. */
export function parsePlayerRemovalEvent(value: unknown, sessionId: string): PlayerRemovalEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const keys = ['type','sessionId','sourceId','playerUid','playerName','roleId','roleName','cause','shipId','cycle','createdAt'];
  const id = (v: unknown) => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
  const name = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 160;
  if (Object.keys(data).length !== keys.length || Object.keys(data).some(key => !keys.includes(key)) ||
      data.type !== 'player-removal' || data.sessionId !== sessionId || !id(data.sessionId) ||
      typeof data.sourceId !== 'string' || data.sourceId.length < 1 || data.sourceId.length > 2048 || !isWireSafeEntityId(data.playerUid) ||
      !name(data.playerName) || !name(data.roleName) || data.roleId !== null && !id(data.roleId) ||
      data.shipId !== null && !id(data.shipId) || !PLAYER_REMOVAL_CAUSES.includes(data.cause as PlayerRemovalCause) ||
      !Number.isSafeInteger(data.cycle) || Number(data.cycle) < 0 ||
      typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))) return null;
  return data as unknown as PlayerRemovalEvent;
}
