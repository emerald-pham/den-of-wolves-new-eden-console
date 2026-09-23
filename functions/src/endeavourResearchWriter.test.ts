import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: ref(path),
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) =>
    documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [path, value] of Object.entries(fields)) {
      const parts = path.split('.');
      if (parts.length === 1) current[path] = value;
      else {
        let cursor = current;
        for (let index = 0; index < parts.length - 1; index += 1) {
          const key = parts[index]!;
          cursor[key] = { ...((cursor[key] as Fields | undefined) ?? {}) };
          cursor = cursor[key] as Fields;
        }
        cursor[parts.at(-1)!] = value;
      }
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update }));
  return { documents, get, set, update, db: { doc: ref, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    toDate() { return this.value; }
  },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({
    run: maybeHandler ?? optionsOrHandler,
  }),
}));

import {
  advanceEndeavourResearchTrack,
  readEndeavourResearchWorkspace,
} from './endeavourResearchWriter';

const command = {
  sessionId: 's1', requestId: 'research-1', expectedControlRevision: 2,
  expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'standard',
};
const request = (data: Fields, uid = 'scientist') =>
  ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

function seedSession(): void {
  put('sessions/s1', {
    phase: 'active', currentTurn: 3, activeRoleIds: ['shepherd-scientist'],
    activeVesselIds: ['shepherd', 'aegis'],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: {
      endeavour: {
        shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
        ownerUid: 'scientist', holderUid: 'scientist', revision: 2,
      },
    },
    shipResources: {
      shepherd: { ore: 10, fuel: 4, food: 10, water: 8, materials: 18, securityTeams: 2 },
    },
  });
  put('sessions/s1/players/scientist', {
    role: 'player', connected: true, assignedRoleId: 'shepherd-scientist', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['shepherd', 'aegis'], memberUids: ['scientist'],
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  seedSession();
});

describe('Endeavour Team research writer', () => {
  it('advances one canonical left-most box and persists private progress and cadence atomically', async () => {
    await expect(advanceEndeavourResearchTrack.run(request(command))).resolves.toEqual({
      status: 'committed', sessionId: 's1', requestId: 'research-1', cycle: 3,
      researchRevision: 1, trackId: 'reactor', funding: 'standard', oreCost: 0,
      previousMaterialCost: 8, currentMaterialCost: 7, shepherdOre: 10,
      progress: { reactor: 1 },
      cadence: { cycle: 3, revision: 1, choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }] },
    });

    expect(mock.documents.get('sessions/s1/serverState/endeavourResearch')).toEqual({ reactor: 1 });
    expect(mock.documents.get('sessions/s1/serverState/endeavourResearchCadence')).toEqual({
      cycle: 3, revision: 1, choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }],
    });
    expect(mock.documents.get('sessions/s1')).not.toHaveProperty('endeavourResearch');
    expect(mock.documents.get('sessions/s1')).not.toHaveProperty('endeavourResearchCadence');
    expect(mock.documents.has('sessions/s1/events/endeavour-research-research-1')).toBe(false);
    expect(mock.documents.get('sessions/s1/commandReceipts/research-1')).toMatchObject({
      fingerprint: { action: 'endeavour-research', actorUid: 'scientist' },
    });
  });

  it('charges exactly five Shepherd ore for an additional choice and leaves standard choices free', async () => {
    await expect(advanceEndeavourResearchTrack.run(request({
      ...command, requestId: 'research-ore', funding: 'shepherd-ore',
    }))).resolves.toMatchObject({ funding: 'shepherd-ore', oreCost: 5, shepherdOre: 5 });
    expect(mock.documents.get('sessions/s1')).toMatchObject({ shipResources: { shepherd: { ore: 5 } } });
    expect(mock.documents.get('sessions/s1/serverState/endeavourResearchCadence')).toMatchObject({
      choices: [{ funding: 'shepherd-ore', oreCost: 5 }],
    });
  });

  it('starts a new cycle with fresh choice capacity and a monotonic revision while retaining research progress', async () => {
    put('sessions/s1/serverState/endeavourResearch', { reactor: 2 });
    put('sessions/s1/serverState/endeavourResearchCadence', {
      cycle: 2, revision: 7,
      choices: [{ trackId: 'jump-drive', funding: 'standard', oreCost: 0 }],
    });
    await expect(advanceEndeavourResearchTrack.run(request({
      ...command, expectedResearchRevision: 7,
    }))).resolves.toMatchObject({
      researchRevision: 8, previousMaterialCost: 6, currentMaterialCost: 5,
      progress: { reactor: 3 },
      cadence: { cycle: 3, revision: 8, choices: [{ trackId: 'reactor', funding: 'standard' }] },
    });
  });

  it('enforces three standard and two Shepherd-ore choices across successive committed calls', async () => {
    const standardTracks = ['reactor', 'jump-drive', 'hydroponics'] as const;
    for (const [index, trackId] of standardTracks.entries()) {
      await expect(advanceEndeavourResearchTrack.run(request({
        ...command,
        requestId: `standard-${index + 1}`,
        expectedResearchRevision: index,
        trackId,
      }))).resolves.toMatchObject({ researchRevision: index + 1, funding: 'standard' });
    }
    const standardWrites = mock.set.mock.calls.length + mock.update.mock.calls.length;
    await expect(advanceEndeavourResearchTrack.run(request({
      ...command, requestId: 'standard-over-limit', expectedResearchRevision: 3,
      trackId: 'water-reclamation',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(standardWrites);

    for (const [index, trackId] of ['water-reclamation', 'advanced-hydroponics'].entries()) {
      await expect(advanceEndeavourResearchTrack.run(request({
        ...command,
        requestId: `extra-${index + 1}`,
        expectedResearchRevision: 3 + index,
        trackId,
        funding: 'shepherd-ore',
      }))).resolves.toMatchObject({ researchRevision: 4 + index, funding: 'shepherd-ore', oreCost: 5 });
    }
    const extraWrites = mock.set.mock.calls.length + mock.update.mock.calls.length;
    await expect(advanceEndeavourResearchTrack.run(request({
      ...command, requestId: 'extra-over-limit', expectedResearchRevision: 5,
      trackId: 'fuel-refinery', funding: 'shepherd-ore',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(extraWrites);
    expect(mock.documents.get('sessions/s1/serverState/endeavourResearchCadence')).toMatchObject({
      cycle: 3, revision: 5, choices: expect.arrayContaining([
        { trackId: 'reactor', funding: 'standard', oreCost: 0 },
        { trackId: 'jump-drive', funding: 'standard', oreCost: 0 },
        { trackId: 'hydroponics', funding: 'standard', oreCost: 0 },
        { trackId: 'water-reclamation', funding: 'shepherd-ore', oreCost: 5 },
        { trackId: 'advanced-hydroponics', funding: 'shepherd-ore', oreCost: 5 },
      ]),
    });
    expect(mock.documents.get('sessions/s1')).toMatchObject({ shipResources: { shepherd: { ore: 0 } } });
  });

  it.each([
    ['non-Scientist actor', 'intruder', undefined],
    ['wrong active console role', 'scientist', 'shepherd-engineer'],
  ])('denies %s before writes', async (_label, uid, roleId) => {
    if (roleId) mock.documents.get('sessions/s1/players/scientist')!.assignedRoleId = roleId;
    await expect(advanceEndeavourResearchTrack.run(request(command, uid)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it.each([
    ['disconnected Scientist', (actor: Fields) => { actor.connected = false; }],
    ['kicked Scientist', (actor: Fields) => { actor.kickedAt = 'removed'; }],
    ['stale Scientist presence', (actor: Fields) => {
      actor.lastSeenAt = new Timestamp(new Date(Date.now() - 60 * 60 * 1000));
    }],
    ['malformed Scientist presence', (actor: Fields) => { actor.lastSeenAt = 'not-a-timestamp'; }],
  ])('denies %s before any state write', async (_label, mutate) => {
    mutate(mock.documents.get('sessions/s1/players/scientist')!);
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('requires current Endeavour holder, active Scientist roster, and Shepherd group membership', async () => {
    const session = mock.documents.get('sessions/s1')!;
    (session.shuttleControl as Fields).endeavour = {
      shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
      ownerUid: 'scientist', holderUid: 'someone-else', revision: 2,
    };
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'permission-denied' });

    (session.shuttleControl as Fields).endeavour = {
      shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
      ownerUid: 'scientist', holderUid: 'scientist', revision: 2,
    };
    session.activeRoleIds = ['shepherd-engineer'];
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'permission-denied' });

    session.activeRoleIds = ['shepherd-scientist'];
    mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['aegis'];
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it.each([
    ['foreign Endeavour role owner', (session: Fields) => {
      (session.shuttleControl as Fields).endeavour = {
        shuttleId: 'endeavour', ownerRoleId: 'shepherd-engineer',
        ownerUid: 'scientist', holderUid: 'scientist', revision: 2,
      };
    }],
    ['replacement role replacing Scientist', (_session: Fields, actor: Fields) => {
      actor.replacementRoleId = 'shepherd-engineer';
    }],
    ['player outside Shepherd group', (_session: Fields, _actor: Fields, group: Fields) => {
      group.memberUids = ['another-player'];
    }],
    ['escaped Scientist', (_session: Fields, actor: Fields) => {
      actor.escapeState = { status: 'fled', shipId: 'shepherd', destructionEventId: 'destroyed', revision: 1 };
    }],
  ])('denies %s before private or public writes', async (_label, mutate) => {
    mutate(
      mock.documents.get('sessions/s1')!,
      mock.documents.get('sessions/s1/players/scientist')!,
      mock.documents.get('sessions/s1/fleetGroups/fleet-1')!,
    );
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it.each([
    ['Coordination phase', { airspace: { state: 'lifted' } }],
    ['missing phase', {}],
  ])('denies a fresh choice during %s without writes', async (_label, phasePatch) => {
    const session = mock.documents.get('sessions/s1')!;
    session.turnPhase = { turn: 3, ...phasePatch };
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('debits Shepherd ore only from the server-held inventory and rejects insufficient stock atomically', async () => {
    const session = mock.documents.get('sessions/s1')!;
    (session.shipResources as Fields).shepherd = { ore: 4 };
    await expect(advanceEndeavourResearchTrack.run(request({
      ...command, requestId: 'research-underfunded', funding: 'shepherd-ore',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.documents.has('sessions/s1/serverState/endeavourResearch')).toBe(false);
  });

  it.each([
    ['malformed progress', 'endeavourResearch', { reactor: 1, unknownTrack: 2 }],
    ['malformed cadence', 'endeavourResearchCadence', { cycle: 3, revision: 0, choices: [] }],
  ])('fails closed on %s without partial research or ore writes', async (_label, stateDoc, value) => {
    put(`sessions/s1/serverState/${stateDoc}`, value);
    await expect(advanceEndeavourResearchTrack.run(request({
      ...command, funding: 'shepherd-ore',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it.each([
    ['stale research revision', { expectedResearchRevision: 1 }],
    ['stale cycle', { expectedCycle: 2 }],
  ])('rejects %s without writes', async (_label, patch) => {
    await expect(advanceEndeavourResearchTrack.run(request({ ...command, ...patch })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('rejects a stale Endeavour control revision without research or ore writes', async () => {
    mock.documents.get('sessions/s1')!.shuttleControl = {
      endeavour: {
        shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
        ownerUid: 'scientist', holderUid: 'scientist', revision: 3,
      },
    };
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('rejects client supplied research state or cost before transaction writes', async () => {
    await expect(advanceEndeavourResearchTrack.run(request({ ...command, materialCost: 8 })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('replays the same committed choice after the phase changes without spending ore or advancing twice', async () => {
    const oreCommand = { ...command, funding: 'shepherd-ore' };
    const first = await advanceEndeavourResearchTrack.run(request(oreCommand));
    const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
    const session = mock.documents.get('sessions/s1')!;
    session.turnPhase = {
      turn: 3,
      teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    };
    const replay = await advanceEndeavourResearchTrack.run(request(oreCommand));
    expect(replay).toEqual({ ...first, status: 'replayed' });
    expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
    expect(mock.documents.get('sessions/s1/serverState/endeavourResearch')).toEqual({ reactor: 1 });
    expect(mock.documents.get('sessions/s1')).toMatchObject({ shipResources: { shepherd: { ore: 5 } } });
  });

  it('rejects request-id collisions instead of exposing another research result', async () => {
    await advanceEndeavourResearchTrack.run(request(command));
    const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
    await expect(advanceEndeavourResearchTrack.run(request({ ...command, trackId: 'jump-drive' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  });

  it('rejects request ids already bound to a legacy mutation or event', async () => {
    put('sessions/s1/events/research-1', { type: 'legacy-action' });
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('fails closed when a private replay receipt does not match canonical progress and cost', async () => {
    await advanceEndeavourResearchTrack.run(request(command));
    const receipt = mock.documents.get('sessions/s1/commandReceipts/research-1')!;
    (receipt.result as Fields).previousMaterialCost = 999;
    mock.set.mockClear();
    mock.update.mockClear();
    await expect(advanceEndeavourResearchTrack.run(request(command)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns saved research only to the current Scientist and derives material prices from canonical progress', async () => {
    put('sessions/s1/serverState/endeavourResearch', { reactor: 1 });
    put('sessions/s1/serverState/endeavourResearchCadence', {
      cycle: 3, revision: 1, choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }],
    });
    await expect(readEndeavourResearchWorkspace.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
      sessionId: 's1', cycle: 3, researchRevision: 1, shepherdOre: 10,
      progress: { reactor: 1 },
      tracks: expect.arrayContaining([
        { trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5, currentMaterialCost: 7, complete: false },
      ]),
    });
    await expect(readEndeavourResearchWorkspace.run(request({ sessionId: 's1' }, 'intruder')))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });
});
