import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoaMissionReclamationCallableDatabase } from './boaMissionReclamationCallable';
import { createBoaMissionReclamationCallables } from './boaMissionReclamationCallable';

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

function settleCandidateVessel(shipId: string): void {
  mock.documents.get('sessions/s1')!.candidateVesselOutcomes = {
    [shipId]: { code: 'O', groupId: 'fleet-1', shipId, sourceId: 'candidate-o-3131', cycle: 2, outcome: 'crossed' },
  };
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

  it('atomically records the choice and its actor-bound receipt once', async () => {
    await expect(callables.chooseBoaMissionReclamationOpportunity(request(command))).resolves.toEqual({
      status: 'committed', sessionId: SESSION, requestId: command.requestId,
      missionOpportunityId: ARRIVAL, taskOpportunityId: 'L-1', choiceRevision: 1,
    });
    expect(mock.documents.get(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`)).toMatchObject({
      type: 'boa-mission-reclamation-choice', status: 'selected', actorUid: ACTOR, actorRoleId: 'capybara-recycler',
      opportunityTaskId: 'L-1', sourceCycle: 2, controlRevision: 2, revision: 1,
    });
    expect(mock.documents.get(`sessions/s1/commandReceipts/${command.requestId}`)).toMatchObject({
      fingerprint: { actorUid: ACTOR, action: 'boa-mission-reclamation-choice' },
      result: { status: 'committed', taskOpportunityId: 'L-1' },
    });
    expect(mock.set).toHaveBeenCalledTimes(1);
    expect(mock.create).toHaveBeenCalledTimes(1);
    // The facilitator's deal preview sees only that a Boa choice is pending, never the chosen task.
    expect(mock.update).toHaveBeenCalledWith({ path: 'sessions/s1', id: 's1' }, {
      [`boaReclamationPending.${ARRIVAL}`]: true, updatedAt: 'server-time',
    });
  });

  it('replays an exact retry without writing and rejects another player reusing the request', async () => {
    await callables.chooseBoaMissionReclamationOpportunity(request(command));
    const writes = mock.create.mock.calls.length + mock.set.mock.calls.length + mock.update.mock.calls.length;

    await expect(callables.chooseBoaMissionReclamationOpportunity(request(command))).resolves.toEqual({
      status: 'replayed', sessionId: SESSION, requestId: command.requestId,
      missionOpportunityId: ARRIVAL, taskOpportunityId: 'L-1', choiceRevision: 1,
    });
    await expect(callables.chooseBoaMissionReclamationOpportunity(request(command, 'intruder')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({ ...command, taskOpportunityId: 'L-2' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.create.mock.calls.length + mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  });

  it('rejects a repeated fresh choice against a stale revision but allows one revised choice before the deal', async () => {
    await callables.chooseBoaMissionReclamationOpportunity(request(command));
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, requestId: 'boa-choice-repeat', taskOpportunityId: 'L-2',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, requestId: 'boa-choice-revised', taskOpportunityId: 'L-2', expectedChoiceRevision: 1,
    }))).resolves.toMatchObject({ status: 'committed', taskOpportunityId: 'L-2', choiceRevision: 2 });
    expect(mock.documents.get(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`)).toMatchObject({
      status: 'selected', opportunityTaskId: 'L-2', revision: 2,
    });
  });

  it('rejects a player who does not hold the Boa without writing', async () => {
    put('sessions/s1/players/other-player', {
      connected: true, role: 'player', assignedRoleId: 'capybara-captain', fleetGroupId: 'fleet-1',
    });
    mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.memberUids = [ACTOR, 'other-player'];
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, requestId: 'boa-wrong-actor',
    }, 'other-player'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION }, 'other-player')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  });

  it('projects the current selection and hides a consumed choice from the workspace', async () => {
    await callables.chooseBoaMissionReclamationOpportunity(request(command));
    await expect(callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION }))).resolves
      .toMatchObject({ opportunities: [{ missionOpportunityId: ARRIVAL, choiceRevision: 1, selectedTaskOpportunityId: 'L-1' }] });
    mock.documents.get(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`)!.status = 'consumed';
    await expect(callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION }))).resolves
      .toMatchObject({ opportunities: [] });
  });

  /** A choice lapses only inside the deal, which creates both mission-start records in that transaction. */
  function seedDealtMissionStart(): void {
    put(`sessions/s1/missionStartSnapshots/${ARRIVAL}`, { type: 'away-mission-start-snapshot' });
    put(`sessions/s1/serverState/awayMissions/instances/mission-${ARRIVAL}`, { status: 'active' });
  }

  it('shows the Recycler a choice that lapsed because the dealt location changed', async () => {
    put(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`, {
      type: 'boa-mission-reclamation-choice', schemaVersion: 1, status: 'lapsed', sessionId: SESSION,
      opportunityId: ARRIVAL, groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceCycle: 2,
      actorUid: ACTOR, actorRoleId: 'capybara-recycler', opportunityTaskId: 'L-1', controlRevision: 2, revision: 1,
      requestId: 'boa-choice-1', missionId: `mission-${ARRIVAL}`, lapseReason: 'location-changed', lapsedCycle: 2,
    });
    seedDealtMissionStart();
    await expect(callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION }))).resolves.toMatchObject({
      lapsedChoices: [{ missionOpportunityId: ARRIVAL, taskOpportunityId: 'L-1', reason: 'location-changed' }],
    });
  });

  it('shows the Recycler a lapsed choice this cycle without offering that location again', async () => {
    put(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`, {
      type: 'boa-mission-reclamation-choice', schemaVersion: 1, status: 'lapsed', sessionId: SESSION,
      opportunityId: ARRIVAL, groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceCycle: 2,
      actorUid: ACTOR, actorRoleId: 'capybara-recycler', opportunityTaskId: 'L-1', controlRevision: 2, revision: 1,
      requestId: 'boa-choice-1', missionId: `mission-${ARRIVAL}`, lapseReason: 'recycler-not-on-mission', lapsedCycle: 2,
    });
    seedDealtMissionStart();
    await expect(callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION }))).resolves.toMatchObject({
      opportunities: [],
      lapsedChoices: [{ missionOpportunityId: ARRIVAL, siteName: expect.any(String), coordinate: '5143',
        taskOpportunityId: 'L-1', reason: 'recycler-not-on-mission' }],
    });
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, requestId: 'boa-after-lapse', expectedChoiceRevision: 1,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it.each([
    ['the actor disposition', () => {
      mock.documents.get(`sessions/s1/players/${ACTOR}`)!.candidateDisposition = {
        code: 'O', outcome: 'crossed', cycle: 2,
      };
    }],
    ['the Capybara home vessel', () => settleCandidateVessel('capybara')],
    ['the current docked host', () => settleCandidateVessel('aegis')],
  ] as const)('rejects a fresh Boa choice after %s before creating its opportunity bindings', async (_label, settle) => {
    settle();
    const requestId = `boa-settled-${_label.replaceAll(' ', '-')}`;
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({ ...command, requestId })))
      .rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.documents.has(`sessions/s1/boaMissionReclamationChoices/${ARRIVAL}`)).toBe(false);
    expect(mock.documents.has(`sessions/s1/commandReceipts/${requestId}`)).toBe(false);
  });

  it('replays a committed Boa choice after its Recycler and home vessel settle on a peer host', async () => {
    await callables.chooseBoaMissionReclamationOpportunity(request(command));
    const writes = mock.create.mock.calls.length + mock.set.mock.calls.length + mock.update.mock.calls.length;
    settleCandidateVessel('capybara');
    mock.documents.get(`sessions/s1/players/${ACTOR}`)!.candidateDisposition = {
      code: 'O', outcome: 'crossed', cycle: 2,
    };

    await expect(callables.chooseBoaMissionReclamationOpportunity(request(command))).resolves.toMatchObject({
      status: 'replayed', taskOpportunityId: 'L-1',
    });
    expect(mock.create.mock.calls.length + mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
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
    expect(mock.documents.has('sessions/s1/commandReceipts/boa-invalid-task')).toBe(false);
  });

  /** The repeatable Abandoned Wolf Supply Outpost (K) at A-6943, reached in cycle 1 and again in cycle 2. */
  function seedRepeatableArrivals(): readonly [string, string] {
    const earlier = 'arrival-fleet-1-A-6943-cycle-1';
    const later = 'arrival-fleet-1-A-6943-cycle-2';
    mock.documents.delete(`sessions/s1/missionOpportunities/${ARRIVAL}`);
    put('sessions/s1/serverState/navigation', {
      shipGalacticCoordinates: { capybara: '6943', aegis: '6943' }, revision: 5,
    });
    for (const [id, cycle] of [[earlier, 1], [later, 2]] as const) {
      put(`sessions/s1/missionOpportunities/${id}`, { ...ARRIVAL_FIELDS, id, coordinate: '6943', siteCode: 'K',
        sourceTransitionId: `jump-entry-${cycle}`, sourceCycle: cycle });
    }
    return [earlier, later];
  }

  it('offers only dealable locations: never a started mission or a superseded repeatable arrival', async () => {
    const [earlier, later] = seedRepeatableArrivals();
    const offered = async () => (await callables.readBoaMissionReclamationWorkspace(request({ sessionId: SESSION })))
      .opportunities.map(({ missionOpportunityId, sourceCycle }) => [missionOpportunityId, sourceCycle]);
    expect(await offered()).toEqual([[later, 2]]);
    expect(earlier).not.toBe(later);

    put(`sessions/s1/missionStartSnapshots/${later}`, { type: 'away-mission-start-snapshot' });
    expect(await offered()).toEqual([]);
    mock.documents.delete(`sessions/s1/missionStartSnapshots/${later}`);
    put(`sessions/s1/serverState/awayMissions/instances/mission-${later}`, { status: 'active' });
    expect(await offered()).toEqual([]);
  });

  it('rejects a choice for a repeatable arrival superseded by a later visit, before writes', async () => {
    const [earlier, later] = seedRepeatableArrivals();
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, requestId: 'boa-superseded', missionOpportunityId: earlier, taskOpportunityId: 'K-1',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.documents.has(`sessions/s1/boaMissionReclamationChoices/${earlier}`)).toBe(false);
    expect(mock.documents.has('sessions/s1/commandReceipts/boa-superseded')).toBe(false);
    await expect(callables.chooseBoaMissionReclamationOpportunity(request({
      ...command, requestId: 'boa-current-visit', missionOpportunityId: later, taskOpportunityId: 'K-1',
    }))).resolves.toMatchObject({ status: 'committed', missionOpportunityId: later });
  });
});
