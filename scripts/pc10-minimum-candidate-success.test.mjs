import assert from 'node:assert/strict';
import test from 'node:test';
import { qualifyMinimumCandidateActors, runMinimumCandidateSuccessProbe } from './pc10-minimum-candidate-success.mjs';

// Synthetic observer snapshots only; these tests do not admit Auth actors.
const actor = (uidHash, role, assignedRoleId = null) => ({ uidHash, sessionId: 'owned-s1',
  hasAuth: true, sameActor: true, connection: 'live', freshness: 'server', playerRole: role,
  assignedRoleId, activeConsoleRoleId: assignedRoleId, seatId: assignedRoleId,
  currentCanonicalSeatOwned: true, phase: 'active', cycle: 2,
  ...(role === 'gm' ? { gmInstanceOwned: true, instanceId: 'owned-gm' } : {}) });
const fixture = code => ({ code, sessionId: 'owned-s1', configuredRoleCount: 14,
  gm: actor('gm-hash', 'gm'), scientist: actor('scientist-hash', 'player', 'shepherd-scientist'),
  representative: actor('representative-hash', 'player', code === 'N' ? 'shepherd-engineer' : 'admiral') });

function legacyInput(code) {
  const input = fixture(code);
  const roles = ['admiral', 'wing-commander', 'dione-captain', 'dione-president', 'icebreaker-captain',
    'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist', 'quellon-captain', 'quellon-explorer',
    'refinery-124-captain', 'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery',
    'joint-engineering-shepherd-icebreaker'];
  const lobby = value => ({ ...value, cycle: 0 });
  input.legacyAdmission = {
    confirmed: { sessionId: input.sessionId, setupConfirmed: true, cycle: 0, activeRoleIds: roles,
      pressEnabled: false, capybaraEnabled: false, uidHash: input.gm.uidHash, instanceId: input.gm.instanceId },
    gm: lobby(input.gm), controller: { ...lobby(input.representative), profileRoleId: 'controller' },
    roster: [{ roleId: 'shepherd-scientist', uidHash: input.scientist.uidHash }],
  };
  input.legacyConfiguration = { playerCount: 14, includePress: false, capybaraEnabled: false };
  return input;
}

test('fourteen configured roles with open unused seats require only three actual N/O actors', () => {
  for (const code of ['N', 'O']) {
    const result = qualifyMinimumCandidateActors(legacyInput(code));
    assert.equal(result.actualAuthenticatedActors, 3);
    assert.equal(result.configuredRoleCount, 14);
    assert.equal(result.fullRosterAdmission, false);
  }
});

test('small-cohort qualification rejects reused identity, foreign session and stale/wrong entitled actor', () => {
  for (const patch of [
    { uidHash: 'gm-hash' }, { sessionId: 'foreign' }, { sameActor: false },
    { connection: 'offline' }, { freshness: 'cache' }, { playerRole: 'gm' },
    { assignedRoleId: 'shepherd-engineer' }, { seatId: null }, { currentCanonicalSeatOwned: false },
  ]) {
    const input = fixture('O'); Object.assign(input.scientist, patch);
    assert.throws(() => qualifyMinimumCandidateActors(input));
  }
});

test('Station uses only GM and actual Wing Commander; configured empty EO seats add no identities', () => {
  const input = { code: 'P', sessionId: 'owned-s1', configuredRoleCount: 14,
    gm: actor('gm-hash', 'gm'), wing: actor('wing-hash', 'player', 'wing-commander') };
  const result = qualifyMinimumCandidateActors(input);
  assert.equal(result.actualAuthenticatedActors, 2);
  assert.equal(result.configuredRoleCount, 14);
});

function stationProbe() {
  const calls = [], state = { revision: 0, fuel: 20, capacity: 0, phase: 'active' };
  const gmActor = actor('gm-hash', 'gm'), wingActor = actor('wing-hash', 'player', 'wing-commander');
  const root = () => ({ sessionId: 'owned-s1', currentTurn: 2, phase: state.phase,
    activeRoleIds: Array.from({ length: 14 }, (_, i) => `configured-${i}`),
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    debriefSnapshot: state.phase === 'debrief' ? { source: 'candidate', result: 'success', candidate: { code: 'P' } } : null });
  const capacities = { aegis: 5, icebreaker: 4, shepherd: 3, quellon: 3, 'refinery-124': 4 };
  const committed = [];
  const gm = { observe: async () => gmActor, callable: async (endpoint, data) => {
    calls.push({ endpoint, data });
    if (endpoint === 'readCandidateWorkspace') return { status: 'committed', result: {
      type: 'candidate-workspace', sessionId: 'owned-s1', groupId: 'fleet-1', cycle: 2,
      revision: state.revision, paths: [{ code: 'P', coordinate: '2222', liberated: true,
        ships: Object.entries(capacities).filter(([id]) => !committed.includes(id)).map(([shipId, reactorCapacity]) => ({ shipId, reactorCapacity, canAct: true })) }] } };
    assert.equal(endpoint, 'executeCandidateAction');
    assert.equal(data.action, 'contribute-reactor');
    assert.equal(data.expectedRevision, state.revision);
    state.capacity += capacities[data.shipId]; committed.push(data.shipId); state.revision++;
    if (state.capacity >= 18) state.phase = 'debrief';
    return { status: 'committed', result: { type: 'candidate-action-result', status: 'committed',
      sessionId: 'owned-s1', requestId: data.requestId, code: 'P', action: data.action, revision: state.revision,
      ...(state.phase === 'debrief' ? { outcome: 'activated' } : {}) } };
  } };
  return { calls, context: { code: 'P', sessionId: 'owned-s1', groupId: 'fleet-1', coordinate: '2222',
    gm, wing: { observe: async () => wingActor }, readRoot: async () => root(),
    selectGmShip: async shipId => calls.push({ grant: shipId }), deadlineAt: Date.now() + 60000 } };
}

