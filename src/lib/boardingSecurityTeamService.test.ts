import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, GmInstance, Player } from '@/types/game';
import { getBoardingSecurityTeamLocations } from './boardingSecurityTeamService';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => ({ name: 'test-functions' })) }));

const session = {
  id: 'security-service-session', name: 'GM test', joinCode: '4821', phase: 'active', currentTurn: 4,
  activeVesselIds: ['aegis', 'dione'],
  createdAt: '2026-09-30T18:00:00.000Z', updatedAt: '2026-09-30T18:00:00.000Z',
} as GameSession;
const gm: Player = {
  uid: 'gm-1', sessionId: session.id, displayName: 'Facilitator', role: 'gm', seatId: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
};
const instance: GmInstance = {
  id: 'gm-instance-1', sessionId: session.id, uid: gm.uid, name: 'Bridge laptop',
  deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
};

const projection = {
  status: 'ready', sessionId: session.id, actorUid: gm.uid,
  gmInstanceId: instance.id, cycle: 4,
  ships: [
    { shipId: 'aegis', shipSecurityTeams: 4, boardingEligibleTeams: 6 },
    { shipId: 'dione', shipSecurityTeams: 1, boardingEligibleTeams: 1 },
  ],
  shuttles: [
    { shuttleId: 'pallas', securityTeams: 2, location: 'docked', currentHostShipId: 'aegis' },
    { shuttleId: 'philia', securityTeams: 1, location: 'undocked', currentHostShipId: null },
  ],
  totals: {
    shipStoredSecurityTeams: 5,
    aboardDockedShuttleSecurityTeams: 2,
    boardingEligibleTotal: 7,
    shuttleCount: 2,
  },
} as const;

function installGm(current = session, local = instance) {
  const store = useSessionStore.getState();
  store.reset();
  store.setIdentity(current, gm);
  store.setGmInstance(local);
  store.setConnection('live');
  store.setSessionSnapshotFreshness('server');
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
}

beforeEach(() => {
  vi.mocked(httpsCallable).mockReset();
  installGm();
});

describe('authenticated boarding-security location service', () => {
  it('calls the read-only GM projection and validates exact totals and identity binding', async () => {
    const call = vi.fn(async () => ({ data: projection }));
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    await expect(getBoardingSecurityTeamLocations()).resolves.toEqual(projection);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'getBoardingSecurityTeamLocations');
    expect(call).toHaveBeenCalledWith({ sessionId: session.id, instanceId: instance.id });
  });

  it('rejects malformed, extra-key, inconsistent-count, and mismatched-actor replies', async () => {
    for (const data of [
      { ...projection, extra: true },
      { ...projection, actorUid: 'other-gm' },
      { ...projection, totals: { ...projection.totals, boardingEligibleTotal: 99 } },
      { ...projection, shuttles: [{ ...projection.shuttles[0], extra: true }, projection.shuttles[1]] },
    ]) {
      vi.mocked(httpsCallable).mockReturnValue(vi.fn(async () => ({ data })) as never);
      await expect(getBoardingSecurityTeamLocations()).rejects.toThrow(/malformed|changed|authority/i);
    }
  });

  it('does not publish a delayed reply after the GM instance changes', async () => {
    let resolve: ((value: { data: typeof projection }) => void) | undefined;
    vi.mocked(httpsCallable).mockReturnValue(vi.fn(() => new Promise((done) => { resolve = done; })) as never);

    const pending = getBoardingSecurityTeamLocations();
    useSessionStore.getState().setGmInstance({ ...instance, id: 'replacement-instance' });
    resolve?.({ data: projection });
    await expect(pending).rejects.toThrow(/authority changed/i);
  });

  it('fails closed before a callable when server freshness or live GM identity is missing', async () => {
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    await expect(getBoardingSecurityTeamLocations()).rejects.toThrow(/reconnect|fresh/i);
    expect(httpsCallable).not.toHaveBeenCalled();

    installGm();
    useSessionStore.getState().setGmInstance(null);
    await expect(getBoardingSecurityTeamLocations()).rejects.toThrow(/GM instance/i);
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});
