import {
  AEGIS_FIGHTER_BAY_SYSTEMS,
  AEGIS_ROLE_CONSOLES,
  type AegisCraft,
} from './aegisConsoles';
import { findConsoleRole } from './roles';
import { SHUTTLECRAFT } from './shuttles';
import { PDF_ESCORT_FIGHTER_WING, PDF_FIGHTER_WING_SYSTEM } from './pdfConsoles';
import type { ShuttleOperation, Shuttlecraft } from './vessels/templates';

export interface CraftHelpOperation {
  readonly name: string;
  readonly phase: string;
  readonly effect: string;
}

/**
 * Static, printed craft guidance for the private role brief.
 *
 * This intentionally contains no current docking, holder, fuel balance,
 * fighter count, or mutable session state. The caller supplies only the
 * server-derived craft IDs entitled to the current player's brief.
 */
export interface CraftHelp {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly fuelRules?: readonly string[];
  readonly cargoRule?: string;
  readonly phaseRules: readonly string[];
  readonly combatRules?: readonly string[];
  readonly missionRules?: readonly string[];
  readonly actionRules: readonly string[];
  readonly operations: readonly CraftHelpOperation[];
}

const roleName = (roleId: string): string => findConsoleRole(roleId)?.name ?? roleId;

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)];

function shuttleHelp(craft: Shuttlecraft): CraftHelp {
  const operations = craft.operations.map(({ name, phase, effect }: ShuttleOperation) => ({
    name,
    phase,
    effect,
  }));
  const combatOperations = operations
    .filter(({ phase }) => phase === 'Wolf attack')
    .map(({ name, effect }) => `${name}: ${effect}`);
  const missionOperations = operations
    .filter(({ phase }) => phase === 'Away mission')
    .map(({ name, effect }) => `${name}: ${effect}`);
  const fuelRules = operations
    .filter(({ effect }) => /fuel/i.test(effect))
    .map(({ name, phase, effect }) => `${name} // ${phase}: ${effect}`);

  return {
    id: craft.id,
    name: craft.name,
    owner: roleName(craft.captainRoleId),
    ...(fuelRules.length > 0 ? { fuelRules: unique(fuelRules) } : {}),
    ...(craft.cargoTransfer ? { cargoRule: craft.cargoTransfer } : {}),
    phaseRules: unique(operations.map(({ phase }) => phase)),
    ...(combatOperations.length > 0 ? { combatRules: unique(combatOperations) } : {}),
    ...(missionOperations.length > 0 ? { missionRules: unique(missionOperations) } : {}),
    actionRules: operations.map(({ name, phase, effect }) => `${name} // ${phase}: ${effect}`),
    operations,
  };
}

function aegisFighterWingHelp(craft: AegisCraft): CraftHelp {
  const system = craft.launchSystemId ? AEGIS_FIGHTER_BAY_SYSTEMS[craft.launchSystemId] : undefined;
  const combat = craft.fighterWing?.combat;
  const actionRules = [
    system?.baseline,
    system?.damaged,
    craft.fighterWing
      ? `Capacity // ${craft.fighterWing.capacity.standard} fighters standard; ${craft.fighterWing.capacity.upgraded} when upgraded.`
      : undefined,
  ].filter((rule): rule is string => Boolean(rule));

  return {
    id: craft.id,
    name: craft.name,
    owner: roleName('wing-commander'),
    phaseRules: unique(['Wolf attack', ...(system?.station ? [system.station] : [])]),
    ...(combat ? {
      combatRules: [combat.mediumRange, combat.shortRange, combat.lossRule],
    } : {}),
    actionRules,
    operations: actionRules.map((effect) => ({ name: 'Launch and capacity', phase: 'Wolf attack', effect })),
  };
}

function pdfFighterWingHelp(): CraftHelp {
  const craft = PDF_ESCORT_FIGHTER_WING;
  const missionRules = [
    `Participate in Away Missions without a ${PDF_FIGHTER_WING_SYSTEM.name} charge, adding +${craft.mission.bonuses.searchAndRescue} to search & rescue and +${craft.mission.bonuses.salvage} to salvage checks.`,
  ];
  const actionRules = [
    `Launch during ${craft.launch.phase} when the ${PDF_FIGHTER_WING_SYSTEM.name} is charged and undamaged.`,
    `Capacity // ${craft.capacity} fighters.`,
  ];

  return {
    id: craft.id,
    name: craft.name,
    owner: roleName(craft.ownerRoleId),
    phaseRules: unique([craft.mission.phase, craft.launch.phase]),
    combatRules: [craft.combat.mediumRange, craft.combat.shortRange, craft.combat.lossRule],
    missionRules,
    actionRules,
    operations: [
      { name: 'Away mission', phase: craft.mission.phase, effect: missionRules.join(' ') },
      { name: 'Launch', phase: craft.launch.phase, effect: actionRules[0]! },
    ],
  };
}

const AEGIS_FIGHTER_WINGS = new Map(
  AEGIS_ROLE_CONSOLES['wing-commander'].craft
    .filter((craft) => craft.fighterWing)
    .map((craft) => [craft.id, craft] as const),
);

const PDF_FIGHTER_WING_HELP = pdfFighterWingHelp();

/** Resolve one catalog-backed craft's static printed help, if represented. */
export function craftHelpFor(craftId: string): CraftHelp | undefined {
  const shuttle = SHUTTLECRAFT.find((craft) => craft.id === craftId);
  if (shuttle) return shuttleHelp(shuttle);
  const aegisFighterWing = AEGIS_FIGHTER_WINGS.get(craftId);
  if (aegisFighterWing) return aegisFighterWingHelp(aegisFighterWing);
  if (craftId === PDF_ESCORT_FIGHTER_WING.id) return PDF_FIGHTER_WING_HELP;
  return undefined;
}
