import assert from 'node:assert/strict';
import test from 'node:test';
import { ANCHORS, REVIEWS } from './pc10-action-review-source-endings.mjs';

const expectedNames = ['commitWolfRangeSupportActionChoice', 'getWolfForceFieldChoice', 'commitWolfForceFieldChoice', 'getWolfBoardingDefenceChoice', 'commitWolfBoardingDefenceChoice', 'getWolfBoardingSpecialChoice', 'commitWolfBoardingSpecialChoice', 'getDioneMaliadesLaunch', 'launchDioneMaliades', 'getPdfEscortWingLaunch', 'launchPdfEscortWing', 'passWolfFighterLaunchChoice', 'startWolfConsoleVisit', 'resolveWolfConsoleSabotage', 'acknowledgeWolfHackingAlert', 'submitWolfHomingBeacon', 'submitWolfIntelligence', 'investigateAsIntelligenceAgent', 'unlockPressAirspace', 'setActiveRoleEnabled', 'setActiveRoleConfiguration', 'applyRolePreset', 'popShipConfetti', 'getSessionPresence', 'fleeDestroyedShip', 'disconnectFromSession', 'claimSeat', 'releaseSeat', 'scavengeDestroyedShipStores', 'adjustShipResource', 'adjustShipUnrest', 'consentCommissarPurge', 'applyCommissarPurge', 'getCommissarPurgeAuthority', 'dismissUnrestAlert', 'resolveShipMutiny', 'addShipDamage', 'adjustShipPopulation', 'applyShipCounterSteps', 'setFighterWingCount', 'buildFighter', 'dismissPopulationAlert', 'runHighwallMining', 'requestScout', 'rollHummingbirdHarvest', 'allocateHummingbirdHarvest', 'setSmallShipDocking', 'runSmallShipMaintenance', 'runVoyage33Maintenance', 'runVulcanAdditionalLabour', 'runMaintenance', 'drawVipCard', 'transferVipCard', 'rerollVipUnrest', 'publishAdmiralDirectiveCommand', 'recordPresidentActionCommand', 'recordPresidentialVisit', 'configurePresidentialElection', 'castPresidentialBallot', 'resolvePresidentialElection', 'updatePoliticalCapital', 'setFleetRedAlert', 'publishPressDispatch', 'dismissPressDispatch', 'repairAllShipDamage', 'rollbackMaintenance', 'clearTurnAdvanceInterstitial', 'setUnionCraftStartingHost'];

test('ending source shard reviews all 68 exports with anchored action contracts', () => {
  assert.equal(REVIEWS.length, 68);
  assert.deepEqual(REVIEWS.map(row => row.exportName).sort(), [...expectedNames].sort());
  assert.equal(new Set(REVIEWS.map(row => row.exportName)).size, 68);
  const anchorIds = new Set(ANCHORS.map(([id]) => id));
  assert.equal(anchorIds.size, ANCHORS.length);
  const details = new Set(['requirements', 'costs', 'consequences', 'blockers', 'nextActor', 'guidance']);
  for (const row of REVIEWS) {
    assert.ok(['served-ui-path', 'read-projection-support', 'legacy/deprecated-internal-compatibility',
      'external/manual-only', 'genuinely-unserved'].includes(row.classification), row.exportName);
    assert.ok(row.productPath?.status && row.productPath.sourceAnchorIds?.length, row.exportName);
    assert.ok(row.actor?.family && row.actor.identities?.length && row.actor.sourceAnchorIds?.length, row.exportName);
    assert.ok(row.actor.conditions?.length || row.actor.conditionalOverrides?.length,
      `${row.exportName} must describe actor eligibility conditions`);
    for (const field of details) {
      assert.ok(row[field]?.summary && row[field].sourceAnchorIds?.length, `${row.exportName} ${field}`);
    }
    for (const sourceId of [row.productPath, row.actor, ...[...details].map(field => row[field])]
      .flatMap(value => value.sourceAnchorIds)) {
      assert.ok(anchorIds.has(sourceId), `${row.exportName} source anchor ${sourceId}`);
    }
    if (row.classification === 'served-ui-path') {
      assert.ok(row.productPath.sourceAnchorIds.some(id => id.endsWith('.service')), row.exportName);
      assert.ok(row.productPath.sourceAnchorIds.some(id => id.endsWith('.ui')), row.exportName);
    }
  }
});
