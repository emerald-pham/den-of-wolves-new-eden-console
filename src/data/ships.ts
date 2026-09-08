import aegis from './vessels/aegis';
import dione from './vessels/dione';
import icebreaker from './vessels/icebreaker';
import capybara from './vessels/capybara';
import shepherd from './vessels/shepherd';
import quellon from './vessels/quellon';
import refinery124 from './vessels/refinery-124';
import type { Ship, ShipOrigin } from './vessels/templates';
export type { Ship, ShipOrigin } from './vessels/templates';

export const SHIP_ORIGIN_LABELS = {
  earth: 'Old Nations of Earth',
  colonies: 'New Nations of the Colonies',
} as const satisfies Readonly<Record<ShipOrigin, string>>;

export const SHIPS: readonly Ship[] = [
  aegis, dione, icebreaker, capybara, shepherd, quellon, refinery124,
];

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
