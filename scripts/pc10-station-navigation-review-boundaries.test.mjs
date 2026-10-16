import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

const marker = 'synthetic-private-marker';
for (const field of ['fleetGroupId', 'connected', 'sessionId', 'connectionGeneration', 'requestSessionId', 'sample', 'parseError', 'primaryError']) {
  test(`rejected navigation packet excludes malformed private payload from ${field}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pc10-native-private-'));
    const events = new EventEmitter(), page = { on: (...args) => events.on(...args), off: (...args) => events.off(...args),
      url: () => 'http://127.0.0.1:5174/#/console', evaluate: async () => assert.fail('Malformed receipt cannot reach acceptance observation.') };
    const current = { documentTimeOrigin: 1000, uidHash: '1234567890abcdef', sessionId: 'native-session',
      meSessionId: 'native-session', playerRole: 'player', fleetGroupId: 'fleet-1', assignedRoleId: 'icebreaker-captain',
      activeConsoleRoleId: null, seatId: null, replacementRoleId: null, replacementStatus: null,
      connectionGeneration: 2, identityHydrationRevision: 1, connected: true, escapeLocked: false,
      currentMemberBerthPresent: true, currentMemberBerthMatches: true, currentOwnPlayerConfirmed: true, connection: 'live', freshness: 'server' };
    const observer = createMemberNavigationResumeObserver(page, { directory, roleId: 'icebreaker-captain', deadlineAt: Date.now() + 500 });
    try {
      const poison = { privatePayload: marker };
      await observer.prepare(field === 'sample' ? { ...current, fleetGroupId: poison } : current);
      observer.sample(field === 'sample' ? { ...current, seatId: poison, unexpectedPrivatePayload: poison } : current);
      observer.bind(field === 'sample' ? { ...current, assignedRoleId: poison } : current);
      const player = { uid: 'private-native-uid', sessionId: 'native-session', role: 'player', fleetGroupId: 'fleet-1',
        assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: null, seatId: null, replacementRoleId: null,
        replacementStatus: null, connectionGeneration: 3, connected: true };
      if (['fleetGroupId', 'connected', 'connectionGeneration'].includes(field)) player[field] = poison;
      const body = { result: { player, session: { id: field === 'sessionId' ? poison : 'native-session' } } };
      const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5011/demo-native/us-central1/resumeSession',
        postDataJSON: () => ({ data: { sessionId: field === 'requestSessionId' ? poison : 'native-session' } }),
        headers: () => assert.fail('No Auth header read'), allHeaders: () => assert.fail('No Auth header read') };
      events.emit('request', request); events.emit('response', { request: () => request, url: request.url, status: () => 200,
        json: async () => { if (field === 'parseError') throw new SyntaxError(marker); return body; } });
      await assert.rejects(observer.accept(current, { ...current, connectionGeneration: 3, identityHydrationRevision: 2 }, '/src/store/useSessionStore.ts'));
      const error = field === 'primaryError' ? new Error(marker) : new Error('Original proof guard');
      await observer.finish(error);
      const packet = await readFile(observer.path, 'utf8'); assert.equal(packet.includes(marker), false, 'Scan the complete rejected packet, including samples, requests, receipts and errors.');
      assert.equal(packet.includes('private-native-uid'), false); assert.equal(events.eventNames().length, 0);
      assert.equal(JSON.parse(packet).status, 'failed');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('pending added client acceptance observation rejects within the original deadline and removes every own listener', async () => {
  const f = await stationNavigationResumeFixture({ acceptanceObservationPending: true, shortDeadline: true });
  let settled; void f.run().then(() => { settled = { success: true }; }, error => { settled = { error }; });
  try {
    await delay(350); assert.ok(settled?.error, 'The added observation must settle at the original finite deadline.');
    assert.match(settled.error.message, /deadline/i); assert.equal(f.events.eventNames().length, 0); assert.equal(f.counters.sdkCalls, 0);
  } finally { await f.cleanup(); }
});
