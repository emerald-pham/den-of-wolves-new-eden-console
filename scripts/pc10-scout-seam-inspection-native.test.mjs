import assert from 'node:assert/strict';
import test from 'node:test';
import * as capybara from './pc10-capybara-full-gameplay.mjs';

const notice = 'Request recorded. Your private scouting report will arrive automatically.';
const nativeSession = 'native-scout-inspection-session';
const nativeCoordinate = '1413';
const request = { sessionId: nativeSession, requestId: 'native-scout-inspection-request',
  entitlementId: 'starlight', targetCoordinate: nativeCoordinate };
const result = { status: 'requested', resolution: 'pending', ...request, cycle: 1,
  source: 'craft', ownerRoleId: 'wing-commander', anchorShipId: 'aegis', receivingShipId: 'aegis' };
const actor = { sameActor: true, sessionId: nativeSession, profileRoleId: 'wing-commander',
  activeConsoleRoleId: 'wing-commander', connection: 'live', freshness: 'server' };
const before = { live: true, sessionId: nativeSession, cycle: 1, phase: 'active',
  turnPhase: { turn: 1, airspace: { state: 'lifted' } }, activeVesselIds: ['aegis'],
  shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis' }] };
const choice = { entitlementId: 'starlight', ownerRoleId: 'wing-commander', targetCoordinate: nativeCoordinate };

function statusNode({ text = notice, visible = true, noticeClass = true, geometry = true } = {}) {
  return { textContent: text, visibility: visible ? 'visible' : 'hidden',
    matches: selector => { assert.equal(selector, '.scout-request__notice'); return noticeClass; },
    getClientRects: () => geometry ? [{}] : [] };
}

function harness(nodes) {
  assert.equal(typeof capybara.createCapybaraSpecialistActionSeam, 'function',
    'The finite caller must share the full Capybara original specialist seam. This absent-export premise is separate from timeout retention RED.');
  const reads = [];
  const panel = { getByRole: role => {
    assert.equal(role, 'status'); reads.push('original-status-query');
    return { evaluateAll: async (evaluate, scout) => {
      assert.equal(scout, true); reads.push('original-dom-evaluation');
      const prior = globalThis.getComputedStyle;
      globalThis.getComputedStyle = node => ({ visibility: node.visibility });
      try {
        const observed = evaluate(nodes, scout);
        assert.equal(typeof observed, 'boolean', 'Preserve the original DOM callback boolean return.');
        return observed;
      }
      finally { if (prior === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = prior; }
    } };
  } };
  const surface = { page: { getByRole: (role, options) => {
    assert.equal(role, 'region'); assert.deepEqual(options, { name: 'Starlight scouting request', exact: true });
    reads.push('original-region-query'); return panel;
  } } };
  const seam = capybara.createCapybaraSpecialistActionSeam({}, {}, {
    specialistDriver: {}, updateCapybaraStage: async () => assert.fail('Inspection cannot record a full-game stage.'),
  });
  const inspect = seam.inspectRenderedAction({ regionName: 'Starlight scouting request',
    resultStatuses: ['requested', 'replayed'], scoutChoice: choice });
  return { inspect: patch => inspect({ surface, result, actor, before, gmState: before, crewState: before,
    request, ...patch }), reads };
}

for (const [name, nodes, ready] of [
  ['one original exact visible notice', [statusNode()], true],
  ['no original status node', [], false],
  ['duplicate original exact visible notices', [statusNode(), statusNode()], false],
  ['hidden original exact notice', [statusNode({ visible: false })], false],
  ['original exact notice without geometry', [statusNode({ geometry: false })], false],
  ['another status with the same copy', [statusNode({ noticeClass: false })], false],
  ['a private report status', [statusNode({ text: 'private-report-value-must-never-be-saved' })], false],
]) {
  test(`the same original DOM evaluation retains its boolean result for ${name}`, async () => {
    const f = harness(nodes);
    const observed = await f.inspect();
    assert.equal(observed.ready, ready);
    assert.equal(observed.scoutInspection.renderedStatusQualified, ready);
    assert.equal(observed.scoutInspection.sourceRequestRecordQualified, true);
    assert.deepEqual(f.reads, ['original-region-query', 'original-status-query', 'original-dom-evaluation']);
    if (ready) assert.equal(observed.renderedStatusCode, 'scout-request-recorded-visible');
    else assert.equal(observed.scoutInspection.boundary, 'rendered-status');
  });
}

for (const [name, patch] of [
  ['original before Team phase', { before: { ...before, turnPhase: { airspace: { state: 'restricted' } } } }],
  ['current GM session mismatch', { gmState: { ...before, sessionId: 'foreign-session' } }],
  ['current crew missing docking', { crewState: { ...before, shuttleDockings: [] } }],
  ['current reply receiving ship mismatch', { result: { ...result, receivingShipId: 'dione' } }],
]) {
  test(`the original ${name} rejection is retained without a new DOM evaluation`, async () => {
    const f = harness([statusNode()]);
    const observed = await f.inspect(patch);
    assert.equal(observed.ready, false);
    assert.equal(observed.scoutInspection.sourceRequestRecordQualified, false);
    assert.equal(observed.scoutInspection.boundary, 'scout-record');
    assert.deepEqual(f.reads, ['original-region-query']);
  });
}

test('the original rejected result status cannot evaluate or credit rendered Scout output', async () => {
  const f = harness([statusNode()]);
  const observed = await f.inspect({ result: { ...result, status: 'denied' } });
  assert.equal(observed.ready, false); assert.equal(observed.scoutInspection.boundary, 'result-status');
  assert.deepEqual(f.reads, []);
});
