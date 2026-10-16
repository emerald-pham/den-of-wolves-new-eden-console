import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

// Base25 retained the original Quellon captain's same-document2/1 ->3/2
// normal200 receipt and fresh member tuple, but accepted no transition.
// Preserve that path while distinguishing mounted SDK map/WeakMap authority
// from the separate bare ESM module. No synthetic browser or gameplay credit.
test('original Quellon station resume consults the mounted accepted SDK object rather than a default-false bare module', async () => {
  const f = await stationNavigationResumeFixture({ roleId: 'quellon-captain', sourceResumeReply: true,
    distinctMountedAuthority: true });
  try {
    assert.equal(f.authorityBinding().sameObject, false);
    assert.equal(f.authorityBinding().mountedHasServerAuthority, true);
    assert.equal(f.authorityBinding().bareHasServerAuthority, false);
    assert.equal(await f.run(), f.crew);
    assert.deepEqual(f.sdkRequests, ['resumeSession']); assert.equal(f.application.length, 1);
    assert.equal(f.store.getState().me.connectionGeneration, 3); assert.equal(f.store.getState().identityHydrationRevision, 2);
    assert.equal(f.store.getState().me.activeConsoleRoleId, 'quellon-captain'); assert.equal(f.berthMatches(), true);
    assert.ok(f.authorityImports.length > 0 && f.authorityImports.every(url => url === f.mountedAuthorityUrl));
    const files = await readdir(join(f.directory, 'member-navigation'));
    assert.equal(files.length, 1);
    const packet = JSON.parse(await readFile(join(f.directory, 'member-navigation', files[0]), 'utf8'));
    assert.equal(packet.transitions.length, 1);
    assert.deepEqual(packet.transitions[0].clientAcceptance, { hasServerAuthority: true, resumePending: false });
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});

for (const [label, capturedAuthorityModuleUrl, pattern] of [
  ['missing mounted authority URL', null, /mounted App SDK authority module/i],
  ['foreign-origin authority URL', 'http://foreign.invalid/src/lib/sessionSnapshotAuthority.ts?t=decoy', /mounted App origin/i],
  ['wrong module path at the same origin', '/src/lib/foreignAuthority.ts?t=decoy', /sessionSnapshotAuthority/],
]) test(`station acceptance rejects ${label} without falling back to accepted bare-module authority`, async () => {
  const f = await stationNavigationResumeFixture({ roleId: 'quellon-captain', sourceResumeReply: true,
    distinctMountedAuthority: true, bareDecoyAccepted: true, capturedAuthorityModuleUrl });
  try {
    await assert.rejects(f.run(), pattern);
    assert.equal(f.store.getState().me.connectionGeneration, 3); assert.equal(f.store.getState().identityHydrationRevision, 2);
    assert.equal(f.authorityImports.length, 0);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});

test('a clean accepted bare module cannot hide the actual mounted SDK unfinished resume fence', async () => {
  const f = await stationNavigationResumeFixture({ roleId: 'quellon-captain', sourceResumeReply: true,
    distinctMountedAuthority: true, bareDecoyAccepted: true, pendingNewerResume: true, shortDeadline: true });
  try {
    await assert.rejects(f.run(), /deadline/i);
    assert.equal(f.authorityBinding().mountedResumePending, true); assert.equal(f.authorityBinding().bareResumePending, false);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});
