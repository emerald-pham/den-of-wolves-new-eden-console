import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: { path },
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const ref = (path: string) => ({
    path,
    id: path.split('/').at(-1) ?? '',
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const collection = (path: string) => ({ path, doc: (id: string) => ref(`${path}/${id}`) });
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: (target: { path: string }) => documents.delete(target.path) }));
  return { documents, get, set, update, runTransaction, db: { doc: ref, collection, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { submitCivilUnrestGrievance, transitionCrisis } from './index';

const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'crisis-1',
  expectedRevision: 0,
  crisisId: 'approaching-vessel',
  state: 'draft' as const,
  title: 'Approaching vessel',
  details: 'The facilitator records the table decision here.',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 2 });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  provision();
});

it('walks the manual crisis lifecycle and publishes only safe member summaries', async () => {
  await expect(transitionCrisis.run(request())).resolves.toMatchObject({
    status: 'committed', sessionId: 's1', crisisId: 'approaching-vessel', state: 'draft', revision: 1,
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
  expect(mock.documents.get('sessions/s1/crisisState/current/audit/crisis-1')).toMatchObject({
    title: baseData.title,
    details: baseData.details,
  });

  const transitions = [
    ['delivered', 1], ['debated', 2], ['resolved', 3], ['announced', 4], ['closed', 5],
  ] as const;
  for (const [state, expectedRevision] of transitions) {
    await expect(transitionCrisis.run(request({
      ...baseData, requestId: `crisis-${state}`, expectedRevision, state,
    }))).resolves.toMatchObject({ status: 'committed', state, revision: expectedRevision + 1 });
  }
  const event = [...mock.documents.entries()].filter(([path]) => path.includes('/events/'))
    .map(([, fields]) => fields)
    .find((fields) => fields.state === 'closed');
  expect(event).toMatchObject({ type: 'crisis-state', state: 'closed', title: baseData.title });
  expect(event).not.toHaveProperty('details');
  const debatedEvent = [...mock.documents.entries()].filter(([path]) => path.includes('/events/'))
    .map(([, fields]) => fields)
    .find((fields) => fields.state === 'debated');
  expect(debatedEvent).toMatchObject({ type: 'crisis-state', state: 'debated', title: baseData.title });
  expect(debatedEvent).not.toHaveProperty('details');
});

it('rejects crisis identifiers longer than the projection bound before any write', async () => {
  await expect(transitionCrisis.run(request({ ...baseData, crisisId: 'x'.repeat(81) })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.documents.has('sessions/s1/crisisState/current')).toBe(false);
});

it('permits an intentionally empty private note without publishing it', async () => {
  await expect(transitionCrisis.run(request({ ...baseData, details: '' }))).resolves.toMatchObject({
    status: 'committed', state: 'draft', revision: 1,
  });
  expect([...mock.documents.values()].some((fields) => fields.type === 'crisis-state' && fields.details === '')).toBe(true);
});

it('supports an explicit escalation branch without inventing an outcome', async () => {
  await transitionCrisis.run(request());
  await transitionCrisis.run(request({ ...baseData, requestId: 'delivered', expectedRevision: 1, state: 'delivered' }));
  await transitionCrisis.run(request({ ...baseData, requestId: 'debated', expectedRevision: 2, state: 'debated' }));
  await expect(transitionCrisis.run(request({
    ...baseData, requestId: 'escalated', expectedRevision: 3, state: 'escalated',
  }))).resolves.toMatchObject({ state: 'escalated', revision: 4 });
  await expect(transitionCrisis.run(request({
    ...baseData, requestId: 'debated-again', expectedRevision: 4, state: 'debated',
  }))).resolves.toMatchObject({ state: 'debated', revision: 5 });
});

it('replays an exact request without a second mutation and rejects authority or CAS violations', async () => {
  await transitionCrisis.run(request());
  mock.set.mockClear();
  await expect(transitionCrisis.run(request())).resolves.toMatchObject({ status: 'committed', state: 'draft', revision: 1 });
  expect(mock.set).not.toHaveBeenCalled();
  await expect(transitionCrisis.run(request({ ...baseData, requestId: 'wrong', expectedRevision: 0, state: 'delivered' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(transitionCrisis.run(request({ ...baseData, requestId: 'actor', expectedRevision: 1 }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(transitionCrisis.run(request({ ...baseData, requestId: 'invalid', expectedRevision: 1, state: 'closed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('starts a new draft only after the prior crisis is closed', async () => {
  await transitionCrisis.run(request());
  for (const [state, expectedRevision] of [
    ['delivered', 1], ['debated', 2], ['resolved', 3], ['announced', 4], ['closed', 5],
  ] as const) {
    await transitionCrisis.run(request({ ...baseData, requestId: `close-${state}`, expectedRevision, state }));
  }
  await expect(transitionCrisis.run(request({
    ...baseData, requestId: 'new-draft', expectedRevision: 6, crisisId: 'disease', state: 'draft',
    title: 'Disease outbreak', details: 'A facilitator-authored note.',
  }))).resolves.toMatchObject({ crisisId: 'disease', state: 'draft', revision: 7 });
  expect(mock.documents.get('sessions/s1/crisisState/current/audit/close-closed')).toMatchObject({
    crisisId: 'approaching-vessel',
    title: baseData.title,
    details: baseData.details,
  });
  expect(mock.documents.get('sessions/s1/crisisState/current/audit/new-draft')).toMatchObject({
    crisisId: 'disease',
    title: 'Disease outbreak',
    details: 'A facilitator-authored note.',
  });
});

it('blocks a President-dependent crisis when the President role is excluded', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeRoleIds: ['dione-captain'] });
  await expect(transitionCrisis.run(request({ ...baseData, crisisKind: 'presidential-election' })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/President/i) });
  expect(mock.set).not.toHaveBeenCalled();
});

it('accepts a team grievance through a server CAS and keeps actor identity in GM audit only', async () => {
  put('sessions/s1', {
    phase: 'active', currentTurn: 2, activeVesselIds: ['icebreaker'],
    turnState: { phase: 'team' },
  });
  put('sessions/s1/players/u1', {
    uid: 'u1', role: 'player', connected: true, assignedRoleId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner',
  });
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisKind: 'civil-unrest', crisisId: 'civil-unrest',
    state: 'delivered', revision: 4, title: 'Civil unrest', details: 'GM notes',
  });
  await expect(submitCivilUnrestGrievance.run(request({
    sessionId: 's1', requestId: 'grievance-1', crisisId: 'civil-unrest',
    expectedCrisisRevision: 4, expectedGrievanceRevision: 0,
    affectedShipId: 'icebreaker', visibility: 'private', text: 'The team needs supplies.',
  }, 'u1'))).resolves.toMatchObject({ status: 'committed', shipId: 'icebreaker', revision: 1 });
  expect(mock.documents.get('sessions/s1/civilUnrestGrievances/icebreaker')).toMatchObject({
    text: 'The team needs supplies.', visibility: 'private', revision: 1,
  });
  expect(mock.documents.get('sessions/s1/civilUnrestGrievances/icebreaker')).not.toHaveProperty('actorUid');
  expect(mock.documents.get('sessions/s1/civilUnrestGrievances/icebreaker/audit/grievance-1')).toMatchObject({ actorUid: 'u1' });
  expect(mock.documents.get('sessions/s1/civilUnrestPublic/current')).toMatchObject({ grievances: [] });
  await expect(submitCivilUnrestGrievance.run(request({
    sessionId: 's1', requestId: 'grievance-2', crisisId: 'civil-unrest',
    expectedCrisisRevision: 4, expectedGrievanceRevision: 1,
    affectedShipId: 'icebreaker', visibility: 'public', text: 'We need supplies publicly.',
  }, 'u1'))).resolves.toMatchObject({ status: 'committed', revision: 2, visibility: 'public' });
  expect(mock.documents.get('sessions/s1/civilUnrestPublic/current')).toMatchObject({
    grievances: [{ shipId: 'icebreaker', text: 'We need supplies publicly.', revision: 2 }],
  });
});

it('rejects a stale lifecycle, wrong phase, and arbitrary ship before writing', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeVesselIds: ['icebreaker'], turnState: { phase: 'coordination' } });
  put('sessions/s1/players/u1', {
    uid: 'u1', role: 'player', connected: true, assignedRoleId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner',
  });
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisKind: 'civil-unrest', crisisId: 'civil-unrest',
    state: 'delivered', revision: 4, title: 'Civil unrest', details: '',
  });
  await expect(submitCivilUnrestGrievance.run(request({
    sessionId: 's1', requestId: 'bad-1', crisisId: 'civil-unrest', expectedCrisisRevision: 4,
    expectedGrievanceRevision: 0, affectedShipId: 'dione', visibility: 'public', text: 'No.',
  }, 'u1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect([...mock.documents.keys()].some((path) => path.includes('civilUnrestGrievances'))).toBe(false);
});

it('blocks Religious Zealotry without Universal Arbour unless the facilitator records an override', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, universalArbourEnabled: false });
  await expect(transitionCrisis.run(request({ ...baseData, crisisKind: 'religious-zealotry' })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/Universal Arbour/i) });
  expect(mock.set).not.toHaveBeenCalled();
  await expect(transitionCrisis.run(request({ ...baseData, crisisKind: 'religious-zealotry', configurationOverride: 'Facilitator adapts this crisis for the table.' })))
    .resolves.toMatchObject({ status: 'committed' });
  expect(mock.documents.get('sessions/s1/crisisState/current')).toMatchObject({
    crisisKind: 'religious-zealotry', configurationOverride: 'Facilitator adapts this crisis for the table.',
  });
});

it('rechecks configuration at delivery and permits a newly recorded private override', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, universalArbourEnabled: true });
  const typed = { ...baseData, crisisKind: 'religious-zealotry' };
  await transitionCrisis.run(request(typed));
  put('sessions/s1', { phase: 'active', currentTurn: 2, universalArbourEnabled: false });
  const delivered = { ...typed, requestId: 'deliver-crisis', expectedRevision: 1, state: 'delivered' };
  await expect(transitionCrisis.run(request(delivered))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(transitionCrisis.run(request({ ...delivered, configurationOverride: 'Adapted after the roster changed.' })))
    .resolves.toMatchObject({ state: 'delivered' });
  const event = mock.documents.get('sessions/s1/events/crisis-approaching-vessel-deliver-crisis');
  expect(JSON.stringify(event)).not.toContain('Adapted after the roster changed.');
  expect(mock.documents.get('sessions/s1/crisisState/current')).toMatchObject({ configurationOverride: 'Adapted after the roster changed.' });
});

