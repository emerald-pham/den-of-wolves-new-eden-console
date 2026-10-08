import { isSupportedShipPopulation } from './shipPopulation';
import { RESOURCE_IDS, type ShipResourceInventory } from './resources';
import type { MissionRewardResourceId } from './missionCards';
import { CONSOLE_METADATA, consoleMetadataFor } from './consoleMetadata';
import { ENDEAVOUR_RESEARCH_TRACKS, type EndeavourResearchRewardEffect, type EndeavourResearchTrackId } from './endeavourResearch';
import type { MissionOpportunityRewardResult } from './missionRewards';

export type MissionRewardChoice =
  | Readonly<{ kind: 'research'; trackIds: readonly EndeavourResearchTrackId[] }>
  | Readonly<{ kind: 'consoles'; action: 'upgrade' | 'repair'; targets: readonly Readonly<{ shipId: string; systemId: string }>[] }>;
export interface MissionRewardSelection { readonly opportunityId: string; readonly choice: MissionRewardChoice }
export interface MissionRewardConsoleTarget {
  readonly shipId: string; readonly systemId: string; readonly name: string;
  readonly canUpgrade: boolean; readonly canRepair: boolean; readonly weapon: boolean;
}
export interface MissionRewardChoiceOptions {
  readonly opportunityId: string;
  readonly researchSelections: number;
  readonly researchTracks: readonly Readonly<{ trackId: EndeavourResearchTrackId; name: string }>[];
  readonly consoleActions: readonly Readonly<{ action: 'upgrade' | 'repair'; amount: number }>[];
  readonly consoleTargets: readonly MissionRewardConsoleTarget[];
}

/** Closed recipient projection vocabulary, also checked when replaying a protected command receipt. */
export function validMissionRewardChoiceProjection(options: unknown, selections: unknown): boolean {
  if (!Array.isArray(options) || !Array.isArray(selections) || options.length > 3 || selections.length > 3) return false;
  const ids = new Set<string>();
  for (const option of options) {
    if (!record(option) || Object.keys(option).length !== 5 || typeof option.opportunityId !== 'string' || ids.has(option.opportunityId) ||
        !Number.isSafeInteger(option.researchSelections) || (option.researchSelections as number) < 0 || (option.researchSelections as number) > 2 ||
        !Array.isArray(option.researchTracks) || !Array.isArray(option.consoleActions) || !Array.isArray(option.consoleTargets)) return false;
    ids.add(option.opportunityId);
    if ((option.researchSelections === 0) === (option.researchTracks.length > 0) ||
        (option.researchSelections === 0) === (option.consoleActions.length === 0) ||
        (option.researchSelections !== 0 && option.consoleTargets.length !== 0) ||
        new Set(option.researchTracks.map(track => record(track) ? track.trackId : undefined)).size !== option.researchTracks.length ||
        option.researchTracks.some(track => !record(track) || Object.keys(track).length !== 2 || typeof track.trackId !== 'string' ||
          !Object.hasOwn(ENDEAVOUR_RESEARCH_TRACKS, track.trackId) || track.name !== ENDEAVOUR_RESEARCH_TRACKS[track.trackId as EndeavourResearchTrackId].name) ||
        new Set(option.consoleActions.map(action => record(action) ? action.action : undefined)).size !== option.consoleActions.length ||
        option.consoleActions.some(action => !record(action) || Object.keys(action).length !== 2 || !['upgrade', 'repair'].includes(String(action.action)) ||
          !Number.isSafeInteger(action.amount) || (action.amount as number) < 1 || (action.amount as number) > 3)) return false;
    const targets = new Set<string>();
    for (const target of option.consoleTargets) {
      if (!record(target) || Object.keys(target).length !== 6 || typeof target.shipId !== 'string' || typeof target.systemId !== 'string') return false;
      const metadata = consoleMetadataFor(target.shipId, target.systemId);
      const key = `${target.shipId}:${target.systemId}`;
      if (!metadata || metadata.name !== target.name || targets.has(key) || typeof target.canUpgrade !== 'boolean' ||
          typeof target.canRepair !== 'boolean' || target.weapon !== (metadata.phase === 'Wolf attack')) return false;
      targets.add(key);
    }
  }
  const chosen = new Set<string>();
  return selections.every(selection => {
    if (!record(selection) || Object.keys(selection).length !== 2 || typeof selection.opportunityId !== 'string' || chosen.has(selection.opportunityId) || !record(selection.choice)) return false;
    chosen.add(selection.opportunityId);
    const option = options.find(candidate => candidate.opportunityId === selection.opportunityId) as MissionRewardChoiceOptions | undefined;
    if (!option) return false;
    const choice = selection.choice;
    if (choice.kind === 'research') return Object.keys(choice).length === 2 && Array.isArray(choice.trackIds) &&
      choice.trackIds.length === option.researchSelections && option.researchSelections > 0 && choice.trackIds.every(id => option.researchTracks.some(track => track.trackId === id));
    if (choice.kind !== 'consoles' || Object.keys(choice).length !== 3 || !Array.isArray(choice.targets) ||
        choice.targets.length !== option.consoleActions.find(action => action.action === choice.action)?.amount) return false;
    const targetIds = new Set<string>();
    return choice.targets.every(target => {
      if (!record(target) || Object.keys(target).length !== 2 || typeof target.shipId !== 'string' || typeof target.systemId !== 'string') return false;
      const key = `${target.shipId}:${target.systemId}`;
      if (targetIds.has(key)) return false;
      targetIds.add(key);
      // A stored recipient choice may outlive current eligibility; final redemption revalidates it.
      return option.consoleTargets.some(candidate => candidate.shipId === target.shipId && candidate.systemId === target.systemId);
    });
  });
}

