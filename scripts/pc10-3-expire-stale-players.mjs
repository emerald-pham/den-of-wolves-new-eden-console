#!/usr/bin/env node
// PC10.3 L3.2 helper: run the unchanged `expireStalePlayers` scheduled handler
// once against this worktree's local Firestore emulator.
//
// The Functions emulator does not fire Cloud Scheduler triggers, so the proof
// invokes the compiled production handler itself. Only the cron trigger is
// substituted; the presence lease (PRESENCE_LEASE_MS), seat release and
// empty-session timer hold are the handler's own code and clock.
//
// Usage (inside `firebase emulators:exec`, after `npm run build --prefix functions`):
//   node scripts/pc10-3-expire-stale-players.mjs <sessionId>
// It refuses to run unless FIRESTORE_EMULATOR_HOST and a demo- project are set,
// and unless every connected player and GM instance belongs to that one session,
// so it can never expire another proof's or a real session's members.
// Runs in its own process so functions/lib/index.js initializes its default
// Admin app exactly as deployed code does.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const [sessionId] = process.argv.slice(2);
assert.match(sessionId ?? '', /^[A-Za-z0-9_-]+$/, 'Name the one local session to expire.');
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^127\.0\.0\.1:\d+$/, 'Use the local Firestore emulator only.');
const project = process.env.GCLOUD_PROJECT ?? process.env.VITE_FIREBASE_PROJECT_ID;
assert.match(project ?? '', /^demo-[a-z0-9-]+$/, 'Use an explicit local demo project.');
process.env.GCLOUD_PROJECT = project;

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { expireStalePlayers } = require('../functions/lib/index.js');
const { getFirestore } = require('firebase-admin/firestore');
assert.equal(typeof expireStalePlayers?.run, 'function', 'expireStalePlayers must be the scheduled-function export.');
assert.ok(expireStalePlayers.__endpoint?.scheduleTrigger, 'expireStalePlayers must carry its schedule trigger.');

const db = getFirestore();
const [players, instances] = await Promise.all([
  db.collectionGroup('players').where('connected', '==', true).get(),
  db.collectionGroup('gmInstances').where('connected', '==', true).get(),
]);
const foreign = [...players.docs, ...instances.docs].filter(doc => doc.ref.path.split('/')[1] !== sessionId);
assert.equal(foreign.length, 0, 'Another session has connected members; refusing to run the global handler.');
const startedAt = Date.now();
await expireStalePlayers.run({});
console.log(JSON.stringify({ handler: 'expireStalePlayers', invocation: 'compiled scheduled handler, local emulator',
  connectedPlayersBefore: players.size, connectedGmInstancesBefore: instances.size, startedAt, completedAt: Date.now() }));
await db.terminate();