it.each(['approaching-vessel', 'disease-outbreak', 'civil-unrest'])('allows %s without a President or loyalty override', async (crisisKind) => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeRoleIds: [], universalArbourEnabled: false });
  await expect(transitionCrisis.run(request({ ...baseData, crisisKind }))).resolves.toMatchObject({ state: 'draft' });
});

it('permits Presidential Election with its configured role and rejects an unknown kind', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeRoleIds: ['dione-president'] });
  await expect(transitionCrisis.run(request({ ...baseData, crisisKind: 'not-a-crisis' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.set).not.toHaveBeenCalled();
  await expect(transitionCrisis.run(request({ ...baseData, crisisKind: 'presidential-election' })))
    .resolves.toMatchObject({ state: 'draft' });
});


it('preserves a typed crisis and private override across older-client transitions', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeRoleIds: [] });
  const legacy = { ...baseData, crisisId: 'election-2026' };
  await transitionCrisis.run(request({ ...legacy, crisisKind: 'presidential-election', configurationOverride: 'Facilitator-approved adaptation.' }));
  for (const [state, expectedRevision] of [['delivered', 1], ['debated', 2]] as const) {
    await expect(transitionCrisis.run(request({ ...legacy, requestId: `legacy-${state}`, expectedRevision, state })))
      .resolves.toMatchObject({ state, revision: expectedRevision + 1 });
    expect(mock.documents.get('sessions/s1/crisisState/current')).toMatchObject({
      crisisKind: 'presidential-election', configurationOverride: 'Facilitator-approved adaptation.',
    });
  }
});

