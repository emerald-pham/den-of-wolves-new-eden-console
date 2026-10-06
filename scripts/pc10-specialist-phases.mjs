import assert from 'node:assert/strict';
import { createSpecialistGameplayCallback } from './pc10-specialist-gameplay.mjs';

/**
 * Ordinary, currently rendered actions for the bounded specialist walkthrough.
 * These are proof-driver registrations, not server or product authority rules.
 * Every action still goes through the selected role's real UI POST, exact same
 * actor Firebase SDK replay, and source-specific projection inspection.
 */
export const PC10_SPECIALIST_ACTIONS = Object.freeze({
  'wing-starlight-scout': Object.freeze({ roleId: 'wing-commander', endpoint: 'requestScout',
    shuttleId: 'starlight', regionName: 'Starlight scouting request', buttonName: 'Record request', required: ['targetCoordinate'] }),
  'wing-build': Object.freeze({ roleId: 'wing-commander', endpoint: 'buildFighter',
    buttonName: 'Build 1 fighter // 1 material', required: ['wingId'],
    cost: { resource: 'material', amount: 1, result: '1 fighter' } }),
  'wing-launch': Object.freeze({ roleId: 'wing-commander', endpoint: 'launchAegisFighterWing',
    regionName: 'AEGIS fighter wing launches', required: ['wingLabel'] }),
  'scientist-standard-research': Object.freeze({ roleId: 'shepherd-scientist', endpoint: 'advanceEndeavourResearchTrack',
    regionName: 'Endeavour research controls', buttonName: 'Advance standard research', required: ['trackId'] }),
  'scientist-advanced-research': Object.freeze({ roleId: 'shepherd-scientist', endpoint: 'advanceEndeavourResearchTrack',
    regionName: 'Endeavour research controls', buttonName: 'Advance with 5 Shepherd ore', required: ['trackId'],
    cost: { resource: 'Shepherd ore', amount: 5 } }),
  'scientist-ecm': Object.freeze({ roleId: 'shepherd-scientist', endpoint: 'activateEndeavourEcmDevice',
    regionName: 'Endeavour ECM Device controls', buttonName: 'Use ECM Device', required: [] }),
  'scientist-scout': Object.freeze({ roleId: 'shepherd-scientist', endpoint: 'requestScout',
    shuttleId: 'endeavour', regionName: 'Endeavour scouting request', buttonName: 'Record request', required: ['targetCoordinate'] }),
  'scientist-field-upgrade': Object.freeze({ roleId: 'shepherd-scientist', endpoint: 'upgradeEndeavourFieldTargets',
    regionName: 'Endeavour field-upgrade purchase controls', buttonName: 'Purchase selected upgrades',
    required: ['targets', 'prepare'] }),
  'scientist-mission': Object.freeze({ roleId: 'shepherd-scientist', endpoint: 'commitAwayMissionLifecycleCommand',
    required: ['prepare', 'missionId', 'missionChoice', 'buttonName'] }),
  'explorer-scout': Object.freeze({ roleId: 'quellon-explorer', endpoint: 'requestScout',
    shuttleId: 'hummingbird', regionName: 'Hummingbird scouting request', buttonName: 'Record request', required: ['targetCoordinate'] }),
  'explorer-harvest-roll': Object.freeze({ roleId: 'quellon-explorer', endpoint: 'rollHummingbirdHarvest',
    shuttleId: 'hummingbird', regionName: 'Hummingbird resource harvesting', buttonName: 'Roll 2d6 for harvest', required: [] }),
  'explorer-harvest-allocation': Object.freeze({ roleId: 'quellon-explorer', endpoint: 'allocateHummingbirdHarvest',
    shuttleId: 'hummingbird', regionName: 'Hummingbird resource harvesting', required: ['foodDieIndex'] }),
  'explorer-mission': Object.freeze({ roleId: 'quellon-explorer', endpoint: 'commitAwayMissionLifecycleCommand',
    required: ['prepare', 'missionId', 'missionChoice', 'buttonName'] }),
  'explorer-route-request': Object.freeze({ roleId: 'quellon-explorer', endpoint: 'requestShuttleDeparture',
    shuttleId: 'hummingbird', regionName: 'Shuttle departure', buttonName: 'Request departure',
    required: ['destinationShipId'] }),
  'explorer-route-transit': Object.freeze({ roleId: 'quellon-explorer', endpoint: 'beginShuttleTransit',
    shuttleId: 'hummingbird', regionName: 'Shuttle departure', buttonName: 'Begin transit', required: [] }),
  'explorer-route-retarget': Object.freeze({ roleId: 'quellon-explorer', endpoint: 'retargetShuttleTransit',
    shuttleId: 'hummingbird', regionName: 'Shuttle departure', buttonName: 'Retarget shuttle',
    required: ['destinationShipId'] }),
  'explorer-route-arrival': Object.freeze({ roleId: 'quellon-explorer', endpoint: 'completeShuttleArrival',
    shuttleId: 'hummingbird', regionName: 'Shuttle departure', required: [] }),
  'pdf-escort-launch': Object.freeze({ roleId: 'refinery-124-pdf-colonel', endpoint: 'launchPdfEscortWing',
    buttonName: 'Launch PDF Escort Wing', required: [] }),
  'pdf-group-relay': Object.freeze({ roleId: 'refinery-124-pdf-colonel', endpoint: 'sendFleetGroupMessage',
    regionName: 'PDF Colonel group news relay', buttonName: 'Relay message to current group', required: ['message'] }),
  'pdf-boarding-defense': Object.freeze({ endpoint: 'commitWolfBoardingDefenceChoice',
    buttonName: 'Commit defence', required: ['defenseRoleId', 'targetShipId', 'securityTeams'] }),
  'pdf-mission': Object.freeze({ roleId: 'refinery-124-pdf-colonel', endpoint: 'commitAwayMissionLifecycleCommand',
    required: ['prepare', 'missionId', 'missionChoice', 'buttonName'] }),
  'boa-recycle': Object.freeze({ roleId: 'capybara-recycler', endpoint: 'recycleWithBoa',
    shuttleId: 'boa', regionName: 'Boa recycling', required: ['recipe', 'amount'] }),
  'boa-reclamation': Object.freeze({ roleId: 'capybara-recycler', endpoint: 'chooseBoaMissionReclamationOpportunity',
    shuttleId: 'boa', regionName: 'Boa mission reclamation', required: ['opportunityLabel', 'taskOpportunityId'] }),
  'boa-scrap-collection': Object.freeze({ roleId: 'capybara-recycler', endpoint: 'resolveWolfAttackAftermath',
    shuttleId: 'boa', regionName: 'Boa Scrap collection', required: ['targetShipId'] }),
  'macaw-repair': Object.freeze({ roleId: 'capybara-captain', endpoint: 'repairConsolesFromMacaw',
    shuttleId: 'macaw', regionName: 'Macaw console repair', buttonName: 'Repair selected consoles', required: ['systemIds', 'systemLabels'] }),
  'macaw-salvage-propose': Object.freeze({ roleId: 'capybara-captain', endpoint: 'proposePermissionedDismantling',
    shuttleId: 'macaw',
    regionName: 'Permissioned dismantling proposal', buttonName: 'Request target-player permission',
    required: ['targetRoleId', 'targetShipId', 'targetConsoleId', 'targetConsoleLabel'] }),
  'macaw-salvage-consent': Object.freeze({ endpoint: 'consentToPermissionedDismantling',
    regionName: 'Permissioned dismantling request', buttonName: 'Grant permission',
    required: ['targetRoleId', 'targetShipId', 'proposalId'] }),
  'macaw-salvage-apply': Object.freeze({ roleId: 'capybara-captain', endpoint: 'applyPermissionedDismantling',
    shuttleId: 'macaw',
    regionName: 'Permissioned dismantling proposal', buttonName: 'Apply consented dismantling',
    required: ['proposalId', 'consentId', 'targetRoleId', 'targetShipId'] }),
  'macaw-scrap-collection': Object.freeze({ roleId: 'capybara-captain', endpoint: 'resolveWolfAttackAftermath',
    shuttleId: 'macaw', regionName: 'Macaw Scrap collection', required: ['targetShipId'] }),
});