/** Only printed choice effects need a recipient's targets. Automatic effects never become choices. */
export function missionRewardNeedsChoice(reward: MissionOpportunityRewardResult): boolean {
  return reward.effects.some(effect => ['crossOutResearchBoxes', 'unlockResearch', 'upgradeOrRepairConsoles', 'upgradeConsoles'].includes(effect.kind));
}

/** Validate the shape and printed count independently of current target availability. */
export function validMissionRewardChoice(reward: MissionOpportunityRewardResult, raw: unknown): raw is MissionRewardChoice {
  if (!record(raw) || reward.branch === 'none') return false;
  const effect = reward.effects.find(effect => ['crossOutResearchBoxes', 'unlockResearch', 'upgradeOrRepairConsoles', 'upgradeConsoles'].includes(effect.kind));
  if (!effect) return false;
  if (effect.kind === 'crossOutResearchBoxes' || effect.kind === 'unlockResearch') {
    return Object.keys(raw).length === 2 && raw.kind === 'research' && Array.isArray(raw.trackIds) &&
      raw.trackIds.length === effect.amount && raw.trackIds.every(id => typeof id === 'string' && Object.hasOwn(ENDEAVOUR_RESEARCH_TRACKS, id));
  }
  if (effect.kind !== 'upgradeOrRepairConsoles' && effect.kind !== 'upgradeConsoles') return false;
  const count = effect.kind === 'upgradeConsoles' ? raw.action === 'upgrade' ? effect.amount : undefined :
    effect.choices.find(choice => choice.action === raw.action)?.amount;
  if (raw.kind !== 'consoles' || Object.keys(raw).length !== 3 || !Array.isArray(raw.targets) || raw.targets.length !== count) return false;
  const keys = new Set<string>();
  return raw.targets.every(target => {
    if (!record(target) || Object.keys(target).length !== 2 || typeof target.shipId !== 'string' || typeof target.systemId !== 'string') return false;
    const metadata = consoleMetadataFor(target.shipId, target.systemId);
    const key = `${target.shipId}:${target.systemId}`;
    if (!metadata || keys.has(key) || (raw.action === 'upgrade' && metadata.upgrade.status !== 'printed') ||
        (effect.kind === 'upgradeOrRepairConsoles' && target.shipId !== effect.target) ||
        (effect.kind === 'upgradeConsoles' && effect.target === 'weapon' && metadata.phase !== 'Wolf attack')) return false;
    keys.add(key); return true;
  });
}

