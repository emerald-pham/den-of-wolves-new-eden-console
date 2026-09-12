import aegis from './vessels/aegis';
import dione from './vessels/dione';
import icebreaker from './vessels/icebreaker';
import capybara from './vessels/capybara';
import shepherd from './vessels/shepherd';
import quellon from './vessels/quellon';
import refinery124 from './vessels/refinery-124';
import gorgoneion from './vessels/gorgoneion';
import capybaraSmall from './vessels/capybara-small';
import warrior from './vessels/warrior';
import vulcan from './vessels/vulcan';
import voyage330 from './vessels/voyage-33-0';
import type { RegisteredVessel, Ship, ShipOrigin, SupplementalVessel } from './vessels/templates';
export type {
  FullPrintedVesselStatistics,
  MaintenanceStep,
  PrintedVesselStatistics,
  RegisteredVessel,
  Ship,
  ShipOrigin,
  SupplementalVessel,
  VesselCapacity,
} from './vessels/templates';

export const SHIP_ORIGIN_LABELS = {
  earth: 'Old Nations of Earth',
  colonies: 'New Nations of the Colonies',
} as const satisfies Readonly<Record<ShipOrigin, string>>;

export const SHIPS: readonly Ship[] = [
  aegis, dione, icebreaker, capybara, shepherd, quellon, refinery124,
];

/** The six regular base-game ships; Capybara has a separate expansion entry. */
export const CORE_SHIPS: readonly Ship[] = SHIPS.filter((ship) => ship.id !== 'capybara');

/** Optional base-game small ships keep identity separate from full ships. */
export const SMALL_SHIPS: readonly SupplementalVessel[] = [
  gorgoneion, capybaraSmall, warrior, vulcan,
];

/** The approaching Voyage 33-0 crisis vessel is not part of the core roster. */
export const VOYAGE_33_0 = voyage330;

export const SUPPLEMENTAL_VESSELS: readonly SupplementalVessel[] = [
  ...SMALL_SHIPS, VOYAGE_33_0,
];

/** Every printed vessel identity, without adding optional vessels to setup. */
export const ALL_VESSEL_DEFINITIONS: readonly RegisteredVessel[] = [
  ...SHIPS, ...SUPPLEMENTAL_VESSELS,
];

export type CapybaraVesselMode = 'base-capybara' | 'expansion-capybara' | 'none';

/** Resolve one Capybara variant without allowing base and expansion mixing. */
export function findVesselForMode(
  id: string,
  mode: CapybaraVesselMode,
): RegisteredVessel | undefined {
  if (id === 'capybara-small') return mode === 'base-capybara' ? capybaraSmall : undefined;
  if (id === 'capybara') return mode === 'expansion-capybara' ? capybara : undefined;
  return ALL_VESSEL_DEFINITIONS.find((vessel) => vessel.id === id);
}

export const ORIGIN_GALACTIC_COORDINATE = '0000';

export const INITIAL_SHIP_GALACTIC_COORDINATES: Readonly<Record<string, string>> =
  Object.fromEntries(SHIPS.map((ship) => [ship.id, ORIGIN_GALACTIC_COORDINATE]));

export const INITIAL_SHIP_CONSOLE_LOCKS: Readonly<Record<string, boolean>> =
  Object.fromEntries(SHIPS.map((ship) => [ship.id, false]));

export const INITIAL_SHIP_JUMP_STATES: Readonly<Record<string, never>> =
  Object.fromEntries(SHIPS.map((ship) => [ship.id, {}])) as Readonly<Record<string, never>>;

export const INITIAL_SHIP_JUMP_TRANSITIONS: Readonly<Record<string, never>> =
  Object.fromEntries(SHIPS.map((ship) => [ship.id, {}])) as Readonly<Record<string, never>>;

export const INITIAL_SHIP_NAVIGATION_LOGS: Readonly<Record<string, readonly never[]>> =
  Object.fromEntries(SHIPS.map((ship) => [ship.id, []]));

export function findShip(id: string | undefined): Ship | undefined {
  return SHIPS.find((ship) => ship.id === id);
}

export function findVessel(id: string | undefined): RegisteredVessel | undefined {
  return id === undefined ? undefined : ALL_VESSEL_DEFINITIONS.find((vessel) => vessel.id === id);
}