it('still rechecks eligibility and rejects explicit kind changes for older-client drafts', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeRoleIds: ['dione-president'] });
  const legacy = { ...baseData, crisisId: 'election-2026' };
  await transitionCrisis.run(request({ ...legacy, crisisKind: 'presidential-election' }));
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeRoleIds: [] });
  const delivered = { ...legacy, requestId: 'legacy-delivered', expectedRevision: 1, state: 'delivered' };
  await expect(transitionCrisis.run(request(delivered)))
    .rejects.toMatchObject({ message: expect.stringMatching(/President/i) });
  await expect(transitionCrisis.run(request({ ...delivered, crisisKind: 'custom' })))
    .rejects.toMatchObject({ message: expect.stringMatching(/configuration is fixed/i) });
});

it('delivers a durable public scouting report without exposing facilitator reality or difficulty notes', async () => {
  const input = { ...baseData, crisisId: 'scout-report-1', crisisKind: 'approaching-vessel', details: 'Reality: trap. Difficulty: fleet has ample supplies.' };
  await transitionCrisis.run(request(input));
  expect(mock.documents.has('sessions/s1/crisisReports/current')).toBe(false);
  const delivered = { ...input, requestId: 'report-delivery', expectedRevision: 1, state: 'delivered' };
  await transitionCrisis.run(request(delivered));
  const report = mock.documents.get('sessions/s1/crisisReports/current');
  expect(report).toMatchObject({ sessionId: 's1', crisisId: 'scout-report-1', state: 'delivered', revision: 2,
    title: 'Approaching vessel', body: expect.stringMatching(/Gliese scout/) });
  expect(JSON.stringify(report)).not.toMatch(/Reality: trap|Difficulty: fleet|configurationOverride|actorUid/);
  mock.set.mockClear();
  await transitionCrisis.run(request(delivered));
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.get('sessions/s1/crisisState/current')).toMatchObject({ details: input.details });
});

