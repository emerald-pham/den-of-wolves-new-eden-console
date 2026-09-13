import type { CommissarPurgeAuthority, GameSession, Player } from '@/types/game';

export function commissarPurgeAuthorityIsCurrent(
  authority: CommissarPurgeAuthority,
  session: GameSession | null,
  player: Player | null,
): boolean {
  if (!session || !player || authority.sessionId !== session.id || player.role !== 'player') return false;
  if (authority.role === 'commissar') {
    return player.replacementRoleId === 'commissar' && player.activeConsoleRoleId === null;
  }
  if (player.activeConsoleRoleId !== authority.captainRoleId ||
      (player.replacementRoleId !== null && player.replacementRoleId !== authority.captainRoleId) ||
      !authority.shipId || !session.activeVesselIds?.includes(authority.shipId)) return false;
  const expectedCaptainRole = authority.shipId === 'aegis'
    ? 'admiral' : `${authority.shipId}-captain`;
  return authority.captainRoleId === expectedCaptainRole;
}