export function missionResearchRewardEffects(rewards: readonly MissionOpportunityRewardResult[], selections: readonly MissionRewardSelection[]): readonly EndeavourResearchRewardEffect[] {
  const effects: EndeavourResearchRewardEffect[] = [];
  for (const reward of rewards) for (const effect of reward.effects) {
    if (effect.kind === 'unlockNamedResearch') effects.push({ trackId: 'ecm-device', marks: 'complete' }, { trackId: 'jump-drive', marks: 'complete' });
    else if (effect.kind === 'crossOutResearchBoxes' || effect.kind === 'unlockResearch') {
      const choice = selections.find(selection => selection.opportunityId === reward.opportunityId)?.choice;
      if (!choice || !validMissionRewardChoice(reward, choice) || choice.kind !== 'research') throw new Error('Select the printed research targets first.');
      effects.push(...choice.trackIds.map(trackId => ({ trackId, marks: effect.kind === 'unlockResearch' ? 'complete' as const : 1 as const })));
    }
  }
  return effects;
}

/** Current, server-derived console availability for private selection and final redemption. */
export function missionRewardConsoleTargets(shipIds: readonly string[], upgrades: unknown, damage: unknown): readonly MissionRewardConsoleTarget[] {
  if ((upgrades !== undefined && !record(upgrades)) || (damage !== undefined && !record(damage))) throw new Error('Console reward authority is malformed.');
  const result: MissionRewardConsoleTarget[] = [];
  for (const shipId of shipIds) {
    const installed = record(upgrades) ? upgrades[shipId] ?? [] : [];
    const state = record(damage) ? damage[shipId] : undefined;
    if (!Array.isArray(installed) || installed.some(id => typeof id !== 'string' || !consoleMetadataFor(shipId, id)) || new Set(installed).size !== installed.length ||
        (state !== undefined && (!record(state) || typeof state.destroyed !== 'boolean' || !Array.isArray(state.damagedSystemIds) ||
          state.damagedSystemIds.some(id => typeof id !== 'string' || !consoleMetadataFor(shipId, id)) || new Set(state.damagedSystemIds).size !== state.damagedSystemIds.length))) {
      throw new Error('Console reward authority is malformed.');
    }
    if (record(state) && state.destroyed) continue;
    for (const [key, metadata] of Object.entries(CONSOLE_METADATA)) {
      if (metadata.shipId !== shipId) continue;
      const systemId = key.slice(shipId.length + 1);
      result.push({ shipId, systemId, name: metadata.name, canUpgrade: metadata.upgrade.status === 'printed' && !installed.includes(systemId),
        canRepair: record(state) && (state.damagedSystemIds as string[]).includes(systemId), weapon: metadata.phase === 'Wolf attack' });
    }
  }
  return result;
}

export function missionRewardChoiceOptions(rewards: readonly MissionOpportunityRewardResult[], targets: readonly MissionRewardConsoleTarget[]): readonly MissionRewardChoiceOptions[] {
  return rewards.filter(missionRewardNeedsChoice).map(reward => {
    const effect = reward.effects.find(effect => ['crossOutResearchBoxes', 'unlockResearch', 'upgradeOrRepairConsoles', 'upgradeConsoles'].includes(effect.kind))!;
    const research = effect.kind === 'crossOutResearchBoxes' || effect.kind === 'unlockResearch';
    return { opportunityId: reward.opportunityId, researchSelections: research ? effect.amount : 0,
      researchTracks: research ? Object.entries(ENDEAVOUR_RESEARCH_TRACKS).map(([trackId, { name }]) => ({ trackId: trackId as EndeavourResearchTrackId, name })) : [],
      consoleActions: effect.kind === 'upgradeOrRepairConsoles' ? effect.choices : effect.kind === 'upgradeConsoles' ? [{ action: 'upgrade' as const, amount: effect.amount }] : [],
      consoleTargets: targets.filter(target => effect.kind === 'upgradeOrRepairConsoles' ? target.shipId === effect.target && (target.canRepair || target.canUpgrade) :
        effect.kind === 'upgradeConsoles' ? target.canUpgrade && (effect.target !== 'weapon' || target.weapon) : false),
    };
  });
}