it('retires a delivered report when a closed crisis is replaced by a fresh draft', async () => {
  await transitionCrisis.run(request());
  for (const [state, expectedRevision] of [['delivered', 1], ['debated', 2], ['resolved', 3], ['announced', 4], ['closed', 5]] as const) {
    await transitionCrisis.run(request({ ...baseData, requestId: `report-${state}`, expectedRevision, state }));
  }
  expect(mock.documents.get('sessions/s1/crisisReports/current')).toMatchObject({ state: 'closed' });
  await transitionCrisis.run(request({ ...baseData, requestId: 'replacement', expectedRevision: 6, crisisId: 'another-crisis', crisisKind: 'custom' }));
  expect(mock.documents.has('sessions/s1/crisisReports/current')).toBe(false);
});

it('retires the current Zealotry decision when a closed crisis is replaced', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, universalArbourEnabled: true });
  const crisisA = {
    ...baseData,
    crisisId: 'zealotry-a', crisisKind: 'religious-zealotry',
    title: 'Religious zealotry A', details: 'First crisis notes.',
  };
  await transitionCrisis.run(request(crisisA));
  put('sessions/s1/zealotryResponses/current', {
    type: 'zealotry-response', sessionId: 's1', crisisId: 'zealotry-a',
    crisisRevision: 3, state: 'debated', revision: 1,
    actions: ['pressure', 'investigate'], rationale: 'Keep this private to crisis A.',
    loyaltyCensusRevision: null, actorUid: 'u1', instanceId: 'gm-1',
  });
  put('sessions/s1/zealotryResponses/history-response-a', {
    type: 'zealotry-response', sessionId: 's1', crisisId: 'zealotry-a',
    crisisRevision: 3, state: 'debated', revision: 1,
    actions: ['pressure', 'investigate'], rationale: 'Keep this private to crisis A.',
    loyaltyCensusRevision: null, actorUid: 'u1', instanceId: 'gm-1',
  });
  for (const [state, expectedRevision] of [
    ['delivered', 1], ['debated', 2], ['resolved', 3], ['announced', 4], ['closed', 5],
  ] as const) {
    await transitionCrisis.run(request({ ...crisisA, requestId: `a-${state}`, expectedRevision, state }));
  }
  expect(mock.documents.has('sessions/s1/zealotryResponses/current')).toBe(true);

  const crisisB = {
    ...crisisA,
    crisisId: 'zealotry-b', title: 'Religious zealotry B', details: 'Second crisis notes.',
  };
  await transitionCrisis.run(request({ ...crisisB, requestId: 'b-draft', expectedRevision: 6, state: 'draft' }));
  expect(mock.documents.has('sessions/s1/zealotryResponses/current')).toBe(false);
  expect(mock.documents.has('sessions/s1/zealotryResponses/history-response-a')).toBe(true);
  await transitionCrisis.run(request({ ...crisisB, requestId: 'b-delivered', expectedRevision: 7, state: 'delivered' }));
  await transitionCrisis.run(request({ ...crisisB, requestId: 'b-debated', expectedRevision: 8, state: 'debated' }));
  expect(mock.documents.has('sessions/s1/zealotryResponses/current')).toBe(false);
});

