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
  | 'jump.resolve';

export type ConsoleResolver =
  | { readonly status: 'implemented'; readonly id: ImplementedConsoleResolverId }
  | {
    readonly status: 'deferred';
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
  /** The maintenance step that charges/resolves this console, when printed. */
  readonly step: ConsoleStep;
  readonly charge: ConsoleRule;
  readonly damage: ConsoleRule;
  readonly upgrade: ConsoleRule;
  readonly effect: string;
  readonly resolver: ConsoleResolver;
}

interface ConsoleBlueprint {
  readonly phase: ConsolePhase;
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
const deferred = (reason: string, followOnPrompts: readonly string[]): ConsoleResolver => ({
  status: 'deferred', reason, followOnPrompts,
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
    phase: 'Team', step: 5, charge: reactorCharge,
    damage: printed('Cannot add fighters when damaged.'),
    upgrade: printed('Each fighter wing may hold up to 6 fighters.'),
    effect: 'When charged, spend 1 material per replacement fighter; add fighters to one wing, up to 4.',
    resolver: deferred('Construction Bay has typed printed data but no authoritative build resolver.', ['178']),
  },
  'aegis:fighter-bay-alpha': {
    phase: 'Wolf attack', step: null, charge: reactorCharge,
    damage: printed('Cannot launch fighters when damaged.'), upgrade: noUpgrade,
    effect: 'A charged, undamaged bay permits this fighter wing to launch during a Wolf Attack.',
    resolver: deferred('Fighter Bay launch remains a combat registration until the attack resolver lands.', ['182']),
  },
  'aegis:fighter-bay-bravo': {
    phase: 'Wolf attack', step: null, charge: reactorCharge,
    damage: printed('Cannot launch fighters when damaged.'), upgrade: noUpgrade,
    effect: 'A charged, undamaged bay permits this fighter wing to launch during a Wolf Attack.',
    resolver: deferred('Fighter Bay launch remains a combat registration until the attack resolver lands.', ['182']),
  },
  'aegis:command-and-control': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Cannot be used when damaged.'),
    upgrade: printed('At the end of the attack, choose up to one ship to take 1 less damage.'),
    effect: 'After targeting, redirect one Wolf ship to AEGIS.',
    resolver: deferred('Command and Control awaits the AEGIS attack resolver.', ['182']),
  },
  'aegis:missile-launchers': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Unusable when damaged.'),
    upgrade: printed('+1 long-range damage and +1 medium-range die.'),
    effect: 'Charged: long range deals 2 damage to one target; medium range rolls 4 dice, each 5+ deals 1 damage to a different target.',
    resolver: deferred('Missile Launchers await the AEGIS attack resolver.', ['182']),
  },
  'aegis:point-defence-lasers': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Unusable when damaged.'),
    upgrade: printed('Add one target.'),
    effect: 'Charged: roll 2 dice at medium range, each 4+ deals 1 damage to a different target; short range rolls 2 dice, each 2+ deals 1 damage to a different target.',
    resolver: deferred('Point Defence Lasers await the AEGIS attack resolver.', ['182']),
  },

  'dione:storage': commonStorage(implemented('maintenance.storage')),
  'dione:reactor': commonReactor(4, 1),
  'dione:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'dione:hydroponics': commonHydroponics(implemented('maintenance.production')),
  'dione:water-reclamation': commonWaterReclamation(implemented('maintenance.production')),
  'dione:vip-lounge': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: noUpgrade,
    effect: 'Draw a VIP card.', resolver: deferred('VIP card ownership and use remain unresolved.', ['190', '191']),
  },
  'dione:fighter-bay': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Cannot launch the Maliades when damaged.'), upgrade: noUpgrade,
    effect: 'While charged, the Maliades can be launched during a Wolf Attack.',
    resolver: deferred('Dione Fighter Bay launch remains a craft-gating action.', ['192']),
  },
  'dione:jump-drive': commonJumpDrive('2 / 4 / 8'),

  'icebreaker:storage': commonStorage(implemented('maintenance.storage')),
  'icebreaker:reactor': commonReactor(4, 1),
  'icebreaker:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'icebreaker:hydroponics': commonHydroponics(deferred('Icebreaker Hydroponics has no authoritative production resolver.', ['198'])),
  'icebreaker:water-reclamation': commonWaterReclamation(deferred('Icebreaker Water Reclamation has no authoritative production resolver.', ['199'])),
  'icebreaker:mining-drone-control': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is two more materials.'),
    effect: 'Gain 3 material from mining drones. Upgraded: +2 materials.', resolver: deferred('Mining Drone Control has no authoritative production resolver.', ['200']),
  },
  'icebreaker:jump-drive': commonJumpDrive('3 / 6 / 12'),
  'icebreaker:ram-scoop': {
    phase: 'Coordination', step: 5, charge: reactorCharge, damage: printed('Cannot gather ore when damaged.'), upgrade: printed('Gain +5 ore after every jump.'),
    effect: 'When you FTL jump, if charged, gain 10 / 15 / 20 ore after a short / medium / long jump.', resolver: deferred('Ram Scoop awaits the authoritative post-jump production resolver.', ['202']),
  },

  'shepherd:storage': commonStorage(implemented('maintenance.storage')),
  'shepherd:reactor': commonReactor(3, 1),
  'shepherd:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'shepherd:water-reclamation': commonWaterReclamation(deferred('Shepherd Water Reclamation has no authoritative production resolver.', ['208'])),
  'shepherd:advanced-hydroponics': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is 16 food.'),
    effect: 'Spend 2 water to generate 12 food. Upgraded: +4 food.', resolver: deferred('Shepherd Advanced Hydroponics has no authoritative production resolver.', ['209']),
  },
  'shepherd:advanced-hydroponics-ii': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is 16 food.'),
    effect: 'Spend 2 water to generate 12 food. Upgraded: +4 food.', resolver: deferred('Shepherd Advanced Hydroponics II has no authoritative production resolver.', ['209']),
  },
  'shepherd:jump-drive': commonJumpDrive('3 / 6 / 12'),

  'quellon:storage': commonStorage(implemented('maintenance.storage')),
  'quellon:reactor': commonReactor(3, 1),
  'quellon:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'quellon:hydroponics': commonHydroponics(deferred('Quellon Hydroponics has no authoritative production resolver.', ['220'])),
  'quellon:water-production': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is 16 water.'),
    effect: 'Generate 12 water. Upgraded: +4 water.', resolver: deferred('Quellon Water Production has no authoritative production resolver.', ['221']),
  },
  'quellon:water-production-ii': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Upgraded output is 16 water.'),
    effect: 'Generate 12 water. Upgraded: +4 water.', resolver: deferred('Quellon Water Production II has no authoritative production resolver.', ['221']),
  },
  'quellon:jump-drive': commonJumpDrive('2 / 4 / 8'),

  'refinery-124:storage': commonStorage(implemented('maintenance.storage')),
  'refinery-124:reactor': commonReactor(4, 1),
  'refinery-124:shuttle-bay': commonShuttleBay(6, implemented('maintenance.bays')),
  'refinery-124:hydroponics': commonHydroponics(deferred('Refinery 124 Hydroponics has no authoritative production resolver.', ['228'])),
  'refinery-124:water-reclamation': commonWaterReclamation(deferred('Refinery 124 Water Reclamation has no authoritative production resolver.', ['229'])),
  'refinery-124:fuel-refinery': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Refine up to 15 ore when upgraded.'),
    effect: 'Spend up to 10 strytium ore; for each ore spent gain 1 strytium fuel.', resolver: deferred('Fuel Refinery has no authoritative production resolver.', ['230']),
  },
  'refinery-124:fuel-refinery-ii': {
    phase: 'Team', step: 5, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: printed('Refine up to 15 ore when upgraded.'),
    effect: 'Spend up to 10 strytium ore; for each ore spent gain 1 strytium fuel.', resolver: deferred('Fuel Refinery II has no authoritative production resolver.', ['230']),
  },
  'refinery-124:fighter-bay': {
    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Cannot be charged or used when damaged.'), upgrade: noUpgrade,
    effect: 'While charged, a Fighter Wing can be launched during a Wolf Attack.', resolver: deferred('Refinery Fighter Bay launch remains a role-gated combat action.', ['231']),
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

/** Identity-only vessels currently have no registered console set; later prompts own those definitions. */
export const UNREGISTERED_VESSEL_CONSOLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  gorgoneion: ['235', '236', '239', '240'],
  'capybara-small': ['241', '241a', '241d', '241e'],
  warrior: ['242', '243', '244', '245'],
  vulcan: ['246', '247', '248'],
  'voyage-33-0': ['249', '250', '251'],
});