/** Reward consoles use the existing upgrade/damage authorities and never purchase materials. */
export function planMissionConsoleRewards(rewards: readonly MissionOpportunityRewardResult[], selections: readonly MissionRewardSelection[], shipIds: readonly string[], upgrades: unknown, damage: unknown): Readonly<Record<string, unknown>> {
  const available = missionRewardConsoleTargets(shipIds, upgrades, damage);
  const patch: Record<string, unknown> = {};
  const touched = new Set<string>();
  for (const reward of rewards.filter(missionRewardNeedsChoice)) {
    const choice = selections.find(selection => selection.opportunityId === reward.opportunityId)?.choice;
    if (!choice || !validMissionRewardChoice(reward, choice)) throw new Error('Select the printed reward targets first.');
    if (choice.kind !== 'consoles') continue;
    for (const { shipId, systemId } of choice.targets) {
      const key = `${shipId}:${systemId}`;
      const target = available.find(candidate => candidate.shipId === shipId && candidate.systemId === systemId);
      if (!target || touched.has(key) || !(choice.action === 'upgrade' ? target.canUpgrade : target.canRepair)) throw new Error('A selected console is no longer eligible for this reward.');
      touched.add(key);
      if (choice.action === 'upgrade') {
        const field = `shipUpgrades.${shipId}`;
        patch[field] = [...(patch[field] as string[] ?? (record(upgrades) ? upgrades[shipId] as string[] ?? [] : [])), systemId];
      } else {
        const field = `shipDamage.${shipId}`;
        const state = patch[field] ?? (record(damage) ? damage[shipId] : undefined);
        if (!record(state)) throw new Error('Repair reward damage authority is unavailable.');
        patch[field] = { ...state, damagedSystemIds: (state.damagedSystemIds as string[]).filter(id => id !== systemId) };
      }
    }
  }
  return patch;
}

interface RewardAmounts { readonly resources: unknown }
export interface MissionRewardDeliveryInput {
  readonly shipId: string;
  readonly inventory: unknown;
  readonly population: unknown;
  readonly minerals: unknown;
  readonly rewards: readonly RewardAmounts[];
  readonly specialRewards: readonly RewardAmounts[];
}

export interface BoaMissionRewardDeliveryInput extends MissionRewardDeliveryInput {
  readonly boaReclamationOpportunityId: string;
  readonly boaScrapCargo: unknown;
}

export interface BoaMissionRewardDeliveryPlan {
  readonly inventory: ShipResourceInventory;
  readonly population: number;
  readonly minerals: number;
  readonly deltas: Readonly<Partial<Record<MissionRewardResourceId, number>>>;
  readonly boaScrapAwarded: 0 | 1;
  readonly boaScrapCargo: Readonly<{ scrap?: number }>;
}

