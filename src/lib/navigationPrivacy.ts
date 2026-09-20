import type { GameSession } from '@/types/game';

/** Discard the organiser chart while preserving only an entitled ship projection. */
export function stripGmNavigationProjection(session: GameSession): GameSession {
  const next = { ...session };
  delete next.shipGalacticCoordinates;
  delete next.shipNavigationLogs;
  delete next.organiserSites;
  delete next.organiserSystems;
  delete next.organiserSystemHistory;
  delete next.pursuitDistances;
  delete next.pursuitGroups;
  delete next.shipFleetGroupIds;
  const own = next.playerDiscovery;
  if (own?.shipId) {
    if (own.currentCoordinate) next.shipGalacticCoordinates = { [own.shipId]: own.currentCoordinate };
    next.shipNavigationLogs = { [own.shipId]: own.navigationLogs };
  }
  return next;
}
