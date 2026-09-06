import type { GameSession } from '@/types/game';

export function isInGameRoute(path: string): boolean {
  if (path === '/press') return true;
  if (/^\/union\/roles\/[^/]+$/.test(path)) return true;
  return /^\/ships\/[^/]+\/roles\/[^/]+$/.test(path);
}

/** Players may browse setup screens during Turn 0, but cannot change gameplay. */
export function isGameplayLockedAtTurnZero(
  session: Pick<GameSession, 'currentTurn'> | null | undefined,
  isGm: boolean,
): boolean {
  return session?.currentTurn === 0 && !isGm;
}
