import { SHIPS } from './ships';
import { DEFAULT_ACTIVE_ROLE_IDS } from './roles';
import { isJointEngineeringRoleAvailable, isJointEngineeringRoleId } from './rolePresets';
import type { ShuttleDocking, ShuttleVisit } from '@/types/game';
import snnPressShuttle from './vessels/snn-press-shuttle';
import starlight from './vessels/starlight';
import pallas from './vessels/pallas';
import philia from './vessels/philia';
import maliades from './vessels/maliades';
import highwall from './vessels/highwall';
import blacksmith from './vessels/blacksmith';
import macaw from './vessels/macaw';
import boa from './vessels/boa';
import endeavour from './vessels/endeavour';
import blackSheep from './vessels/black-sheep';
import hummingbird from './vessels/hummingbird';
import condor from './vessels/condor';
import chacau from './vessels/chacau';
import chepu from './vessels/chepu';
import wobbly from './vessels/wobbly';
import ally from './vessels/ally';
import type { Shuttlecraft } from './vessels/templates';
export type { Shuttlecraft } from './vessels/templates';

export const SHUTTLECRAFT: readonly Shuttlecraft[] = [
  snnPressShuttle,
  starlight,
  pallas,
  philia,
  maliades,
  highwall,
  blacksmith,
  macaw,
  boa,
  endeavour,
  blackSheep,
  hummingbird,
  condor,
  chacau,
  chepu,
  wobbly,
  ally,
];

/** The standard 20/21-player fleet; optional Union craft stay GM-controlled. */
export const DEFAULT_ENABLED_SHUTTLECRAFT = SHUTTLECRAFT.filter((shuttle) =>
  shuttle.availability === 'standard' && DEFAULT_ACTIVE_ROLE_IDS.includes(shuttle.captainRoleId),
);

/** Active roles are server-authoritative and may only be changed from GM setup. */
export function isShuttleEnabled(
  shuttle: Shuttlecraft,
  activeRoleIds: readonly string[],
): boolean {
  if (isJointEngineeringRoleId(shuttle.captainRoleId)) {
    return isJointEngineeringRoleAvailable(activeRoleIds, shuttle.captainRoleId);
  }
  return activeRoleIds.includes(shuttle.captainRoleId);
}

export const INITIAL_SHUTTLE_DOCKINGS: readonly ShuttleDocking[] = DEFAULT_ENABLED_SHUTTLECRAFT.flatMap(
  (shuttle) => shuttle.initialDocking ? [{ ...shuttle.initialDocking, shuttleId: shuttle.id }] : [],
);

export const INITIAL_SHUTTLE_VISITS: readonly ShuttleVisit[] = DEFAULT_ENABLED_SHUTTLECRAFT.flatMap(
  (shuttle) => shuttle.initialVisit ? [{ ...shuttle.initialVisit, shuttleId: shuttle.id }] : [],
);

interface ShuttleSessionState {
  readonly shuttleDockings?: readonly ShuttleDocking[];
  readonly shuttleVisitLog?: readonly ShuttleVisit[];
}

export function shuttlebayForShip(session: ShuttleSessionState, shipId: string) {
  const dockings = session.shuttleDockings ?? INITIAL_SHUTTLE_DOCKINGS;
  const visits = session.shuttleVisitLog ?? INITIAL_SHUTTLE_VISITS;
  const dockedShuttles = dockings.filter((item) => item.shipId === shipId).flatMap((docking) => {
      const shuttle = SHUTTLECRAFT.find((item) => item.id === docking.shuttleId);
      return shuttle ? [{ ...shuttle, dockedAt: docking.dockedAt }] : [];
    });
  return {
    dockedShuttles,
    mechanicalBays: (SHIPS.find(ship => ship.id === shipId)?.systems ?? []).filter(system => system.name.startsWith('Shuttle Bay')),
    mechanicalDockedShuttles: dockedShuttles.filter(shuttle => shuttle.dockingEntrance !== 'press'),
    pressDockedShuttles: dockedShuttles.filter(shuttle => shuttle.dockingEntrance === 'press'),
    visits: visits.filter((item) => item.shipId === shipId).flatMap((visit) => {
      const shuttle = SHUTTLECRAFT.find((item) => item.id === visit.shuttleId);
      return shuttle ? [{ ...visit, shuttle, shuttleport: shuttle.dockingPort ?? 'Shuttle bay' }] : [];
    }),
  };
}

export function dockingForShuttle(session: ShuttleSessionState, shuttleId: string): ShuttleDocking | undefined {
  return (session.shuttleDockings ?? INITIAL_SHUTTLE_DOCKINGS)
    .find((docking) => docking.shuttleId === shuttleId);
}
