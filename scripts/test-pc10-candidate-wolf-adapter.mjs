import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';

/** Native adapter counterexamples only. These surfaces are not gameplay/Auth evidence. */
function nativeAttack({ requiredRole, step = 'boarding', sourceLabel }) {
  const calls = [];
  let selectedRole, revision = 1, status = 'declared';
  const current = () => ({ status, revision, currentStep: step, turn: 2,
    attackId: 'native-adapter-counterexample', preparation: { shipIds: ['native-enemy'] } });
  const response = { request: () => ({ postDataJSON: () => ({ data: {} }) }) };
  const widget = (kind, name) => ({
    isVisible: async () => kind === 'button' && name === 'Commit defence' && selectedRole === requiredRole ||
      kind === 'region' && name === `${sourceLabel} Long Range choice` && selectedRole === requiredRole ||
      kind === 'button' && name === 'Pass this range' && selectedRole === requiredRole,
    isEnabled: async () => true,
    click: async () => { calls.push({ selectedRole, name }); revision += 1; status = 'resolved'; },
    getByRole: (nextKind, options = {}) => widget(nextKind, options.name),
    filter: () => widget('region', 'native-defence-panel'),
    locator: () => ({ evaluateAll: async () => ['0', '1'] }),
    selectOption: async () => {},
  });
  const page = { waitForResponse: async () => response, getByRole: (kind, options = {}) => widget(kind, options.name) };
  const gm = { page }, crew = { page };
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
  return { context: { gm, crew, roster }, tools, calls };
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
