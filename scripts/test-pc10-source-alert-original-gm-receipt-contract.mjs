import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createPendingGmRulingsCountersCallbacks } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';

const sessionId = 'pc10-source-alert-session';
const originalUid = 'original-facilitator-uid';
const originalUidHash = hash(originalUid);
const originalInstanceId = 'gm-instance-original';

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function alertRow(shipId, shipName, targetInstance = originalInstanceId, type = 'population') {
  return {
    shipId,
    shipName,
    targetGmInstanceIds: [targetInstance],
    createdAt: '2026-10-17T10:00:00.000Z',
    ...(type === 'population' ? { population: 500 } : {}),
  };
}

function makeFixture({
  actorUid = originalUid,
  actorInstanceId = originalInstanceId,
  actorOwned = true,
  sourceShipId = 'aegis',
  mountedShipId = sourceShipId,
  type = 'population',
  targetInstanceId = originalInstanceId,
  mountDelayPolls = 0,
  renderWrongVessel = false,
} = {}) {
  const actorUidHash = hash(actorUid);
  const sourceState = {
    live: true,
    sessionId,
    phase: 'active',
    cycle: 1,
    activeVesselIds: ['aegis', 'dione'],
    vesselActionRevisions: { aegis: 3, dione: 7 },
    shipFleetGroupIds: { aegis: 'fleet-1', dione: 'fleet-1' },
    populationAlerts: type === 'population'
      ? { [sourceShipId]: alertRow(sourceShipId, sourceShipId === 'aegis' ? 'AEGIS' : 'Dione', targetInstanceId, type) }
      : {},
    unrestAlerts: type === 'unrest'
      ? { [sourceShipId]: alertRow(sourceShipId, sourceShipId === 'aegis' ? 'AEGIS' : 'Dione', targetInstanceId, type) }
      : {},
  };
  const actor = {
    sameActor: true,
    sessionId,
    uidHash: actorUidHash,
    playerRole: 'gm',
    profileRoleId: null,
    activeConsoleRoleId: null,
    assignedRoleId: null,
    instanceId: actorInstanceId,
    gmInstanceOwned: actorOwned,
    connection: 'live',
    freshness: 'server',
    phase: 'active',
    cycle: 1,
  };
  let mountPolls = 0;
  let lastRequest = null;
  let lastResult = null;
  let replayCount = 0;
  let pendingResponse = null;
  const listeners = new Set();
  const visibleShipId = renderWrongVessel ? 'dione' : mountedShipId;
  const label = type === 'population' ? 'Dismiss population alert' : 'Dismiss unrest alert';
  const visibleShipName = visibleShipId === 'aegis' ? 'AEGIS' : 'Dione';
  const dialogText = type === 'population'
    ? `${visibleShipName} survivor population has reached 500. A census threshold requires GM attention.`
    : `${visibleShipName} has exceeded the maximum unrest dial rating of 7. Shipboard stability is no longer measurable.`;
  const mounted = () => ++mountPolls > mountDelayPolls;
  const button = {
    count: async () => mounted() ? 1 : 0,
    isVisible: async () => true,
    isEnabled: async () => true,
    click: async () => {
      const requestId = 'source-alert-request-1';
      const requestData = {
        sessionId,
        instanceId: actorInstanceId,
        shipId: mountedShipId,
        requestId,
        expectedRevision: sourceState.vesselActionRevisions[mountedShipId],
      };
      const revision = requestData.expectedRevision + 1;
      lastRequest = { method: () => 'POST', url: () => `http://localhost/us-central1/dismiss${type === 'population' ? 'Population' : 'Unrest'}Alert`,
        postDataJSON: () => ({ data: requestData }) };
      lastResult = {
        dismissed: true,
        shipId: mountedShipId,
        actorUid,
        actorRoleId: 'gm',
        vesselId: mountedShipId,
        turn: 1,
        phase: 'active',
        revision,
        idempotencyKey: requestId,
        auditId: `dismiss-${type}-${requestId}`,
      };
      for (const listener of listeners) listener(lastRequest);
      const alerts = type === 'population' ? sourceState.populationAlerts : sourceState.unrestAlerts;
      delete alerts[mountedShipId];
      sourceState.vesselActionRevisions[mountedShipId] = revision;
      const response = {
        request: () => lastRequest,
        url: () => lastRequest.url(),
        ok: () => true,
        status: () => 200,
        json: async () => ({ result: lastResult }),
      };
      assert.ok(pendingResponse, 'The UI response listener must be armed before clicking.');
      assert.equal(pendingResponse.predicate(response), true);
      pendingResponse.resolve(response);
      pendingResponse = null;
      return undefined;
    },
  };
  const dialog = {
    count: async () => mounted() ? 1 : 0,
    isVisible: async () => true,
    isEnabled: async () => true,
    innerText: async () => dialogText,
    getByRole: (role, options) => role === 'button' && options?.name === label ? button : absentLocator,
  };
  const absentLocator = {
    count: async () => 0,
    isVisible: async () => false,
    isEnabled: async () => false,
    click: async () => { throw new Error('No matching source alert control is mounted.'); },
  };
  const page = {
    url: () => 'http://localhost/#/gm',
    on: (event, listener) => { if (event === 'request') listeners.add(listener); },
    off: (event, listener) => { if (event === 'request') listeners.delete(listener); },
    getByRole: (role, options) => {
      if (role === 'alertdialog') return dialog;
      if (role === 'status') return { allTextContents: async () => [lastResult ? `Dismiss ${type} alert committed.` : ''] };
      return absentLocator;
    },
    waitForResponse: predicate => new Promise((resolve, reject) => {
      pendingResponse = { predicate, resolve, reject };
      if (lastRequest) reject(new Error('The response listener was armed after the mounted click.'));
    }),
    evaluate: async (_fn, input) => input?.expectedSessionId ? structuredClone(actor) : structuredClone(sourceState),
  };
  const surface = {
    page,
    observe: async () => structuredClone(actor),
    storeModuleUrl: () => '/fixture/useSessionStore.ts',
    callable: async (_endpoint, request) => {
      replayCount += 1;
      assert.deepEqual(request, lastRequest.postDataJSON().data);
      return { status: 'committed', result: structuredClone(lastResult) };
    },
  };
  const game = {
    select: async roleId => {
      assert.equal(roleId, 'gm');
      return surface;
    },
    state: async () => structuredClone(sourceState),
  };
  const started = { uidHash: originalUidHash, instanceId: originalInstanceId };
  const context = {
    initial: { sessionId, uidHash: originalUidHash },
    started,
    gm: surface,
    directory: undefined,
    sourceCommit: 'fixture-source-commit',
  };
  return { context, game, sourceState, surface, get lastRequest() { return lastRequest; },
    get replayCount() { return replayCount; }, get mountPolls() { return mountPolls; } };
}

