const ACTOR_IDENTITY_FIELDS = Object.freeze([
  'uidHash', 'sessionId', 'playerRole', 'profileRoleId', 'assignedRoleId', 'activeConsoleRoleId',
  'instanceId', 'instanceClaimedAt',
]);

function liveActor(actor) {
  return actor?.hasAuth === true && actor.sameActor === true && actor.connection === 'live' &&
    actor.freshness === 'server' && typeof actor.uidHash === 'string' && actor.uidHash.length > 0 &&
    typeof actor.sessionId === 'string' && actor.sessionId.length > 0 &&
    ['gm', 'player'].includes(actor.playerRole);
}

const STAGE_CODE = Object.freeze({ 'research-choice': 'N', repaired: 'N', 'paid-loss-choice': 'O', 'reactor-choice': 'P' });

function enabledShips(path) {
  return Array.isArray(path?.ships) ? path.ships.filter(ship => ship?.canAct === true) : [];
}

/**
 * Accept candidate geometry only when the mounted native report, original live
 * actor, current session cycle, and rendered path controls all agree.
 */
export function projectCandidateWorkspaceReadiness({
  expectedActor, currentActor, sourceState, request, report, expectedGroupId, code, stage, rendered,
} = {}) {
  const blocked = reason => ({ state: 'blocked', reason });
  const pending = reason => ({ state: 'pending', reason });
  if (!liveActor(expectedActor) || !liveActor(currentActor)) return blocked('original-live-actor-not-authenticated');
  if (ACTOR_IDENTITY_FIELDS.some(field => expectedActor[field] !== undefined &&
      currentActor[field] !== expectedActor[field])) return blocked('original-actor-identity-changed');
  if (expectedActor.playerRole === 'gm' &&
      (expectedActor.gmInstanceOwned !== true || currentActor.gmInstanceOwned !== true ||
       typeof expectedActor.instanceId !== 'string' || !expectedActor.instanceId)) {
    return blocked('original-owned-GM-instance-not-current');
  }
  if (!sourceState || sourceState.live !== true || sourceState.sessionId !== expectedActor.sessionId ||
      !Number.isSafeInteger(sourceState.cycle) || sourceState.cycle < 1 || sourceState.phase !== 'active' ||
      sourceState.playerRole !== expectedActor.playerRole || sourceState.instanceId !== expectedActor.instanceId ||
      sourceState.instanceClaimedAt !== expectedActor.instanceClaimedAt ||
      sourceState.gmInstanceOwned !== expectedActor.gmInstanceOwned) {
    return blocked('current-session-cycle-or-instance-is-not-live');
  }
  if (typeof expectedGroupId !== 'string' || !expectedGroupId ||
      request?.sessionId !== expectedActor.sessionId || request.expectedGroupId !== expectedGroupId ||
      report?.sessionId !== expectedActor.sessionId || report.groupId !== expectedGroupId ||
      expectedActor.playerRole === 'gm' && request.instanceId !== expectedActor.instanceId ||
      expectedActor.playerRole === 'player' &&
        (sourceState.groupId !== expectedGroupId || Object.hasOwn(request, 'instanceId'))) {
    return blocked('current-group-or-mounted-read-request-does-not-match-actor');
  }
  if (report.type !== 'candidate-workspace' || report.cycle !== sourceState.cycle ||
      !Number.isSafeInteger(report.revision) || report.revision < 0 || !Array.isArray(report.paths)) {
    return blocked('native-candidate-report-is-not-current-and-well-formed');
  }
  if (STAGE_CODE[stage] !== code) return blocked('candidate-proof-stage-is-not-supported');
  const matchingPaths = report.paths.filter(path => path?.code === code);
  if (matchingPaths.length !== 1 || typeof matchingPaths[0]?.title !== 'string') {
    return blocked('native-report-does-not-contain-one-current-candidate-path');
  }
  const path = matchingPaths[0];
  if (stage === 'research-choice' && (!Array.isArray(path.researchChoices) || path.researchChoices.length < 1 ||
      path.researchChoices.some(choice => typeof choice?.name !== 'string' || !choice.name) ||
      new Set(path.researchChoices.map(choice => choice.name)).size !== path.researchChoices.length)) {
    return blocked('current-candidate-report-does-not-offer-distinct-research-choices');
  }
  if (stage === 'repaired' && (path.repaired !== true || enabledShips(path).length < 1)) {
    return blocked('current-candidate-report-does-not-show-the-repaired-path');
  }
  if (stage === 'paid-loss-choice' && enabledShips(path).length < 1) {
    return blocked('current-candidate-report-does-not-offer-an-acting-nebula-ship');
  }
  const actingShips = enabledShips(path);
  if (stage !== 'research-choice' && (!Array.isArray(path.ships) ||
      path.ships.some(ship => typeof ship?.shipId !== 'string' || !ship.shipId) ||
      new Set(path.ships.map(ship => ship.shipId)).size !== path.ships.length ||
      expectedActor.playerRole === 'player' && actingShips.length !== 1)) {
    return blocked('native-candidate-report-does-not-offer-distinct-actor-ship-authority');
  }
  if (stage === 'reactor-choice' && (path.liberated !== true || path.completed === true || path.activated === true ||
      !Array.isArray(path.reactorShipIds) || path.reactorShipIds.some(shipId => typeof shipId !== 'string' || !shipId) ||
      new Set(path.reactorShipIds).size !== path.reactorShipIds.length ||
      !actingShips.some(ship => Number.isSafeInteger(ship.reactorCapacity) && ship.reactorCapacity > 0 &&
        !path.reactorShipIds.includes(ship.shipId)))) {
    return blocked('current-candidate-report-does-not-offer-an-available-liberated-reactor');
  }
  if (!rendered || rendered.receiving === true || rendered.headerCount !== 1 ||
      rendered.cycle !== sourceState.cycle || rendered.revision !== report.revision ||
      rendered.currentGroupId !== expectedGroupId || ![0, 1].includes(rendered.fleetGroupSelectorCount) ||
      rendered.fleetGroupSelectorCount === 1 && rendered.selectedFleetGroup !== expectedGroupId ||
      !Array.isArray(rendered.pathHeadings) || rendered.pathHeadings.filter(title => title === path.title).length !== 1) {
    return pending('candidate-workspace-report-is-not-yet-rendered-at-its-current-cycle-and-revision');
  }
  if (stage === 'research-choice') {
    const expectedNames = path.researchChoices.map(choice => choice.name).sort();
    const renderedNames = Array.isArray(rendered.researchTrackNames) ? [...rendered.researchTrackNames].sort() : [];
    if (rendered.researchGroupVisible !== true || rendered.commitResearchButtonCount !== 1 ||
        JSON.stringify(renderedNames) !== JSON.stringify(expectedNames) ||
        rendered.researchTrackEnabledCount !== expectedNames.length) {
      return pending('current-research-controls-do-not-match-the-native-candidate-report');
    }
  }
  let actingShip;
  if (stage !== 'research-choice') {
    const selections = Array.isArray(rendered.pathShipSelections)
      ? rendered.pathShipSelections.filter(selection => selection?.title === path.title) : [];
    if (expectedActor.playerRole === 'gm') {
      if (selections.length !== 1 || actingShips.length === 1 && selections[0].actingShip?.count !== 0) {
        return pending('native-acting-ship-has-no-unique-mounted-source-selection');
      }
      const selection = actingShips.length > 1 ? selections[0].actingShip : rendered.gmShipSelection;
      const expectedIds = actingShips.length > 1 ? actingShips.map(ship => ship.shipId) :
        [...new Set(report.paths.flatMap(value => enabledShips(value).map(ship => ship.shipId)))];
      if (selection?.count !== 1 || selection.visible !== true || selection.enabled !== true ||
          !Array.isArray(selection.offeredShipIds) || selection.optionCount !== expectedIds.length ||
          new Set(selection.offeredShipIds).size !== expectedIds.length ||
          JSON.stringify([...selection.offeredShipIds].sort()) !== JSON.stringify([...expectedIds].sort())) {
        return pending('native-acting-ship-has-no-unique-mounted-source-selection');
      }
      actingShip = actingShips.find(ship => ship.shipId === selection.selectedShipId);
      if (!actingShip) return pending('mounted-selected-ship-is-not-current-native-actor-authority');
    } else {
      if (selections.some(selection => selection.actingShip?.count !== 0)) {
        return pending('member-native-ship-authority-has-an-unexpected-source-selection');
      }
      actingShip = actingShips[0];
    }
    if (stage === 'paid-loss-choice' && (!Number.isSafeInteger(actingShip.fuelCost) || actingShip.fuelCost < 0)) {
      return blocked('native-selected-nebula-ship-has-no-exact-fuel-cost');
    }
    if (stage === 'reactor-choice' && (!Number.isSafeInteger(actingShip.reactorCapacity) ||
        actingShip.reactorCapacity < 1 || path.reactorShipIds.includes(actingShip.shipId))) {
      return blocked('native-selected-reactor-is-not-currently-available');
    }
    const expectedName = stage === 'repaired' ? `Cross Ring // ${actingShip.shipId} // five fuel` :
      stage === 'paid-loss-choice' ? `Long jump into Nebula // ${actingShip.shipId} // ${actingShip.fuelCost} fuel` :
        `Cannibalise Reactor // ${actingShip.shipId} // ${actingShip.reactorCapacity} capacity`;
    const buttons = stage === 'repaired' ? rendered.ringButtons : stage === 'paid-loss-choice'
      ? rendered.nebulaJumpButtons : rendered.reactorButtons;
    if (!Array.isArray(buttons) || buttons.length !== 1 || buttons[0]?.name !== expectedName || buttons[0].enabled !== true) {
      return pending('selected-native-ship-action-does-not-match-one-enabled-mounted-control');
    }
  }
  return {
    state: 'ready', reason: null,
    actor: { uidHash: currentActor.uidHash, playerRole: currentActor.playerRole,
      profileRoleId: currentActor.profileRoleId ?? null },
    groupId: expectedGroupId, cycle: sourceState.cycle, revision: report.revision,
    candidateCode: code, stage, candidateTitle: path.title,
    researchChoiceCount: Array.isArray(path.researchChoices) ? path.researchChoices.length : 0,
    repaired: path.repaired === true, renderedPathCount: rendered.pathHeadings.length,
    ...(actingShip ? { actingShipId: actingShip.shipId, ...(stage === 'reactor-choice'
      ? { reactorCapacity: actingShip.reactorCapacity } : { fuelCost: stage === 'repaired' ? 5 : actingShip.fuelCost }) } : {}),
  };
}

