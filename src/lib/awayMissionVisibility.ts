import type { PlayerRole } from '@/types/game';

export function shouldLoadAwayMissionDiscardPanel(
  sessionId: string | undefined,
  role: PlayerRole | undefined,
  participantPointerCount: number,
  gmPointerCount: number,
): boolean {
  if (!sessionId) return false;
  if (role === 'gm') return gmPointerCount > 0;
  return role === 'player' && participantPointerCount > 0;
}
