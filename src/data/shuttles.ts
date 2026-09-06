import type { ShuttleDocking, ShuttleVisit } from '@/types/game';
import snnPressShuttle from './vessels/snn-press-shuttle';
import type { Shuttlecraft } from './vessels/templates';
export type { Shuttlecraft } from './vessels/templates';

export const SHUTTLECRAFT: readonly Shuttlecraft[] = [snnPressShuttle];

export const INITIAL_SHUTTLE_DOCKINGS: readonly ShuttleDocking[] = SHUTTLECRAFT.flatMap(
  (shuttle) => shuttle.initialDocking ? [{ ...shuttle.initialDocking, shuttleId: shuttle.id }] : [],
);

export const INITIAL_SHUTTLE_VISITS: readonly ShuttleVisit[] = SHUTTLECRAFT.flatMap(
  (shuttle) => shuttle.initialVisit ? [{ ...shuttle.initialVisit, shuttleId: shuttle.id }] : [],
);

interface ShuttleSessionState {
  readonly shuttleDockings?: readonly ShuttleDocking[];
  readonly shuttleVisitLog?: readonly ShuttleVisit[];
}

export function shuttlebayForShip(session: ShuttleSessionState, shipId: string) {
  const dockings = session.shuttleDockings ?? INITIAL_SHUTTLE_DOCKINGS;
  const visits = session.shuttleVisitLog ?? INITIAL_SHUTTLE_VISITS;
  return {
    dockedShuttles: dockings.filter((item) => item.shipId === shipId).flatMap((docking) => {
      const shuttle = SHUTTLECRAFT.find((item) => item.id === docking.shuttleId);
      return shuttle ? [{ ...shuttle, dockedAt: docking.dockedAt }] : [];
    }),
    visits: visits.filter((item) => item.shipId === shipId).flatMap((visit) => {
      const shuttle = SHUTTLECRAFT.find((item) => item.id === visit.shuttleId);
      return shuttle ? [{ ...visit, shuttle }] : [];
    }),
  };
}

export function dockingForShuttle(session: ShuttleSessionState, shuttleId: string): ShuttleDocking | undefined {
  return (session.shuttleDockings ?? INITIAL_SHUTTLE_DOCKINGS)
    .find((docking) => docking.shuttleId === shuttleId);
}
