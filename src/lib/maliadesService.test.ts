import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairMaliades, resolveMaliadesMedium, resolveMaliadesShort } from './maliadesService';

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset().mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '', currentTurn: 2, activeVesselIds: ['dione'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: '2099-09-22T12:00:00.000Z', openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { maliades: { shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'owner', holderUid: 'u1', revision: 2 } },
    shuttleDockings: [{ shuttleId: 'maliades', shipId: 'dione', dockedAt: 'SESSION START' }],
    shuttleFuelled: { maliades: true },
    shipResources: { dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 4, securityTeams: 2 } },
    shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
    maliadesState: { revision: 1, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 1, destroyed: false, medium: null, short: null },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Engineer', role: 'player', seatId: null,
    assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('does not send enemy or friendly target guesses for unavailable range choices', async () => {
  const attempts = [
    resolveMaliadesMedium(2, 1, [{ kind: 'attack', targetId: 'wolf-fighter-wing' }]),
    resolveMaliadesMedium(2, 1, [{ kind: 'attack', targetId: 'aegis' }]),
    resolveMaliadesShort(2, 1, ['wolf-fighter-wing']),
    resolveMaliadesShort(2, 1, ['aegis']),
  ];
  const messages: string[] = [];
  for (const attempt of attempts) {
    try { await attempt; } catch (error) { messages.push((error as Error).message); }
  }
  expect(messages).toEqual(Array(4).fill('Maliades range choices are not available for this attack.'));
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('rejects cache-backed authority before contacting a callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(resolveMaliadesMedium(2, 1, [{ kind: 'attack', targetId: 'wolf-1' }]))
    .rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('validates the repair host, damage amount, and authoritative response', async () => {
  mocks.call.mockImplementation(async (payload: { requestId: string }) => ({ data: {
    status: 'committed', sessionId: 's1', requestId: payload.requestId, craftId: 'maliades', cycle: 2,
    revision: 2, hostShipId: 'dione', damageRepaired: 1, materialsRemaining: 3,
    state: { revision: 2, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 0, destroyed: false, medium: null,
      short: { rolls: [{ targetId: 'wolf-1', die: 2, hit: true, selfDamage: 0 }], selfDamage: 0 } },
  } }));
  await expect(repairMaliades(2, 1, 'dione', 1)).resolves.toMatchObject({ hostShipId: 'dione', damageRepaired: 1 });
  await expect(repairMaliades(2, 1, 'dione', 0)).rejects.toThrow(/repair selection is invalid/i);
});

it('accepts a minimal stale CAS only when it is bound to this request, actor authority, host, and command', async () => {
  mocks.call.mockImplementation(async (payload: Record<string, unknown>) => ({ data: {
    status: 'stale', sessionId: 's1', requestId: payload.requestId, craftId: 'maliades',
    expectedHostShipId: 'dione', damageToRepair: 1,
    expectedControlRevision: 2, currentControlRevision: 3,
    expectedRevision: 1, currentRevision: 2, expectedCycle: 2, currentCycle: 2,
  } }));

  const reply = await repairMaliades(2, 1, 'dione', 1);

  expect(reply).toMatchObject({ status: 'stale', expectedHostShipId: 'dione', currentControlRevision: 3, currentRevision: 2 });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairMaliades');
  const payload = mocks.call.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(payload).toMatchObject({
    sessionId: 's1', expectedCycle: 2, expectedControlRevision: 2, expectedRevision: 1,
    expectedHostShipId: 'dione', damageToRepair: 1,
  });
  expect(Object.keys(reply as object)).not.toContain('holderUid');
});

it('rejects a stale response whose request binding does not match the call', async () => {
  mocks.call.mockResolvedValue({ data: {
    status: 'stale', sessionId: 's1', requestId: 'some-other-request', craftId: 'maliades',
    expectedHostShipId: 'dione', damageToRepair: 1,
    expectedControlRevision: 2, currentControlRevision: 3,
    expectedRevision: 1, currentRevision: 2, expectedCycle: 2, currentCycle: 2,
  } });

  await expect(repairMaliades(2, 1, 'dione', 1)).rejects.toThrow(/stale response.*malformed|request.*binding/i);
});

it('uses a fresh request ID and the current control and repair CAS for an explicit retry', async () => {
  mocks.call
    .mockImplementationOnce(async (payload: Record<string, unknown>) => ({ data: {
      status: 'stale', sessionId: 's1', requestId: payload.requestId, craftId: 'maliades',
      expectedHostShipId: 'dione', damageToRepair: 1,
      expectedControlRevision: 2, currentControlRevision: 3,
      expectedRevision: 2, currentRevision: 3, expectedCycle: 2, currentCycle: 2,
    } }))
    .mockImplementationOnce(async (payload: Record<string, unknown>) => ({ data: {
      status: 'committed', sessionId: 's1', requestId: payload.requestId, craftId: 'maliades', cycle: 2,
      revision: 4, hostShipId: 'dione', damageRepaired: 1, materialsRemaining: 2,
      state: { revision: 4, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 0, destroyed: false, medium: null, short: null },
    } }));

  await expect(repairMaliades(2, 2, 'dione', 1)).resolves.toMatchObject({ status: 'stale', currentRevision: 3 });
  const current = useSessionStore.getState();
  current.setIdentity({
    ...current.session!,
    shuttleControl: { maliades: { shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'owner', holderUid: 'u1', revision: 3 } },
    maliadesState: { revision: 3, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 1, destroyed: false, medium: null, short: null },
  }, current.me!);

  await expect(repairMaliades(2, 3, 'dione', 1)).resolves.toMatchObject({ status: 'committed', revision: 4 });
  const payloads = mocks.call.mock.calls.map(([payload]) => payload as Record<string, unknown>);
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({ expectedControlRevision: 2, expectedRevision: 2, expectedCycle: 2 });
  expect(payloads[1]).toMatchObject({ expectedControlRevision: 3, expectedRevision: 3, expectedCycle: 2 });
  expect(payloads[1]?.requestId).not.toBe(payloads[0]?.requestId);
});

it.each([
  ['actor role', (_session: Record<string, unknown>, me: Record<string, unknown>) => { me.activeConsoleRoleId = 'other-role'; }],
  ['holder', (session: Record<string, unknown>) => {
    session.shuttleControl = { maliades: { shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'owner', holderUid: 'other', revision: 3 } };
  }],
  ['fleet group', (_session: Record<string, unknown>, me: Record<string, unknown>) => { me.fleetGroupId = 'other-group'; }],
  ['host docking', (session: Record<string, unknown>) => {
    session.shuttleDockings = [{ shuttleId: 'maliades', shipId: 'aegis', dockedAt: 'SESSION START' }];
  }],
  ['Team Phase', (session: Record<string, unknown>) => { session.turnPhase = { ...session.turnPhase as object, airspace: { state: 'lifted', tickerActive: true, pressAccess: false } }; }],
])('rejects a stale response if %s authority changes while pending', async (_label, change) => {
  let resolveCall!: (value: unknown) => void;
  mocks.call.mockImplementation(() => new Promise((resolve) => { resolveCall = resolve; }));
  const pending = repairMaliades(2, 1, 'dione', 1);
  const current = useSessionStore.getState();
  const changedSession = { ...current.session! } as unknown as Record<string, unknown>;
  const changedMe = { ...current.me! } as unknown as Record<string, unknown>;
  change(changedSession, changedMe);
  useSessionStore.getState().setIdentity(changedSession as never, changedMe as never);
  resolveCall({ data: {
    status: 'stale', sessionId: 's1', requestId: (mocks.call.mock.calls[0]?.[0] as Record<string, unknown>).requestId,
    craftId: 'maliades', expectedHostShipId: 'dione', damageToRepair: 1,
    expectedControlRevision: 2, currentControlRevision: 3,
    expectedRevision: 1, currentRevision: 2, expectedCycle: 2, currentCycle: 2,
  } });

  await expect(pending).rejects.toThrow(/authority changed|authorized|Team Phase/i);
});
