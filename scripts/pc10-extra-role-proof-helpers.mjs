import assert from 'node:assert/strict';
import { assertSelectedActor } from './pc10-full-game-demo-proof-helpers.mjs';

/** Additive proof helpers; no gameplay mutation or identity substitution. */
export async function completeBeforeStart(context, prepare, start) {
  await prepare?.(context);
  return start();
}

export function chooseAffordableRation(options, available) {
  if (!Number.isSafeInteger(available) || available < 0) throw Error('Actual current stores are required.');
  const choices = options.map(option => {
    const match = option.text.match(/\/\/\s*([\d,]+(?:\.\d+)?)\s*\/\//);
    const cost = match ? Number(match[1].replaceAll(',', '')) : NaN;
    if (!/^[0-3]$/.test(option.value) || !Number.isFinite(cost) || cost < 0)
      throw Error('The visible printed ration cost is unavailable.');
    return { ...option, cost };
  }).filter(option => option.cost <= available).sort((left, right) => Number(right.value) - Number(left.value));
  if (!choices.length) throw Error('No visible affordable ration choice exists.');
  return choices[0].value;
}

/** Ordinary end resets step to zero; an unfinished or stale cycle cannot count. */
export function isCompletedMaintenanceForCycle(cycle, turn) {
  return Boolean(cycle && cycle.turn === turn && cycle.step === 0 &&
    typeof cycle.completedAt === 'string' && Number.isFinite(Date.parse(cycle.completedAt)) &&
    typeof cycle.results?.['7'] === 'string' && cycle.results['7'].length > 0);
}

const REPLACEMENT_ACTORS = [
  ['executive-officer', 'wolf-commander'], ['dione-engineer', 'comms-officer'],
  ['dione-president', 'vip-host'], ['icebreaker-engineer', 'commissar'],
  ['icebreaker-miner', 'rosal-militia-leader'], ['shepherd-engineer', 'doctor'],
  ['quellon-engineer', 'pdf-fighter-ace'], ['quellon-explorer', 'gorgoneion-captain'],
  ['refinery-124-engineer', 'capybara-small-captain'], ['refinery-124-captain', 'warrior-captain'],
  ['wing-commander', 'vulcan-captain'],
].map(([anchorRoleId, roleId]) => ({ anchorRoleId, roleId }));

export function extraRoleScenario(name) {
  assert.ok(['joint', 'replacements'].includes(name), 'Only source-backed extra-role scenarios may run.');
  return { name, playerCount: name === 'joint' ? 8 : 18, includePress: true, capybaraEnabled: true,
    actors: name === 'joint' ? [
      { anchorRoleId: 'joint-engineering-quellon-refinery', roleId: 'joint-engineering-quellon-refinery' },
      { anchorRoleId: 'joint-engineering-shepherd-icebreaker', roleId: 'joint-engineering-shepherd-icebreaker' },
    ] : REPLACEMENT_ACTORS.map(actor => ({ ...actor })) };
}

/** Anchor names never grant a current station. The original SDK account must survive reassignment. */
export function assertExtraActor(observed, station, expected) {
  assertSelectedActor(observed, { roleId: expected.anchorRoleId, uidHash: expected.uidHash, sessionId: expected.sessionId });
  assert.equal(station.sessionId, expected.sessionId);
  assert.equal(observed.pendingCommandCount, 0, 'A different actor must not inherit an in-flight outbox.');
  assert.equal(observed.briefMatchesActor, true, 'The current private brief must belong to the original Auth UID.');
  assert.equal(observed.briefRoleId, expected.roleId);
  if (expected.roleId !== expected.anchorRoleId) {
    assert.equal(station.assignedRoleId, expected.anchorRoleId, 'Original assignment remains source history.');
    assert.equal(station.replacementRoleId, expected.roleId);
    assert.equal(station.seatId, null, 'The original claimed seat must be released atomically.');
    assert.equal(station.activeConsoleRoleId, expected.consoleRoleId ?? null);
  } else {
    assert.equal(station.replacementRoleId ?? null, null);
    assert.equal(station.activeConsoleRoleId, expected.consoleRoleId ?? expected.roleId);
  }
}

export function choosePrintedRation(options, available) {
  assert.ok(Number.isSafeInteger(available) && available >= 0, 'Actual current stores are required.');
  const normalized = options.map(option => {
    const match = option.text.match(/\/\/\s*([\d,]+(?:\.\d+)?)(?:\s*\/\/|\s*$)/);
    assert.ok(match, 'The actual visible ration cost must be present.');
    return { ...option, text: `${option.text.split('//')[0]} // ${match[1]} //` };
  });
  return chooseAffordableRation(normalized, available);
}

function row(roleId, suffix, endpoint, source, prerequisite, nextActor, details = {}) {
  return { id: `${roleId}:${suffix}`, roleId, endpoint, source, prerequisite, nextActor,
    status: 'pending', attempts: [], ...details };
}

export function createExtraRoleMatrix(scenario) {
  const plan = extraRoleScenario(scenario);
  const rows = [];
  if (scenario === 'joint') {
    for (const [role, ships, craft] of [
      ['joint-engineering-quellon-refinery', ['quellon', 'refinery-124'], 'wobbly'],
      ['joint-engineering-shepherd-icebreaker', ['shepherd', 'icebreaker'], 'ally'],
    ]) {
      for (const ship of ships) for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end'])
        rows.push(row(role, `${ship}-${action}`, 'runMaintenance', 'src/routes/JointEngineeringConsole.tsx; src/components/MaintenanceSystems.tsx; functions/src/index.ts',
          `Current restricted Team; original ${role} UID/current station; ${ship} source step, revision and actual costs.`, role,
          { requiredRequestFields: { shipId: ship, action } }));
      rows.push(row(role, `${craft}-fuel`, 'runMaintenance', 'src/data/shuttles.ts; functions/src/index.ts',
        `${craft} docked with an actual operational host bay; real fuel and current Team maintenance.`, role,
        { requiredRequestFields: { shipId: ships[0], action: 'bays' } }));
      for (const [suffix, endpoint, prerequisite] of [
        ['cargo-load', 'transferShuttleCargoCommand', 'Positive whole amount present in actual docked host stores.'],
        ['cargo-unload', 'transferShuttleCargoCommand', 'Actual cargo from the previously committed load.'],
        ['departure', 'requestShuttleDeparture', 'Coordination and an offered co-located active destination.'],
        ['transit', 'beginShuttleTransit', 'Current actual departure request and holder UID.'],
        ['retarget', 'retargetShuttleTransit', 'Actual in-flight movement and an offered different co-located destination.'],
        ['arrival', 'completeShuttleArrival', 'Real arrival deadline has naturally passed; offered arrival control.'],
        ['evacuation', 'evacuateShuttleSurvivorsCommand', 'Actual population, printed step, co-located recipient and once-per-cycle capacity.'],
        ['handoff', 'transferShuttleControlCommand', 'Original owner chooses a genuinely admitted ordinary recipient.'],
        ['reclaim', 'transferShuttleControlCommand', 'Original owner reclaims the actual handed-off craft.'],
        ['boarding', 'commitWolfBoardingDefenceChoice', 'Genuine declared boarding attack and current fuelled security-team source.'],
      ]) rows.push(row(role, `${craft}-${suffix}`, endpoint, 'src/components/ShuttleControl.tsx; src/components/WolfBoardingDefencePanel.tsx; functions/src/index.ts', prerequisite, role));
      if (craft === 'wobbly') rows.push(row(role, 'wobbly-recharge', 'rechargeHostConsoleFromShuttle',
        'src/components/ShuttleControl.tsx; functions/src/serviceShuttleRecharge.ts',
        'Coordination; actual fuelled craft and current host console availability/cost.', role));
      else {
        rows.push(row(role, 'ally-repair', 'repairConsolesFromAlly', 'src/components/AllyRepairPanel.tsx; functions/src/index.ts',
          'Fuelled Ally at host; actual repairable console; four materials each; maximum two repairs per host/cycle.', role));
        for (const [suffix, endpoint, prerequisite, next] of [
          ['proposal', 'proposePermissionedDismantling', 'An actual undamaged host console and current engineering-craft holder.', role],
          ['consent', 'consentToPermissionedDismantling', 'Exact current proposal shown to a distinct ordinary host player.', 'Current host Captain'],
          ['decline', 'declinePermissionedDismantling', 'Fresh exact proposal shown to its ordinary target player.', 'Current host Captain'],
          ['revoke', 'revokePermissionedDismantlingConsent', 'Unconsumed actual target-player consent.', 'Current host Captain'],
          ['apply', 'applyPermissionedDismantling', 'Exact target-player consent; original holder applies; gains three materials.', role],
        ]) rows.push(row(role, `ally-dismantle-${suffix}`, endpoint, 'src/components/PermissionedDismantlingPanel.tsx; src/lib/permissionedDismantlingService.ts', prerequisite, next));
      }
    }
    return rows;
  }
  for (const { roleId, anchorRoleId } of plan.actors) {
    rows.push(row(roleId, 'eligibility', 'setReplacementEligibility', 'src/routes/GmConsole.tsx; functions/src/index.ts',
      `Live owned GM records an explicit simulated-station removal ruling for actual ${anchorRoleId} UID.`, 'GM',
      { trainingChoice: 'Simulated station retirement: removed; no death/arrest/physical attendance claim.' }));
    rows.push(row(roleId, 'assignment', 'assignReplacementRole', 'src/routes/GmConsole.tsx; functions/src/index.ts',
      'Current recorded eligibility, original UID, available source role, setup revision and claimed-seat CAS.', 'GM'));
  }
  const add = (role, suffix, endpoint, source, prerequisite, nextActor = role, details) =>
    rows.push(row(role, suffix, endpoint, source, prerequisite, nextActor, details));
  for (const [suffix, endpoint, prerequisite] of [
    ['cycle-dial', 'commitWolfCommanderAttackDial', 'Current restricted Team and an actually offered fleet group.'],
    ['address', 'publishWolfCommanderAddress', 'Current restricted Team; deliberate disclosed simulated-crew address.'],
    ['amnesty', 'createWolfAmnestyOffer', 'Actual address and a current active Captain; no unexpired unresolved offer.'],
    ['range-dial', 'applyWolfCommanderRangeTargetAdjustment', 'Actual declared attack at a current range; source target-ring step.'],
    ['target-reroll', 'applyWolfCommanderTargetRerolls', 'Actual targeting window and an eligible source die.'],
    ['finish-rerolls', 'finishWolfCommanderTargetingRerolls', 'Actual current targeting window after explicit Commander choices.'],
  ]) add('wolf-commander', suffix, endpoint,
    `src/components/${suffix === 'cycle-dial' ? 'WolfCommanderCycleAttackDialPanel' :
      ['address', 'amnesty'].includes(suffix) ? 'WolfCommanderAmnestyPanels' :
        suffix === 'range-dial' ? 'WolfCommanderRangeTargetDialPanel' : 'WolfCommanderTargetingPanel'}.tsx; functions/src/index.ts`, prerequisite);
  add('wolf-commander', 'captain-amnesty-response', 'respondToWolfAmnesty', 'src/components/WolfCommanderAmnestyPanels.tsx',
    'A distinct actual target Captain responds to the exact actual offer.', 'Target Captain');
  add('wolf-commander', 'gm-amnesty-ruling', 'recordWolfAmnestyConsequence', 'src/components/WolfCommanderAmnestyPanels.tsx',
    'Live owned GM rules on the genuine response and records actual consequence.', 'GM');
  add('comms-officer', 'scout', 'requestScout', 'src/components/ScoutRequestControls.tsx; functions/src/index.ts',
    'Current Coordination; a real printed chart coordinate; private report belongs to original UID.');
  for (const [suffix, endpoint, prerequisite] of [
    ['draw', 'drawVipCard', 'Actual Dione Team maintenance step5 with charged undamaged VIP Lounge.'],
    ['transfer', 'transferVipCard', 'Actual unspent privately drawn card and distinct live ordinary recipient in Coordination.'],
    ['discard-reroll', 'rerollVipUnrest', 'Actual unspent card and current Team unrest die window before riot.'],
  ]) add('vip-host', suffix, endpoint, 'src/components/DioneVipCards.tsx; functions/src/index.ts', prerequisite);
  add('vip-host', 'physical-visit', 'attestVipHostVisit', 'src/components/GmVipHostVisitControl.tsx; src/lib/vipHostService.ts',
    'Source-required physical visit witnessed by a facilitator; zero-human software proof cannot establish it.',
    'Physical VIP Host and witnessing facilitator', { physicalFactRequired: true });
  add('vip-host', 'hosted-maintenance-reroll', 'rerollHostedShipMaintenance', 'src/components/VipHostMaintenanceRerollControl.tsx',
    'An actual source physical-visit grant and a current matching unrest roll; do not invent a grant.',
    'Visited ship Engineer', { physicalFactRequired: true });
  add('commissar', 'captain-consent', 'consentCommissarPurge', 'src/components/CommissarPurgePanel.tsx',
    'Distinct actual target Captain approves at current cycle/vessel revision.', 'Icebreaker Captain');
  add('commissar', 'purge', 'applyCommissarPurge', 'src/components/CommissarPurgePanel.tsx; functions/src/index.ts',
    'Exact actual Captain consent; printed survivor-track step; unrest reduced by one.');
  add('rosal-militia-leader', 'boarding', 'commitWolfBoardingSpecialChoice', 'src/components/WolfBoardingSpecialChoicePanel.tsx',
    'Genuine current boarding step and permitted Rosal option; no fabricated boarding roll.');
  add('doctor', 'medical-aid', 'resolveWolfAttackAftermath', 'src/components/WolfAttackAftermathActionPanel.tsx',
    'Genuine resolved attack with population-loss targets; first free, each additional costs three food and water.');
  add('pdf-fighter-ace', 'permission', 'grantPdfFighterAcePermission', 'src/components/Pc09SpecialistPresenters.tsx; src/lib/pdfFighterAceService.ts',
    'Distinct real current fighter Commander chooses actual fighter slot during a declared range.', 'Admiral or PDF Colonel');
  for (const range of ['long', 'medium', 'short']) add('pdf-fighter-ace', range, 'commitPdfFighterAceCombat',
    'src/components/PdfFighterAceCombatWorkspace.tsx; functions/src/index.ts',
    `Genuine ${range} range, authorized actual fighter source, current contact and unspent action; separate fresh attacks if mutually exclusive.`);
  for (const shipId of ['gorgoneion', 'capybara-small', 'warrior', 'vulcan']) {
    const role = `${shipId}-captain`;
    add(role, 'docking', 'setSmallShipDocking', 'src/components/SmallShipOperations.tsx; functions/src/index.ts',
      'Current Coordination; an actual co-located active host; docking revision.', 'GM');
    for (const action of ['begin', 'rations', 'unrest', 'riot', 'reactor', 'end'])
      add(role, `maintenance-${action}`, 'runSmallShipMaintenance', 'src/components/SmallShipOperations.tsx; functions/src/smallShip.ts',
        'Source Team step; actual host-funded stores, normal random dice and reactor capacity.', 'GM: disclosed ordinary maintenance lane',
        { requiredRequestFields: { smallShipId: shipId, action } });
    add(role, 'undock', 'setSmallShipDocking', 'src/components/SmallShipOperations.tsx',
      'Actual completed current cycle and Coordination; retain authority after ordinary detach.', 'GM');
  }
  for (const role of ['gorgoneion-captain', 'capybara-small-captain']) {
    add(role, 'charge-jump', 'runSmallShipMaintenance', 'src/components/SmallShipJumpWorkspace.tsx; src/lib/smallShipJumpService.ts',
      'Current docked Team phase and source reactor capacity.', role,
      { requiredRequestFields: { smallShipId: role.replace('-captain', ''), action: 'reactor' } });
    for (const range of ['short', 'medium', 'long']) add(role, `jump-${range}`, 'jumpSmallShip',
      'src/components/SmallShipJumpPanel.tsx; functions/src/index.ts',
      `Actual known ${range} destination and one/one/two host fuel; successful jump detaches craft. Separate fresh cases if no co-located host.`);
  }
  add('gorgoneion-captain', 'mission-support', 'applyGorgoneionMissionSupport', 'src/components/GorgoneionMissionSupportWorkspace.tsx',
    'Actual server pre-deal top-five projection and an explicit top/bottom partition; never record cards publicly.');
  add('gorgoneion-captain', 'repair', 'repairGorgoneionWithDrones', 'src/components/GorgoneionRepairDronesPanel.tsx',
    'Current completed Team Repair Drones charge, actual host damage, three materials and once-per-cycle ledger.');
  add('gorgoneion-captain', 'force-field', 'commitWolfForceFieldChoice', 'src/components/WolfForceFieldChoicePanel.tsx',
    'Actual declared attack pre-target choice and genuine current Force Field charge.');
  for (const range of ['long', 'medium', 'short']) add('gorgoneion-captain', `missile-${range}`, 'commitWolfRangeSupportActionChoice',
    'src/components/WolfRangeSupportActionPanel.tsx; functions/src/index.ts',
    `Genuine current ${range} attack step; actual charge; source random dice and per-target cap.`);
  for (const direction of ['load', 'unload']) add('capybara-small-captain', `cargo-${direction}`, 'transferBaseCapybaraCargo',
    'src/components/BaseCapybaraCargoTransferPanel.tsx', 'Current docked Coordination; positive actual inventory amount.');
  for (const consoleId of ['water-reclimator', 'hydroponics', 'fuel-processor']) add('capybara-small-captain', consoleId, 'runSmallShipMaintenance',
    'src/components/SmallShipOperations.tsx; functions/src/smallShip.ts',
    'Actual current production charge and host water/ore cost; only two reactor slots per cycle.', 'GM: disclosed actual production lane');
  add('capybara-small-captain', 'bulk-haulage', 'commitAwayMissionLifecycleCommand', 'functions/src/awayMissionLifecycleAdapter.ts; src/components/AwayMissionLifecyclePanel.tsx',
    'Actual contributed base craft and resource-winning mission opportunity; automatic source modifier must appear in genuine result.');
  add('warrior-captain', 'repair', 'repairWarriorWithDrones', 'src/components/WarriorRepairDronesPanel.tsx',
    'Actual Repair Drones charge; one/two actual damaged host consoles; six materials.');
  add('warrior-captain', 'reclamator', 'commitAwayMissionLifecycleCommand', 'src/components/AwayMissionLifecyclePanel.tsx',
    'Genuine Warrior mission participation and actual private hand during discards; no seeded cards.');
  add('warrior-captain', 'salvage', 'resolveWolfAttackAftermath', 'src/components/WolfAttackAftermathActionPanel.tsx',
    'Actual current Salvage Drones charge and genuine resolved attack with damage on either side.');
  add('warrior-captain', 'cargo-transfer', 'transferWarriorCargo',
    'src/components/ExtraShipCaptainWorkspace.tsx; src/components/BaseCapybaraCargoTransferPanel.tsx; src/lib/baseCapybaraCargoService.ts; functions/src/baseCapybaraCargoTransferCallable.ts',
    'Current admitted Warrior Captain aboard the docked host, Coordination open, undestroyed active host, and a positive whole amount available at the selected source. One server transaction debits the host or Warrior ledger and credits the other; exact retry does not duplicate cargo.',
    'Warrior Captain');
  add('warrior-captain', 'jump-drive', 'jumpSmallShip',
    'src/components/ExtraShipCaptainWorkspace.tsx; src/components/SmallShipJumpWorkspace.tsx; src/lib/smallShipJumpService.ts; functions/src/smallShipJump.ts',
    'Current Warrior Captain, admitted docked Warrior and active host, completed current Team maintenance, Coordination open, Captain-known destination of the selected short/medium/long length, and actual host fuel 1/1/2. Warrior Jump Drive does not require a reactor charge; a successful jump detaches the craft.',
    'Warrior Captain', { requiredRequestFields: { smallShipId: 'warrior' } });
  add('vulcan-captain', 'jump-drive', 'jumpSmallShip',
    'src/components/ExtraShipCaptainWorkspace.tsx; src/components/SmallShipJumpWorkspace.tsx; src/lib/smallShipJumpService.ts; functions/src/smallShipJump.ts',
    'Current Vulcan Captain, admitted docked Vulcan and active host, completed current Team maintenance, Coordination open, Captain-known destination of the selected short/medium/long length, and actual host fuel 1/1/2. Vulcan Jump Drive does not require a reactor charge; a successful jump detaches the craft.',
    'Vulcan Captain', { requiredRequestFields: { smallShipId: 'vulcan' } });
  for (const range of ['medium', 'short']) add('vulcan-captain', `laser-cannon-${range}`, 'commitWolfRangeSupportActionChoice',
    'src/components/ExtraShipCaptainWorkspace.tsx; src/components/WolfRangeSupportActionPanel.tsx; src/lib/sessionService.ts; functions/src/index.ts; functions/src/wolfAttackLifecycle.ts',
    `The actual Wolf ${range[0].toUpperCase()}${range.slice(1)} Range step, unique current Vulcan Captain aboard Vulcan's current admitted host, living/non-mutinous Vulcan, and current-cycle Laser Cannon charge are required to use. The Captain commits one use/pass for this range; the one charge powers both Medium and Short choices. Use adds two server-rolled d6 at 4+ with up to two targets and 1 damage per success; a separate resolver owns the result.`,
    'Vulcan Captain at the current Wolf range; shared range resolver after all required source choices',
    { requiredRequestFields: { sourceId: 'vulcan-laser-cannon', range: `${range}-range` } });
  for (const charge of [1, 2]) add('vulcan-captain', `labour-${charge}`, 'runVulcanAdditionalLabour', 'src/components/VulcanAdditionalLabourPanel.tsx; functions/src/vulcanLabour.ts',
    'Actual completed current Team cycle with independent labour charge; permitted undamaged uncharged external console.', 'vulcan-captain',
    { requiredRequestFields: { sourceConsoleId: `additional-labour-${charge}` } });
  return rows;
}

export function recordExtraRoleResult(matrix, id, outcome) {
  const target = matrix.find(entry => entry.id === id);
  assert.ok(target, `Unknown action-level receipt ${id}.`);
  assert.ok(['pending', 'blocked', 'committed', 'failed'].includes(outcome.status));
  if (outcome.status === 'committed') {
    assert.equal(target.physicalFactRequired === true, false, 'A zero-human software run cannot establish a physical fact.');
    assert.equal(target.unavailableReason === undefined, true, 'Unavailable source controls cannot gain execution credit.');
    assert.equal(outcome.receipt?.httpStatus, 200);
    assert.equal(outcome.receipt?.identityVerified, true, 'Current original actor authority must be observed for the actual receipt.');
    assert.equal(outcome.receipt?.endpoint, target.endpoint);
    assert.ok(outcome.receipt?.requestId && ['ordinary-ui', 'ordinary-sdk', 'source-automatic'].includes(outcome.receipt?.transport));
    for (const [field, value] of Object.entries(target.requiredRequestFields ?? {}))
      assert.equal(outcome.receipt?.requestFields?.[field], value, `Actual procedure request field ${field} must match.`);
  } else {
    assert.ok(outcome.blocker && outcome.nextActor, 'A conditional gap must retain its blocker and concrete next actor.');
  }
  target.attempts.push({ ...outcome });
  // A later conditional branch cannot erase a genuine earlier receipt.
  if (target.status !== 'committed') Object.assign(target, outcome);
  return target;
}

export function extraRoleCoverage(matrix) {
  assert.ok(Array.isArray(matrix) && matrix.length > 0);
  const committed = matrix.filter(row => row.status === 'committed').length;
  return { diagnosticRows: matrix.length, committed, pending: matrix.filter(row => row.status === 'pending').length,
    blocked: matrix.filter(row => row.status === 'blocked').length,
    failed: matrix.filter(row => row.status === 'failed').length,
    everyRoleFunctionComplete: matrix.every(row => row.status === 'committed'),
    countsMeaning: 'Source procedure diagnostic rows, not a fixed checkpoint count or surface-visit credit.' };
}
