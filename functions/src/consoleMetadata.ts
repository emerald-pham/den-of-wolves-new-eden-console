import { SHIP_DAMAGE_DECKS } from './shipDamage';

export type ConsolePhase = 'Team' | 'Coordination' | 'Wolf attack' | 'Damage resolution';
export type ConsoleStep = 1 | 5 | 6 | 7 | null;

export type ConsoleRule =
  | { readonly status: 'printed'; readonly text: string }
  | {
    readonly status: 'unresolved';
    readonly reason: string;
    readonly followOnPrompts: readonly string[];
  };

export type ImplementedConsoleResolverId =
  | 'damage.draw'
  | 'maintenance.storage'
  | 'maintenance.reactor'
  | 'maintenance.bays'
  | 'maintenance.production'
  | 'fighter.build'
  | 'wolf-attack.maliades-launch'
  | 'wolf-attack.command-and-control'
  | 'vip-card.draw'
  | 'jump.resolve';

export type ConsoleResolver =
  | { readonly status: 'implemented'; readonly id: ImplementedConsoleResolverId }
  | {
    /** Authoritative fail-closed disposition until the owning prompt supplies an action resolver. */
    readonly status: 'unavailable';
    readonly id: 'fail-closed.unavailable';
    readonly followOnPrompts: readonly string[];
    readonly reason: string;
  };

export interface ConsoleMetadata {
  readonly consoleId: string;
  readonly shipId: string;
  readonly name: string;
  /** The card identity is server-only; do not copy it into the client catalog. */
  readonly card: string;
  readonly phase: ConsolePhase;
  /** Printed role that owns an interactive console action, when the source names one. */
  readonly ownerRoleId?: string;
  /** The maintenance step that charges/resolves this console, when printed. */
  readonly step: ConsoleStep;
  readonly charge: ConsoleRule;
  readonly damage: ConsoleRule;
  readonly upgrade: ConsoleRule;
  readonly effect: string;
  readonly resolver: ConsoleResolver;
}

export interface SupplementalConsoleMetadata {
  readonly consoleId: string;
  readonly vesselId: string;
  readonly name: string;
  readonly phase: ConsolePhase;
  readonly maintenanceStep: 4;
  readonly charge: ConsoleRule;
  readonly effect: string;
  readonly resolver: ConsoleResolver;
}

interface ConsoleBlueprint {
  readonly phase: ConsolePhase;
  readonly ownerRoleId?: string;
  readonly step: ConsoleStep;
  readonly charge: ConsoleRule;
  readonly damage: ConsoleRule;
  readonly upgrade: ConsoleRule;
  readonly effect: string;
  readonly resolver: ConsoleResolver;
}

const printed = (text: string): ConsoleRule => ({ status: 'printed', text });
const unresolved = (reason: string, followOnPrompts: readonly string[] = []): ConsoleRule => ({
  status: 'unresolved', reason, followOnPrompts,
});
const implemented = (id: ImplementedConsoleResolverId): ConsoleResolver => ({ status: 'implemented', id });
const unavailable = (reason: string, followOnPrompts: readonly string[]): ConsoleResolver => ({
  status: 'unavailable', id: 'fail-closed.unavailable', reason, followOnPrompts,
});

const noCharge = printed('No reactor charge is required.');
const reactorCharge = printed('Requires one console charge from the ship Reactor.');
const noUpgrade = unresolved('The routed system source does not specify an upgrade for this console.');

const commonStorage = (resolver: ConsoleResolver): ConsoleBlueprint => ({
  phase: 'Team', step: 1, charge: noCharge,
  damage: printed('Discard half of the ship and docked-shuttle resources each maintenance cycle; round losses down.'),
  upgrade: noUpgrade,
  effect: 'Stored resources remain available to the ship and docked shuttlecraft.', resolver,
});

const commonReactor = (capacity: number, damaged: number): ConsoleBlueprint => ({
  phase: 'Team', step: 5, charge: printed('The Reactor supplies the printed console-charge capacity.'),
  damage: printed(`Charge ${damaged} consoles when damaged.`),
  upgrade: printed(`Charge ${capacity + 1} consoles when upgraded.`),
  effect: `Charge up to ${capacity} consoles.`, resolver: implemented('maintenance.reactor'),
});

const commonShuttleBay = (step: 6 | 7, resolver: ConsoleResolver): ConsoleBlueprint => ({
  phase: 'Team', step, charge: noCharge,
  damage: printed('Cannot refuel a shuttle when damaged.'),
  upgrade: noUpgrade,
  effect: 'Spend 1 fuel to refuel one eligible docked shuttle.', resolver,
});

