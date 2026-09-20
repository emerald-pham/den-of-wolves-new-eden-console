import {
  chargeableConsoleIds,
  emptyMaintenanceCycle,
  parseMaintenanceCycle,
  resolveMaintenanceProduction,
  type MaintenanceCycle,
  type MaintenanceInput,
} from './maintenance';
import { consoleMetadataFor } from './consoleMetadata';
import type { ShipDamageState } from './shipDamage';
import type { ShipResourceInventory } from './resources';
import type { SmallShipMaintenanceCycle } from './smallShip';

/** The two printed Additional Labour consoles are distinct, turn-scoped uses. */
export const VULCAN_ADDITIONAL_LABOUR_CONSOLES = [
  'additional-labour-1', 'additional-labour-2',
] as const;
export type VulcanAdditionalLabourConsole = (typeof VULCAN_ADDITIONAL_LABOUR_CONSOLES)[number];

export type VulcanLabourInput = Readonly<{
  sourceCycle: SmallShipMaintenanceCycle;
  sourceConsoleId: VulcanAdditionalLabourConsole;
  currentTurn: number;
  targetShipId: string;
  targetConsoleId: string;
  targetCycle: MaintenanceCycle;
  targetResources: ShipResourceInventory;
  targetDamage: ShipDamageState;
  targetUnrest: number;
  targetPopulation: number;
  targetDockings: readonly { readonly shipId: string; readonly shuttleId: string }[];
  targetCargo: Record<string, Record<string, number>>;
  targetFuelled: Record<string, boolean>;
  targetUpgrades: readonly string[];
  now: string;
  productionScrap?: boolean;
  productionOreAmount?: number;
}>;

export type VulcanLabourResult = Readonly<{
  sourceCycle: SmallShipMaintenanceCycle;
  targetCycle: MaintenanceCycle;
  targetResources: ShipResourceInventory;
  targetDamage: ShipDamageState;
  targetUnrest: number;
  targetPopulation: number;
  targetCargo: Record<string, Record<string, number>>;
  targetFuelled: Record<string, boolean>;
  immediate: boolean;
  message: string;
}>;

function cloneTargetCycle(cycle: MaintenanceCycle): MaintenanceCycle {
  const parsed = parseMaintenanceCycle(cycle);
  if (!parsed) throw new Error('Malformed target maintenance cycle.');
  return {
    ...parsed,
    results: { ...parsed.results },
    charges: [...parsed.charges],
    refuelled: [...parsed.refuelled],
  };
}

/**
 * Apply one source-backed Additional Labour use. The caller owns the
 * transaction and persists both cycles and the target ledger together.
 */
export function applyVulcanAdditionalLabour(input: VulcanLabourInput): VulcanLabourResult {
  if (!VULCAN_ADDITIONAL_LABOUR_CONSOLES.includes(input.sourceConsoleId)) {
    throw new Error('Unknown Additional Labour console.');
  }
  if (input.sourceCycle.step !== 5 || input.sourceCycle.turn !== input.currentTurn) {
    throw new Error('Additional Labour is available after Vulcan maintenance in the current cycle.');
  }
  if (!input.sourceCycle.charges.includes(input.sourceConsoleId)) {
    throw new Error('That Additional Labour console is not charged.');
  }
  if (input.targetShipId === 'vulcan' || !chargeableConsoleIds(input.targetShipId).includes(input.targetConsoleId)) {
    throw new Error('Choose a permitted console on another active ship.');
  }
  if (input.targetDamage.destroyed) throw new Error('A destroyed ship cannot receive a console charge.');
  if (input.targetConsoleId !== 'jump-drive' && input.targetDamage.damagedSystemIds.includes(input.targetConsoleId)) {
    throw new Error('A damaged console cannot be charged.');
  }

  const targetCycle = cloneTargetCycle(input.targetCycle);
  if (targetCycle.charges.includes(input.targetConsoleId)) {
    throw new Error('That console is already charged this cycle.');
  }
  const chargedCycle: MaintenanceCycle = {
    ...targetCycle,
    charges: [...targetCycle.charges, input.targetConsoleId],
  };
  const metadata = consoleMetadataFor(input.targetShipId, input.targetConsoleId);
  const production = metadata?.resolver.status === 'implemented' &&
    metadata.resolver.id === 'maintenance.production';
  if (production && input.targetShipId === 'capybara' &&
      input.targetConsoleId === 'scrap-refinery' && input.productionScrap === undefined) {
    throw new Error('Choose a Scrap Refinery outcome.');
  }
  let resolvedCycle = chargedCycle;
  let targetResources = input.targetResources;
  let targetDamage = input.targetDamage;
  let targetUnrest = input.targetUnrest;
  let targetPopulation = input.targetPopulation;
  let targetCargo = input.targetCargo;
  let targetFuelled = input.targetFuelled;
  let message = `${metadata?.name ?? input.targetConsoleId} charged.`;

  if (production) {
    const result = resolveMaintenanceProduction({
      shipId: input.targetShipId,
      cycle: chargedCycle,
      currentTurn: input.currentTurn,
      expectedRevision: chargedCycle.revision,
      action: 'production',
      resources: input.targetResources,
      damage: input.targetDamage,
      unrest: input.targetUnrest,
      population: input.targetPopulation,
      dockings: input.targetDockings,
      cargo: input.targetCargo,
      fuelled: input.targetFuelled,
      rolls: [0, 0],
      entropy: 0,
      upgraded: input.targetUpgrades,
      productionConsoleId: input.targetConsoleId,
      productionScrap: input.productionScrap,
      productionOreAmount: input.productionOreAmount,
      now: input.now,
    } satisfies MaintenanceInput);
    resolvedCycle = {
      ...targetCycle,
      revision: result.cycle.revision,
      results: { ...result.cycle.results },
      charges: [...result.cycle.charges],
    };
    targetResources = result.resources;
    targetDamage = result.damage;
    targetUnrest = result.unrest;
    targetPopulation = result.population;
    targetCargo = result.cargo;
    targetFuelled = result.fuelled;
    message = result.cycle.results['5'] ?? `${metadata?.name ?? input.targetConsoleId} resolved.`;
  } else {
    resolvedCycle = { ...chargedCycle, revision: chargedCycle.revision + 1 };
  }

  return {
    sourceCycle: {
      ...input.sourceCycle,
      revision: input.sourceCycle.revision + 1,
      charges: input.sourceCycle.charges.filter((id) => id !== input.sourceConsoleId),
    },
    targetCycle: resolvedCycle,
    targetResources,
    targetDamage,
    targetUnrest,
    targetPopulation,
    targetCargo,
    targetFuelled,
    immediate: production,
    message,
  };
}

export function emptyTargetMaintenanceCycle(): MaintenanceCycle {
  return emptyMaintenanceCycle();
}
