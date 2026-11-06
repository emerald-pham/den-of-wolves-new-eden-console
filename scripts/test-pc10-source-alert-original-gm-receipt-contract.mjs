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
  mountedType = type,
  targetInstanceId = originalInstanceId,
  mountDelayPolls = 0,
  alertSequence = false,
  renderWrongVessel = false,
  staleBeforeRecipe = false,
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
  let actionStateReads = 0;
  let pendingResponse = null;
  let requestSequence = 0;
  const listeners = new Set();
  const visibleShipId = renderWrongVessel ? 'dione' : mountedShipId;
  const currentMountedType = () => alertSequence
    ? Object.keys(sourceState.unrestAlerts).length > 0 ? 'unrest'
      : Object.keys(sourceState.populationAlerts).length > 0 ? 'population' : mountedType
    : mountedType;
  const labelFor = type => type === 'population' ? 'Dismiss population alert' : 'Dismiss unrest alert';
  const visibleShipName = visibleShipId === 'aegis' ? 'AEGIS' : 'Dione';
  const dialogText = type => type === 'population'
    ? `Survivor population threshold reached. ${visibleShipName} survivor population has reached 500. A census threshold requires GM attention.`
    : `Unrest threshold exceeded. ${visibleShipName} has exceeded the maximum unrest dial rating of 7. Shipboard stability is no longer measurable.`;
  const mounted = () => ++mountPolls > mountDelayPolls;
  const button = {
    count: async () => mounted() ? 1 : 0,
    isVisible: async () => true,
    isEnabled: async () => true,
    click: async () => {
      const actionType = currentMountedType();
      const requestId = `source-alert-request-${++requestSequence}`;
      const requestData = {
        sessionId,
        instanceId: actorInstanceId,
        shipId: mountedShipId,
        requestId,
        expectedRevision: sourceState.vesselActionRevisions[mountedShipId],
      };
      const revision = requestData.expectedRevision + 1;
      lastRequest = { method: () => 'POST', url: () => `http://localhost/us-central1/dismiss${actionType === 'population' ? 'Population' : 'Unrest'}Alert`,
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
        auditId: `dismiss-${actionType}-${requestId}`,
      };
      for (const listener of listeners) listener(lastRequest);
      const alerts = actionType === 'population' ? sourceState.populationAlerts : sourceState.unrestAlerts;
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
    innerText: async () => dialogText(currentMountedType()),
    getByRole: (role, options) => role === 'button' && options?.name === labelFor(currentMountedType()) ? button : absentLocator,
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
      if (role === 'status') return { allTextContents: async () => [lastResult ? `Dismiss ${currentMountedType()} alert committed.` : ''] };
      return absentLocator;
    },
    waitForResponse: predicate => new Promise(resolve => {
      pendingResponse = { predicate, resolve };
    }),
    evaluate: async (_fn, input) => {
      if (input?.expectedSessionId) return structuredClone(actor);
      actionStateReads += 1;
      if (staleBeforeRecipe && actionStateReads === 1) {
        const rows = type === 'population' ? sourceState.populationAlerts : sourceState.unrestAlerts;
        rows[sourceShipId] = { ...rows[sourceShipId], createdAt: '2026-10-17T10:00:01.000Z' };
        sourceState.vesselActionRevisions[sourceShipId] += 1;
      }
      return structuredClone(sourceState);
    },
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
    `The fixture must observe the real mounted UI request and current source revision: ${JSON.stringify(result.alertResult.evidence.cases[0])}`);
  assert.equal(result.alertResult.sourceInterruptionsReady, true,
    'Governance is released only after the original GM source-alert receipt is bound.');
  assert.equal(result.alertResult.evidence.cases[0].status, 'completed');
  assert.deepEqual(result.alertResult.evidence.cases[0].sourceAlertReceipt, {
    kind: 'gm-source-alert-receipt-v1',
    type: 'population',
    shipId: 'aegis',
    sourceRevisionBefore: 3,
    sourceRevisionAfter: 4,
    alertIdentityHash: result.alertResult.evidence.cases[0].sourceAlertReceipt.alertIdentityHash,
    alertIdentityMatched: true,
    alertRemoved: true,
    originalGmUidHash: originalUidHash,
    originalGmInstanceHash: hash(originalInstanceId),
    exactReplay: true,
  });
  assert.match(result.alertResult.evidence.cases[0].sourceAlertReceipt.alertIdentityHash, /^[0-9a-f]{64}$/);
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

