import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, GmInstance, Player } from '@/types/game';
import { INITIAL_SHIP_RESOURCES } from '@/data/resources';
import { getBoardingSecurityTeamLocations } from '@/lib/boardingSecurityTeamService';
import BoardingSecurityTeamWorkspace from './BoardingSecurityTeamWorkspace';

vi.mock('@/lib/boardingSecurityTeamService', () => ({
  getBoardingSecurityTeamLocations: vi.fn(),
}));

const session = {
  id: 'security-workspace-session', name: 'GM test', joinCode: '4821', phase: 'active', currentTurn: 4,
  activeVesselIds: ['aegis', 'dione'], activeRoleIds: ['admiral', 'dione-engineer'],
  shipResources: {
    aegis: { ...INITIAL_SHIP_RESOURCES.aegis, securityTeams: 4 },
    dione: { ...INITIAL_SHIP_RESOURCES.dione, securityTeams: 1 },
  },
  shuttleDockings: [{ shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'cycle-4' }],
  shuttleCargo: { pallas: { securityTeams: 2 } },
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

function installGm(freshness: 'server' | 'cache' = 'server') {
  const store = useSessionStore.getState();
  store.reset();
  store.setIdentity(session, gm);
  store.setGmInstance(instance);
  store.setConnection('live');
  store.setSessionSnapshotFreshness(freshness);
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
}

beforeEach(() => {
  vi.mocked(getBoardingSecurityTeamLocations).mockReset();
  vi.mocked(getBoardingSecurityTeamLocations).mockResolvedValue(projection as never);
  installGm();
});

describe('read-only boarding-security location workspace', () => {
  it('shows server counters, docked and undocked shuttle locations, and no combat resolution', async () => {
    render(<BoardingSecurityTeamWorkspace />);

    const region = await screen.findByRole('region', { name: 'Security team locations' });
    expect(region).toHaveTextContent('5');
    expect(region).toHaveTextContent('2');
    expect(region).toHaveTextContent('7');
    expect(region).toHaveTextContent('AEGIS');
    expect(region).toHaveTextContent('Dione');
    expect(region).toHaveTextContent('Pallas');
    expect(region).toHaveTextContent('Docked at AEGIS');
    expect(region).toHaveTextContent('Undocked');
    expect(region).toHaveTextContent(/read\s+only/i);
    expect(region).toHaveTextContent(/resolve a boarding action/i);
    expect(region.querySelectorAll('button')).toHaveLength(1);
  });

  it('refreshes an authoritative snapshot on demand', async () => {
    render(<BoardingSecurityTeamWorkspace />);
    await screen.findByRole('region', { name: 'Security team locations' });

    fireEvent.click(screen.getByRole('button', { name: /refresh locations/i }));
    await waitFor(() => expect(getBoardingSecurityTeamLocations).toHaveBeenCalledTimes(2));
  });

  it('clears old location counts and reloads after shared resource or docking authority changes', async () => {
    let resolveNext: ((value: typeof projection) => void) | undefined;
    vi.mocked(getBoardingSecurityTeamLocations)
      .mockResolvedValueOnce(projection as never)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }) as never);
    render(<BoardingSecurityTeamWorkspace />);
    const region = await screen.findByRole('region', { name: 'Security team locations' });
    expect(region).toHaveTextContent('7');

    act(() => useSessionStore.getState().setSession({
      ...session,
      shipResources: {
        aegis: { ...INITIAL_SHIP_RESOURCES.aegis, securityTeams: 5 },
        dione: { ...INITIAL_SHIP_RESOURCES.dione, securityTeams: 1 },
      },
    } as GameSession));
    await waitFor(() => expect(getBoardingSecurityTeamLocations).toHaveBeenCalledTimes(2));
    expect(region).toHaveTextContent(/refreshing|loading/i);
    expect(region).not.toHaveTextContent('boarding eligible total // 7');

    await act(async () => { resolveNext?.(projection); });
  });

  it('does not request or retain locations from a cached session snapshot', async () => {
    installGm('cache');
    render(<BoardingSecurityTeamWorkspace />);

    expect(await screen.findByRole('status')).toHaveTextContent(/live, server-backed active GM session/i);
    expect(getBoardingSecurityTeamLocations).not.toHaveBeenCalled();
  });
});
