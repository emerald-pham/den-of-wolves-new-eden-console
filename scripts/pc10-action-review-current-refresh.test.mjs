import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ANCHORS as endingAnchors, REVIEWS as endings } from './pc10-action-review-source-endings.mjs';
import { ANCHORS as workspaceAnchors, REVIEWS as workspaces } from './pc10-action-review-source-workspaces.mjs';
import { REVIEWS as demo } from './pc10-action-review-source-demo.mjs';

const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const reviewByName = new Map([...endings, ...workspaces, ...demo].map(row => [row.exportName, row]));
const annotationSource = readFileSync(resolve(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), 'utf8');

function primaryReview(name) {
  const start = annotationSource.indexOf(`exportName: '${name}'`);
  assert.notEqual(start, -1, `${name} remains in the primary review list`);
  const end = annotationSource.indexOf('\n  },\n  {', start);
  assert.notEqual(end, -1, `${name} review has a bounded row`);
  return annotationSource.slice(start, end);
}

function requireReview(name) {
  const row = reviewByName.get(name);
  assert.ok(row, `${name} has an additive source review`);
  return row;
}

test('current review traces candidate post-terminal results and exact request recovery', () => {
  const read = requireReview('readCandidateWorkspace');
  const action = requireReview('executeCandidateAction');
  assert.match(read.productPath.surface, /Candidate Preparation/);
  assert.match(read.requirements.summary, /Cycle 1|currentTurn|current cycle/i);
  assert.match(read.consequences.summary, /ended|terminal|committed result/i);
  assert.match(read.guidance.summary, /original candidate result|ended result/i);
  assert.match(action.requirements.summary, /active phase/i);
  assert.match(action.consequences.summary, /receipt|replay/i);
  assert.match(action.blockers.summary, /terminal|ended/i);
  assert.match(action.guidance.summary, /exact|original request|retry/i);
});

test('scout review keeps live instance, session identity, phase and freshness gates distinct', () => {
  for (const name of ['listPendingScoutRequests', 'listGmScoutResolutionLog', 'resolvePendingScoutRequest']) {
    const row = primaryReview(name);
    assert.match(row, /session|sessionId/i, `${name} binds the current session`);
    assert.match(row, /owned live instance|instanceId/i, `${name} requires the owned facilitator lease`);
    assert.match(row, /server-fresh|freshness|server snapshot/i, `${name} has a source-backed current snapshot gate`);
    assert.match(row, /active phase|phase === 'active'/i, `${name} is phase-scoped`);
  }
});

test('P.D.F. launch and Fighter Ace reviews account for current phase and the PDF pass mount', () => {
  for (const name of ['getPdfEscortWingLaunch', 'launchPdfEscortWing', 'getPdfFighterAcePermissionView',
    'grantPdfFighterAcePermission', 'passWolfFighterLaunchChoice']) {
    const row = requireReview(name);
    assert.match(row.requirements.summary, /active gameplay|active attack/i, `${name} phase gate`);
    assert.match(row.productPath.surface, /P\.D\.F\.|PdfEscortWingReference|Fighter Ace/i, `${name} current surface`);
  }
  const pdfPassAnchor = endingAnchors.find(([id]) => id === 'ending.passWolfFighterLaunchChoice.pdfUi');
  assert.deepEqual(pdfPassAnchor, ['ending.passWolfFighterLaunchChoice.pdfUi',
    'src/components/PdfEscortWingReference.tsx', 'PdfEscortWingReference']);
});

test('loyalty review describes listener-first acknowledgement and App census rebinding', () => {
  const row = requireReview('assignLoyalty');
  assert.match(row.consequences.summary, /listener-first|accepted.*snapshot/i);
  assert.match(row.blockers.summary, /stale|changed.*revision/i);
  assert.ok(row.productPath.sourceAnchorIds.some(id => id === 'workspace.mount.app'));
  assert.ok(workspaceAnchors.some(([id, path, symbol]) => id === 'workspace.mount.app' &&
    path === 'src/App.tsx' && symbol === 'App'));
});

test('App recovery annotations retain closed-history and census-refresh boundaries', () => {
  const resume = primaryReview('resumeSession');
  assert.match(resume, /closed-session history/i);
  assert.match(resume, /read-only|ephemeral/i);
  assert.match(resume, /seat|presence/i);
  const presence = primaryReview('refreshPresence');
  assert.match(presence, /heartbeat/i);
  assert.match(presence, /closed|terminal/i);
});

test('source guidance does not erase the six current UI gaps or the explicit Wolf supply gap', () => {
  const unserved = ['investigateAsIntelligenceAgent', 'getSessionPresence', 'adjustShipResource',
    'adjustShipUnrest', 'addShipDamage', 'adjustShipPopulation'];
  for (const name of unserved) assert.equal(requireReview(name).classification, 'genuinely-unserved', name);
  const supply = primaryReview('submitWolfSupplySabotage');
  assert.match(supply, /external\/manual-only/);
  assert.match(annotationSource, /explicitPc11GuidanceGaps/);
  assert.match(annotationSource, /server-action-not-surfaced-to-member-ui/);
});
