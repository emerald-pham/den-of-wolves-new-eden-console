import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { assertGmInstanceFence, blockedSourceBranch } from './pc10-political-crisis-arrest-proof-contracts.mjs';
import { validateElectionPlan } from './pc10-politics-press-proof.mjs';

const source = () => readFile(new URL('./pc10-politics-press-proof.mjs', import.meta.url), 'utf8');
const selectedVoters = ['dione-president', 'dione-captain'];
const choice = { voterRoleIds: selectedVoters, policy: {
  votingSystem: 'plurality', populationWeighting: 'equal', vicePresidentEnabled: false,
  campaigning: 'prohibited', supplyUse: 'prohibited', tieRule: 'current-office-remains',
  openCycle: 1, closeCycle: 1, campaignInstructions: 'No campaigning or supplies.',
} };

function functionSource(text, name) {
  const tree = ts.createSourceFile('politics.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(declarations.length, 1, `Extract the actual ${name} consumer function.`);
  return declarations[0].getText(tree);
}

async function runElectionConsumer() {
  const consumer = functionSource(await source(), 'configureElection');
  const sessionId = 'original-election-session';
  const originalGm = { sessionId, uidHash: 'original-gm-hash', sameActor: true, playerRole: 'gm',
    instanceId: 'original-gm-instance', gmInstanceOwned: true, cycle: 1, phase: 'active',
    turnStatePhase: 'team', connection: 'live', freshness: 'server', documentTimeOrigin: 1 };
  const roster = selectedVoters.map((roleId, index) => ({ roleId, uidHash: `original-voter-${index}`,
    displayName: index === 0 ? 'President' : 'Captain' }));
  const enteredRoleIds = [];
  const form = { isVisible: async () => false };
  const region = { getByRole: () => form };
  const result = await runInNewContext(`(async()=>{${consumer};return configureElection(context,choice,{});})()`, {
    assert,
    context: { initial: { sessionId }, started: originalGm, roster,
      gm: { observe: async () => ({ ...originalGm }) }, crew: {} },
    choice,
    validateElectionPlan,
    assertGmInstanceFence,
    blockedSourceBranch,
    required: () => false,
    missingChoice: () => null,
    electionGmRegion: async () => region,
    enterSelectedRole: async (_context, roleId) => {
      enteredRoleIds.push(roleId);
      const actor = roster.find(value => value.roleId === roleId);
      const current = { sameActor: true, sessionId, uidHash: actor.uidHash, profileRoleId: roleId,
        connection: 'live', freshness: 'server', cycle: 1, phase: 'active', turnStatePhase: 'team' };
      // Keep this test focused on the separate re-entry repair. The full result
      // wrapper is exercised below in its own contract test.
      return { ...current, actor: { ...current, actorKind: 'player' }, current };
    },
  });
  return { result, enteredRoleIds };
}

test('election setup re-enters every selected original voter before opening the current GM procedure', async () => {
  const { result, enteredRoleIds } = await runElectionConsumer();
  assert.deepEqual(enteredRoleIds, selectedVoters);
  assert.equal(result.status, 'blocked', 'The inert current election form does not receive gameplay credit.');
  assert.deepEqual(Array.from(result.blockerCodes), ['election-procedure-already-configured-or-not-offered']);
});
