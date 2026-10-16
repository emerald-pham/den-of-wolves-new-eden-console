import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createContext, Script, SyntheticModule } from 'node:vm';
import test from 'node:test';
import { createArrestPosseCallbacks } from './pc10-arrest-posse-proof.mjs';

const SESSION_ID = 'source-wrapped-arrest-locators';
const GM_UID = 'original-gm-account';
const TARGET_UID = 'original-president-account';
const TARGET_NAME = 'DEMO // Dione President';
const UID_HASH = createHash('sha256').update(GM_UID).digest('hex').slice(0, 16);

function fixture({ adjustment = 'none', targetRoleIds = ['arrest-posse-target'],
  adjustmentRoleIds = ['arrest-posse-adjustment'] } = {}) {
  const roster = [{ sessionId: SESSION_ID, roleId: 'dione-president', uid: TARGET_UID, displayName: TARGET_NAME }];
  const state = { session: { id: SESSION_ID, phase: 'active', currentTurn: 1, setupRevision: 38,
    turnState: { phase: 'team' }, fullGameDemo: { status: 'active', progression: 'manual' } },
  me: { sessionId: SESSION_ID, uid: GM_UID, role: 'gm', connectionGeneration: 4 },
  gmInstance: { id: 'original-owned-instance', uid: GM_UID, sessionId: SESSION_ID, claimedAt: 'original-claim' },
  identityHydrationRevision: 2, connection: 'live', sessionSnapshotFreshness: 'server', pendingCommands: [],
  roleBrief: null, gmLoyaltyCensusStatus: 'present',
  gmLoyaltyCensus: { revision: 38, entries: [{ uid: TARGET_UID, kind: 'fleet-loyalist', suspicion: 0 }] } };
  const counts = { exactLabelReads: [], roles: [], ids: [], intersections: [], selections: [], fields: [],
    calculationClicks: 0, sdkCalls: 0, reloads: 0 };
  let selectedTarget = TARGET_UID;
  const option = { value: TARGET_UID, textContent: `${TARGET_NAME} (${TARGET_UID})`, disabled: false };
  const select = { value: selectedTarget, disabled: false, options: [option], labels: [{
    textContent: `Target player ${option.textContent}`,
    childNodes: [{ nodeType: 3, textContent: 'Target player' }, { nodeType: 1, textContent: option.textContent }],
  }] };
  const document = { querySelector: () => null, querySelectorAll: selector => {
    assert.equal(selector, '[aria-label="Arrest posse calculator"]');
    return [{ querySelectorAll: inner => { assert.equal(inner, '#arrest-posse-target'); select.value = selectedTarget; return [select]; } }];
  } };
  async function sourceCallback(callback, input) {
    const realm = createContext({ input, crypto: webcrypto, TextEncoder, document, Node: { TEXT_NODE: 3 } });
    assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(realm),
      'undefined,undefined,undefined');
    const exportsByModule = new Map([
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: { uid: GM_UID } }) }],
      ['/src/store/useSessionStore.ts', { useSessionStore: { getState: () => state } }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: null }],
      ['/src/lib/demoActorProfiles.ts', { readDemoActorRoster: sid => { assert.equal(sid, SESSION_ID); return roster; } }],
      ['/src/lib/demoActorDisplayName.ts', { demoActorDisplayName: roleId => { assert.equal(roleId, 'dione-president'); return TARGET_NAME; } }],
    ]);
    const modules = new Map();
    for (const [name, exports] of exportsByModule) {
      const module = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: realm });
      await module.link(() => assert.fail('No fixture source imports.')); await module.evaluate(); modules.set(name, module);
    }
    return new Script(`(${callback.toString()})(input)`, { importModuleDynamically: async name => {
      assert.ok(modules.has(name), `Use only the actual source-reader modules: ${name}`); return modules.get(name);
    } }).runInContext(realm);
  }
  function unavailableLabel(name) {
    return { count: async () => 0, selectOption: async () => {
      throw Object.assign(new Error(`locator.selectOption: waiting for getByLabel('${name}', { exact: true })`), { name: 'TimeoutError' });
    }, inputValue: async () => assert.fail('Wrapped select input values cannot use an unavailable label locator.') };
  }
  function roleControl(name, matchingIds, intersectionId = null) {
    const count = matchingIds.filter(id => intersectionId === null || id === intersectionId).length;
    return { count: async () => count,
      and: locator => {
        assert.equal(locator.kind, 'source-id');
        const expected = name === 'Target player' ? 'arrest-posse-target' : 'arrest-posse-adjustment';
        assert.equal(locator.id, expected, 'The exact role/name must intersect its original source ID.');
        counts.intersections.push([name, locator.id]);
        return roleControl(name, matchingIds, locator.id);
      },
      selectOption: async (value, options) => {
        assert.ok(intersectionId, 'The public proof must intersect its named combobox with the source ID.');
        if (count !== 1) throw Object.assign(new Error('Exact combobox/source ID is absent or ambiguous.'), { name: 'TimeoutError' });
        assert.ok(options.timeout > 0 && options.timeout <= 35_000, 'Retain the original operation deadline.');
        if (name === 'Target player') { assert.equal(value, TARGET_UID); selectedTarget = value; }
        else assert.equal(value, String(adjustment));
        counts.selections.push([name, value, intersectionId]);
      },
      inputValue: async () => { assert.ok(intersectionId); assert.equal(count, 1); return selectedTarget; },
    };
  }
  const panel = { isVisible: async () => true,
    locator: selector => {
      assert.ok(['#arrest-posse-target', '#arrest-posse-adjustment'].includes(selector)); counts.ids.push(selector);
      return { kind: 'source-id', id: selector.slice(1), count: async () => 1 };
    },
    getByLabel: (name, options) => {
      assert.equal(options.exact, true); counts.exactLabelReads.push(name);
      if (['Target player', 'Optional adjustment'].includes(name)) return unavailableLabel(name);
      assert.equal(name, 'Defenders'); return { count: async () => 1,
        fill: async (value, options) => { assert.equal(value, '0'); assert.ok(options.timeout > 0); counts.fields.push([name, value]); } };
    },
    getByRole: (role, options) => {
      assert.equal(options.exact, true);
      if (role === 'combobox') {
        assert.ok(['Target player', 'Optional adjustment'].includes(options.name)); counts.roles.push([role, options.name]);
        return roleControl(options.name, options.name === 'Target player' ? targetRoleIds : adjustmentRoleIds);
      }
      assert.equal(role, 'button'); assert.equal(options.name, 'Calculate required players');
      return { isEnabled: async () => false,
        click: async () => { counts.calculationClicks++; assert.fail('Native locator proof does not mutate gameplay.'); } };
    },
    getByText: () => ({ isVisible: async () => false }),
  };
  const actor = () => ({ hasAuth: true, sameActor: true, uidHash: UID_HASH, sessionId: state.session.id,
    phase: state.session.phase, cycle: state.session.currentTurn, setupRevision: state.session.setupRevision,
    playerRole: 'gm', instanceId: state.gmInstance.id, gmInstanceOwned: true, turnStatePhase: 'team',
    connection: 'live', freshness: 'server', fullGameDemo: state.session.fullGameDemo });
  const context = { initial: { sessionId: SESSION_ID }, started: actor(), deadlineAt: Date.now() + 35_000,
    gm: { observe: async () => actor(), storeModuleUrl: () => '/src/store/useSessionStore.ts',
      callable: async () => { counts.sdkCalls++; assert.fail('No native SDK gameplay request.'); },
      page: { evaluate: sourceCallback, getByRole: (role, options) => {
        assert.equal(role, 'region'); assert.deepEqual(options, { name: 'Arrest posse calculator', exact: true }); return panel;
      }, reload: async () => { counts.reloads++; assert.fail('No locator retry or reload.'); } } },
    crew: { page: { evaluate: sourceCallback } } };
  const run = () => createArrestPosseCallbacks({ posse: { targetRoleId: 'dione-president', defenders: 0, adjustment },
    requiredBranches: ['arrest-posse-calculation'] }).onStarted(context);
  return { context, panel, counts, run };
}

