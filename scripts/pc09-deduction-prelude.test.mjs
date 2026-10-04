import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPc09DeductionPrelude } from './pc09-deduction-prelude.mjs';

function field(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  return { timestampValue: '2026-10-04T10:00:00.000Z' };
}

function fixture() {
  const roles = Array.from({ length: 20 }, (_, index) => `role-${index + 1}`);
  const actors = roles.map((roleId, index) => ({ localId: `uid-${index + 1}`, idToken: `token-${index + 1}`, roleId }));
  const wolfAgent = actors[5], intelligenceAgent = actors[7], wolfCult = actors[10];
  const gm = { localId: 'gm', idToken: 'gm-token' };
  const callLog = [];
  const urlLog = [];
  globalThis.fetch = async (url, options) => {
    urlLog.push({ url: String(url), authorization: options?.headers?.Authorization });
    const isNotice = String(url).includes('/playerHackingNotices/');
    const isAlert = String(url).includes('/wolfHackingAlerts/');
    const body = isNotice ? { fields: {
      type: field('wolf-hacking-overlay-notice'), sessionId: field('session-1'), sequence: field(1),
      createdAt: field(null),
    } } : isAlert ? { fields: {
      type: field('wolf-hacking-alert'), state: field('acknowledged'), revision: field(2),
      clueInstructionHandled: field(true), actorUid: field(wolfAgent.localId),
      targetSystemName: field('Command and Control'), clueInstruction: field('A weak trace remains.'),
    } } : { fields: {
      type: field('intelligence-investigation'), sessionId: field('session-1'),
      investigatorUid: field(intelligenceAgent.localId), targetUid: field(wolfAgent.localId),
      reportedWolf: field(true), revision: field(1),
    } };
    if (String(url).includes('/wolfHackingAlerts/') && options?.headers?.Authorization !== 'Bearer gm-token') {
      return { status: 403, json: async () => ({}) };
    }
    if (String(url).includes('/intelligenceInvestigations/') && options?.headers?.Authorization === 'Bearer token-1') {
      return { status: 403, json: async () => ({}) };
    }
    return { status: 200, json: async () => body };
  };
  return {
    f: {
      roles, players: actors, gm, sessionId: 'session-1', instanceId: 'gm-instance', project: 'demo-project',
      config: { firestorePort: 8090 }, session: { get: async () => ({ get: key => key === 'currentTurn' ? 1 : undefined }) },
      loyaltyActors: { wolfAgent, wolfCult, intelligenceAgent },
      explicitLoyaltySetupProof: [
        { roleId: wolfAgent.roleId, targetUid: wolfAgent.localId, kind: 'wolf-agent' },
        { roleId: wolfCult.roleId, targetUid: wolfCult.localId, kind: 'wolf-cult' },
        { roleId: intelligenceAgent.roleId, targetUid: intelligenceAgent.localId, kind: 'intelligence-agent' },
      ],
      call: async (actor, name, data) => {
        callLog.push({ actor: actor.localId, name, data });
        if (name === 'investigateAsIntelligenceAgent') return { status: 200, result: {
          status: 'committed', type: 'intelligence-investigation', sessionId: 'session-1',
          requestId: data.requestId, cycle: 1, revision: 1, investigatorUid: actor.localId,
          targetUid: data.targetUid, targetDisplayName: 'Wolf Agent', reportedWolf: true, suspicion: 8,
        } };
        if (name === 'startWolfConsoleVisit') return { status: 200, result: {
          status: 'observing', type: 'wolf-console-visit', sessionId: 'session-1',
          visitId: data.requestId, cycle: 1, actorUid: data.targetUid,
          eligibleAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 50000).toISOString(),
        } };
        if (name === 'resolveWolfConsoleSabotage') return { status: 200, result: {
          status: 'committed', type: 'wolf-console-sabotage', sessionId: 'session-1',
          requestId: data.requestId, visitId: data.visitId, cycle: 1, revision: 1,
          actorUid: wolfAgent.localId, coverRoleId: wolfAgent.roleId, targetShipId: 'shepherd',
          targetSystemId: 'command-and-control', targetSystemName: 'Command and Control', mode: 'random',
          suspicion: 4, auditId: `wolf-console-sabotage-${data.requestId}`,
        } };
        if (name === 'acknowledgeWolfHackingAlert') return { status: 200, result: {
          status: 'acknowledged', type: 'wolf-hacking-alert-acknowledgement', sessionId: 'session-1',
          requestId: data.requestId, alertId: data.alertId, noticeId: 'notice-000000000001',
          noticeSequence: 1, revision: 2,
        } };
        if (name === 'calculateArrestPosse') return { status: 200, result: {
          type: 'arrest-posse-calculation', sessionId: 'session-1', revision: 1,
          requestId: data.requestId, targetUid: wolfAgent.localId, defenders: 0,
          requiredPlayers: 6, censusRevision: 21,
        } };
        if (name === 'resolveArrestPosse') return { status: 200, result: {
          status: 'committed', type: 'arrest-posse-outcome', sessionId: 'session-1',
          requestId: data.requestId, turn: 1, revision: 1, targetUid: data.targetUid,
          requiredPlayers: 6, presentPlayers: data.presentPlayerUids.length,
          outcome: 'arrested', deadlineCycle: 2,
        } };
        throw new Error(`Unexpected authenticated action: ${name}`);
      },
      ok: (reply, name) => { assert.equal(reply.status, 200, name); return reply.result; },
    }, callLog, urlLog,
  };
}

