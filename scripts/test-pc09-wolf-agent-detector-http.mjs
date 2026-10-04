import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const directory = process.env.PC09_DETECTOR_EVIDENCE_DIRECTORY;
assert.ok(directory, 'Set an external evidence directory.');
await mkdir(directory, { recursive: true });

function decodeField(field) {
  if (Object.hasOwn(field ?? {}, 'stringValue')) return field.stringValue;
  if (Object.hasOwn(field ?? {}, 'booleanValue')) return field.booleanValue;
  if (Object.hasOwn(field ?? {}, 'integerValue')) return Number(field.integerValue);
  if (Object.hasOwn(field ?? {}, 'timestampValue')) return field.timestampValue;
  return undefined;
}

function decodeDocument(value) {
  const fields = value?.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, decodeField(field)]));
}

async function readDocument(f, actor, suffix) {
  const url = `http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${f.sessionId}/${suffix}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${actor.idToken}` } });
  return { status: response.status, document: response.status === 200 ? decodeDocument(await response.json()) : null };
}

function ok(f, reply, name) {
  assert.equal(reply.status, 200, `${name}: ${reply.error?.message}`);
  return reply.result;
}

const f = await createPc07AuthenticatedSession('PC09 authenticated detector proof', 20, {
  keepAlive: true,
  expansion: 'capybara',
  capybaraEnabled: true,
  explicitLoyaltySetup: {
    wolfAgentRoleId: 'refinery-124-pdf-colonel',
    wolfCultRoleId: 'wing-commander',
    intelligenceAgentRoleId: 'quellon-explorer',
  },
});

try {
  const scientist = f.byRole('shepherd-scientist');
  const researcherRoleId = f.roles[f.players.findIndex((player) => player.localId === scientist.localId)];
  const researchCycles = [];

  for (let box = 1; box <= 4; box += 1) {
    const workspace = ok(f, await f.call(scientist, 'readEndeavourResearchWorkspace', {
      sessionId: f.sessionId,
    }), `read detector research ${box}`);
    assert.equal(workspace.cycle, box);
    const session = await f.session.get();
    const control = session.get('shuttleControl')?.endeavour;
    assert.equal(control?.holderUid, scientist.localId, 'The normal session must assign the Endeavour to the Scientist.');
    const advanced = ok(f, await f.call(scientist, 'advanceEndeavourResearchTrack', {
      sessionId: f.sessionId,
      requestId: randomUUID(),
      expectedControlRevision: control.revision,
      expectedResearchRevision: workspace.researchRevision,
      expectedCycle: workspace.cycle,
      trackId: 'wolf-agent-detector',
      funding: 'standard',
    }), `research detector box ${box}`);
    assert.equal(advanced.progress['wolf-agent-detector'], box);
    researchCycles.push(workspace.cycle);

    if (box < 4) {
      ok(f, await f.call(f.gm, 'advanceTurn', {
        sessionId: f.sessionId,
        instanceId: f.instanceId,
        requestId: randomUUID(),
        expectedTurn: workspace.cycle,
        overridePhaseTimer: true,
      }), `advance to research cycle ${box + 1}`);
      const nextPhase = (await f.session.get()).get('turnPhase');
      if (nextPhase?.timerPause) {
        ok(f, await f.call(f.byRole('executive-officer'), 'clearTurnAdvanceInterstitial', {
          sessionId: f.sessionId,
          requestId: randomUUID(),
          expectedCycle: box + 1,
          expectedPausedAt: nextPhase.timerPause.pausedAt,
        }), `clear research cycle ${box + 1} briefing`);
      }
    }
  }

  const workspace = ok(f, await f.call(scientist, 'readEndeavourResearchWorkspace', {
    sessionId: f.sessionId,
  }), 'read completed detector research');
  assert.equal(workspace.tracks.find((track) => track.trackId === 'wolf-agent-detector')?.complete, true);
  const targetActors = [
    f.loyaltyActors.wolfAgent,
    f.loyaltyActors.wolfCult,
    f.byRole('admiral'),
  ];
  const actions = [];
  for (let index = 0; index < targetActors.length; index += 1) {
    const reply = ok(f, await f.call(scientist, 'runWolfAgentDetectorTest', {
      sessionId: f.sessionId,
      requestId: randomUUID(),
      expectedCycle: workspace.cycle,
      expectedRevision: index,
      targetUid: targetActors[index].localId,
    }), `run detector test ${index + 1}`);
    assert.equal(reply.revision, index + 1);
    assert.equal(reply.reportedWolf instanceof Boolean || typeof reply.reportedWolf === 'boolean', true);
    assert.equal(Object.hasOwn(reply, 'actualWolf'), false);
    assert.equal(Object.hasOwn(reply, 'accuracyRoll'), false);
    assert.equal(Object.hasOwn(reply, 'accurate'), false);
    const audit = await f.db.doc(`sessions/${f.sessionId}/wolfAgentDetectorAudits/${reply.requestId}`).get();
    assert.equal(audit.exists, true, 'The server must persist a separate audit for each detector test.');
    const auditData = audit.data();
    assert.equal(typeof auditData.actualWolf, 'boolean');
    assert.equal(typeof auditData.accurate, 'boolean');
    assert.ok(Number.isSafeInteger(auditData.accuracyRoll));
    actions.push({ revision: reply.revision, reportedWolf: reply.reportedWolf });
  }

  const exhausted = await f.call(scientist, 'runWolfAgentDetectorTest', {
    sessionId: f.sessionId,
    requestId: randomUUID(),
    expectedCycle: workspace.cycle,
    expectedRevision: 3,
    targetUid: targetActors[0].localId,
  });
  assert.notEqual(exhausted.status, 200, 'The fourth test in a cycle must be rejected.');

  const currentReport = await readDocument(f, scientist,
    `wolfAgentDetectorReports/${scientist.localId}`);
  assert.equal(currentReport.status, 200, 'Only the investigator may read their latest report.');
  assert.equal(currentReport.document?.reportedWolf, actions.at(-1)?.reportedWolf);
  for (const secretField of ['actualWolf', 'accurate', 'accuracyRoll', 'targetLoyaltyKind']) {
    assert.equal(Object.hasOwn(currentReport.document ?? {}, secretField), false);
  }
  const unauthorizedReport = await readDocument(f, f.byRole('admiral'),
    `wolfAgentDetectorReports/${scientist.localId}`);
  assert.notEqual(unauthorizedReport.status, 200, 'Other current players cannot read the Scientist report.');
  const state = await readDocument(f, scientist, `wolfAgentDetectorStates/${scientist.localId}`);
  assert.equal(state.status, 200);
  assert.deepEqual(state.document, { cycle: workspace.cycle, revision: 3, testsUsed: 3 });

  const evidence = {
    schemaVersion: 1,
    fixture: 'normal authenticated twenty-post setup; detector research advanced through its callable once in each of four cycles',
    researcherRoleId,
    researchCycles,
    testsCommitted: actions.length,
    cycleAllowanceExhausted: exhausted.status !== 200,
    reportPrivateAndTruthFree: currentReport.status === 200 && unauthorizedReport.status !== 200,
    separateServerTruthAudits: actions.length,
  };
  const evidencePath = path.join(directory, 'pc09-wolf-agent-detector.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...evidence, evidencePath }, null, 2));
} finally {
  await f.cleanup();
}
