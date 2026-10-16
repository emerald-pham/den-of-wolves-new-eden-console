import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';

// Consumer-boundary regression for composing the released production member
// contract with the owner's stricter mounted SDK acceptance. Inert transport
// supplies a captured original resume reply; this earns no browser/gameplay credit.
async function liveBaseResume({ accepted = { hasServerAuthority: true, resumePending: false },
  presentationReader = false, mutateSettled = value => value } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-live-base-resume-'));
  const uid = 'private-live-base-actor', sessionId = 'native-production-session', roleId = 'dione-engineer';
  const uidHash = createHash('sha256').update(uid).digest('hex').slice(0, 16);
  const events = new EventEmitter();
  const page = { url: () => 'http://127.0.0.1:5174/#/dione',
    on: (name, callback) => events.on(name, callback), off: (name, callback) => events.off(name, callback) };
  const original = { documentTimeOrigin: 1000, hasAuth: true, sameActor: true, uidHash,
    profileRoleId: null, profileSessionId: null, sessionId, meSessionId: sessionId,
    playerRole: 'player', assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId,
    fleetGroupId: 'fleet-1', replacementRoleId: null, replacementStatus: null,
    escapeLocked: false, kicked: false, connected: true, connectionGeneration: 2,
    identityHydrationRevision: 1, connection: 'live', freshness: 'server',
    currentOwnPlayerConfirmed: true, currentCanonicalSeatOwned: true,
    currentMemberBerthPresent: false, currentMemberBerthMatches: false,
    memberScopeMatches: true, currentOwnBerthConfirmed: true,
    sdkHasServerAuthority: true, sdkResumePending: false, invalidFields: [],
    fullGameDemo: null, cycle: 1, phase: 'active' };
  const current = { ...original, connectionGeneration: 3, identityHydrationRevision: 2 };
  const settled = mutateSettled({ ...current, ...(presentationReader
    ? { sdkHasServerAuthority: accepted.hasServerAuthority, sdkResumePending: accepted.resumePending }
    : { clientAcceptance: accepted }) });
  const observer = createMemberNavigationResumeObserver(page, {
    directory, roleId, deadlineAt: Date.now() + 1500, memberContract: 'pc11-live-base',
  });
  try {
    await observer.prepare(original);
    const request = { method: () => 'POST',
      url: () => 'http://127.0.0.1:5011/demo-native/us-central1/resumeSession',
      postDataJSON: () => ({ data: { sessionId } }) };
    events.emit('request', request);
    events.emit('response', { request: () => request, url: request.url, status: () => 200,
      json: async () => ({ result: { session: { id: sessionId }, player: {
        uid, sessionId, role: 'player', fleetGroupId: 'fleet-1', assignedRoleId: roleId,
        activeConsoleRoleId: roleId, seatId: roleId, replacementRoleId: null,
        replacementStatus: null, connectionGeneration: 3,
      } } }) });
    const result = await observer.accept(original, current, async () => settled);
    await observer.finish();
    const packet = JSON.parse(await readFile(observer.path, 'utf8'));
    assert.equal(JSON.stringify(packet).includes(uid), false, 'Receipt retains only the actor hash.');
    assert.equal(events.eventNames().length, 0, 'Original observer removes its own listeners.');
    return { result, packet };
  } finally {
    await observer.finish();
    await rm(directory, { recursive: true, force: true });
  }
}

for (const presentationReader of [false, true]) {
  test(`clean production resume accepts the original mounted SDK authority (${presentationReader ? 'presentation' : 'explicit'} reader)`, async () => {
    const { result, packet } = await liveBaseResume({ presentationReader });
    assert.equal(result.connectionGeneration, 3);
    assert.equal(result.identityHydrationRevision, 2);
    assert.equal(packet.transitions.length, 1);
    assert.deepEqual(packet.transitions[0].clientAcceptance, { hasServerAuthority: true, resumePending: false });
  });

  for (const [label, accepted] of [
    ['unfinished mounted resume', { hasServerAuthority: true, resumePending: true }],
    ['unaccepted mounted authority', { hasServerAuthority: false, resumePending: false }],
  ]) test(`clean production projection cannot hide ${label} (${presentationReader ? 'presentation' : 'explicit'} reader)`, async () => {
    const { result, packet } = await liveBaseResume({ accepted, presentationReader });
    assert.equal(result, false);
    assert.equal(packet.transitions.length, 0);
  });
}

test('clean production readiness is reread after the original resume digest before acceptance', async () => {
  const { result, packet } = await liveBaseResume({ mutateSettled: value => ({ ...value, currentOwnBerthConfirmed: false }) });
  assert.equal(result, false);
  assert.equal(packet.transitions.length, 0);
});
