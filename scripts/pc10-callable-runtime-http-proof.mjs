import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const evidencePath = process.env.PC10_CALLABLE_RUNTIME_EVIDENCE_PATH;
assert.ok(evidencePath, 'An external runtime evidence file is required.');
const project = process.env.VITE_FIREBASE_PROJECT_ID;
assert.ok(/^demo-[a-z0-9-]+$/.test(project ?? ''), 'Only an explicitly local demo project is allowed.');
const env = Object.fromEntries((await readFile('.env.emulators.local', 'utf8')).trim().split('\n').map(line => line.split('=')));
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT)}`;
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT)}`;
process.env.GCLOUD_PROJECT = project;
// This disposable process constructs the actual exported handlers using the
// canonical production App Check setting, while all identity/database traffic
// is explicitly bound to local emulators. No deployment setting is changed.
delete process.env.FUNCTIONS_EMULATOR;
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const express = require('express');
const exported = require('../functions/lib/index.js');
const callables = Object.entries(exported).filter(([, value]) => value?.__endpoint?.callableTrigger);
assert.ok(callables.length >= 223, 'Inspect every actual SDK callable export, including factories and re-exports.');
const identityResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${project}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
});
assert.equal(identityResponse.status, 200);
const identity = await identityResponse.json();
const { getAuth } = require('firebase-admin/auth');
const verifiedIdentity = await getAuth().verifyIdToken(identity.idToken);
assert.equal(verifiedIdentity.uid, identity.localId, 'The same SDK verifier must accept the real local Auth token.');
assert.equal(verifiedIdentity.aud, project);
const app = express();
app.use(express.json());
for (const [name, callable] of callables) app.post(`/${name}`, callable);
let server;
try {
  server = await new Promise((resolve, reject) => {
    const started = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve(started));
    started.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const results = [];
  for (const [name, callable] of callables) {
    assert.equal(callable.__endpoint.maxInstances, 10, `${name} maximum instance count`);
    assert.deepEqual(callable.__endpoint.region, ['us-central1'], `${name} region`);
    const response = await fetch(`http://127.0.0.1:${address.port}/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${identity.idToken}` },
      body: JSON.stringify({ data: {} }),
    });
    assert.equal(response.status, 401, `${name} must enforce missing App Check before its schema or membership handler`);
    assert.deepEqual(await response.json(), { error: { message: 'Unauthenticated', status: 'UNAUTHENTICATED' } });
    results.push({ name, platform: callable.__endpoint.platform, region: callable.__endpoint.region,
      maxInstances: callable.__endpoint.maxInstances, missingAppCheckHttpStatus: response.status,
      verifiedAuthActor: true, endpoint: callable.__endpoint });
  }
  const files = [];
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path); else files.push(path);
    }
  };
  await walk('functions/lib');
  const hash = createHash('sha256');
  for (const path of files.sort()) hash.update(path.replace('functions/lib/', '') + '\0').update(await readFile(path));
  const report = { type: 'pc10-actual-sdk-callable-runtime-proof',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    compiledTreeSha256: hash.digest('hex'), callableCount: callables.length,
    canonicalOptions: { region: 'us-central1', maxInstances: 10, enforceAppCheck: true },
    verifiedLocalAuthActor: true, sdkAuthTokenVerifiedBeforeTransport: true,
    verifiedActorTokenAudience: project, missingAppCheckDeniedForEveryExport: true,
    adminGameplaySeeds: [], localIdentitiesOnly: true, productionGameplay: false, results };
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ callableCount: callables.length, missingAppCheckDeniedForEveryExport: true }));
} finally {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