/** Require keyboard events to visit every currently enabled, visible panel tab stop. */
export function summarizeCandidateKeyboardTraversal({
  documentTabStopCount, intendedTargets, visitedTargets, tabPresses, programmaticFocusUsed = false,
} = {}) {
  const targets = Array.isArray(intendedTargets) ? intendedTargets : [];
  const visited = new Set(Array.isArray(visitedTargets) ? visitedTargets : []);
  const uniqueTargets = targets.length > 0 && targets.every(value => typeof value === 'string' && value.length > 0) &&
    new Set(targets).size === targets.length;
  const validCounts = Number.isSafeInteger(documentTabStopCount) && documentTabStopCount >= targets.length &&
    Number.isSafeInteger(tabPresses) && tabPresses >= 0;
  const tabPressLimit = validCounts ? documentTabStopCount + 1 : 0;
  const allEnabledTargetsReached = uniqueTargets && validCounts && programmaticFocusUsed === false &&
    tabPresses > 0 && tabPresses <= tabPressLimit && targets.every(target => visited.has(target));
  return {
    allEnabledTargetsReached, programmaticFocusUsed: programmaticFocusUsed === true,
    documentTabStopCount: Number.isSafeInteger(documentTabStopCount) ? documentTabStopCount : 0,
    intendedTargetCount: targets.length,
    reachedTargetCount: targets.filter(target => visited.has(target)).length,
    tabPresses, tabPressLimit,
    reason: allEnabledTargetsReached ? null : 'not-all-current-enabled-targets-reached-within-dom-derived-tab-bound',
  };
}