const commonHydroponics = (resolver: ConsoleResolver): ConsoleBlueprint => ({
  phase: 'Team', step: 5, charge: reactorCharge,
  damage: printed('Cannot be charged or used when damaged.'),
  upgrade: printed('Upgraded output is two more food.'),
  effect: 'Spend 1 water to generate 3 food. Upgraded: +2 food.', resolver,
});

const commonWaterReclamation = (resolver: ConsoleResolver): ConsoleBlueprint => ({
  phase: 'Team', step: 5, charge: reactorCharge,
  damage: printed('Cannot be charged or used when damaged.'),
  upgrade: printed('Upgraded output is two more water.'),
  effect: 'Generate 2 water. Upgraded: +2 water.', resolver,
});

const commonJumpDrive = (cost: string): ConsoleBlueprint => ({
  phase: 'Coordination', step: 5, charge: reactorCharge,
  damage: printed('A damaged jump fails on a roll of 1–3; the drive remains chargeable.'),
  upgrade: printed('Each jump costs 1 fewer fuel; a damaged upgraded drive fails only on 1.'),
  effect: `Charged: jump for ${cost} fuel at short / medium / long range.`,
  resolver: implemented('jump.resolve'),
});

const BLUEPRINTS: Readonly<Record<string, ConsoleBlueprint>> = {
  'aegis:armoured-hull-i': {
    phase: 'Damage resolution', step: null, charge: noCharge,
    damage: printed('Do not lose survivors; recycle the damage card after resolution unless the deck is empty.'),
    upgrade: noUpgrade, effect: 'Passive armour section. No charge required.', resolver: implemented('damage.draw'),
  },
  'aegis:armoured-hull-ii': {
    phase: 'Damage resolution', step: null, charge: noCharge,
    damage: printed('Do not lose survivors; recycle the damage card after resolution unless the deck is empty.'),
    upgrade: noUpgrade, effect: 'Passive armour section. No charge required.', resolver: implemented('damage.draw'),
  },
  'aegis:storage': commonStorage(implemented('maintenance.storage')),
  'aegis:reactor': commonReactor(5, 2),
  'aegis:shuttle-bay-zeta': { ...commonShuttleBay(6, implemented('maintenance.bays')), effect: 'Spend 1 fuel to refuel one docked shuttle.' },
  'aegis:shuttle-bay-omega': { ...commonShuttleBay(7, implemented('maintenance.bays')), effect: 'Spend 1 fuel to refuel one docked shuttle.' },
  'aegis:jump-drive': commonJumpDrive('2 / 3 / 6'),
  'aegis:construction-bay': {
    phase: 'Team', ownerRoleId: 'wing-commander', step: 5, charge: reactorCharge,
    damage: printed('Cannot add fighters when damaged.'),
    upgrade: printed('Each fighter wing may hold up to 6 fighters.'),
    effect: 'When charged, spend 1 material per replacement fighter; add fighters to one wing, up to 4.',
    resolver: implemented('fighter.build'),
  },
  'aegis:fighter-bay-alpha': {
    phase: 'Wolf attack', step: null, charge: reactorCharge,
    damage: printed('Cannot launch fighters when damaged.'), upgrade: noUpgrade,
    effect: 'A charged, undamaged bay permits this fighter wing to launch during a Wolf Attack.',
    resolver: unavailable('Fighter Bay launch remains unavailable until the attack resolver lands.', ['182']),
  },
  'aegis:fighter-bay-bravo': {
    phase: 'Wolf attack', step: null, charge: reactorCharge,
    damage: printed('Cannot launch fighters when damaged.'), upgrade: noUpgrade,
    effect: 'A charged, undamaged bay permits this fighter wing to launch during a Wolf Attack.',
    resolver: unavailable('Fighter Bay launch remains unavailable until the attack resolver lands.', ['182']),
  },
  'aegis:command-and-control': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Cannot be used when damaged.'),
    upgrade: printed('At the end of the attack, choose up to one ship to take 1 less damage.'),
    effect: 'After targeting, redirect one Wolf ship to AEGIS.',
    resolver: implemented('wolf-attack.command-and-control'),
  },
  'aegis:missile-launchers': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Unusable when damaged.'),
    upgrade: printed('+1 long-range damage and +1 medium-range die.'),
    effect: 'Charged: long range deals 2 damage to one target; medium range rolls 4 dice, each 5+ deals 1 damage to a different target.',
    resolver: unavailable('Missile Launchers are unavailable until the AEGIS attack resolver lands.', ['182']),
  },
  'aegis:point-defence-lasers': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Unusable when damaged.'),
    upgrade: printed('Add one target.'),
    effect: 'Charged: roll 2 dice at medium range, each 4+ deals 1 damage to a different target; short range rolls 2 dice, each 2+ deals 1 damage to a different target.',
    resolver: unavailable('Point Defence Lasers are unavailable until the AEGIS attack resolver lands.', ['182']),
  },

  'dione:storage': commonStorage(implemented('maintenance.storage')),
  'dione:reactor': commonReactor(4, 1),
  'dione:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'dione:hydroponics': commonHydroponics(implemented('maintenance.production')),
  'dione:water-reclamation': commonWaterReclamation(implemented('maintenance.production')),
  'dione:vip-lounge': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: noUpgrade,
    effect: 'Draw a VIP card.', resolver: implemented('vip-card.draw'),
  },
  'dione:fighter-bay': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Cannot launch the Maliades when damaged.'), upgrade: noUpgrade,
    effect: 'While charged, the Maliades can be launched during a Wolf Attack.',
    resolver: implemented('wolf-attack.maliades-launch'),
  },
  'dione:jump-drive': commonJumpDrive('2 / 4 / 8'),

  'icebreaker:storage': commonStorage(implemented('maintenance.storage')),
  'icebreaker:reactor': commonReactor(4, 1),
  'icebreaker:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'icebreaker:hydroponics': commonHydroponics(implemented('maintenance.production')),
  'icebreaker:water-reclamation': commonWaterReclamation(implemented('maintenance.production')),
  'icebreaker:mining-drone-control': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is two more materials.'),
    effect: 'Gain 3 material from mining drones. Upgraded: +2 materials.', resolver: implemented('maintenance.production'),
  },
  'icebreaker:jump-drive': commonJumpDrive('3 / 6 / 12'),
  'icebreaker:ram-scoop': {
    phase: 'Coordination', step: 5, charge: reactorCharge, damage: printed('Cannot gather ore when damaged.'), upgrade: printed('Gain +5 ore after every jump.'),
    effect: 'When you FTL jump, if charged, gain 10 / 15 / 20 ore after a short / medium / long jump.', resolver: unavailable('Ram Scoop is unavailable until the authoritative post-jump production resolver lands.', ['202']),
  },

  'shepherd:storage': commonStorage(implemented('maintenance.storage')),
  'shepherd:reactor': commonReactor(3, 1),
  'shepherd:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'shepherd:water-reclamation': commonWaterReclamation(implemented('maintenance.production')),
  'shepherd:advanced-hydroponics': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is 16 food.'),
    effect: 'Spend 2 water to generate 12 food. Upgraded: +4 food.', resolver: implemented('maintenance.production'),
  },
  'shepherd:advanced-hydroponics-ii': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is 16 food.'),
    effect: 'Spend 2 water to generate 12 food. Upgraded: +4 food.', resolver: implemented('maintenance.production'),
  },
  'shepherd:jump-drive': commonJumpDrive('3 / 6 / 12'),

  'quellon:storage': commonStorage(implemented('maintenance.storage')),
  'quellon:reactor': commonReactor(3, 1),
  'quellon:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'quellon:hydroponics': commonHydroponics(implemented('maintenance.production')),
  'quellon:water-production': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is 16 water.'),
    effect: 'Generate 12 water. Upgraded: +4 water.', resolver: implemented('maintenance.production'),
  },
  'quellon:water-production-ii': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is 16 water.'),
    effect: 'Generate 12 water. Upgraded: +4 water.', resolver: implemented('maintenance.production'),
  },
  'quellon:jump-drive': commonJumpDrive('2 / 4 / 8'),

  'refinery-124:storage': commonStorage(implemented('maintenance.storage')),
  'refinery-124:reactor': commonReactor(4, 1),
  'refinery-124:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'refinery-124:hydroponics': commonHydroponics(implemented('maintenance.production')),
  'refinery-124:water-reclamation': commonWaterReclamation(implemented('maintenance.production')),
  'refinery-124:fuel-refinery': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Refine up to 15 ore when upgraded.'),
    effect: 'Spend up to 10 strytium ore; for each ore spent gain 1 strytium fuel.', resolver: implemented('maintenance.production'),
  },
  'refinery-124:fuel-refinery-ii': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Refine up to 15 ore when upgraded.'),
    effect: 'Spend up to 10 strytium ore; for each ore spent gain 1 strytium fuel.', resolver: implemented('maintenance.production'),
  },
  'refinery-124:fighter-bay': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: noUpgrade,
    effect: 'While charged, a Fighter Wing can be launched during a Wolf Attack.', resolver: unavailable('Refinery Fighter Bay launch is unavailable until its role-gated combat resolver lands.', ['231']),
  },
  'refinery-124:jump-drive': commonJumpDrive('2 / 4 / 8'),

  'capybara:storage': {
    ...commonStorage(implemented('maintenance.storage')),
    effect: "If damaged, discard half the ship's resources including those on docked shuttles; round losses down.",
  },
  'capybara:reactor': commonReactor(3, 0),
  'capybara:advanced-hydroponics': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged when damaged.'), upgrade: printed('Upgraded output is 9 food.'),
    effect: 'Spend 2 water to generate 6 food; optionally spend 1 Scrap for +6 food. Upgraded: +3 food.', resolver: implemented('maintenance.production'),
  },
  'capybara:water-production': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged when damaged.'), upgrade: printed('Upgraded output is 9 water.'),
    effect: 'Generate 6 water; optionally spend 1 Scrap for +6 water. Upgraded: +3 water.', resolver: implemented('maintenance.production'),
  },
  'capybara:scrap-refinery': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged when damaged.'), upgrade: noUpgrade,
    effect: 'Choose one: spend 1 Scrap for 3 materials, or generate 1 Scrap.', resolver: implemented('maintenance.production'),
  },
  'capybara:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'capybara:jump-drive': commonJumpDrive('3 / 6 / 12'),
};