it('accepts the alternative Wolf Cult configuration and rechecks it before Zealotry delivery', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, universalArbourEnabled: false, wolfCultEnabled: true });
  const input = { ...baseData, crisisId: 'zealotry-1', crisisKind: 'religious-zealotry' };
  await expect(transitionCrisis.run(request(input))).resolves.toMatchObject({ state: 'draft' });
  put('sessions/s1', { phase: 'active', currentTurn: 2, universalArbourEnabled: false, wolfCultEnabled: false });
  const delivered = { ...input, requestId: 'cult-delivery', expectedRevision: 1, state: 'delivered' };
  await expect(transitionCrisis.run(request(delivered))).rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1', { phase: 'active', currentTurn: 2, universalArbourEnabled: false, wolfCultEnabled: true });
  await expect(transitionCrisis.run(request(delivered))).resolves.toMatchObject({ state: 'delivered' });
});

it.each([
  { universalArbourEnabled: true, wolfCultEnabled: false },
  { universalArbourEnabled: false, wolfCultEnabled: true },
])('delivers the same public Zealotry report for either compatible loyalty configuration: %j', async (configuration) => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, ...configuration });
  const input = { ...baseData, crisisId: 'zealotry-public', crisisKind: 'religious-zealotry', details: 'Secret holder: player-27. Private adjudication notes.' };
  await transitionCrisis.run(request(input));
  expect(mock.documents.has('sessions/s1/crisisReports/current')).toBe(false);
  await transitionCrisis.run(request({ ...input, requestId: 'zealotry-delivery', expectedRevision: 1, state: 'delivered' }));
  const report = mock.documents.get('sessions/s1/crisisReports/current');
  expect(report).toMatchObject({ title: 'Religious zealotry', body: expect.stringContaining('Universal Arbour'), state: 'delivered' });
  expect(JSON.stringify(report)).not.toMatch(/player-27|adjudication|Wolf Cult|wolfCultEnabled|universalArbourEnabled/);
  expect(mock.documents.get('sessions/s1/crisisState/current')).toMatchObject({ details: input.details });
});

it('introduces an election without inventing voting, timing or campaign procedures', async () => {
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeRoleIds: ['dione-president'] });
  const input = { ...baseData, crisisId: 'election-1', crisisKind: 'presidential-election', details: 'Private facilitator preparation.' };
  await transitionCrisis.run(request(input));
  await transitionCrisis.run(request({ ...input, requestId: 'election-report', expectedRevision: 1, state: 'delivered' }));
  const report = mock.documents.get('sessions/s1/crisisReports/current');
  expect(report).toMatchObject({ title: 'Presidential election', state: 'delivered' });
  expect(report?.body).toEqual(expect.stringMatching(/voting method.*timing.*campaign rules/));
  expect(report?.body).toEqual(expect.stringContaining('still need facilitator decisions'));
  expect(JSON.stringify(report)).not.toContain(input.details);
  expect([...mock.documents.keys()].some(path => /ballot|electionProcedure/.test(path))).toBe(false);
});

