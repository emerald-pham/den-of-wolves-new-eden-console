import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoaMissionReclamationCallableDatabase } from './boaMissionReclamationCallable';
import { createBoaMissionReclamationCallables } from './boaMissionReclamationCallable';
import { organiserSitesForChart } from './starChartLookup';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return { exists: fields !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path),
      get: (field: string) => fields?.[field], data: () => fields };
  };
  const get = vi.fn(async (target: { path: string }) => {
    if (target.path.endsWith('/missionOpportunities') ||
        target.path.endsWith('/boaMissionReclamationChoices')) {
      const prefix = `${target.path}/`;
      return { docs: [...documents.keys()].filter((path) => path.startsWith(prefix))
        .map((path) => snapshot(path)) };
    }
    return snapshot(target.path);
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const create = vi.fn((target: { path: string }, fields: Fields) => {
    if (documents.has(target.path)) throw new Error(`already exists: ${target.path}`);
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (transaction: unknown) => unknown) => callback({ get, set, update, create }));
  return { documents, get, set, update, create, runTransaction,
    db: { doc: ref, collection: ref, runTransaction } };
});

const SESSION = 's1';
const ACTOR = 'boa-player';
const ARRIVAL = 'arrival-fleet-1-A-5143';
const SESSION_FIELDS = {
  phase: 'active', currentTurn: 2, expansion: 'capybara', capybaraEnabled: true,
  turnPhase: { turn: 2 },
  activeRoleIds: ['capybara-captain', 'capybara-recycler'],
  activeVesselIds: ['capybara', 'aegis'],
  shuttleControl: { boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler',
    ownerUid: ACTOR, holderUid: ACTOR, revision: 2 } },
  shuttleDockings: [{ shuttleId: 'boa', shipId: 'aegis', dockedAt: 'now' }],
};
const ARRIVAL_FIELDS = {
  type: 'mission-opportunity', status: 'available', sessionId: SESSION,
  id: ARRIVAL, groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L',
  sourceShipId: 'aegis', sourceTransitionId: 'jump-entry-1', sourceCycle: 2,
};
const ASTEROID_COORDINATE = Object.entries(organiserSitesForChart('A'))
  .find(([, site]) => site.code === 'A')?.[0];
