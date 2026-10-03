import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));
import { getWolfEscortRangeActionChoice, commitWolfEscortRangeActionChoice } from './wolfEscortRangeService';

const view = { type: 'dione-maliades-range-action-view', sessionId: 's1', attackId: 'attack-2', turn: 2,
  revision: 8, range: 'medium-range', choiceStatus: 'pending', launched: true, damage: 1, destroyed: false,
  targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 1 }] };
beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset().mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'gm',
    createdAt: '', updatedAt: '', currentTurn: 2,
    shuttleControl: { maliades: { shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'u1', holderUid: 'u1', revision: 0 } },
  }, { uid: 'u1', sessionId: 's1', displayName: 'Engineer', role: 'player', seatId: null,
    assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', fleetGroupId: 'fleet-1', joinedAt: '' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});
it('reads exact member-safe Maliades choices and rejects private fields or invalid contacts', async () => {
  mocks.call.mockResolvedValue({ data: view });
  await expect(getWolfEscortRangeActionChoice('medium-range', 'maliades')).resolves.toEqual(view);
  expect(mocks.callable).toHaveBeenLastCalledWith('functions', 'getWolfEscortRangeActionChoice');
  mocks.call.mockResolvedValue({ data: { ...view, dice: [6] } });
  await expect(getWolfEscortRangeActionChoice('medium-range', 'maliades')).rejects.toThrow(/invalid/i);
  mocks.call.mockResolvedValue({ data: { ...view, targets: [{ instanceId: 'wolf-1', label: 'Private', targetNumber: 1 }] } });
  await expect(getWolfEscortRangeActionChoice('medium-range', 'maliades')).rejects.toThrow(/invalid/i);
});
it('sends an explicit pass and binds the exact source, attack, count, and next revision receipt', async () => {
  mocks.call.mockImplementation(async (payload) => ({ data: { type: 'wolf-escort-range-action-choice', status: 'committed',
    sessionId: 's1', requestId: payload.requestId, attackId: 'attack-2', turn: 2, revision: 9,
    range: 'medium-range', sourceId: 'maliades', choiceStatus: 'pending-resolution', actionCount: 0 } }));
  await expect(commitWolfEscortRangeActionChoice(view, 'maliades', [])).resolves.toMatchObject({ actionCount: 0, revision: 9 });
  expect(mocks.call.mock.calls[0][0]).toMatchObject({ expectedTurn: 2, expectedRevision: 8, sourceId: 'maliades', actions: [] });
  mocks.call.mockImplementation(async (payload) => ({ data: { type: 'wolf-escort-range-action-choice', status: 'committed',
    sessionId: 's1', requestId: payload.requestId, attackId: 'other-attack', turn: 2, revision: 9,
    range: 'medium-range', sourceId: 'maliades', choiceStatus: 'pending-resolution', actionCount: 0 } }));
  await expect(commitWolfEscortRangeActionChoice(view, 'maliades', [])).rejects.toThrow(/invalid/i);
});
it('withholds requests on cached state or wrong current custody and discards a late role-switch reply', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(getWolfEscortRangeActionChoice('medium-range', 'maliades')).rejects.toThrow(/live session/i);
  expect(mocks.callable).not.toHaveBeenCalled();
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  mocks.call.mockImplementation(async () => {
    const current = useSessionStore.getState();
    current.setIdentity(current.session!, { ...current.me!, assignedRoleId: 'dione-gardener', activeConsoleRoleId: 'dione-gardener' });
    return { data: view };
  });
  await expect(getWolfEscortRangeActionChoice('medium-range', 'maliades')).rejects.toThrow(/authority changed/i);
});
