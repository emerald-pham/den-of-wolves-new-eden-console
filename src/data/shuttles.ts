import type { ShuttleDocking, ShuttleVisit } from '@/types/game';

export interface Shuttlecraft {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
}

export const SHUTTLECRAFT: readonly Shuttlecraft[] = [
  { id: 'snn-press-shuttle', name: 'SNN Independent Press Shuttle', shortName: 'SNN Press Shuttle' },
];

export const INITIAL_SHUTTLE_DOCKINGS: readonly ShuttleDocking[] = [
  { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
];

export const INITIAL_SHUTTLE_VISITS: readonly ShuttleVisit[] = [
  {
    id: 'snn-initial-aegis-docking', shuttleId: 'snn-press-shuttle', shipId: 'aegis',
    action: 'docked', occurredAt: 'SESSION START',
  },
];

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
