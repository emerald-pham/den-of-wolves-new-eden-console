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

/** The standard core fleet; optional Union craft stay GM-controlled. */
export const DEFAULT_ENABLED_SHUTTLECRAFT = SHUTTLECRAFT.filter((shuttle) =>
  shuttle.id === 'snn-press-shuttle' ||
  (shuttle.availability === 'standard' && DEFAULT_ACTIVE_ROLE_IDS.includes(shuttle.captainRoleId)),
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

/**
 * SNN is an optional Press station, but its initial docking follows the
 * locked/core roster. Dione is absent from the 8–11 player presets, so those
 * sessions use the historical Aegis starting host; 12+ presets with Dione use
 * Dione. The persisted session remains authoritative once it exists.
 */
export function initialShuttleDockingsForRoles(
  activeRoleIds: readonly string[],
): readonly ShuttleDocking[] {
  const initialHost = activeRoleIds.some((roleId) => roleId.startsWith('dione-'))
    ? 'dione'
    : 'aegis';
  return INITIAL_SHUTTLE_DOCKINGS.map((docking) => docking.shuttleId === 'snn-press-shuttle'
    ? { ...docking, shipId: initialHost }
    : docking);
}

function initialShuttleDockingsForSession(
  activeRoleIds: readonly string[] | undefined,
  playerCount: number | undefined,
): readonly ShuttleDocking[] {
  if (activeRoleIds !== undefined) return initialShuttleDockingsForRoles(activeRoleIds);
  if (playerCount !== undefined) {
    return initialShuttleDockingsForRoles(playerCount >= 12
      ? ['dione-presence-for-legacy-session']
      : []);
  }
  return INITIAL_SHUTTLE_DOCKINGS;
}

export function initialShuttleVisitsForDockings(
  dockings: readonly ShuttleDocking[],
): readonly ShuttleVisit[] {
  return dockings.map((docking) => ({
    id: docking.shuttleId === 'snn-press-shuttle'
      ? `snn-initial-${docking.shipId}-docking`
      : `${docking.shuttleId}-initial-${docking.shipId}-docking`,
    shuttleId: docking.shuttleId,
    shipId: docking.shipId,
    action: 'docked' as const,
    occurredAt: 'SESSION START',
  }));
}

export interface NormalizedShuttleManifest {
  readonly dockings: readonly ShuttleDocking[];
  readonly visits: readonly ShuttleVisit[];
}

/** Fill only missing legacy SNN state; never replace a persisted docking/history. */
export function normalizeShuttleManifest(
  dockings: readonly ShuttleDocking[] | undefined,
  visits: readonly ShuttleVisit[] | undefined,
  activeRoleIds?: readonly string[],
  playerCount?: number,
): NormalizedShuttleManifest {
  const generatedDockings = initialShuttleDockingsForSession(activeRoleIds, playerCount);
  const generatedVisits = initialShuttleVisitsForDockings(generatedDockings);
  const normalizedDockings = dockings === undefined ? [...generatedDockings] : [...dockings];
  const hadSnnDocking = normalizedDockings.some(
    (docking) => docking.shuttleId === 'snn-press-shuttle',
  );
  const legacyDockingCanBeAdded = normalizedDockings.length > 0 && !hadSnnDocking;
  if (legacyDockingCanBeAdded) {
    const snnDocking = generatedDockings.find(
      (docking) => docking.shuttleId === 'snn-press-shuttle',
    );
    if (snnDocking) normalizedDockings.push(snnDocking);
  }

  const normalizedVisits = visits === undefined
    ? (dockings === undefined ? [...generatedVisits] : [])
    : [...visits];
  const hadSnnVisit = normalizedVisits.some(
    (visit) => visit.shuttleId === 'snn-press-shuttle',
  );
  if ((legacyDockingCanBeAdded || (dockings === undefined && !hadSnnDocking)) && !hadSnnVisit) {
    const snnVisit = generatedVisits.find((visit) => visit.shuttleId === 'snn-press-shuttle');
    if (snnVisit) normalizedVisits.push(snnVisit);
  }
  return { dockings: normalizedDockings, visits: normalizedVisits };
}

interface ShuttleSessionState {
  readonly shuttleDockings?: readonly ShuttleDocking[];
  readonly shuttleVisitLog?: readonly ShuttleVisit[];
  readonly activeRoleIds?: readonly string[];
  readonly playerCount?: number;
}

export function shuttlebayForShip(session: ShuttleSessionState, shipId: string) {
  const manifest = normalizeShuttleManifest(
    session.shuttleDockings,
    session.shuttleVisitLog,
    session.activeRoleIds,
    session.playerCount,
  );
  const dockings = manifest.dockings;
  const visits = manifest.visits;
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
  return normalizeShuttleManifest(
    session.shuttleDockings,
    session.shuttleVisitLog,
    session.activeRoleIds,
    session.playerCount,
  ).dockings
    .find((docking) => docking.shuttleId === shuttleId);
}
