import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { captureMountedProcedureAction } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION = 'route-select-session';
const UID = 'route-select-holder';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const ROLE_ID = 'quellon-explorer';
const SHUTTLE_ID = 'starlight';

function currentDocumentAuthority(overrides = {}) {
  return { sessionId: SESSION, uidHash: UID_HASH, groupId: 'fleet-1', roleId: ROLE_ID,
    connectionGeneration: 4, identityHydrationRevision: 3, documentTimeOrigin: 1_760_000_000_000,
    audienceHash: 'a'.repeat(64), authorityHash: 'b'.repeat(64), shuttleAuthorized: true, ...overrides };
}

function makeCanonicalSelectHarness({ route = '#/shuttles/starlight', activeConsoleRoleId = ROLE_ID,
  originAuthority = currentDocumentAuthority() } = {}) {
  // Inert route fixture for the current canonical createTwoBrowserGameplay.select API:
  // scripts/pc10-two-browser-gameplay.mjs at f9952d02 defaults enter=true; when the
  // page is on #/shuttles/*, it returns through the original role console. enter:false
  // preserves the already mounted craft route without performing role admission.
  let currentRoute = route;
  const routeChanges = [];
  const selections = [];
  let clicks = 0;
  const onShuttle = () => currentRoute === `#/shuttles/${SHUTTLE_ID}`;
  const recordRoute = next => {
    if (next === currentRoute) return;
    currentRoute = next;
    routeChanges.push(next);
  };
  const actor = { uidHash: UID_HASH, sessionId: SESSION, profileRoleId: ROLE_ID,
    activeConsoleRoleId, sameActor: true, connection: 'live', freshness: 'server' };
  const state = { live: true, sessionId: SESSION, phase: 'active', cycle: 2,
    holderGroupId: 'fleet-1', playerDiscovery: { groupId: 'fleet-1' },
    activeVesselIds: ['quellon', 'dione', 'icebreaker'],
    shuttleControl: { [SHUTTLE_ID]: { shuttleId: SHUTTLE_ID, holderUid: UID, revision: 4 } },
    shuttleDockings: [{ shuttleId: SHUTTLE_ID, shipId: 'quellon' }],
    shipFleetGroupIds: { quellon: 'fleet-1', dione: 'fleet-1', icebreaker: 'fleet-1' },
    currentDocumentAuthority: currentDocumentAuthority() };
  const gmActor = { uidHash: 'gm-route-select', sessionId: SESSION, playerRole: 'gm',
    instanceId: 'gm-route-select', gmInstanceOwned: true, sameActor: true,
    connection: 'live', freshness: 'server' };
  const movement = null;
  const locator = (exists, click = async () => {}) => ({
    count: async () => exists() ? 1 : 0,
    isVisible: async () => exists(),
    isEnabled: async () => exists(),
    click,
  });
  const destination = {
    count: async () => onShuttle() ? 1 : 0,
    isVisible: async () => onShuttle(),
    isEnabled: async () => onShuttle(),
    locator: () => ({ evaluateAll: async () => [
      { value: 'quellon', text: 'Quellon', offered: true, enabled: true },
      { value: 'dione', text: 'Dione', offered: true, enabled: true },
    ] }),
    selectOption: async () => {},
  };
  const requestButton = locator(onShuttle, async () => {
    if (!onShuttle()) throw new Error('CANONICAL_SELECT_UNMOUNTED_SOURCE_PANEL');
    throw new Error('ROUTE_PRESERVED_STOP_BEFORE_MUTATION');
  });
  const panel = {
    getByLabel: () => destination,
    getByRole: (role, options = {}) => role === 'button' && options.name === 'Request departure'
      ? requestButton : locator(() => false),
  };
  const page = {
    url: () => `http://localhost:5174/${currentRoute}`,
    evaluate: async (_reader, input) => input && typeof input === 'object' && input.sessionId
      ? movement : structuredClone(state),
    on: () => {}, off: () => {},
    waitForResponse: () => new Promise(() => {}),
    waitForURL: async predicate => {
      assert.ok(predicate(new URL(`http://localhost:5174/${currentRoute}`)));
    },
    getByRole: (role, options = {}) => role === 'region' && options.name === 'Shuttle departure'
      ? panel : locator(() => false),
    locator: selector => selector === `a[href$="/shuttles/${SHUTTLE_ID}"]`
      ? locator(() => currentRoute.startsWith('#/ships/') && activeConsoleRoleId === ROLE_ID,
        async () => recordRoute(`#/shuttles/${SHUTTLE_ID}`))
      : locator(() => false),
  };
  const player = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => actor,
    callable: async () => { throw new Error('route selection proof must not use SDK mutation/replay'); } };
  const gm = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => gmActor };
  const game = {
    select: async (roleId, options = {}) => {
      if (roleId === 'gm') return gm;
      const enter = options.enter ?? true;
      selections.push({ roleId, enter });
      if (enter && currentRoute.startsWith('#/shuttles/')) recordRoute(`#/ships/quellon/roles/${roleId}`);
      return player;
    },
    state: async () => structuredClone(state),
  };
  const context = { initial: { sessionId: SESSION }, gm,
    roster: [{ roleId: ROLE_ID, uidHash: UID_HASH }],
    shuttleOriginAuthority: { sessionId: SESSION, uidHash: UID_HASH, shuttleId: SHUTTLE_ID,
      groupId: 'fleet-1', cycle: 2, controlRevision: 4, sourceAuthority: originAuthority } };
  return { context, game, player, route: () => currentRoute, routeChanges, selections,
    clickCount: () => clicks, originAuthority, state };
}

test('movement recipe and capture preserve the already mounted original shuttle route', async () => {
  const harness = makeCanonicalSelectHarness();
  const step = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
  const prepared = await step({ context: harness.context, game: harness.game });
  assert.equal(prepared.expected.shuttleId, SHUTTLE_ID);
  assert.equal(harness.route(), `#/shuttles/${SHUTTLE_ID}`);

  await assert.rejects(captureMountedProcedureAction({ context: harness.context, game: harness.game,
    caseId: 'core:requestShuttleDeparture', timeoutMs: 1000, ...prepared }),
  /ROUTE_PRESERVED_STOP_BEFORE_MUTATION/);
  assert.deepEqual(harness.routeChanges, [], 'no role-selector navigation may unmount the prepared shuttle panel');
  assert.deepEqual(harness.selections, [{ roleId: ROLE_ID, enter: false }, { roleId: ROLE_ID, enter: false }],
    'both the movement recipe and capture retain the already admitted current holder console');
  assert.equal(harness.clickCount(), 0, 'the inert fixture stops immediately before any mutation');
});

test('route preservation does not admit an unentered role or accept stale source authority', async () => {
  for (const harness of [
    makeCanonicalSelectHarness({ route: '#/ships/quellon/roles/quellon-explorer', activeConsoleRoleId: null }),
    makeCanonicalSelectHarness({ originAuthority: currentDocumentAuthority({
      identityHydrationRevision: 2, authorityHash: 'c'.repeat(64) }) }),
  ]) {
    const step = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
    const prepared = await step({ context: harness.context, game: harness.game });
    const result = await captureMountedProcedureAction({ context: harness.context, game: harness.game,
      caseId: 'core:requestShuttleDeparture', timeoutMs: 1000, ...prepared });
    assert.equal(result.status, 'pending');
    assert.equal(harness.clickCount(), 0);
  }
});
