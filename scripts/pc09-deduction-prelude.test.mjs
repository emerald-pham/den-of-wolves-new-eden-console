import assert from 'node:assert/strict';
import test from 'node:test';
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
        { roleId: wolfAgent.roleId, kind: 'wolf-agent' },
        { roleId: wolfCult.roleId, kind: 'wolf-cult' },
        { roleId: intelligenceAgent.roleId, kind: 'intelligence-agent' },
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
        throw new Error(`Unexpected authenticated action: ${name}`);
      },
      ok: (reply, name) => { assert.equal(reply.status, 200, name); return reply.result; },
    }, callLog, urlLog,
  };
}

test('runs investigator, physical Wolf sabotage, facilitator review, and proves private/public projections separately', async () => {
  const { f, callLog, urlLog } = fixture();
  const result = await runPc09DeductionPrelude(f, { directory: '/tmp/pc09-proof' });
  assert.deepEqual(callLog.map(entry => entry.name), [
    'investigateAsIntelligenceAgent', 'startWolfConsoleVisit',
    'resolveWolfConsoleSabotage', 'acknowledgeWolfHackingAlert',
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
});

test('refuses proof sessions without the normally assigned explicit role actors', async () => {
  const { f, callLog } = fixture();
  f.loyaltyActors = undefined;
  await assert.rejects(runPc09DeductionPrelude(f, { directory: '/tmp/pc09-proof' }), /normal authenticated explicit loyalty setup/i);
  assert.deepEqual(callLog, []);
});