async function invokeActualSourceInterruption(callback, context) {
  const source = await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('base.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const run = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'runBaseGameplay');
  const interruption = run.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'sourceInterruptions');
  assert.ok(interruption, 'Use the actual Base runner source-interruption function.');
  const events = [];
  let alertResult;
  const procedures = {
    onEligibleAlert: callback,
    onEligibleMutiny: async () => ({ status: 'pending' }),
    onEligibleDestruction: async () => ({ status: 'pending' }),
  };
  const compose = async (stage, action, callbackContext = context) => {
    const result = await action(callbackContext);
    if (stage.endsWith('/eligible-alert')) alertResult = result;
    events.push(stage);
    return result;
  };
  const execute = runInNewContext(`(async () => { ${interruption.getText(tree)}; await sourceInterruptions('post-wolf'); await governance(); })()`, {
    context,
    procedures,
    compose,
    governance: async () => { events.push('governance'); },
  });
  let error = null;
  try { await execute; } catch (caught) { error = caught; }
  return { events, alertResult, error };
}

function callbacksFor(fixture) {
  return createPendingGmRulingsCountersCallbacks({
    steps: createPendingProcedureDefaultSteps(),
    gameFactory: () => fixture.game,
  });
}

test('the real eligible-alert callback binds its mounted dismissal receipt to the exact source alert and original GM', async () => {
  const fixture = makeFixture();
  const callbacks = callbacksFor(fixture);
  const result = await invokeActualSourceInterruption(callbacks.onEligibleAlert, fixture.context);

  assert.equal(result.alertResult.evidence.cases[0].status, 'completed',
    'The fixture must observe the real mounted UI request and current source revision.');
  assert.equal(result.alertResult.sourceInterruptionsReady, true,
    'Governance is released only after the original GM source-alert receipt is bound.');
  assert.equal(result.alertResult.evidence.cases[0].status, 'completed');
  assert.deepEqual(result.alertResult.evidence.cases[0].sourceAlertReceipt, {
    kind: 'gm-source-alert-receipt-v1',
    type: 'population',
    shipId: 'aegis',
    sourceRevisionBefore: 3,
    sourceRevisionAfter: 4,
    alertIdentityMatched: true,
    alertRemoved: true,
    originalGmUidHash: originalUidHash,
    originalGmInstanceHash: hash(originalInstanceId),
    exactReplay: true,
  });
  assert.equal(fixture.lastRequest.postDataJSON().data.shipId, 'aegis');
  assert.equal(fixture.lastRequest.postDataJSON().data.instanceId, originalInstanceId);
  assert.equal(fixture.lastRequest.postDataJSON().data.expectedRevision, 3);
  assert.equal(fixture.replayCount, 1);
  assert.ok(result.events.indexOf('post-wolf/eligible-alert') < result.events.indexOf('governance'));
});

test('the exact source alert may mount after a short delay and still complete its original receipt', async () => {
  const fixture = makeFixture({ mountDelayPolls: 3 });
  const result = await callbacksFor(fixture).onEligibleAlert(fixture.context);
  assert.equal(result.sourceInterruptionsReady, true);
  assert.equal(result.evidence.cases[0].status, 'completed');
  assert.ok(fixture.mountPolls >= 4, 'The recipe waits for the matching current alert control to mount.');
});

test('an alert aimed at another GM cannot use that actor’s mounted control or release governance', async () => {
  const fixture = makeFixture({ actorUid: 'other-facilitator-uid', actorInstanceId: 'gm-instance-other',
    targetInstanceId: originalInstanceId });
  const result = await invokeActualSourceInterruption(callbacksFor(fixture).onEligibleAlert, fixture.context);
  assert.equal(result.alertResult.sourceInterruptionsReady, false);
  assert.equal(result.events.includes('governance'), false);
  assert.equal(result.error?.message, 'eligible source alert was not acknowledged by the original GM');
  assert.equal(fixture.sourceState.populationAlerts.aegis.shipId, 'aegis');
});

test('a mounted control for a different vessel cannot consume the source alert or release governance', async () => {
  const fixture = makeFixture({ renderWrongVessel: true });
  const result = await invokeActualSourceInterruption(callbacksFor(fixture).onEligibleAlert, fixture.context);
  assert.equal(result.alertResult.sourceInterruptionsReady, false);
  assert.equal(result.events.includes('governance'), false);
  assert.equal(result.error?.message, 'eligible source alert was not acknowledged by the original GM');
  assert.ok(fixture.sourceState.populationAlerts.aegis);
});
