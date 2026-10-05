import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';

/** Native adapter counterexamples only. These surfaces are not gameplay/Auth evidence. */
function nativeAttack({ requiredRole, step = 'boarding', sourceLabel }) {
  const calls = [];
  const targetShipId = requiredRole.startsWith('capybara-') ? 'capybara' : 'dione';
  let selectedRole, revision = 1, status = 'declared';
  const current = () => ({ status, revision, currentStep: step, turn: 2,
    attackId: 'native-adapter-counterexample', preparation: { shipIds: ['native-enemy'] } });
  const response = { request: () => ({ postDataJSON: () => ({ data: { sessionId: 'native-session',
    requestId: 'native-request', expectedTurn: 2, expectedRevision: 1 } }) }) };
  const widget = (kind, name) => ({
    isVisible: async () => kind === 'button' && name === 'Commit defence' && selectedRole === requiredRole ||
      kind === 'region' && name === `${sourceLabel} Long Range choice` && selectedRole === requiredRole ||
      kind === 'button' && name === 'Pass this range' && selectedRole === requiredRole ||
      kind === 'region' && (name === 'Boarding defence' || name === `${targetShipId.toUpperCase()} boarding defence`),
    isEnabled: async () => true,
    innerText: async () => selectedRole === requiredRole ? 'Cycle 2 // boarding Crew choice required'
      : 'This ship’s defence choice is not open yet. It will remain pending for the current assigned crew when its stage begins.',
    count: async () => 1,
    first() { return this; },
    click: async () => { calls.push({ selectedRole, name }); revision += 1; status = 'resolved'; },
    getByRole: (nextKind, options = {}) => widget(nextKind, options.name),
    filter: () => widget('region', 'native-defence-panel'),
    locator: () => ({ evaluateAll: async () => ['0', '1'] }),
    selectOption: async () => {},
  });
  const authority = { sessionId: 'native-session', fleetGroupId: 'native-group', connectionGeneration: 1,
    identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null, seatId: null, connected: true };
  const nativeShipForRole = roleId => ['admiral', 'executive-officer', 'wing-commander'].includes(roleId) ? 'aegis'
    : roleId?.startsWith('refinery-124-') ? 'refinery-124'
      : ['dione', 'icebreaker', 'shepherd', 'quellon', 'capybara'].find(id => roleId?.startsWith(`${id}-`));
  const page = { waitForResponse: async () => response, getByRole: (kind, options = {}) => widget(kind, options.name),
    evaluate: async () => ({ ...authority,
      // The current source reader requires a protected own-actor berth witness.
      // This explicitly scoped native fixture grants no live authority or playtest credit.
      discoveryAuthority: nativeShipForRole(selectedRole) ? { groupId: authority.fleetGroupId,
        shipId: nativeShipForRole(selectedRole), revision: 1,
        fleetGroupVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'] } : null,
    }) };
  const observation = roleId => ({ hasAuth: true, sameActor: true, sessionId: 'native-session', phase: 'active', cycle: 2,
    uidHash: `native-${roleId}`, profileRoleId: roleId, assignedRoleId: roleId,
    activeConsoleRoleId: roleId, playerRole: 'player', connection: 'live', freshness: 'server' });
  const gm = { page, observe: async () => ({ ...observation('gm'), playerRole: 'gm', activeConsoleRoleId: null,
    instanceId: 'native-instance', gmInstanceOwned: true }) };
  const crew = { page, storeModuleUrl: () => '/native-observer', observe: async () => observation(selectedRole),
    callable: async endpoint => {
      if (endpoint === 'getWolfBoardingSpecialChoice') return { status: 'committed', result: {
        type: 'wolf-boarding-special-choice-unavailable', sessionId: 'native-session', reason: 'not-your-choice' } };
      assert.equal(endpoint, 'getWolfBoardingDefenceChoice');
      return { status: 'committed', result: selectedRole === requiredRole ? {
        type: 'wolf-boarding-defence-choice-view', sessionId: 'native-session', turn: 2, revision,
        targetShipId, choiceStatus: 'pending' } : {
        type: 'wolf-boarding-defence-choice-unavailable', sessionId: 'native-session', reason: 'not-your-choice' } };
    } };
  const roster = [
    'admiral', 'executive-officer', 'wing-commander', 'dione-captain', 'dione-engineer', 'dione-president',
    'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
    'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
    'quellon-captain', 'quellon-engineer', 'quellon-explorer',
    'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
    'capybara-captain', 'capybara-recycler', 'press-officer',
  ].map(roleId => ({ roleId, uidHash: `native-${roleId}` }));
  const tools = {
    read: async () => current(), record: async () => {},
    state: async () => ({ phase: 'active', cycle: 2, turnPhase: { airspace: { state: 'lifted' } },
      activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'] }),
    select: async roleId => { selectedRole = roleId; return roleId === 'gm' ? gm : crew; },
    receipt: async (_surface, _endpoint, decision) => { await decision(); return { status: 'committed' }; },
  };
  return { context: { gm, crew, roster, initial: { sessionId: 'native-session' },
    started: { uidHash: 'native-gm', instanceId: 'native-instance' } }, tools, calls };
}

test('the source P18/20 adapter visits the actually admitted Dione boarding actor instead of remaining in its old P11 loop', async () => {
  const fixture = nativeAttack({ requiredRole: 'dione-engineer' });
  const result = await resolveLiveWolfAttack(fixture.context, { tools: fixture.tools, verifyReplay: false, timeoutMs: 50 });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(fixture.calls, [{ selectedRole: 'dione-engineer', name: 'Commit defence' }]);
});

test('the source P20 adapter visits Capybara boarding defence under its actual recycler account', async () => {
  const fixture = nativeAttack({ requiredRole: 'capybara-recycler' });
  const result = await resolveLiveWolfAttack(fixture.context, { tools: fixture.tools, verifyReplay: false, timeoutMs: 50 });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(fixture.calls, [{ selectedRole: 'capybara-recycler', name: 'Commit defence' }]);
});
