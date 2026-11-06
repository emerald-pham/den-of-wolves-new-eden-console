import { SHUTTLECRAFT } from '@/data/shuttles';
import type { GameSession } from '@/types/game';

/** The craft that collect attack Scrap pickups. */
export type ScrapCollectionCraftId = 'macaw' | 'boa';

export type ScrapCustodyContext = Readonly<{
  shuttleDockings?: GameSession['shuttleDockings'];
  shuttleControl?: GameSession['shuttleControl'];
  retainedShuttles?: GameSession['retainedShuttles'];
}>;

/** The role that owns a collecting craft, from its vessel config. */
export function scrapCollectionRoleId(shuttleId: ScrapCollectionCraftId): string | undefined {
  return SHUTTLECRAFT.find((shuttle) => shuttle.id === shuttleId)?.captainRoleId;
}

/**
 * Whether this craft is retained from the destroyed ship: undocked, owned by
 * its printed role, and held under the same control revision the retention
 * recorded. Only that shuttle may collect the destroyed ship's Scrap (PC10 C3).
 * This is a presentation check; the server rechecks custody on commit.
 */
export function retainedFromDestroyedShip(
  context: ScrapCustodyContext | undefined,
  shuttleId: ScrapCollectionCraftId,
  shipId: string,
): boolean {
  const roleId = scrapCollectionRoleId(shuttleId);
  if (!roleId || !Array.isArray(context?.shuttleDockings)) return false;
  const retained = context.retainedShuttles?.[shuttleId];
  const control = context.shuttleControl?.[shuttleId];
  return !context.shuttleDockings.some((docking) => docking.shuttleId === shuttleId) &&
    retained?.status === 'retained' && retained.shuttleId === shuttleId && retained.ownerRoleId === roleId &&
    control?.shuttleId === shuttleId && control.ownerRoleId === roleId &&
    retained.holderUid === control.holderUid && retained.destroyedHostShipId === shipId &&
    retained.controlRevision === control.revision;
}
