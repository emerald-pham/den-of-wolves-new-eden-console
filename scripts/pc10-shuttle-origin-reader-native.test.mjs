import assert from 'node:assert/strict';
import test from 'node:test';
import * as procedureRecipes from './pc10-pending-procedure-ui-recipes.mjs';

test('the public shuttle source reader delegates one current mounted-store read for the requested craft', async () => {
  const currentState = { live: true, sessionId: 'reader-session', cycle: 2, phase: 'active' };
  const calls = [];
  const surface = { storeModuleUrl: () => '/src/store/useSessionStore.ts',
    page: { evaluate: async (reader, input) => { calls.push({ reader, input }); return currentState; } } };

  assert.equal(typeof procedureRecipes.readActionState, 'function');
  assert.equal(await procedureRecipes.readActionState(surface, 'starlight'), currentState);
  assert.equal(calls.length, 1, 'the source reader performs one existing page evaluation');
  assert.equal(typeof calls[0].reader, 'function');
  assert.deepEqual(calls[0].input, { moduleUrl: '/src/store/useSessionStore.ts', shuttleId: 'starlight' });
});
