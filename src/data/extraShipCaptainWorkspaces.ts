import type { RoleId, SupplementalVesselId } from '@/types/identifiers';

export type ExtraShipCaptainRoleId =
  | 'gorgoneion-captain'
  | 'capybara-small-captain'
  | 'warrior-captain'
  | 'vulcan-captain';

export interface ExtraShipCaptainAction {
  readonly id: string;
  readonly name: string;
  readonly phase: 'Team' | 'Coordination' | 'Away Mission' | 'Wolf attack' | 'FTL';
  readonly effect: string;
  readonly charge: 'none' | 'reactor';
  readonly control: 'unavailable' | 'live-below';
  readonly availability: string;
}

export interface ExtraShipCaptainWorkspaceDefinition {
  readonly roleId: ExtraShipCaptainRoleId;
  readonly vesselId: Extract<SupplementalVesselId, 'gorgoneion' | 'capybara-small' | 'warrior' | 'vulcan'>;
  readonly policy: string;
  readonly actions: readonly ExtraShipCaptainAction[];
}

const unavailable = (
  id: string,
  name: string,
  phase: ExtraShipCaptainAction['phase'],
  effect: string,
  charge: ExtraShipCaptainAction['charge'] = 'none',
  availability = 'Authoritative control unavailable on this workspace.',
): ExtraShipCaptainAction => ({ id, name, phase, effect, charge, control: 'unavailable', availability });

export const EXTRA_SHIP_CAPTAIN_WORKSPACES: readonly ExtraShipCaptainWorkspaceDefinition[] = [
  {
    roleId: 'gorgoneion-captain',
    vesselId: 'gorgoneion',
    policy: 'Protect the fleet, support missions, and use Gorgoneion systems only through their server-owned phase authority.',
    actions: [
      unavailable('jump-drive', 'Jump Drive', 'FTL', 'Spend 1 / 1 / 2 fuel from the docked host for a short / medium / long jump.'),
      unavailable('mission-support', 'Mission Support', 'Away Mission', 'Before cards are dealt, inspect the top five mission cards and return each to the top or bottom.', 'none', 'Awaiting the authoritative pre-deal mission lifecycle.'),
      unavailable('repair-drones', 'Repair Drones', 'Coordination', 'When charged, spend 3 host materials to repair one damaged host console, once per cycle.', 'reactor', 'The strict server resolver exists; callable and workspace control remain unavailable.'),
      unavailable('missile-array', 'Missile Array', 'Wolf attack', 'When charged, roll three dice at each range using the printed 6+ / 5+ / 4+ thresholds.', 'reactor', 'Awaiting the authoritative range-phase resolver.'),
      unavailable('force-field-projector', 'Force Field Projector', 'Wolf attack', 'When charged before targeting, protect one ship and reduce its final attack damage by 2.', 'reactor', 'Awaiting the authoritative before-targeting resolver.'),
    ],
  },
  {
    roleId: 'capybara-small-captain',
    vesselId: 'capybara-small',
    policy: 'Supply the fleet from the base small-ship Capybara without borrowing any full expansion Capybara rule.',
    actions: [
      unavailable('jump-drive', 'Jump Drive', 'FTL', 'Spend 1 / 1 / 2 fuel from the docked host for a short / medium / long jump.'),
      unavailable('bulk-haulage', 'Bulk Haulage', 'Away Mission', 'A contributed opportunity grants one additional resource of every type won.'),
      unavailable('cargo-transfer', 'Cargo Transfer', 'Coordination', 'Move security teams, ore, fuel, food, water, or materials between Capybara cargo and its docked host.', 'none', 'The strict server resolver exists; callable and workspace control remain unavailable.'),
      unavailable('water-reclimator', 'Water Reclimator', 'Team', 'When charged, generate 4 water.', 'reactor', 'The production resolver exists on the facilitator small-ship lane; Captain control remains unavailable.'),
      unavailable('hydroponics', 'Hydroponics', 'Team', 'When charged, spend 1 water to generate 4 food.', 'reactor', 'The production resolver exists on the facilitator small-ship lane; Captain control remains unavailable.'),
      unavailable('fuel-processor', 'Fuel Processor', 'Team', 'When charged, convert up to 5 ore into the same amount of fuel.', 'reactor', 'The production resolver exists on the facilitator small-ship lane; Captain control remains unavailable.'),
    ],
  },
  {
    roleId: 'warrior-captain',
    vesselId: 'warrior',
    policy: 'Recover supplies and repair fleet consoles while protecting Warrior and Rosal survivors.',
    actions: [
      unavailable('jump-drive', 'Jump Drive', 'FTL', 'Spend 1 / 1 / 2 fuel from the docked host for a short / medium / long jump.'),
      unavailable('reclamator', 'Reclamator', 'Away Mission', 'Discard the entire hand to salvage one opportunity for the printed per-card resource choice.', 'none', 'Awaiting the authoritative mission opportunity and reward lifecycle.'),
      unavailable('cargo-transfer', 'Cargo Transfer', 'Coordination', 'Move security teams, ore, fuel, food, water, or materials to and from the docked host.'),
      unavailable('repair-drones', 'Repair Drones', 'Coordination', 'When charged, spend 6 host materials to repair one or two damaged host consoles, once per cycle.', 'reactor', 'The strict server resolver exists; callable and workspace control remain unavailable.'),
      unavailable('salvage-drones', 'Salvage Drones', 'Wolf attack', 'After an attack, when charged, roll once for each damage dealt by either side and gain 1 material for every 5+.', 'reactor', 'Attack damage tracking and salvage rolls are not available yet.'),
    ],
  },
  {
    roleId: 'vulcan-captain',
    vesselId: 'vulcan',
    policy: 'Protect and rehabilitate Vulcan prisoners while using only the vessel systems authorized for the current phase.',
    actions: [
      unavailable('jump-drive', 'Jump Drive', 'FTL', 'Spend 1 / 1 / 2 fuel from the docked host for a short / medium / long jump.'),
      unavailable('laser-cannon', 'Laser Cannon', 'Wolf attack', 'When charged, roll two dice at Medium and Short range; each 4+ deals 1 damage.', 'reactor', 'Awaiting the authoritative Medium and Short range resolvers.'),
      {
        id: 'additional-labour',
        name: 'Additional Labour',
        phase: 'Coordination',
        effect: 'Each independently charged console may charge one permitted console on another ship once per cycle.',
        charge: 'reactor',
        control: 'live-below',
        availability: 'Live server-owned controls appear below when current authority permits.',
      },
    ],
  },
] as const;

export function extraShipCaptainWorkspaceFor(
  roleId: RoleId | null | undefined,
): ExtraShipCaptainWorkspaceDefinition | undefined {
  return EXTRA_SHIP_CAPTAIN_WORKSPACES.find((workspace) => workspace.roleId === roleId);
}
