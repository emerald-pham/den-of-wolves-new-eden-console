import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import {
  commitPdfFighterAceCombat,
  getPdfFighterAceCombatView,
  getPdfFighterAcePermissionView,
  grantPdfFighterAcePermission,
} from './pdfFighterAceService';

const session = {
  id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active' as const,
  ownerUid: 'owner', currentTurn: 4, activeRoleIds: ['wing-commander', 'refinery-124-pdf-colonel'],
  activeVesselIds: ['aegis', 'refinery-124'],
  turnPhase: { turn: 4, teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
    openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
    airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false } },
  createdAt: '', updatedAt: '',
};

function setActor(role: 'source' | 'ace') {
  const uid = role === 'source' ? 'commander' : 'ace';
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid, sessionId: 's1', displayName: uid, role: 'player', seatId: null,
    assignedRoleId: role === 'source' ? 'wing-commander' : null,
    activeConsoleRoleId: role === 'source' ? 'wing-commander' : null,
    replacementRoleId: role === 'ace' ? 'pdf-fighter-ace' : null,
    replacementStatus: role === 'ace' ? 'active' : null,
    joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset().mockReturnValue(mocks.call);
});

it('reads only the source officer’s current attack permission view', async () => {
  setActor('source');
  mocks.call.mockResolvedValue({ data: {
    type: 'pdf-fighter-ace-permission-view', sessionId: 's1', attackId: 'attack-4',
    turn: 4, revision: 7, range: 'medium', sourceId: 'fighter-wing-alpha',
    sourceLabel: 'AEGIS Fighter Wing Alpha', status: 'ready', reason: null,
    fighters: 4, availableFighterIndexes: [0, 1, 2, 3],
  } });

  await expect(getPdfFighterAcePermissionView('fighter-wing-alpha')).resolves.toMatchObject({
    attackId: 'attack-4', revision: 7, availableFighterIndexes: [0, 1, 2, 3],
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'getPdfFighterAcePermissionView');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', sourceId: 'fighter-wing-alpha' });
});

it('submits an explicit source officer slot grant against the displayed attack revision', async () => {
  setActor('source');
  mocks.call.mockImplementation(async (payload) => ({ data: {
    status: 'committed', type: 'pdf-fighter-ace-permission', sessionId: 's1',
    requestId: payload.requestId, attackId: 'attack-4', turn: 4, revision: 8,
    sourceId: 'fighter-wing-alpha', fighterIndex: 2, permissionRevision: 1,
    actorRoleId: 'wing-commander',
  } }));

  await expect(grantPdfFighterAcePermission({
    attackId: 'attack-4', expectedRevision: 7,
    sourceId: 'fighter-wing-alpha', fighterIndex: 2,
  })).resolves.toMatchObject({ status: 'committed', sourceId: 'fighter-wing-alpha', fighterIndex: 2 });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'grantPdfFighterAcePermission');
  expect(mocks.call.mock.calls[0]?.[0]).toMatchObject({
    sessionId: 's1', attackId: 'attack-4', expectedRevision: 7,
    sourceId: 'fighter-wing-alpha', fighterIndex: 2,
  });
});

it('commits only an opaque attack-scoped Ace action and rejects a hidden result payload', async () => {
  setActor('ace');
  const action = {
    attackId: 'attack-4', expectedRevision: 8, range: 'short' as const,
    sourceId: 'fighter-wing-alpha' as const, fighterIndex: 2,
    permissionRequestId: 'permission-1', permissionRevision: 1,
    targetId: 'contact-1', extraTargetId: 'contact-1',
  };
  mocks.call.mockImplementation(async (payload) => ({ data: {
    status: 'committed', type: 'pdf-fighter-ace-combat', sessionId: 's1',
    requestId: payload.requestId, attackId: 'attack-4', turn: 4, revision: 9,
    range: 'short', sourceId: 'fighter-wing-alpha', fighterIndex: 2,
    targetId: 'contact-1', damage: 2, targetDestroyed: true,
    results: [{ targetId: 'contact-1', damage: 2, destroyed: true }],
    fighterDestroyed: true, aceDied: false, escaped: true,
  } }));
  await expect(commitPdfFighterAceCombat(action)).resolves.toMatchObject({
    status: 'committed', attackId: 'attack-4', range: 'short', escaped: true,
    results: [{ targetId: 'contact-1', damage: 2, destroyed: true }],
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'commitPdfFighterAceCombat');
  expect(mocks.call.mock.calls[0]?.[0]).not.toHaveProperty('targetInstanceId');

  mocks.call.mockResolvedValueOnce({ data: {
    ...await mocks.call.mock.results[0]?.value.then((reply: { data: Record<string, unknown> }) => reply.data),
    targetShipId: 'wolf-cruiser',
  } });
  await expect(commitPdfFighterAceCombat(action)).rejects.toThrow(/invalid|malformed/i);
});

it('rejects use when the current role does not authorize the source or Ace', async () => {
  setActor('ace');
  await expect(getPdfFighterAcePermissionView('fighter-wing-alpha')).rejects.toThrow(/active AEGIS Wing Commander/i);
  expect(mocks.call).not.toHaveBeenCalled();
  await expect(getPdfFighterAceCombatView()).resolves.toBeNull();
  expect(mocks.call).not.toHaveBeenCalled();
});