it('delivers explicitly public outbreak details while keeping facilitator notes private', async () => {
  const diseaseOutbreak = { affectedShipIds: ['aegis'], workRestrictions: 'Medical staff report reduced work capacity.', escalationRisk: 'Further spread is possible without a response.' };
  const input = { ...baseData, crisisId: 'outbreak-1', crisisKind: 'disease-outbreak', details: 'Private: review pressure after the next turn.', diseaseOutbreak };
  await transitionCrisis.run(request(input));
  expect(mock.documents.has('sessions/s1/crisisReports/current')).toBe(false);
  await transitionCrisis.run(request({ ...input, requestId: 'outbreak-delivery', expectedRevision: 1, state: 'delivered' }));
  const report = mock.documents.get('sessions/s1/crisisReports/current');
  expect(report).toMatchObject({ title: 'Disease outbreak', body: expect.stringContaining('AEGIS') });
  expect(report?.body).toEqual(expect.stringContaining(diseaseOutbreak.workRestrictions));
  expect(report?.body).toEqual(expect.stringContaining(diseaseOutbreak.escalationRisk));
  expect(JSON.stringify(report)).not.toContain(input.details);
  await transitionCrisis.run(request({ ...baseData, crisisId: input.crisisId, crisisKind: input.crisisKind, details: input.details, requestId: 'legacy-outbreak-debate', expectedRevision: 2, state: 'debated' }));
  expect(mock.documents.get('sessions/s1/crisisState/current')).toMatchObject({ diseaseOutbreak });
  expect(mock.documents.get('sessions/s1/crisisReports/current')?.body).toEqual(report?.body);
});

it('requires complete outbreak details at delivery and permits adding them to an existing draft', async () => {
  const input = { ...baseData, crisisId: 'outbreak-1', crisisKind: 'disease-outbreak' };
  await transitionCrisis.run(request(input));
  const delivered = { ...input, requestId: 'outbreak-delivery', expectedRevision: 1, state: 'delivered' };
  await expect(transitionCrisis.run(request(delivered))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(transitionCrisis.run(request({ ...delivered, diseaseOutbreak: { affectedShipIds: ['aegis'], workRestrictions: 'Affected crew cannot work.', escalationRisk: 'Conditions may worsen.' } })))
    .resolves.toMatchObject({ state: 'delivered' });
});

it('rejects unknown outbreak ships and rechecks current ship availability before delivery', async () => {
  const diseaseOutbreak = { affectedShipIds: ['not-a-ship'], workRestrictions: 'Reported restriction.', escalationRisk: 'Reported risk.' };
  const input = { ...baseData, crisisKind: 'disease-outbreak', diseaseOutbreak };
  await expect(transitionCrisis.run(request(input))).rejects.toMatchObject({ code: 'failed-precondition' });
  diseaseOutbreak.affectedShipIds = ['dione'];
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeVesselIds: ['aegis', 'dione'], dioneEnabled: true });
  await transitionCrisis.run(request(input));
  put('sessions/s1', { phase: 'active', currentTurn: 2, activeVesselIds: ['aegis'], dioneEnabled: false });
  await expect(transitionCrisis.run(request({ ...input, requestId: 'outbreak-delivery', expectedRevision: 1, state: 'delivered' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});


it('binds outbreak retries to their public details and freezes the delivered report', async () => {
  const diseaseOutbreak = { affectedShipIds: ['aegis'], workRestrictions: 'Limited work.', escalationRisk: 'Further spread.' };
  const input = { ...baseData, crisisKind: 'disease-outbreak', diseaseOutbreak };
  await transitionCrisis.run(request(input));
  const delivered = { ...input, requestId: 'disease-delivery', expectedRevision: 1, state: 'delivered' };
  await transitionCrisis.run(request(delivered));
  mock.set.mockClear();
  await transitionCrisis.run(request(delivered));
  expect(mock.set).not.toHaveBeenCalled();
  const changed = { ...diseaseOutbreak, escalationRisk: 'Different risk.' };
  await expect(transitionCrisis.run(request({ ...delivered, diseaseOutbreak: changed }))).rejects.toThrow();
  await expect(transitionCrisis.run(request({ ...delivered, requestId: 'changed-debate', expectedRevision: 2, state: 'debated', diseaseOutbreak: changed }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/crisisState/current')).toMatchObject({ diseaseOutbreak });
});
