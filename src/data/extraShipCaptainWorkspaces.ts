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
      {
        id: 'jump-drive', name: 'Jump Drive', phase: 'Coordination',
        effect: 'When charged during Team Phase, spend 1 / 1 / 2 fuel from the docked host for a short / medium / long jump.',
        charge: 'reactor', control: 'live-below',
        availability: 'Live server-owned movement controls appear below using this Captain’s known chart nodes.',
      },
      {
        id: 'mission-support', name: 'Mission Support', phase: 'Away Mission',
        effect: 'Before cards are dealt, inspect the top five mission cards and return each to the top or bottom.',
        charge: 'none', control: 'live-below',
        availability: 'Live Mission Support controls appear below for an eligible pre-deal mission.',
      },
      {
        id: 'repair-drones',
        name: 'Repair Drones',
        phase: 'Coordination',
        effect: 'When charged, spend 3 materials from the docked host to repair one damaged host console, once per cycle.',
        charge: 'reactor',
        control: 'live-below',
        availability: 'Live server-owned repair control appears below when current authority permits.',
      },
      {
        id: 'missile-array', name: 'Missile Array', phase: 'Wolf attack',
        effect: 'At each range, when charged, roll three dice: 6+ at Long, 5+ at Medium, and 4+ at Short. Each hit deals 1 damage; the array can damage each target at most once per phase.',
        charge: 'reactor', control: 'live-below',
        availability: 'Live server-owned range choice panel appears below when the current Captain and charge permit.',
      },
      {
        id: 'force-field-projector', name: 'Force Field Projector', phase: 'Wolf attack',
        effect: 'When charged before targeting, protect one ship and reduce its final attack damage by 2.',
        charge: 'reactor', control: 'live-below',
        availability: 'Choose a current fleet-group target or explicitly pass before targeting rolls are exposed.',
      },
    ],
  },
  {
    roleId: 'capybara-small-captain',
    vesselId: 'capybara-small',
    policy: 'Supply the fleet from the base small-ship Capybara without borrowing any full expansion Capybara rule.',
    actions: [
      {
        id: 'jump-drive', name: 'Jump Drive', phase: 'Coordination',
        effect: 'When charged during Team Phase, spend 1 / 1 / 2 fuel from the docked host for a short / medium / long jump.',
        charge: 'reactor', control: 'live-below',
        availability: 'Live server-owned movement controls appear below using this Captain’s known chart nodes.',
      },
      {
        id: 'bulk-haulage', name: 'Bulk Haulage', phase: 'Away Mission',
        effect: 'A contributed opportunity grants one additional resource of every type won.',
        charge: 'none', control: 'live-below',
        availability: 'Mission resolution applies this benefit automatically when base Capybara contributes to the opportunity.',
      },
      {
        id: 'cargo-transfer',
        name: 'Cargo Transfer',
        phase: 'Coordination',
        effect: 'Move a positive whole amount of security teams, ore, fuel, food, water, or materials between base Capybara cargo and its current docked host.',
        charge: 'none',
        control: 'live-below',
        availability: 'Live server-owned transfer control appears below when current authority permits.',
      },
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
      { id: 'jump-drive', name: 'Jump Drive', phase: 'Coordination', charge: 'none', control: 'live-below',
        effect: 'Spend 1 / 1 / 2 fuel from the docked host for a short / medium / long jump after current Team maintenance. No reactor charge is required.',
        availability: 'Live server-owned Jump Drive controls appear below when current authority permits.' },
      {
        id: 'reclamator', name: 'Reclamator', phase: 'Away Mission',
        effect: 'Discard the entire hand to salvage one opportunity for the printed per-card resource choice.',
        charge: 'none', control: 'live-below',
        availability: 'Live Reclamator choices appear in the mission workspace when Warrior contributes and private discards open.',
      },
      { id: 'cargo-transfer', name: 'Cargo Transfer', phase: 'Coordination', charge: 'none', control: 'live-below',
        effect: 'Move a positive whole amount of security teams, ore, fuel, food, water, or materials between Warrior cargo and its current docked host.',
        availability: 'Live server-owned transfer control appears below when current authority permits.' },
      {
        id: 'repair-drones',
        name: 'Repair Drones',
        phase: 'Coordination',
        effect: 'When charged, spend 6 host materials to repair one or two damaged host consoles, once per cycle.',
        charge: 'reactor',
        control: 'live-below',
        availability: 'Live server-owned repair control appears below when current authority permits.',
      },
      {
        id: 'salvage-drones', name: 'Salvage Drones', phase: 'Wolf attack',
        effect: 'After an attack, when charged, roll once for each damage dealt by either side and gain 1 material for every 5+.',
        charge: 'reactor', control: 'live-below',
        availability: 'Live aftermath controls appear below after a resolved attack when Warrior has a current Salvage Drones charge.',
      },
    ],
  },
  {
    roleId: 'vulcan-captain',
    vesselId: 'vulcan',
    policy: 'Protect and rehabilitate Vulcan prisoners while using only the vessel systems authorized for the current phase.',
    actions: [
      { id: 'jump-drive', name: 'Jump Drive', phase: 'Coordination', charge: 'none', control: 'live-below',
        effect: 'Spend 1 / 1 / 2 fuel from the docked host for a short / medium / long jump after current Team maintenance. No reactor charge is required.',
        availability: 'Live server-owned Jump Drive controls appear below when current authority permits.' },
      { id: 'laser-cannon', name: 'Laser Cannon', phase: 'Wolf attack', charge: 'reactor', control: 'live-below',
        effect: 'When charged, roll two dice at Medium and Short range; each 4+ deals 1 damage.',
        availability: 'Live server-owned range choice panels appear below at the current Medium or Short range. Choose use or pass before range resolution.' },
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
