import assert from 'node:assert/strict';

export function proofRuntimeFromViteSource(source) {
  const assignment = source.match(/import\.meta\.env\s*=\s*(\{[^\n]+\});/);
  assert.ok(assignment, 'Vite must expose its actual environment before gameplay.');
  const env = JSON.parse(assignment[1]);
  return { projectId: env.VITE_FIREBASE_PROJECT_ID, useEmulators: env.VITE_USE_EMULATORS === '1',
    ports: { auth: Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT),
      functions: Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT),
      firestore: Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT) } };
}

export function validateProofRuntime(runtime, expected) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(expected.baseUrl).hostname), 'Loopback browser only.');
  assert.match(expected.projectId, /^demo-[a-z0-9-]+$/, 'Explicit demo project only.');
  assert.equal(runtime.projectId, expected.projectId, 'Runtime must be the root-owned project.');
  assert.equal(runtime.useEmulators, true, 'All services must use emulators.');
  for (const key of ['auth', 'functions', 'firestore']) {
    assert.ok(Number.isInteger(expected.ports[key]) && expected.ports[key] > 0 && expected.ports[key] < 65536);
    assert.equal(runtime.ports[key], expected.ports[key], `Root-owned ${key} port required.`);
  }
  return { projectId: runtime.projectId, useEmulators: true, ports: { ...expected.ports } };
}

export function assertSelectedActor(current, expected) {
  assert.equal(current.sessionId, expected.sessionId);
  assert.equal(current.profileRoleId, expected.roleId);
  assert.equal(current.uidHash, expected.uidHash);
  assert.equal(current.sameActor, true, 'Selected SDK UID must equal the server member.');
  assert.equal(current.playerRole, 'player');
  assert.equal(current.connection, 'live');
  assert.equal(current.freshness, 'server');
}
