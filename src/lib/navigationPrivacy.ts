import type { GameSession } from '@/types/game';

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

/** Discard the organiser chart while preserving entitled member projections. */
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
  delete next.candidatePlanCheckpoint;
  const own = next.playerDiscovery;
  if (own?.shipId) {
    if (own.currentCoordinate) next.shipGalacticCoordinates = { [own.shipId]: own.currentCoordinate };
    next.shipNavigationLogs = { [own.shipId]: own.navigationLogs };
  }
  return next;
}

/** A private player chart is safe in memory but cannot be bound to the next Firebase UID after reload. */
export function stripPersistedNavigationProjection(session: GameSession): GameSession {
  const next = stripGmNavigationProjection(session) as Mutable<GameSession>;
  delete next.playerDiscovery;
  delete next.currentGroupCandidateReveals;
  delete next.shipGalacticCoordinates;
  delete next.shipNavigationLogs;
  return next;
}
