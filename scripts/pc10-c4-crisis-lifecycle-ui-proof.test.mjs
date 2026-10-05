import assert from 'node:assert/strict';
import test from 'node:test';
import { runBaseC4CustomCrisisLifecycle } from './pc10-crisis-voyage-proof.mjs';

// Reason: pin the Base C4 custom-crisis path to the genuine mounted GM controls,
// original owned C4 Coordination actor, source-offered transition buttons, and
// exact replay of each captured UI request. The fake surface exercises only the
// proof contract; it is not gameplay or acceptance evidence.

const STATES = ['draft', 'delivered', 'debated', 'resolved', 'announced', 'closed'];
const choice = Object.freeze({ crisisId: 'pc10-training-supply-debate', crisisKind: 'custom',
  title: 'Training supply debate',
  details: 'The virtual fleet considers its actual post-mission supply result.', deliveryPressure: 'hold' });

function harness({ cycle = 4, turnStatePhase = 'coordination', currentCrisis = null,
  missingControl = null } = {}) {
  const actor = { sessionId: 'session-1', uidHash: 'gm-hash', instanceId: 'owned-gm-1',
    playerRole: 'gm', gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server',
    cycle, phase: 'active', turnStatePhase };
  let crisis = currentCrisis ? structuredClone(currentCrisis) : null;
  let fields = {};
  let waitingResponse;
  const uiRequests = [];
  const sdkCalls = [];
  const next = {
    none: ['draft'], draft: ['delivered'], delivered: ['debated'], debated: ['resolved', 'escalated'],
    resolved: ['announced'], escalated: ['debated', 'resolved'], announced: ['closed'], closed: ['draft'],
  };
  const permitted = state => (crisis?.state ? next[crisis.state] ?? [] : ['draft']).includes(state) && state !== missingControl;
  const button = state => ({
    isVisible: async () => permitted(state),
    isEnabled: async () => permitted(state),
    click: async () => {
      assert.equal(permitted(state), true, `The source must offer Mark ${state} before click.`);
      const revision = crisis?.revision ?? 0;
      const currentId = crisis?.crisisId;
      const request = {
        sessionId: 'session-1', instanceId: 'owned-gm-1', requestId: `request-${state}`,
        expectedRevision: revision, crisisId: fields.crisisId, state,
        title: fields.title, details: fields.details, crisisKind: fields.crisisKind,
        configurationOverride: '', deliveryPressure: fields.deliveryPressure,
      };
      assert.ok(!currentId || crisis.state === 'closed' || currentId === request.crisisId);
      const result = { status: 'committed', sessionId: 'session-1', crisisId: request.crisisId,
        state, revision: revision + 1, title: request.title, deliveryPressure: request.deliveryPressure };
      crisis = { ...result, details: request.details, crisisKind: request.crisisKind };
      uiRequests.push(structuredClone(request));
      const response = { ok: () => true, url: () => 'http://localhost:5001/demo/us-central1/transitionCrisis',
        request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: structuredClone(request) }) }),
        json: async () => ({ result: structuredClone(result) }) };
      assert.ok(waitingResponse);
      waitingResponse.resolve(response);
      waitingResponse = undefined;
    },
  });
  const panel = {
    getByRole: (_role, options = {}) => {
      if (options.name === 'Crisis state machine') return panel;
      if (typeof options.name === 'string' && options.name.startsWith('Mark ')) return button(options.name.slice(5));
      if (options.name === 'Crisis kind') return control('crisisKind');
      if (options.name instanceof RegExp && options.name.test('Crisis delivery pressure // explicit facilitator framing')) {
        return control('deliveryPressure');
      }
      throw new Error(`Unexpected role query: ${String(options.name)}`);
    },
    getByLabel: label => {
      const key = ({ 'Crisis identifier': 'crisisId', 'Crisis title': 'title',
        'Crisis facilitator notes': 'details' })[label];
      if (key) return control(key);
      throw new Error(`Unexpected label query: ${label}`);
    },
    getByText: text => ({ waitFor: async () => {
      assert.equal(crisis?.crisisId ? `${crisis.crisisId} // ${crisis.state} // revision ${crisis.revision}` : 'No crisis drafted', text);
    } }),
  };
  function control(key) {
    return { isVisible: async () => true, isEnabled: async () => true,
      selectOption: async value => { fields[key] = value; },
      fill: async value => { fields[key] = value; } };
  }
  const page = {
    getByRole: panel.getByRole,
    getByLabel: panel.getByLabel,
    getByText: panel.getByText,
    waitForResponse: predicate => new Promise((resolve, reject) => {
      waitingResponse = { resolve: response => predicate(response) ? resolve(response) : reject(new Error('Unexpected callable response.')) };
    }),
    reload: async () => {},
    evaluate: async () => ({ sessionId: 'session-1', live: true, crisis: crisis ? {
      crisisId: crisis.crisisId, state: crisis.state, revision: crisis.revision, title: crisis.title,
      details: crisis.details, crisisKind: crisis.crisisKind, deliveryPressure: crisis.deliveryPressure,
    } : null }),
  };
  const surface = {
    page,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => structuredClone(actor),
    until: async (_label, predicate) => { assert.equal(predicate(actor), true); return actor; },
    callable: async (endpoint, request) => {
      assert.equal(endpoint, 'transitionCrisis');
      sdkCalls.push(structuredClone(request));
      const response = uiRequests.find(item => item.requestId === request.requestId);
      assert.deepEqual(request, response);
      const result = { status: 'committed', sessionId: request.sessionId, crisisId: request.crisisId,
        state: request.state, revision: request.expectedRevision + 1, title: request.title,
        deliveryPressure: request.deliveryPressure };
      return { status: 'committed', result: { ...result, status: 'replayed' } };
    },
  };
  const context = { initial: { sessionId: 'session-1' }, started: { uidHash: 'gm-hash', instanceId: 'owned-gm-1' }, gm: surface };
  return { context, actor, uiRequests, sdkCalls, current: () => crisis };
}