const BOA_RECIPES = Object.freeze({
  food: { resource: 'food', amount: 6, label: '6 Food' },
  water: { resource: 'water', amount: 6, label: '6 Water' },
  ore: { resource: 'ore', amount: 6, label: '6 Ore' },
  materials: { resource: 'materials', amount: 3, label: '3 Materials' },
  fuel: { resource: 'fuel', amount: 6, label: '6 Fuel' },
});

function uncredited(actionId, reason, fields = {}) {
  return { status: 'uncredited', actionId, reason, ...fields };
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field) && value[field] !== undefined && value[field] !== null;
}

function shipLabel(shipId) {
  return String(shipId).replaceAll('-', ' ').toUpperCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function regionFor(page, regionName) {
  return regionName ? page.getByRole('region', { name: regionName, exact: true }) : page;
}

async function enterActionConsole(page, actionId, spec, inputs) {
  if (typeof inputs.enterConsole === 'function') {
    return (await inputs.enterConsole({ page, actionId, roleId: inputs.roleId ?? spec.roleId })) !== false;
  }
  if (!spec.shuttleId) return true;
  const url = new URL(page.url());
  if (url.hash.endsWith(`/shuttles/${spec.shuttleId}`)) return true;
  const shortName = spec.shuttleId.charAt(0).toUpperCase() + spec.shuttleId.slice(1);
  const link = page.getByRole('link', { name: `Open ${shortName} shuttle console`, exact: true });
  if (!(await link.isVisible()) || !(await link.isEnabled())) return false;
  await link.click();
  await page.waitForURL(current => current.hash.endsWith(`/shuttles/${spec.shuttleId}`));
  return true;
}

function buttonNameFor(actionId, action, inputs) {
  switch (actionId) {
    case 'wing-launch':
      return `Launch ${inputs.wingLabel}`;
    case 'explorer-route-arrival':
      return /^(?:Complete arrival|Retry arrival)$/;
    case 'explorer-harvest-allocation':
      return new RegExp(`^Die ${Number(inputs.foodDieIndex) + 1}:`);
    case 'boa-recycle': {
      const recipe = BOA_RECIPES[inputs.recipe];
      return new RegExp(`^Recycle ${escapeRegExp(recipe.label)} for 1 Scrap$`);
    }
    case 'explorer-route-request':
    case 'explorer-route-retarget':
      return action.buttonName;
    case 'boa-reclamation':
      return `Apply Boa reclamation to ${inputs.taskOpportunityId}`;
    case 'macaw-scrap-collection':
    case 'boa-scrap-collection':
      return `Collect Scrap from ${shipLabel(inputs.targetShipId)}`;
    default:
      return action.buttonName;
  }
}

function buttonFor(region, actionId, inputs, name) {
  if (actionId === 'wing-build') {
    const wingName = inputs.wingId === 'fighter-wing-alpha' ? 'Fighter Wing Alpha'
      : inputs.wingId === 'fighter-wing-bravo' ? 'Fighter Wing Bravo' : null;
    if (!wingName) return null;
    return region.locator('.aegis-craft').filter({ hasText: wingName })
      .getByRole('button', { name: 'Build 1 fighter // 1 material', exact: true });
  }
  return region.getByRole('button', { name, exact: typeof name === 'string' });
}

async function prepareActionUi(actionId, spec, inputs, page, region) {
  if (typeof inputs.prepare === 'function') {
    return (await inputs.prepare({ page, region, actionId, inputs })) !== false;
  }
  switch (actionId) {
    case 'wing-starlight-scout':
    case 'scientist-scout':
    case 'explorer-scout':
      await region.getByLabel('Printed system coordinate', { exact: true }).fill(inputs.targetCoordinate);
      return true;
    case 'scientist-standard-research':
    case 'scientist-advanced-research':
      await region.getByLabel('Research track', { exact: true }).selectOption(inputs.trackId);
      return true;
    case 'explorer-harvest-allocation':
      if (![0, 1].includes(inputs.foodDieIndex)) return false;
      return true;
    case 'explorer-route-request':
      return selectVisibleOption(region.getByLabel('Destination ship', { exact: true }), inputs.destinationShipId);
    case 'explorer-route-retarget':
      return selectVisibleOption(region.getByLabel('New destination ship', { exact: true }), inputs.destinationShipId);
    case 'pdf-group-relay':
      if (typeof inputs.message !== 'string' || inputs.message.trim().length === 0 || inputs.message.length > 240) return false;
      await region.getByLabel('Message to current fleet group', { exact: true }).fill(inputs.message);
      return true;
    case 'boa-recycle': {
      const recipe = BOA_RECIPES[inputs.recipe];
      if (!recipe || inputs.amount !== recipe.amount) return false;
      await region.getByLabel('Resource to recycle', { exact: true }).selectOption(inputs.recipe);
      return true;
    }
    case 'boa-reclamation': {
      const locations = region.getByRole('region', { name: 'Current fleet mission locations', exact: true });
      const location = locations.getByRole('button', { name: inputs.opportunityLabel, exact: true });
      if (!(await location.isVisible()) || !(await location.isEnabled())) return false;
      await location.click();
      const task = region.getByRole('radio', {
        name: new RegExp(`^${escapeRegExp(inputs.taskOpportunityId)} \/\/`),
      });
      if (!(await task.isVisible()) || !(await task.isEnabled())) return false;
      await task.check();
      return true;
    }
    case 'macaw-repair': {
      if (!Array.isArray(inputs.systemIds) || inputs.systemIds.length < 1 || inputs.systemIds.length > 2) return false;
      if (new Set(inputs.systemIds).size !== inputs.systemIds.length) return false;
      if (!inputs.systemIds.every(id => typeof inputs.systemLabels[id] === 'string')) return false;
      for (const id of inputs.systemIds) {
        const checkbox = region.getByRole('checkbox', { name: inputs.systemLabels[id], exact: true });
        if (!(await checkbox.isVisible()) || !(await checkbox.isEnabled())) return false;
        await checkbox.check();
      }
      return true;
    }
    case 'macaw-salvage-propose': {
      const selector = region.getByLabel('Undamaged target console', { exact: true });
      if (!(await selector.isVisible()) || !(await selector.isEnabled())) return false;
      await selector.selectOption(inputs.targetConsoleId);
      return true;
    }
    case 'pdf-boarding-defense': {
      if (!Number.isSafeInteger(inputs.securityTeams) || inputs.securityTeams < 0) return false;
      const selector = region.getByLabel('Security Teams committed', { exact: true });
      if (!(await selector.isVisible()) || !(await selector.isEnabled())) return false;
      await selector.selectOption(String(inputs.securityTeams));
      return true;
    }
    case 'scientist-field-upgrade':
    case 'scientist-mission':
    case 'explorer-mission':
    case 'pdf-mission':
      return false;
    default:
      return true;
  }
}

async function selectVisibleOption(selector, value) {
  const isVisible = await selector.isVisible();
  const isEnabled = await selector.isEnabled();
  if (!isVisible || !isEnabled) return false;
  const values = await selector.locator('option').evaluateAll(options => options.map(option => option.value));
  if (!values.includes(value)) return false;
  await selector.selectOption(value);
  return true;
}

/** Execute one named ordinary UI action; omitted, blocked, or unavailable choices remain uncredited. */
export async function runPc10SpecialistAction({
  game, driver, actionId, inspect, cost, ...inputs
}) {
  const spec = PC10_SPECIALIST_ACTIONS[actionId];
  if (!spec) return uncredited(actionId, 'action-not-in-proof-catalog');
  if (typeof inspect !== 'function') return uncredited(actionId, 'source-projection-inspector-required');
  const missing = spec.required.filter(field => !hasOwn(inputs, field));
  if (missing.length) return uncredited(actionId, 'explicit-choice-required', { missingChoices: missing });

  if (actionId === 'boa-recycle' &&
      (!BOA_RECIPES[inputs.recipe] || inputs.amount !== BOA_RECIPES[inputs.recipe].amount)) {
    return uncredited(actionId, 'recipe-cost-does-not-match-printed-option');
  }
  if (actionId === 'explorer-harvest-allocation' && ![0, 1].includes(inputs.foodDieIndex)) {
    return uncredited(actionId, 'select-one-of-the-two-currently-rendered-dice');
  }
  if (actionId === 'wing-build' && !['fighter-wing-alpha', 'fighter-wing-bravo'].includes(inputs.wingId)) {
    return uncredited(actionId, 'choose-one-current-fighter-wing');
  }
  if (actionId === 'pdf-group-relay' &&
      (typeof inputs.message !== 'string' || inputs.message.trim().length === 0 || inputs.message.length > 240)) {
    return uncredited(actionId, 'current-group-message-must-be-1-to-240-characters');
  }
  if (actionId === 'macaw-salvage-propose' || actionId === 'macaw-salvage-consent' || actionId === 'macaw-salvage-apply') {
    if (inputs.targetShipId === 'capybara' || inputs.targetRoleId === 'capybara-captain') {
      return uncredited(actionId, 'self-target-prohibited-pending-facilitator-ruling');
    }
    if (inputs.targetRoleId && !game.context.roster?.some(entry => entry.roleId === inputs.targetRoleId)) {
      return uncredited(actionId, 'target-role-not-in-fresh-admitted-roster');
    }
  }
  if (actionId === 'boa-reclamation' && !inputs.taskOpportunityId) {
    return uncredited(actionId, 'printed-mission-task-choice-required');
  }

  const roleId = actionId === 'pdf-boarding-defense' ? inputs.defenseRoleId
    : actionId === 'macaw-salvage-consent' ? inputs.targetRoleId
      : spec.roleId;
  if (!game?.context?.initial?.sessionId || typeof game.select !== 'function') {
    return uncredited(actionId, 'fresh-connected-game-adapter-required');
  }
  if (typeof driver?.capture !== 'function') return uncredited(actionId, 'projection-verified-specialist-driver-required');
  if (!roleId || !game.context.roster?.some(entry => entry.roleId === roleId)) {
    return uncredited(actionId, 'ordinary-role-not-in-fresh-admitted-roster');
  }
  const surface = await game.select(roleId);
  const actor = await surface.observe();
  if (actor?.sameActor !== true || actor.sessionId !== game.context.initial.sessionId ||
      actor.profileRoleId !== roleId || actor.activeConsoleRoleId !== roleId ||
      actor.connection !== 'live' || actor.freshness !== 'server') {
    return uncredited(actionId, 'current-normally-authenticated-role-console-not-ready');
  }
  if (!(await enterActionConsole(surface.page, actionId, spec, { ...inputs, roleId }))) {
    return uncredited(actionId, 'assigned-shuttle-console-link-not-currently-offered');
  }

  const regionName = inputs.regionName ?? spec.regionName ?? (actionId === 'pdf-boarding-defense'
    ? `${shipLabel(inputs.targetShipId)} boarding defence` : undefined);
  const region = regionFor(surface.page, regionName);
  // The driver's last rich select navigates back from a shuttle. Defer the
  // Scout form's sole fill until that navigation completes; never refill it.
  const prepareScout = spec.endpoint === 'requestScout';
  const prepared = prepareScout || await prepareActionUi(actionId, spec, inputs, surface.page, region);
  if (!prepared) return uncredited(actionId, 'explicit-choice-not-currently-offered');
  const name = inputs.buttonName ?? buttonNameFor(actionId, spec, inputs);
  if (!name && actionId !== 'wing-build') return uncredited(actionId, 'source-button-selector-required');
  const control = buttonFor(region, actionId, inputs, name);
  if (!control) return uncredited(actionId, 'source-button-selector-required');
  if (!prepareScout && (!(await control.isVisible()) || !(await control.isEnabled()))) {
    return uncredited(actionId, 'control-not-currently-offered');
  }
  const selectedCost = cost ?? inputs.cost ?? spec.cost ?? (actionId === 'boa-recycle'
    ? { resource: BOA_RECIPES[inputs.recipe].resource, amount: BOA_RECIPES[inputs.recipe].amount, result: '1 Scrap' }
    : actionId === 'macaw-repair'
      ? { resource: 'Capybara Scrap', amount: inputs.systemIds.length,
        result: `${inputs.systemIds.length} repaired console${inputs.systemIds.length === 1 ? '' : 's'}` }
      : actionId === 'macaw-salvage-apply' || actionId === 'macaw-scrap-collection' || actionId === 'boa-scrap-collection'
        ? { result: '1 Scrap' }
        : null);
  async function currentControl(page) {
    const clickRegion = regionFor(page, regionName);
    const clickControl = buttonFor(clickRegion, actionId, inputs, name);
    assert.equal(await clickControl.isVisible(), true, `The ordinary ${actionId} control remains visible before click.`);
    assert.equal(await clickControl.isEnabled(), true, `The ordinary ${actionId} control is enabled before click.`);
    return clickControl;
  }
  const captured = await driver.capture({
    roleId,
    endpoint: spec.endpoint,
    originalActor: actor,
    cost: selectedCost,
    inspect,
    prepare: async page => {
      if (!(await enterActionConsole(page, actionId, spec, { ...inputs, roleId }))) {
        throw new Error(`The ordinary ${actionId} shuttle console link is no longer available.`);
      }
      if (prepareScout) assert.equal(await prepareActionUi(actionId, spec, inputs, page, regionFor(page, regionName)), true,
        `The explicit ${actionId} source choice is ready before observation.`);
      await currentControl(page);
    },
    click: async page => {
      if (spec.shuttleId) assert.equal(new URL(page.url()).hash.endsWith(`/shuttles/${spec.shuttleId}`), true,
        `The original ${actionId} shuttle console remains current before click.`);
      const clickControl = await currentControl(page);
      await clickControl.click();
    },
  });
  return { status: captured?.failed ? 'failed' : 'captured', actionId, roleId, endpoint: spec.endpoint,
    ...(captured?.evidence ? { evidence: captured.evidence } : {}) };
}

/** Create a concrete step function which a fresh-game run can pass to the proof driver. */
export function makePc10SpecialistActionStep(actionId, choices = {}) {
  return runtime => runPc10SpecialistAction({ ...runtime, actionId, ...choices });
}

/** Run one real Capybara maintenance cycle through the adapter's UI receipt/replay routine. */
export async function runCapybaraMaintenanceCycle({ game, context = game?.context, cycle, refuelCraft }) {
  if (!Number.isSafeInteger(cycle) || cycle < 1) return { status: 'uncredited', reason: 'invalid-cycle', cycle };
  if (refuelCraft !== null && !['boa', 'macaw'].includes(refuelCraft)) {
    return { status: 'uncredited', reason: 'explicit-refuel-choice-required', cycle };
  }
  if (!context?.roster?.some(entry => entry.roleId === 'capybara-recycler')) {
    return { status: 'uncredited', reason: 'ordinary-recyclotron-not-in-fresh-admitted-roster', cycle };
  }
  if (!game?.context?.gm || typeof game.state !== 'function' || typeof game.maintenanceUi !== 'function') {
    return { status: 'uncredited', reason: 'connected-maintenance-ui-required', cycle };
  }
  const before = await game.state(game.context.gm);
  if (before?.sessionId !== context.initial?.sessionId || before?.live !== true || before?.phase !== 'active') {
    return { status: 'uncredited', reason: 'fresh-live-active-game-required', cycle };
  }
  if (before.cycle !== cycle) return { status: 'uncredited', reason: 'expected-cycle-not-live', cycle };
  if (before.turnPhase?.airspace?.state !== 'restricted') {
    return { status: 'uncredited', reason: 'maintenance-phase-not-currently-open', cycle };
  }
  if (!Array.isArray(before.activeVesselIds) || !before.activeVesselIds.includes('capybara')) {
    return { status: 'uncredited', reason: 'capybara-not-active', cycle };
  }
  const prior = before.maintenanceCycles?.capybara;
  if (prior?.turn === cycle && prior.step === 0 && prior.completedAt) {
    return { status: 'uncredited', reason: 'maintenance-cycle-already-completed', cycle };
  }
  if (prior?.turn === cycle && Number.isSafeInteger(prior.step) && prior.step > 0) {
    return { status: 'uncredited', reason: 'maintenance-cycle-already-in-progress', cycle };
  }
  if (refuelCraft !== null) {
    const isDockedHere = before.shuttleDockings?.some(docking =>
      docking?.shuttleId === refuelCraft && docking.shipId === 'capybara');
    if (!isDockedHere) return { status: 'uncredited', reason: 'selected-craft-not-docked-at-capybara', cycle };
    if (before.shuttleFuelled?.[refuelCraft] === true) {
      return { status: 'uncredited', reason: 'craft-already-fuelled', cycle };
    }
    if ((before.shipResources?.capybara?.fuel ?? 0) < 1) {
      return { status: 'uncredited', reason: 'insufficient-current-fuel-for-refuel', cycle };
    }
    const damage = before.shipDamage?.capybara;
    if (damage?.destroyed === true || damage?.damagedSystemIds?.includes('shuttle-bay')) {
      return { status: 'uncredited', reason: 'current-shuttle-bay-cannot-refuel', cycle };
    }
  }
  const completed = await game.maintenanceUi('capybara', 'capybara-recycler', {
    consoles: [], refuels: refuelCraft === null ? {} : { 'Shuttle Bay': refuelCraft },
  });
  const after = await game.state(game.context.gm);
  assert.equal(after?.sessionId, before.sessionId);
  assert.equal(after?.cycle, cycle, 'The caller controls normal phase/cycle advancement.');
  assert.equal(completed?.turn, cycle, 'Use the real maintenance receipt cycle.');
  assert.equal(completed?.step, 0);
  assert.ok(completed?.completedAt, 'The Recyclotron UI must show a completed server maintenance receipt.');
  assert.equal(after.maintenanceCycles?.capybara?.turn, cycle);
  assert.equal(after.maintenanceCycles?.capybara?.step, 0);
  assert.ok(after.maintenanceCycles?.capybara?.completedAt);
  return { status: 'completed', cycle, roleId: 'capybara-recycler', refueledCraft: refuelCraft };
}

/**
 * Place caller-owned callbacks around actions without taking ownership of game
 * transitions. A base phase may perform ordinary UI work between cycle 1 and 2;
 * candidate and terminal callbacks remain genuine source-owned callbacks.
 */
export function composePc10SpecialistSteps({
  beforeSpecialists,
  cycleOne = [],
  betweenCycles,
  cycleTwo = [],
  afterSpecialists,
  candidateEnding,
  terminalEnding,
}) {
  for (const [name, steps] of [['cycleOne', cycleOne], ['cycleTwo', cycleTwo]]) {
    if (!Array.isArray(steps) || !steps.every(step => typeof step === 'function')) {
      throw new TypeError(`${name} must be an array of ordinary specialist phase callbacks.`);
    }
  }
  for (const [name, callback] of Object.entries({ beforeSpecialists, betweenCycles, afterSpecialists, candidateEnding, terminalEnding })) {
    if (callback !== undefined && typeof callback !== 'function') throw new TypeError(`${name} must be a caller-owned callback.`);
  }
  return [
    ...(beforeSpecialists ? [beforeSpecialists] : []),
    ...cycleOne,
    ...(betweenCycles ? [betweenCycles] : []),
    ...cycleTwo,
    ...(afterSpecialists ? [afterSpecialists] : []),
    ...(candidateEnding ? [candidateEnding] : []),
    ...(terminalEnding ? [terminalEnding] : []),
  ];
}

function compilePhaseActions(actions) {
  if (!Array.isArray(actions)) throw new TypeError('Each specialist cycle must be an array of phase actions.');
  return actions.map(action => {
    if (typeof action === 'function') return action;
    if (!action || typeof action !== 'object' || typeof action.actionId !== 'string') {
      throw new TypeError('Phase entries must be callbacks or named ordinary actions.');
    }
    if (action.actionId === 'capybara-maintenance') {
      return ({ game, context }) => runCapybaraMaintenanceCycle({ game, context,
        cycle: action.cycle, refuelCraft: action.refuelCraft });
    }
    const { actionId, ...choices } = action;
    return makePc10SpecialistActionStep(actionId, choices);
  });
}

/** Compile a two-cycle action plan while leaving real transition and ending callbacks caller-owned. */
export function createPc10SpecialistPhaseSteps(plan = {}) {
  return composePc10SpecialistSteps({
    beforeSpecialists: plan.beforeSpecialists,
    cycleOne: compilePhaseActions(plan.cycleOne ?? []),
    betweenCycles: plan.betweenCycles,
    cycleTwo: compilePhaseActions(plan.cycleTwo ?? []),
    afterSpecialists: plan.afterSpecialists,
    candidateEnding: plan.candidateEnding,
    terminalEnding: plan.terminalEnding,
  });
}

/** Build the existing fresh-game callback around these steps; no lifecycle hook or runner is replaced. */
export function createPc10SpecialistGameplayCallback({ createTwoBrowserGameplay, plan, name = 'PC10 specialist phases' }) {
  return createSpecialistGameplayCallback({ createTwoBrowserGameplay,
    steps: createPc10SpecialistPhaseSteps(plan), name });
}
