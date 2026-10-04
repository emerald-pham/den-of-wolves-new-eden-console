import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function asResult(f, reply, step) {
  return f.ok(reply, step);
}

async function authenticatedCommand(f, actor, name, data) {
  return asResult(f, await f.call(actor, name, { sessionId: f.sessionId, ...data }), name);
}

function decodeFirestoreField(field) {
  if (Object.hasOwn(field ?? {}, 'stringValue')) return field.stringValue;
  if (Object.hasOwn(field ?? {}, 'booleanValue')) return field.booleanValue;
  if (Object.hasOwn(field ?? {}, 'integerValue')) return Number(field.integerValue);
  if (Object.hasOwn(field ?? {}, 'timestampValue')) return field.timestampValue;
  return undefined;
}

function decodedDocument(value) {
  const fields = value?.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, decodeFirestoreField(field)]));
}

async function readDocument(f, actor, suffix) {
  const url = `http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${f.sessionId}/${suffix}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${actor.idToken}` } });
  return { status: response.status, document: response.status === 200 ? decodedDocument(await response.json()) : null };
}

function hasExactKeys(value, keys) {
  return value && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validateExplicitActors(f) {
  const aliases = f.loyaltyActors;
  const required = ['wolfAgent', 'intelligenceAgent', 'wolfCult'];
  if (!aliases || required.some((key) => !aliases[key]?.localId || !aliases[key]?.idToken) ||
      !Array.isArray(f.roles) || f.roles.length !== 20 || !Array.isArray(f.players) || f.players.length !== 20 ||
      !Array.isArray(f.explicitLoyaltySetupProof)) {
    throw new Error('Use the normal authenticated explicit loyalty setup with a complete twenty-post roster first.');
  }
  const roleIds = {};
  for (const [key, kind, roleKey] of [
    ['wolfAgent', 'wolf-agent', 'wolfAgent'],
    ['intelligenceAgent', 'intelligence-agent', 'intelligenceAgent'],
    ['wolfCult', 'wolf-cult', 'wolfCult'],
  ]) {
    const actor = aliases[key];
    const row = f.explicitLoyaltySetupProof.find((entry) => entry.kind === kind && entry.targetUid === actor.localId);
    const index = row ? f.roles.indexOf(row.roleId) : -1;
    if (!row || index < 0 || f.players[index]?.localId !== actor.localId) {
      throw new Error(`The normal setup did not authenticate a current ${kind} actor.`);
    }
    roleIds[roleKey] = row.roleId;
  }
  return { aliases, roleIds };
}

/**
 * Reuse a normal PC07 authenticated fixture to prove PC09 investigation and
 * facilitator-only arrest setup. The optional posse list is an explicit GM
 * attendance attestation supplied by the composed caller, never inferred.
 */
export async function runPc09DeductionPrelude(f, {
  directory,
  possePresentPlayerUids,
} = {}) {
  if (typeof directory !== 'string' || directory.length === 0) {
    throw new Error('An evidence directory is required for the authenticated PC09 prelude.');
  }
  const { aliases: actors, roleIds } = validateExplicitActors(f);
  const cycle = (await f.session.get()).get('currentTurn');
  assert.ok(Number.isSafeInteger(cycle) && cycle >= 1, 'The ordinary authenticated session must have a live cycle.');
  const checks = { loyaltySource: 'explicit-GM-authenticated-assignLoyalty', currentCycle: cycle };

  const investigation = await authenticatedCommand(f, actors.intelligenceAgent, 'investigateAsIntelligenceAgent', {
    requestId: randomUUID(), expectedCycle: cycle, targetUid: actors.wolfAgent.localId,
  });
  assert.equal(investigation.type, 'intelligence-investigation');
  assert.equal(investigation.investigatorUid, actors.intelligenceAgent.localId);
  assert.equal(investigation.targetUid, actors.wolfAgent.localId);
  assert.equal(typeof investigation.reportedWolf, 'boolean');
  assert.equal(Object.hasOwn(investigation, 'actualWolf'), false);
  assert.equal(Object.hasOwn(investigation, 'accurate'), false);
  checks.privateInvestigationCallable = true;

  const visit = await authenticatedCommand(f, f.gm, 'startWolfConsoleVisit', {
    instanceId: f.instanceId, requestId: randomUUID(), expectedCycle: cycle,
    targetUid: actors.wolfAgent.localId, targetShipId: 'shepherd',
  });
  assert.equal(visit.actorUid, actors.wolfAgent.localId);
  const readyAt = Date.parse(visit.eligibleAt);
  assert.ok(Number.isFinite(readyAt), 'The server must issue a timed physical observation window.');
  const waitMs = Math.max(0, readyAt - Date.now());
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const sabotage = await authenticatedCommand(f, f.gm, 'resolveWolfConsoleSabotage', {
    instanceId: f.instanceId, requestId: randomUUID(), visitId: visit.visitId,
    expectedCycle: cycle, mode: 'random',
  });
  assert.equal(sabotage.actorUid, actors.wolfAgent.localId);
  assert.equal(sabotage.mode, 'random');
  assert.equal(Object.hasOwn(sabotage, 'accuracyRoll'), false);
  checks.physicalWolfConsoleObservation = true;

  const acknowledgement = await authenticatedCommand(f, f.gm, 'acknowledgeWolfHackingAlert', {
    instanceId: f.instanceId, requestId: randomUUID(), alertId: sabotage.requestId, expectedRevision: 1,
  });
  assert.equal(acknowledgement.revision, 2);
  const privateAlert = await readDocument(f, f.gm, `wolfHackingAlerts/${sabotage.requestId}`);
  assert.equal(privateAlert.status, 200);
  assert.equal(privateAlert.document?.state, 'acknowledged');
  assert.equal(privateAlert.document?.clueInstructionHandled, true);
  assert.equal(typeof privateAlert.document?.clueInstruction, 'string');
  const unauthorizedAlert = await readDocument(f, actors.intelligenceAgent, `wolfHackingAlerts/${sabotage.requestId}`);
  assert.equal(unauthorizedAlert.status, 403, 'A regular player cannot read the facilitator alert or clue instruction.');
  checks.alertIsAcknowledgedAndClueHandled = true;

  const publicNoticePath = `playerHackingNotices/${acknowledgement.noticeId}`;
  for (const player of f.players) {
    const notice = await readDocument(f, player, publicNoticePath);
    assert.equal(notice.status, 200, 'Every current player should read the decorative overlay notice.');
    assert.ok(hasExactKeys(notice.document, ['type', 'sessionId', 'sequence', 'createdAt']));
    assert.equal(notice.document.type, 'wolf-hacking-overlay-notice');
    assert.equal(notice.document.sessionId, f.sessionId);
    assert.equal(notice.document.sequence, acknowledgement.noticeSequence);
    assert.equal(Object.hasOwn(notice.document, 'actorUid'), false);
    assert.equal(Object.hasOwn(notice.document, 'targetSystemName'), false);
  }
  checks.playerNoticeIsActorAndDetailFree = true;
  checks.overlayNoticeReadableByAllRosterActors = f.players.length;

  const privateInvestigation = await readDocument(f, actors.intelligenceAgent,
    `intelligenceInvestigations/${actors.intelligenceAgent.localId}`);
  assert.equal(privateInvestigation.status, 200);
  assert.equal(Object.hasOwn(privateInvestigation.document, 'actualWolf'), false);
  assert.equal(Object.hasOwn(privateInvestigation.document, 'accurate'), false);
  const unauthorizedInvestigation = await readDocument(f, f.players.find((player) => player.localId !== actors.intelligenceAgent.localId),
    `intelligenceInvestigations/${actors.intelligenceAgent.localId}`);
  assert.equal(unauthorizedInvestigation.status, 403);
  checks.investigationIsPrivate = true;

  const calculation = await authenticatedCommand(f, f.gm, 'calculateArrestPosse', {
    instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: 0,
    targetUid: actors.wolfAgent.localId, defenders: 0,
  });
  assert.equal(calculation.targetUid, actors.wolfAgent.localId);
  assert.ok(Number.isSafeInteger(calculation.requiredPlayers) && calculation.requiredPlayers >= 0);
  checks.privateArrestCalculation = true;

  let arrestOutcome;
  if (possePresentPlayerUids !== undefined) {
    assert.ok(Array.isArray(possePresentPlayerUids), 'Supply only an explicit GM attendance list.');
    const roster = new Set(f.players.map((player) => player.localId));
    assert.ok(possePresentPlayerUids.length >= calculation.requiredPlayers,
      'The GM attendance attestation must meet the private calculated count.');
    assert.ok(new Set(possePresentPlayerUids).size === possePresentPlayerUids.length &&
      possePresentPlayerUids.every((uid) => roster.has(uid) && uid !== actors.wolfAgent.localId),
    'Every attested posse member must be a unique current non-target player.');
    arrestOutcome = await authenticatedCommand(f, f.gm, 'resolveArrestPosse', {
      instanceId: f.instanceId, requestId: randomUUID(), expectedCycle: cycle,
      expectedRevision: calculation.revision, targetUid: actors.wolfAgent.localId,
      presentPlayerUids: [...possePresentPlayerUids].sort(),
    });
    assert.equal(arrestOutcome.outcome, 'arrested');
    assert.equal(arrestOutcome.deadlineCycle, cycle + 1);
    checks.arrestAttendance = 'explicit-facilitator-attestation';
  } else {
    checks.arrestAttendance = 'awaiting-explicit-facilitator-attestation';
  }

  const evidence = {
    schemaVersion: 1,
    fixture: 'createPc07AuthenticatedSession with explicitLoyaltySetup; twenty core roles preserved',
    checks,
    actions: {
      investigatorRoleId: roleIds.intelligenceAgent,
      wolfAgentRoleId: roleIds.wolfAgent,
      wolfCultRoleId: roleIds.wolfCult,
      investigationReportedWolf: investigation.reportedWolf,
      investigationRevision: investigation.revision,
      sabotageMode: sabotage.mode,
      alertAcknowledgedRevision: acknowledgement.revision,
      playerNoticeSequence: acknowledgement.noticeSequence,
      requiredPossePlayers: calculation.requiredPlayers,
      ...(arrestOutcome ? { arrestOutcome: arrestOutcome.outcome, arrestDeadlineCycle: arrestOutcome.deadlineCycle } : {}),
    },
  };
  const evidencePath = path.join(directory, 'pc09-deduction-prelude.json');
  await mkdir(directory, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  return {
    checks,
    evidencePath,
    actors: { wolfAgent: actors.wolfAgent, intelligenceAgent: actors.intelligenceAgent },
    actorRoleIds: { wolfAgent: roleIds.wolfAgent, intelligenceAgent: roleIds.intelligenceAgent },
    investigation: { reportedWolf: investigation.reportedWolf, revision: investigation.revision },
    sabotage: { requestId: sabotage.requestId, targetShipId: sabotage.targetShipId,
      targetSystemName: sabotage.targetSystemName, mode: sabotage.mode },
    arrestCalculation: { requiredPlayers: calculation.requiredPlayers, revision: calculation.revision,
      targetUid: calculation.targetUid },
    arrestCase: {
      path: `sessions/${f.sessionId}/arrestCases/${actors.wolfAgent.localId}`,
      targetUid: actors.wolfAgent.localId,
      revision: arrestOutcome?.revision ?? null,
      status: arrestOutcome?.outcome === 'arrested' ? 'pending-resolution'
        : arrestOutcome?.outcome === 'not-arrested' ? 'not-arrested' : 'awaiting-facilitator-attendance',
      deadlineCycle: arrestOutcome?.deadlineCycle ?? null,
    },
    // Candidate identities let the facilitator choose actual attendees later;
    // the proof never infers physical presence from fixture accounts.
    posseCandidates: f.players.flatMap((player, index) => player.localId === actors.wolfAgent.localId ? [] : [
      { uid: player.localId, roleId: f.roles[index] },
    ]),
    ...(arrestOutcome ? { arrestOutcome } : {}),
  };
}