if (!ASTEROID_COORDINATE) throw new Error('Expected a chart A lichen asteroid location.');
const command = {
  sessionId: SESSION, requestId: 'boa-choice-1', missionOpportunityId: ARRIVAL,
  taskOpportunityId: 'L-1', expectedControlRevision: 2, expectedChoiceRevision: 0, expectedCycle: 2,
};
const request = (data: Fields, uid = ACTOR) => ({ data, auth: { uid } });
const callableDatabase = mock.db as unknown as BoaMissionReclamationCallableDatabase;
const callables = createBoaMissionReclamationCallables({
  db: callableDatabase,
  commandMarkers: {
    read: (transaction, sessionId, requestId) => (transaction as { get: typeof mock.get })
      .get(mock.db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`)),
    create: (transaction, fingerprint, result) => (transaction as {
      create: typeof mock.create;
    }).create(mock.db.doc(`sessions/${fingerprint.sessionId}/commandReceipts/${fingerprint.requestId}`), {
      fingerprint, result, createdAt: 'server-time',
    }),
  },
  isActivePlayer: (player) => player.get('connected') === true && player.get('role') === 'player',
  serverTimestamp: () => 'server-time',
});

function put(path: string, value: Fields): void { mock.documents.set(path, { ...value }); }

function seed(): void {
  put('sessions/s1', SESSION_FIELDS);
  put('sessions/s1/players/boa-player', {
    connected: true, role: 'player', assignedRoleId: 'capybara-recycler',
    activeConsoleRoleId: 'capybara-recycler', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', memberUids: [ACTOR], vesselIds: ['capybara', 'aegis'],
  });
  put('sessions/s1/serverState/navigation', {
    shipGalacticCoordinates: { capybara: '5143', aegis: '5143' }, revision: 4,
  });
  put(`sessions/s1/missionOpportunities/${ARRIVAL}`, ARRIVAL_FIELDS);
}

describe('Boa mission reclamation callables', () => {
  beforeEach(() => {
    mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear();
    mock.update.mockClear(); mock.create.mockClear(); mock.runTransaction.mockClear();
    seed();
  });

  it('projects only current-group new-location mission-card task opportunities to the active Boa Recycler', async () => {
    put('sessions/s1/missionOpportunities/arrival-fleet-2-A-5143', {
      ...ARRIVAL_FIELDS, id: 'arrival-fleet-2-A-5143', groupId: 'fleet-2',
    });
    await expect(callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION }))).resolves.toMatchObject({
      status: 'available', sessionId: SESSION, actorUid: ACTOR, groupId: 'fleet-1',
      controlRevision: 2, cycle: 2,
      opportunities: [{ missionOpportunityId: ARRIVAL, siteCode: 'L',
        taskOpportunities: expect.arrayContaining([
          expect.objectContaining({ id: 'L-1', description: expect.any(String), difficulty: 15 }),
        ]) }],
    });
  });

  it('does not expose another fleet group and requires the current active Boa holder', async () => {
    put('sessions/s1/players/boa-player', {
      connected: true, role: 'player', assignedRoleId: 'wing-commander', fleetGroupId: 'fleet-1',
    });
    await expect(callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION })))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('atomically records the choice, actor-bound receipt, and exact half-point audit', async () => {
    await expect(callables.chooseBoaMissionReclamationOpportunity(request(command))).resolves.toEqual({
      status: 'committed', sessionId: SESSION, requestId: command.requestId,
      missionOpportunityId: ARRIVAL, taskOpportunityId: 'L-1', choiceRevision: 1,
    });
    expect(mock.documents.get(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`)).toMatchObject({
      status: 'selected', actorUid: ACTOR, opportunityTaskId: 'L-1',
      sourceCycle: 2, controlRevision: 2, revision: 1,
    });
    expect(mock.documents.get(`sessions/s1/commandReceipts/${command.requestId}`)).toMatchObject({
      fingerprint: { actorUid: ACTOR, action: 'boa-mission-reclamation-choice' },
      result: { status: 'committed', taskOpportunityId: 'L-1' },
    });
    expect(mock.documents.get(`sessions/s1/actionAudits/${command.requestId}`)).toMatchObject({
      action: 'boa-mission-reclamation-choice', resolutionSource: 'server-calculated',
    });
    expect(mock.documents.get(`sessions/s1/procedureAudits/${command.requestId}`)).toMatchObject({
      requiredChoices: [{ actor: 'player', kind: 'boa-reclamation-card', value: expect.objectContaining({
        missionOpportunityId: ARRIVAL, taskOpportunityId: 'L-1',
      }) }],
      calculation: expect.objectContaining({ rounding: 'floor', printedDifficulty: 15, effectiveDifficulty: 7 }),
      consequences: expect.objectContaining({ scrap: 1, criticalBonus: 0 }),
      audience: { operational: 'actor' },
    });
  });

  it('records 17/2 as an exact 8.5 threshold in the private Boa-choice audit', async () => {
    const opportunityId = `arrival-fleet-1-A-${ASTEROID_COORDINATE}`;
    put(`sessions/s1/missionOpportunities/${opportunityId}`, {
      ...ARRIVAL_FIELDS, id: opportunityId, coordinate: ASTEROID_COORDINATE, siteCode: 'A',
    });
    put('sessions/s1/serverState/navigation', {
      shipGalacticCoordinates: { capybara: ASTEROID_COORDINATE, aegis: ASTEROID_COORDINATE }, revision: 4,
    });
    const exactChoice = {
      ...command, requestId: 'boa-choice-seventeen', missionOpportunityId: opportunityId, taskOpportunityId: 'A-1',
    };

    await expect(callables.chooseBoaMissionReclamationOpportunity(request(exactChoice))).resolves.toMatchObject({
      status: 'committed', taskOpportunityId: 'A-1',
    });
    expect(mock.documents.get('sessions/s1/procedureAudits/boa-choice-seventeen')).toMatchObject({
      calculation: {
        rounding: 'none', printedDifficulty: 17, effectiveDifficulty: 8.5, criticalThreshold: null,
      },
    });
  });

  it('replays an exact receipt after terminal closure and authority changes without writing again', async () => {
    await callables.chooseBoaMissionReclamationOpportunity(request(command));
    const writeCount = mock.create.mock.calls.length + mock.set.mock.calls.length + mock.update.mock.calls.length;
    put('sessions/s1', { ...SESSION_FIELDS, phase: 'closed' });
    put('sessions/s1/players/boa-player', {
      connected: false, role: 'player', assignedRoleId: 'wing-commander', fleetGroupId: 'fleet-1',
    });
    await expect(callables.chooseBoaMissionReclamationOpportunity(request(command))).resolves.toMatchObject({
      status: 'replayed', taskOpportunityId: 'L-1',
    });
    expect(mock.create.mock.calls.length + mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writeCount);
  });

  it.each(['debrief', 'closed'] as const)(
    'rejects fresh Boa workspace and mission-selection calls during the %s phase without writes', async (phase) => {
      put('sessions/s1', { ...SESSION_FIELDS, phase });

      await expect(callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION })))
        .rejects.toMatchObject({ code: 'permission-denied' });
      await expect(callables.chooseBoaMissionReclamationOpportunity(request({
        ...command, requestId: `boa-terminal-${phase}`,
      }))).rejects.toMatchObject({ code: 'permission-denied' });

      expect(mock.create).not.toHaveBeenCalled();
      expect(mock.set).not.toHaveBeenCalled();
      expect(mock.update).not.toHaveBeenCalled();
      expect(mock.documents.has(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`)).toBe(false);
      expect(mock.documents.has(`sessions/s1/commandReceipts/boa-terminal-${phase}`)).toBe(false);
      expect(mock.documents.has(`sessions/s1/actionAudits/boa-terminal-${phase}`)).toBe(false);
      expect(mock.documents.has(`sessions/s1/procedureAudits/boa-terminal-${phase}`)).toBe(false);
    },
  );

  it('rejects stale control, foreign group, started locations, and a participant-free choice before writes', async () => {
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, expectedControlRevision: 1,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, taskOpportunityId: 'L-99', requestId: 'boa-invalid-task',
    }))).rejects.toMatchObject({ code: 'invalid-argument' });
    put(`sessions/s1/missionStartSnapshots/${ARRIVAL}`, { type: 'away-mission-start-snapshot' });
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, requestId: 'boa-after-deal',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.documents.has(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`)).toBe(false);
    expect(mock.documents.has('sessions/s1/actionAudits/boa-invalid-task')).toBe(false);
  });
});