function metadataFor(shipId: string, card: { readonly card: string; readonly systemId: string; readonly systemName: string }): ConsoleMetadata {
  const key = `${shipId}:${card.systemId}`;
  const blueprint = BLUEPRINTS[key];
  if (!blueprint) throw new Error(`Missing Prompt 165 blueprint for ${key}.`);
  return { consoleId: key, shipId, name: card.systemName, card: card.card, ...blueprint };
}

/** Server-only source of card, rule, and resolver metadata for configured consoles. */
export const CONSOLE_METADATA: Readonly<Record<string, ConsoleMetadata>> = Object.freeze(
  Object.fromEntries(Object.entries(SHIP_DAMAGE_DECKS).flatMap(([shipId, cards]) =>
    cards.map(card => [
      `${shipId}:${card.systemId}`,
      metadataFor(shipId, card),
    ] as const))),
);

export function consoleMetadataFor(shipId: string, systemId: string): ConsoleMetadata | undefined {
  return CONSOLE_METADATA[`${shipId}:${systemId}`];
}

/** Server-side registration for optional-vessel systems without damage cards. */
export const SUPPLEMENTAL_CONSOLE_METADATA: Readonly<Record<string, SupplementalConsoleMetadata>> =
  Object.freeze({
    'gorgoneion:missile-array': {
      consoleId: 'gorgoneion:missile-array',
      vesselId: 'gorgoneion',
      name: 'Missile Array',
      phase: 'Wolf attack',
      maintenanceStep: 4,
      charge: printed('Requires one console charge from the small-ship Reactor.'),
      effect: 'Roll 3 dice total: one at long, one at medium, and one at short range. Each 6+ / 5+ / 4+ deals 1 damage at that range; the array can damage each target at most once per phase.',
      resolver: unavailable(
        'Missile Array firing is unavailable until the authoritative range-phase resolver lands.',
        ['455'],
      ),
    },
    'gorgoneion:force-field-projector': {
      consoleId: 'gorgoneion:force-field-projector',
      vesselId: 'gorgoneion',
      name: 'Force Field Projector',
      phase: 'Wolf attack',
      maintenanceStep: 4,
      charge: printed('Requires one console charge from the small-ship Reactor.'),
      effect: 'Before targeting, choose 1 ship. At the end of the Wolf attack, reduce the damage that ship takes by 2.',
      resolver: unavailable(
        'Ship selection is unavailable until the authoritative before-targeting resolver lands; selection cannot occur after targeting begins.',
        ['437'],
      ),
    },
    'vulcan:laser-cannon': {
      consoleId: 'vulcan:laser-cannon',
      vesselId: 'vulcan',
      name: 'Laser Cannon',
      phase: 'Wolf attack',
      maintenanceStep: 4,
      charge: printed('Requires one console charge from the small-ship Reactor.'),
      effect: 'At each of medium and short range, roll 2 dice. Each die deals 1 damage on a 4+.',
      resolver: unavailable(
        'Vulcan Laser Cannon resolution is unavailable until the authoritative Medium and Short range resolvers land.',
        ['439', '440'],
      ),
    },
  });

export function supplementalConsoleMetadataFor(
  vesselId: string,
  systemId: string,
): SupplementalConsoleMetadata | undefined {
  return SUPPLEMENTAL_CONSOLE_METADATA[`${vesselId}:${systemId}`];
}

/** Identity-only vessels currently have no registered console set; later prompts own those definitions. */
export const UNREGISTERED_VESSEL_CONSOLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  gorgoneion: ['235', '236'],
  'capybara-small': ['241', '241a', '241d', '241e'],
  warrior: ['242', '243', '244', '245'],
  vulcan: ['246', '248'],
  'voyage-33-0': ['249', '250', '251'],
});