/** Strict ledger arithmetic: printed minerals remain cargo, never invented ore. */
export function planMissionRewardDelivery(input: MissionRewardDeliveryInput): {
  readonly inventory: ShipResourceInventory;
  readonly population: number;
  readonly minerals: number;
  readonly deltas: Readonly<Partial<Record<MissionRewardResourceId, number>>>;
} | null {
  if (!record(input.inventory) || !amount(input.population) || !amount(input.minerals) ||
      !Array.isArray(input.rewards) || !Array.isArray(input.specialRewards)) return null;
  const inventory = { ...input.inventory };
  for (const id of RESOURCE_IDS) {
    if (id === 'scrap' && inventory[id] === undefined) continue;
    if (!amount(inventory[id])) return null;
  }
  const deltas: Partial<Record<MissionRewardResourceId, number>> = {};
  const validIds = new Set<string>([...RESOURCE_IDS, 'survivors', 'minerals']);
  for (const reward of [...input.rewards, ...input.specialRewards]) {
    if (!record(reward) || !record(reward.resources)) return null;
    for (const [id, value] of Object.entries(reward.resources)) {
      if (!validIds.has(id) || !amount(value)) return null;
      const key = id as MissionRewardResourceId;
      const total = (deltas[key] ?? 0) + value;
      if (!amount(total)) return null;
      deltas[key] = total;
    }
  }
  for (const id of RESOURCE_IDS) {
    if ((deltas[id] ?? 0) === 0) continue;
    const total = (inventory[id] ?? 0) as number;
    if (!amount(total + deltas[id]!)) return null;
    inventory[id] = total + deltas[id]!;
  }
  const population = input.population + (deltas.survivors ?? 0);
  const minerals = input.minerals + (deltas.minerals ?? 0);
  if (!isSupportedShipPopulation(input.shipId, population) || !amount(minerals)) return null;
  return { inventory: inventory as unknown as ShipResourceInventory, population, minerals, deltas };
}

/** Route the one selected Boa reclamation reward to the shuttle's Scrap-only cargo. */
export function planBoaMissionRewardDelivery(
  input: BoaMissionRewardDeliveryInput,
): BoaMissionRewardDeliveryPlan | null {
  if (!record(input) || typeof input.boaReclamationOpportunityId !== 'string' ||
      input.boaReclamationOpportunityId.length === 0 || !Array.isArray(input.rewards)) return null;
  const cargo = input.boaScrapCargo === undefined ? {} : input.boaScrapCargo;
  if (!record(cargo) || Object.keys(cargo).some((key) => key !== 'scrap') ||
      cargo.scrap !== undefined && !amount(cargo.scrap)) return null;
  const matches = input.rewards.filter((reward) => record(reward) &&
    reward.opportunityId === input.boaReclamationOpportunityId);
  if (matches.length !== 1) return null;
  const selected = matches[0] as unknown as Record<string, unknown>;
  const selectedResources = selected.resources;
  const effects = selected.effects;
  if (!record(selectedResources) || !Array.isArray(effects) || effects.length !== 0 ||
      selected.bulkHaulageApplied !== false) return null;
  let boaScrapAwarded: 0 | 1;
  if (selected.branch === 'none') {
    if (Object.keys(selectedResources).length !== 0) return null;
    boaScrapAwarded = 0;
  } else if (selected.branch === 'success' || selected.branch === 'critical') {
    if (Object.keys(selectedResources).length !== 1 || selectedResources.scrap !== 1) return null;
    boaScrapAwarded = 1;
  } else return null;

  const currentScrap = cargo.scrap ?? 0;
  if (boaScrapAwarded === 1 && currentScrap >= Number.MAX_SAFE_INTEGER) return null;
  const filteredRewards = input.rewards.map((reward) => {
    if (!record(reward) || reward.opportunityId !== input.boaReclamationOpportunityId) return reward;
    return { ...reward, resources: {} };
  });
  const delivery = planMissionRewardDelivery({
    shipId: input.shipId,
    inventory: input.inventory,
    population: input.population,
    minerals: input.minerals,
    rewards: filteredRewards,
    specialRewards: input.specialRewards,
  });
  if (!delivery) return null;
  const nextScrap = currentScrap + boaScrapAwarded;
  return {
    ...delivery,
    boaScrapAwarded,
    boaScrapCargo: nextScrap === 0 ? {} : { scrap: nextScrap },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function amount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
