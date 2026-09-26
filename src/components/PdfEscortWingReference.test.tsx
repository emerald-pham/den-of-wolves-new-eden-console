import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@/store/useSessionStore';
import PdfEscortWingReference from './PdfEscortWingReference';

const mocks = vi.hoisted(() => ({ read: vi.fn(), launch: vi.fn() }));

vi.mock('@/lib/sessionService', () => ({
  getPdfEscortWingLaunch: mocks.read,
  launchPdfEscortWing: mocks.launch,
}));

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.read.mockReset();
  mocks.launch.mockReset();
});

describe('PDF Escort Wing reference', () => {
  it('shows the registered baseline for a legacy session without a state projection', () => {
    render(<PdfEscortWingReference />);

    const wing = screen.getByRole('region', { name: 'PDF Escort Fighter Wing' });
    expect(within(wing).getByText('4 of 4')).toBeInTheDocument();
    expect(within(wing).getByText('Not launched')).toBeInTheDocument();
    expect(within(wing).getAllByText('Not resolved')).toHaveLength(2);
  });

  it('shows the member-safe live fighter, launch, range, and loss state', () => {
    render(<PdfEscortWingReference state={{
      type: 'pdf-escort-fighter-wing-view',
      revision: 3,
      cycle: 1,
      capacity: 4,
      fighters: 2,
      launched: true,
      mediumResolved: true,
      mediumActionCount: 3,
      shortResolved: true,
      shortRollCount: 4,
      losses: 2,
    }} />);

    const wing = screen.getByRole('region', { name: 'PDF Escort Fighter Wing' });
    expect(within(wing).getByText('2 of 4')).toBeInTheDocument();
    expect(within(wing).getByText('Launched')).toBeInTheDocument();
    expect(within(wing).getByText('Resolved // 3 fighter actions')).toBeInTheDocument();
    expect(within(wing).getByText('Resolved // 4 fighter rolls')).toBeInTheDocument();
    expect(within(wing).getByText('2')).toBeInTheDocument();
  });

  it('launches only from the live P.D.F. Colonel view using both server revisions', async () => {
    const user = userEvent.setup();
    useSessionStore.getState().setIdentity(
      {
        id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 2,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        uid: 'u1', sessionId: 's1', displayName: 'PDF Colonel', role: 'player',
        seatId: 'refinery-124-pdf-colonel', assignedRoleId: 'refinery-124-pdf-colonel',
        activeConsoleRoleId: 'refinery-124-pdf-colonel', joinedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    mocks.read.mockResolvedValue({
      type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 2,
      revision: 5, wingRevision: 3, launched: false, eligible: true,
    });
    mocks.launch.mockResolvedValue({
      type: 'pdf-escort-wing-launch-view', status: 'committed', sessionId: 's1',
      requestId: 'launch-1', turn: 2, revision: 6, wingRevision: 4,
      launched: true, eligible: false, reason: 'already-launched',
    });

    render(<PdfEscortWingReference writable />);
    const launch = await screen.findByRole('button', { name: 'Launch PDF Escort Wing' });
    await waitFor(() => expect(launch).toBeEnabled());
    await user.tab();
    expect(launch).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mocks.launch).toHaveBeenCalledWith(2, 5, 3));
    expect(await screen.findByRole('button', { name: 'PDF Escort Wing launched' })).toBeDisabled();
    expect(screen.getByText('Medium and Short combat resolution is not available in the console yet.'))
      .toBeVisible();
    expect(screen.getByText(/result integration pending/)).toBeVisible();
  });

  it('shows the server denial when no wing fighters remain', async () => {
    useSessionStore.getState().setIdentity(
      {
        id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 2,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        uid: 'u1', sessionId: 's1', displayName: 'PDF Colonel', role: 'player',
        seatId: 'refinery-124-pdf-colonel', assignedRoleId: 'refinery-124-pdf-colonel',
        activeConsoleRoleId: 'refinery-124-pdf-colonel', joinedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    mocks.read.mockResolvedValue({
      type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 2,
      revision: 5, wingRevision: 4, launched: false, eligible: false, reason: 'no-fighters',
    });

    render(<PdfEscortWingReference writable />);

    expect(await screen.findByText('No P.D.F. Escort Wing fighters remain // launch denied')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('clears launch eligibility and ignores an older response after a newer denial', async () => {
    const liveSession = {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active' as const, currentTurn: 2,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    useSessionStore.getState().setIdentity(liveSession, {
      uid: 'u1', sessionId: 's1', displayName: 'PDF Colonel', role: 'player',
      seatId: 'refinery-124-pdf-colonel', assignedRoleId: 'refinery-124-pdf-colonel',
      activeConsoleRoleId: 'refinery-124-pdf-colonel', joinedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');

    let resolveOld!: (value: unknown) => void;
    let resolveCurrent!: (value: unknown) => void;
    const oldRead = new Promise<unknown>((resolve) => { resolveOld = resolve; });
    const currentRead = new Promise<unknown>((resolve) => { resolveCurrent = resolve; });
    mocks.read
      .mockResolvedValueOnce({
        type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 2,
        revision: 5, wingRevision: 3, launched: false, eligible: true,
      })
      .mockReturnValueOnce(oldRead)
      .mockReturnValueOnce(currentRead);

    render(<PdfEscortWingReference writable />);
    const launch = await screen.findByRole('button', { name: 'Launch PDF Escort Wing' });
    await waitFor(() => expect(launch).toBeEnabled());

    await act(async () => useSessionStore.getState().setSession({ ...liveSession, currentTurn: 3 }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
    expect(launch).toBeDisabled();

    await act(async () => useSessionStore.getState().setSession({ ...liveSession, currentTurn: 4 }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
    await act(async () => {
      resolveCurrent({
        type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 4,
        revision: 9, wingRevision: 4, launched: false, eligible: false, reason: 'uncharged',
      });
      await currentRead;
    });
    expect(await screen.findByText('Refinery 8♦ Fighter Bay uncharged // launch denied')).toBeVisible();
    await act(async () => {
      resolveOld({
        type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 3,
        revision: 7, wingRevision: 3, launched: false, eligible: true,
      });
      await oldRead;
    });

    await waitFor(() => expect(launch).toBeDisabled());
    expect(screen.getByText('Refinery 8♦ Fighter Bay uncharged // launch denied')).toBeVisible();
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('ignores an eligible response after the P.D.F. Colonel loses active-console authority', async () => {
    const liveSession = {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active' as const, currentTurn: 2,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const colonel = {
      uid: 'u1', sessionId: 's1', displayName: 'PDF Colonel', role: 'player' as const,
      seatId: 'refinery-124-pdf-colonel', assignedRoleId: 'refinery-124-pdf-colonel',
      activeConsoleRoleId: 'refinery-124-pdf-colonel', joinedAt: '2026-01-01T00:00:00.000Z',
    };
    useSessionStore.getState().setIdentity(liveSession, colonel);
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    let resolveLate!: (value: unknown) => void;
    const lateRead = new Promise<unknown>((resolve) => { resolveLate = resolve; });
    mocks.read.mockResolvedValueOnce({
      type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 2,
      revision: 5, wingRevision: 3, launched: false, eligible: true,
    }).mockReturnValueOnce(lateRead);

    render(<PdfEscortWingReference writable />);
    const launch = await screen.findByRole('button', { name: 'Launch PDF Escort Wing' });
    await waitFor(() => expect(launch).toBeEnabled());
    await act(async () => useSessionStore.getState().setSession({ ...liveSession, currentTurn: 3 }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
    await act(async () => useSessionStore.getState().setIdentity({ ...liveSession, currentTurn: 3 }, {
      ...colonel, activeConsoleRoleId: null,
    }));
    await act(async () => {
      resolveLate({
        type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 3,
        revision: 7, wingRevision: 4, launched: false, eligible: true,
      });
      await lateRead;
    });

    await waitFor(() => expect(launch).toBeDisabled());
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('clears launch eligibility when the refreshed server read fails', async () => {
    const liveSession = {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active' as const, currentTurn: 2,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    useSessionStore.getState().setIdentity(liveSession, {
      uid: 'u1', sessionId: 's1', displayName: 'PDF Colonel', role: 'player',
      seatId: 'refinery-124-pdf-colonel', assignedRoleId: 'refinery-124-pdf-colonel',
      activeConsoleRoleId: 'refinery-124-pdf-colonel', joinedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    mocks.read.mockResolvedValueOnce({
      type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 2,
      revision: 5, wingRevision: 3, launched: false, eligible: true,
    }).mockRejectedValueOnce(new Error('Refresh failed.'));

    render(<PdfEscortWingReference writable />);
    const launch = await screen.findByRole('button', { name: 'Launch PDF Escort Wing' });
    await waitFor(() => expect(launch).toBeEnabled());
    await act(async () => useSessionStore.getState().setSession({ ...liveSession, currentTurn: 3 }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed.');
    expect(launch).toBeDisabled();
    expect(mocks.launch).not.toHaveBeenCalled();
  });
});