test('the mounted unrest dialog binds to the exact unrest source row and original GM receipt', async () => {
  const fixture = makeFixture({ type: 'unrest' });
  const result = await callbacksFor(fixture).onEligibleAlert(fixture.context);
  assert.equal(result.sourceInterruptionsReady, true);
  assert.equal(result.evidence.cases[0].caseId, 'gm:dismissUnrestAlert');
  assert.equal(result.evidence.cases[0].sourceAlertReceipt.type, 'unrest');
  assert.equal(result.evidence.cases[0].sourceAlertReceipt.shipId, 'aegis');
  assert.equal(result.evidence.cases[0].sourceAlertReceipt.exactReplay, true);
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

test('a source alert targeted to another GM instance cannot be consumed by the original GM or release governance', async () => {
  const fixture = makeFixture({ targetInstanceId: 'gm-instance-other' });
  const result = await invokeActualSourceInterruption(callbacksFor(fixture).onEligibleAlert, fixture.context);
  assert.equal(result.alertResult.sourceInterruptionsReady, false);
  assert.equal(result.events.includes('governance'), false);
  assert.equal(result.error?.message, 'eligible source alert was not acknowledged by the original GM');
  assert.deepEqual(fixture.sourceState.populationAlerts.aegis.targetGmInstanceIds, ['gm-instance-other']);
});

test('a mounted control for a different vessel cannot consume the source alert or release governance', async () => {
  const fixture = makeFixture({ renderWrongVessel: true });
  const result = await invokeActualSourceInterruption(callbacksFor(fixture).onEligibleAlert, fixture.context);
  assert.equal(result.alertResult.sourceInterruptionsReady, false);
  assert.equal(result.events.includes('governance'), false);
  assert.equal(result.error?.message, 'eligible source alert was not acknowledged by the original GM');
  assert.ok(fixture.sourceState.populationAlerts.aegis);
});

test('a stale source-alert row or revision stays pending and prevents governance', async () => {
  const fixture = makeFixture({ staleBeforeRecipe: true });
  const result = await invokeActualSourceInterruption(callbacksFor(fixture).onEligibleAlert, fixture.context);
  assert.equal(result.alertResult.sourceInterruptionsReady, false);
  assert.equal(result.events.includes('governance'), false);
  assert.equal(result.error?.message, 'eligible source alert was not acknowledged by the original GM');
  assert.equal(fixture.sourceState.populationAlerts.aegis.createdAt, '2026-10-17T10:00:01.000Z');
});

test('a mounted dialog for the wrong alert type stays pending and prevents governance', async () => {
  const fixture = makeFixture({ type: 'population', mountedType: 'unrest' });
  const result = await invokeActualSourceInterruption(callbacksFor(fixture).onEligibleAlert, fixture.context);
  assert.equal(result.alertResult.sourceInterruptionsReady, false);
  assert.equal(result.events.includes('governance'), false);
  assert.equal(result.error?.message, 'eligible source alert was not acknowledged by the original GM');
  assert.ok(fixture.sourceState.populationAlerts.aegis);
});

test('multiple alert types on one vessel use each dismissal’s current source revision', async () => {
  const fixture = makeFixture({ alertSequence: true });
  fixture.sourceState.unrestAlerts.aegis = alertRow('aegis', 'AEGIS', originalInstanceId, 'unrest');

  const result = await invokeActualSourceInterruption(callbacksFor(fixture).onEligibleAlert, fixture.context);

  assert.equal(result.error, null,
    `Both current source alerts are acknowledged before governance: ${JSON.stringify(result.alertResult.evidence.cases)}`);
  assert.equal(result.alertResult.sourceInterruptionsReady, true);
  assert.deepEqual(result.alertResult.evidence.cases.map(item => ({
    type: item.sourceAlertReceipt?.type,
    before: item.sourceAlertReceipt?.sourceRevisionBefore,
    after: item.sourceAlertReceipt?.sourceRevisionAfter,
  })), [
    { type: 'unrest', before: 3, after: 4 },
    { type: 'population', before: 4, after: 5 },
  ]);
  assert.deepEqual(result.events, ['post-wolf/eligible-alert', 'post-wolf/eligible-mutiny',
    'post-wolf/eligible-destruction', 'governance']);
  assert.equal(Object.keys(fixture.sourceState.unrestAlerts).length +
    Object.keys(fixture.sourceState.populationAlerts).length, 0);
});
