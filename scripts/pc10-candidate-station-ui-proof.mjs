import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';
import { candidateShipRole, contributeStationReactors } from './pc10-candidate-proof-helpers.mjs';

/** Fresh source arrival, current audited combat choices, then unique physical Reactors. */
export async function runStationEnding(context) {
  const tools = candidateGameplayTools(context);
  const { gm, crew, directory } = context;
  const start = await tools.begin('P');
  const coordinate = Object.entries(start.organiserSites).find(([, site]) => site.code === 'P')?.[0];
  assert.match(coordinate, /^\d{4}$/);
  await tools.record('entitled live GM chart selected P with the confirmed source roster', {
    candidateCode: 'P', vesselCount: start.activeVesselIds.length, namedRoleCount: context.roster.length });
  const budget = await tools.printedRationBudget(Object.fromEntries(start.activeVesselIds.map(shipId => [shipId, 2])));
  for (const shipId of start.activeVesselIds) {
    for (const [resource, minimum] of [['food', budget[shipId].food], ['water', budget[shipId].water], ['fuel', 20]])
      await tools.gmSupplies(shipId, resource, minimum);
    await tools.maintenanceUi(shipId, candidateShipRole(context.roster, shipId), {
      afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
    });
  }
  await tools.coordination();
  for (const shipId of start.activeVesselIds) await tools.jump(shipId, coordinate);
  await tools.cycle(2);
  for (const shipId of start.activeVesselIds) await tools.maintenanceUi(shipId, candidateShipRole(context.roster, shipId), {
    consoles: shipId === 'aegis' ? ['Fighter Bay Alpha', 'Fighter Bay Bravo', 'Command and Control', 'Missile Launchers', 'Point Defence Lasers'] : [],
    refuels: shipId === 'icebreaker' ? { 'Shuttle Bay': 'highwall' } : {},
    afterBegin: () => tools.gmRepair(shipId), afterRiot: () => tools.gmRepair(shipId),
  });
  await tools.coordination();
  await tools.select('gm');
  const timing = gm.page.getByRole('region', { name: 'Wolf attack timing controls', exact: true });
  await timing.getByLabel('Target fleet group', { exact: true }).selectOption((await tools.state()).shipFleetGroupIds.aegis);
  const source = timing.getByLabel('Triggered Wolf site', { exact: true });
  const sourceDeadline = Date.now() + 60_000; let sourceId;
  while (Date.now() < sourceDeadline && !sourceId) {
    sourceId = await source.locator('option').evaluateAll(options => options.find(option => !option.disabled && /^P \/\//.test(option.textContent.trim()))?.value);
    if (!sourceId) await delay(200);
  }
  assert.ok(sourceId, 'Actual paid Station arrivals must produce the live GM source option.');
  await source.selectOption(sourceId);
  await tools.receipt(gm, 'setWolfAttackWindow', () => timing.getByRole('button', { name: 'Mark threat source due', exact: true }).click());
  const preparation = gm.page.getByRole('region', { name: 'Private Wolf attack preparation', exact: true });
  await preparation.getByLabel('Battlestation count', { exact: true }).fill('1');
  await preparation.getByLabel('Fleet Strikecarrier count', { exact: true }).fill('4');
  await tools.receipt(gm, 'stageWolfAttackPreparation', () => preparation.getByRole('button', { name: 'Save private attack draft', exact: true }).click());
  await tools.record('actual GM Station source composition', { battlestations: 1, otherDamageCapacity: 20,
    mechanism: 'current source option and normal audited GM draft UI' });
  let waves = 0, liberated = false;
  while (waves < 12 && !liberated) {
    waves++;
    for (const shipId of start.activeVesselIds) await tools.gmRepair(shipId);
    await tools.gmSupplies('aegis', 'ore', 5);
    await tools.select('gm');
    await tools.receipt(gm, 'declareWolfAttack', () => preparation.getByRole('button', { name: 'Declare Wolf attack', exact: true }).click());
    const current = await resolveLiveWolfAttack(context, { tools });
    assert.ok(['repeat', 'stopped'].includes(current.pStationRepeat?.status), 'Only finalized current source survivors control the repeat.');
    liberated = current.pStationRepeat.status === 'stopped';
    await tools.record('actual source Station combat finalized', { wave: waves, liberated,
      survivorCount: current.pStationRepeat.survivors?.length ?? 0,
      mechanism: 'actual source-owned choices and server rolls; no supplied die or survivor roster' });
    await gm.page.screenshot({ path: `${directory}/P-source-wave-${waves}.png` });
  }
  assert.ok(liberated, 'Only zero authoritative Station Wolves permits Reactor contribution.');
  for (const shipId of start.activeVesselIds) await tools.gmRepair(shipId);
  await contributeStationReactors({ shipIds: start.activeVesselIds, contribute: async shipId => {
    const actor = await tools.select(candidateShipRole(context.roster, shipId));
    const panel = actor.page.getByRole('region', { name: 'Candidate preparation and actions', exact: true });
    if (shipId === 'aegis') await tools.candidateGeometry(actor, 'P', 'reactor-choice');
    const button = panel.getByRole('button', { name: new RegExp(`^Cannibalise Reactor \\/\\/ ${shipId} \\/\\/ \\d+ capacity$`) });
    const capacity = Number((await button.textContent()).match(/\/\/ (\d+) capacity$/)?.[1]);
    assert.ok(Number.isSafeInteger(capacity) && capacity > 0, 'Record the actual displayed available Reactor capacity.');
    const result = await tools.receipt(actor, 'executeCandidateAction', () => button.click());
    await tools.record('actual unique Reactor contribution', { shipId, capacity, activated: result.outcome === 'activated',
      mechanism: 'current available physical Reactor; source permanently consumed' });
    return result;
  } });
  await tools.complete('P');
  assert.equal((await crew.observe()).cycle, 2);
}