for (const adjustment of ['none', -1, 1]) {
  test(`the public factory selects both source-wrapped comboboxes by exact role/name and ID for adjustment ${adjustment}`, async () => {
    const f = fixture({ adjustment });
    await assert.rejects(f.run(), /source-calculation-disabled-by-live-census-or-authority/);
    assert.deepEqual(f.counts.selections, [
      ['Target player', TARGET_UID, 'arrest-posse-target'],
      ['Optional adjustment', String(adjustment), 'arrest-posse-adjustment'],
    ]);
    assert.deepEqual(f.counts.roles, [['combobox', 'Target player'], ['combobox', 'Optional adjustment']]);
    assert.deepEqual(f.counts.ids, ['#arrest-posse-target', '#arrest-posse-adjustment']);
    assert.deepEqual(f.counts.exactLabelReads, ['Defenders'], 'No unavailable label fallback is permitted for either select.');
    assert.equal(f.counts.calculationClicks, 0); assert.equal(f.counts.sdkCalls, 0); assert.equal(f.counts.reloads, 0);
  });
}

test('the native locator model preserves the owner-observed exact label0/role1/ID1 source shape', async () => {
  const f = fixture();
  for (const [name, id] of [['Target player', 'arrest-posse-target'], ['Optional adjustment', 'arrest-posse-adjustment']]) {
    assert.equal(await f.panel.getByLabel(name, { exact: true }).count(), 0);
    assert.equal(await f.panel.getByRole('combobox', { name, exact: true }).count(), 1);
    assert.equal(await f.panel.locator(`#${id}`).count(), 1);
  }
});

test('a same-name decoy combobox cannot change the exact source control selected by the public factory', async () => {
  const f = fixture({ targetRoleIds: ['decoy-target', 'arrest-posse-target'],
    adjustmentRoleIds: ['decoy-adjustment', 'arrest-posse-adjustment'] });
  await assert.rejects(f.run(), /source-calculation-disabled-by-live-census-or-authority/);
  assert.equal(f.counts.selections.length, 2);
  assert.deepEqual(f.counts.intersections, [['Target player', 'arrest-posse-target'], ['Optional adjustment', 'arrest-posse-adjustment']]);
});

for (const changed of [{ targetRoleIds: ['decoy-target'] }, { adjustmentRoleIds: ['decoy-adjustment'] },
  { targetRoleIds: ['arrest-posse-target', 'arrest-posse-target'] }]) {
  test(`an unavailable or duplicate exact source-ID intersection remains uncredited: ${JSON.stringify(changed)}`, async () => {
    const f = fixture(changed);
    await assert.rejects(f.run(), /Exact combobox\/source ID is absent or ambiguous/);
    assert.equal(f.counts.calculationClicks, 0); assert.equal(f.counts.sdkCalls, 0); assert.equal(f.counts.reloads, 0);
    assert.equal(f.counts.exactLabelReads.includes('Target player'), false);
    assert.equal(f.counts.exactLabelReads.includes('Optional adjustment'), false);
  });
}