test('Base C4 advances only the source-offered mounted custom-crisis lifecycle with exact UI receipts and retries', async () => {
  const h = harness();
  const result = await runBaseC4CustomCrisisLifecycle(h.context, choice);
  assert.equal(result.status, 'source-actions-committed');
  assert.deepEqual(result.completedStates, STATES);
  assert.equal(result.physicalAttendanceProof, false);
  assert.equal(result.gameplayAcceptance, false);
  assert.equal(h.uiRequests.length, STATES.length);
  assert.equal(h.sdkCalls.length, STATES.length * 2, 'each captured UI request is replayed before and after reload');
  assert.deepEqual(h.uiRequests.map(request => request.state), STATES);
  assert.deepEqual(h.uiRequests.map(request => request.expectedRevision), [0, 1, 2, 3, 4, 5]);
  for (const request of h.uiRequests) {
    assert.equal(request.crisisId, choice.crisisId);
    assert.equal(request.crisisKind, 'custom');
    assert.equal(request.title, choice.title);
    assert.equal(request.details, choice.details);
    assert.equal(request.deliveryPressure, 'hold');
  }
  assert.equal(h.current().state, 'closed');
  assert.doesNotMatch(JSON.stringify(result), /virtual fleet considers its actual post-mission supply result/);
});

test('a non-C4/non-Coordination actor remains pending without form or mutation requests', async () => {
  for (const wrong of [{ cycle: 3 }, { turnStatePhase: 'team' }]) {
    const h = harness(wrong);
    const result = await runBaseC4CustomCrisisLifecycle(h.context, choice);
    assert.equal(result.status, 'pending');
    assert.equal(h.uiRequests.length, 0);
    assert.equal(h.sdkCalls.length, 0);
  }
});

test('an existing open crisis is not replaced and an unoffered transition stays pending', async () => {
  const open = harness({ currentCrisis: { crisisId: 'existing', state: 'debated', revision: 3,
    title: 'Existing debate', details: 'private', crisisKind: 'custom' } });
  const blockedOpen = await runBaseC4CustomCrisisLifecycle(open.context, choice);
  assert.equal(blockedOpen.status, 'pending');
  assert.equal(open.uiRequests.length, 0);

  const missing = harness({ missingControl: 'resolved' });
  const blockedMissing = await runBaseC4CustomCrisisLifecycle(missing.context, choice);
  assert.equal(blockedMissing.status, 'pending');
  assert.deepEqual(blockedMissing.completedStates, ['draft', 'delivered', 'debated']);
  assert.equal(missing.uiRequests.length, 3, 'no transition is manufactured when the current button is absent');
});