test('sparse Station action slice uses real current workspace revisions and official GM ship grants, then stops at activation', async () => {
  const { context, calls } = stationProbe();
  const result = await runMinimumCandidateSuccessProbe(context);
  assert.equal(result.actualAuthenticatedActors, 2);
  assert.equal(result.configuredRoleCount, 14);
  assert.equal(result.outcomeObserved, 'activated');
  const actions = calls.filter(call => call.endpoint === 'executeCandidateAction');
  assert.equal(actions.length, 5);
  assert.equal(calls.filter(call => call.grant).length, 5);
  for (const { data } of actions) assert.equal(Object.hasOwn(data, 'outcome'), false);
});

test('unliberated Station produces no Reactor mutation or injected combat outcome', async () => {
  const { context, calls } = stationProbe(), original = context.gm.callable;
  context.gm.callable = async (endpoint, data) => {
    const reply = await original(endpoint, data);
    if (endpoint === 'readCandidateWorkspace') reply.result.paths[0].liberated = false;
    return reply;
  };
  await assert.rejects(runMinimumCandidateSuccessProbe(context), /liberat/i);
  assert.equal(calls.filter(call => call.endpoint === 'executeCandidateAction').length, 0);
});

test('never-settling original reader fails within its original deadline', async () => {
  const { context } = stationProbe(); context.deadlineAt = Date.now() + 15;
  context.readRoot = () => new Promise(() => {});
  const result = await Promise.race([
    runMinimumCandidateSuccessProbe(context).then(() => 'unexpected-success', error => error.message),
    new Promise(resolve => setTimeout(() => resolve('unbounded-operation'), 60)),
  ]);
  assert.match(result, /deadline expired/i);
});

test('foreign workspace envelope and changed live authority cannot mutate', async () => {
  for (const patch of [{ type: 'foreign' }, { sessionId: 'foreign' }, { groupId: 'fleet-2' }, { cycle: 3 }]) {
    const { context, calls } = stationProbe(), original = context.gm.callable;
    context.gm.callable = async (name, data) => {
      const reply = await original(name, data);
      if (name === 'readCandidateWorkspace') Object.assign(reply.result, patch);
      return reply;
    };
    await assert.rejects(runMinimumCandidateSuccessProbe(context));
    assert.equal(calls.filter(call => call.endpoint === 'executeCandidateAction').length, 0);
  }
  const { context, calls } = stationProbe(); let observations = 0;
  context.gm.observe = async () => ({ ...actor('gm-hash', 'gm'), connection: ++observations > 1 ? 'offline' : 'live' });
  await assert.rejects(runMinimumCandidateSuccessProbe(context));
  assert.equal(calls.filter(call => call.endpoint === 'executeCandidateAction').length, 0);
});

test('last committed activation waits for source-owned publication without another mutation', async () => {
  const { context, calls } = stationProbe(), original = context.readRoot; let delayed = false;
  context.readRoot = async () => {
    const value = await original();
    if (value.phase === 'debrief' && !delayed) { delayed = true; return { ...value, phase: 'active', debriefSnapshot: null }; }
    return value;
  };
  const result = await runMinimumCandidateSuccessProbe(context);
  assert.equal(result.outcomeObserved, 'activated');
  assert.equal(calls.filter(call => call.endpoint === 'executeCandidateAction').length, 5);
});

test('Nebula success from old dispositions cannot be relabeled as a new reached action', async () => {
  const input = fixture('O'); let reads = 0;
  const context = { ...input, groupId: 'fleet-1', coordinate: '2222', deadlineAt: Date.now() + 100,
    gm: { observe: async () => input.gm, callable: async () => ({ status: 'committed', result: {
      type: 'candidate-workspace', sessionId: 'owned-s1', groupId: 'fleet-1', cycle: 2,
      revision: 5, paths: [{ code: 'O', coordinate: '2222', ships: [] }] } }) },
    scientist: { observe: async () => input.scientist }, representative: { observe: async () => input.representative },
    readRoot: async () => ({ sessionId: 'owned-s1', currentTurn: 2,
      activeRoleIds: Array(14).fill('configured'), phase: ++reads === 1 ? 'active' : 'debrief',
      debriefSnapshot: { source: 'candidate', result: 'success', candidate: { code: 'O' } } }),
    selectGmShip: async () => {},
  };
  await assert.rejects(runMinimumCandidateSuccessProbe(context), /reached.*receipt|receipt.*reached/i);
});

test('malformed committed envelope retains the exact uncertain request and never sends a replacement', async () => {
  for (const patch of [{ requestId: 'foreign-request' }, { revision: 100 }]) {
    const { context, calls } = stationProbe(), original = context.gm.callable;
    context.gm.callable = async (name, data) => {
      const response = await original(name, data);
      if (name === 'executeCandidateAction') Object.assign(response.result, patch);
      return response;
    };
    await assert.rejects(runMinimumCandidateSuccessProbe(context));
    const requests = calls.filter(call => call.endpoint === 'executeCandidateAction');
    assert.equal(requests.length, 1);
    assert.deepEqual(context.pendingCandidateRequest, requests[0].data);
  }
});