test('runs investigator, physical Wolf sabotage, facilitator review, and proves private/public projections separately', async () => {
  const { f, callLog, urlLog } = fixture();
  const previousFetch = globalThis.fetch;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pc09-prelude-test-'));
  let result;
  try {
    result = await runPc09DeductionPrelude(f, { directory });
    const evidence = await readFile(path.join(directory, 'pc09-deduction-prelude.json'), 'utf8');
    assert.equal(evidence.includes('token-'), false);
  } finally {
    globalThis.fetch = previousFetch;
    await rm(directory, { recursive: true, force: true });
  }
  assert.deepEqual(callLog.map(entry => entry.name), [
    'investigateAsIntelligenceAgent', 'startWolfConsoleVisit',
    'resolveWolfConsoleSabotage', 'acknowledgeWolfHackingAlert', 'calculateArrestPosse',
  ]);
  assert.equal(callLog[0].actor, 'uid-8');
  assert.equal(callLog[0].data.targetUid, 'uid-6');
  assert.equal(callLog[2].data.mode, 'random');
  assert.equal(result.checks.playerNoticeIsActorAndDetailFree, true);
  assert.equal(result.checks.alertIsAcknowledgedAndClueHandled, true);
  assert.equal(result.checks.investigationIsPrivate, true);
  assert.equal(urlLog.some(entry => entry.authorization === 'Bearer gm-token'), true);
  assert.deepEqual(result.actors, { wolfAgent: f.loyaltyActors.wolfAgent, intelligenceAgent: f.loyaltyActors.intelligenceAgent });
  assert.equal(JSON.stringify(result.checks).includes('token-'), false);
  assert.equal(result.arrestCase.path, `sessions/session-1/arrestCases/${f.loyaltyActors.wolfAgent.localId}`);
  assert.equal(result.arrestCase.status, 'awaiting-facilitator-attendance');
  assert.equal(result.arrestCase.deadlineCycle, null);
  assert.equal(result.posseCandidates.length, 19);
  assert.deepEqual(result.posseCandidates[0], { uid: 'uid-1', roleId: 'role-1' });
});

test('resolves a posse only from the caller supplied current non-target attendees', async () => {
  const { f, callLog } = fixture();
  const previousFetch = globalThis.fetch;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pc09-prelude-attendance-'));
  let result;
  try {
    result = await runPc09DeductionPrelude(f, {
      directory,
      possePresentPlayerUids: [...f.players.slice(0, 5), f.players[6]].map(player => player.localId),
    });
  } finally {
    globalThis.fetch = previousFetch;
    await rm(directory, { recursive: true, force: true });
  }
  const resolution = callLog.find(entry => entry.name === 'resolveArrestPosse');
  assert.ok(resolution);
  assert.equal(resolution.actor, f.gm.localId);
  assert.equal(resolution.data.expectedCycle, 1);
  assert.equal(resolution.data.expectedRevision, 1);
  assert.deepEqual(resolution.data.presentPlayerUids, ['uid-1', 'uid-2', 'uid-3', 'uid-4', 'uid-5', 'uid-7']);
  assert.equal(result.arrestCase.status, 'pending-resolution');
  assert.equal(result.arrestCase.targetUid, f.loyaltyActors.wolfAgent.localId);
  assert.equal(result.arrestCase.deadlineCycle, 2);
  assert.equal(result.arrestOutcome.deadlineCycle, 2);
});

test('refuses proof sessions without the normally assigned explicit role actors', async () => {
  const { f, callLog } = fixture();
  f.loyaltyActors = undefined;
  await assert.rejects(runPc09DeductionPrelude(f, { directory: '/tmp/pc09-proof' }), /normal authenticated explicit loyalty setup/i);
  assert.deepEqual(callLog, []);
});
