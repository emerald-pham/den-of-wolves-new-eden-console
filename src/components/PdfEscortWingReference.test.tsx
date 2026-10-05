import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@/store/useSessionStore';
import PdfEscortWingReference, { PdfEscortWingLaunchPanelView } from './PdfEscortWingReference';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({ read: vi.fn(), launch: vi.fn(), pass: vi.fn() }));

vi.mock('@/lib/sessionService', () => ({
  getPdfEscortWingLaunch: mocks.read,
  launchPdfEscortWing: mocks.launch,
  passWolfFighterLaunchChoice: mocks.pass,
}));

beforeEach(() => {
  useSessionStore.getState().reset();
  mocks.read.mockReset();
  mocks.launch.mockReset();
  mocks.pass.mockReset();
});

describe('PDF launch reader gameplay readiness', () => {
  const colonel = {
    uid: 'original-pdf', sessionId: 's1', displayName: 'PDF Colonel', role: 'player' as const,
    seatId: 'refinery-124-pdf-colonel', assignedRoleId: 'refinery-124-pdf-colonel',
    activeConsoleRoleId: 'refinery-124-pdf-colonel', joinedAt: '2026-01-01T00:00:00.000Z',
  };
  const eligible = {
    type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 1,
    revision: 5, wingRevision: 3, launched: false, eligible: true,
  } as const;
  function ready(phase: GameSession['phase'], currentTurn = 0): GameSession {
    const session: GameSession = {
      id: 's1', name: 'Table one', joinCode: '4821', phase, currentTurn,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    useSessionStore.getState().setIdentity(session, colonel);
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    return session;
  }

  it.each(['lobby', 'casting', 'briefing', 'active'] as const)(
    'awaits the GM start during %s Cycle 0 without a launch read or false interception', async phase => {
      const session = ready(phase);
      mocks.read.mockRejectedValue(new Error('Launch is unavailable before active gameplay.'));
      render(<PdfEscortWingReference writable />);
      for (let update = 1; update <= 23; update += 1) {
        await act(async () => useSessionStore.getState().setSession({ ...session, updatedAt: String(update) }));
      }
      expect(mocks.read).not.toHaveBeenCalled();
      expect(screen.getByText(/Awaiting GM start.*Cycle 1/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Launch PDF Escort Wing' })).toHaveAccessibleDescription(/Awaiting GM start.*Cycle 1/);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it.each(['success', 'failure', 'debrief', 'closed', 'retained-empty'] as const)(
    'does not query or report a false server error during %s', async phase => {
      ready(phase, 2);
      mocks.read.mockRejectedValue(new Error('Gameplay has ended.'));
      render(<PdfEscortWingReference writable />);
      await act(async () => {});
      expect(mocks.read).not.toHaveBeenCalled();
      expect(screen.getByText(/Game ended.*launch unavailable/)).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
    },
  );

  it('queries after the actual active Cycle 1 transition under the same original actor and commits pass normally', async () => {
    const user = userEvent.setup();
    const session = ready('casting');
    mocks.read.mockResolvedValueOnce(eligible).mockResolvedValueOnce({ ...eligible, eligible: false, choiceStatus: 'passed', reason: 'passed' });
    mocks.pass.mockResolvedValue({ status: 'committed' });
    render(<PdfEscortWingReference writable />);
    expect(mocks.read).not.toHaveBeenCalled();
    await act(async () => useSessionStore.getState().setSession({ ...session, phase: 'active', currentTurn: 1 }));
    const pass = await screen.findByRole('button', { name: 'Pass PDF Escort Wing' });
    expect(useSessionStore.getState().me?.uid).toBe(colonel.uid);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await user.click(pass);
    await waitFor(() => expect(mocks.pass).toHaveBeenCalledWith('pdf-escort-fighter-wing', 1, 5, 3));
    expect(await screen.findByText('Launch choice passed for this attack.')).toBeVisible();
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it.each(['casting', 'debrief', 'closed'] as const)(
    'discards a deferred active launch view after phase changes to %s', async phase => {
      const session = ready('active', 1);
      let resolveRead!: (value: unknown) => void;
      const deferred = new Promise(resolve => { resolveRead = resolve; });
      mocks.read.mockReturnValue(deferred);
      render(<PdfEscortWingReference writable />);
      expect(mocks.read).toHaveBeenCalledTimes(1);
      await act(async () => useSessionStore.getState().setSession({ ...session, phase, currentTurn: phase === 'casting' ? 0 : 1 }));
      await act(async () => { resolveRead(eligible); await deferred; });
      expect(mocks.read).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Wolf Attack targeting.*charged and operational/)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('does not read cached launch authority, discards a pending view on freshness loss and recovers live under the original UID', async () => {
    ready('active', 1);
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    let resolveRead!: (value: unknown) => void;
    const deferred = new Promise(resolve => { resolveRead = resolve; });
    mocks.read.mockReturnValueOnce(deferred).mockResolvedValueOnce(eligible);
    render(<PdfEscortWingReference writable />);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(screen.getByText(/Reconnect.*live session state/)).toBeVisible();
    await act(async () => useSessionStore.getState().setSessionSnapshotFreshness('server'));
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await act(async () => useSessionStore.getState().setSessionSnapshotFreshness('cache'));
    await act(async () => { resolveRead(eligible); await deferred; });
    expect(screen.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await act(async () => useSessionStore.getState().setSessionSnapshotFreshness('server'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeEnabled());
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().me?.uid).toBe(colonel.uid);
  });

  it('cannot apply a late receipt or start a permission read after the game ends', async () => {
    const user = userEvent.setup();
    const session = ready('active', 1);
    mocks.read.mockResolvedValue(eligible);
    let resolveLaunch!: (value: unknown) => void;
    const deferred = new Promise(resolve => { resolveLaunch = resolve; });
    mocks.launch.mockReturnValue(deferred);
    render(<PdfEscortWingReference writable />);
    const launch = screen.getByRole('button', { name: 'Launch PDF Escort Wing' });
    await waitFor(() => expect(launch).toBeEnabled());
    await user.click(launch);
    await act(async () => useSessionStore.getState().setSession({ ...session, phase: 'debrief' }));
    await act(async () => {
      resolveLaunch({ ...eligible, status: 'committed', requestId: 'launch-1', launched: true, eligible: false, revision: 6, wingRevision: 4 });
      await deferred;
    });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(launch).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'PDF Escort Wing launched' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fighter Ace source permission' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cannot show a foreign same-station response after the original actor UID changes', async () => {
    ready('active', 1);
    let resolveRead!: (value: unknown) => void;
    const deferred = new Promise(resolve => { resolveRead = resolve; });
    mocks.read.mockReturnValueOnce(deferred).mockResolvedValueOnce({ ...eligible, eligible: false, reason: 'waiting' });
    render(<PdfEscortWingReference writable />);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await act(async () => useSessionStore.setState({ me: { ...colonel, uid: 'another-pdf' } }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
    await act(async () => { resolveRead(eligible); await deferred; });
    expect(screen.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for an active Wolf Attack targeting window.')).toBeVisible();
  });
});

it('shows the PDF wing pass as a separate current launch choice', async () => {
  const user = userEvent.setup();
  const view = {
    type: 'pdf-escort-wing-launch-view', sessionId: 's1', turn: 2,
    revision: 5, wingRevision: 3, launched: false, eligible: true,
  } as const;
  const onLaunch = vi.fn();
  const onPass = vi.fn();
  render(<PdfEscortWingLaunchPanelView view={view} canRead onLaunch={onLaunch} onPass={onPass} />);

  await user.click(screen.getByRole('button', { name: 'Pass PDF Escort Wing' }));
  expect(onPass).toHaveBeenCalledWith(view);
  expect(onLaunch).not.toHaveBeenCalled();
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
    expect(screen.queryByText('Medium and Short combat resolution is not available in the console yet.'))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/result integration pending/)).not.toBeInTheDocument();
    expect(screen.getByText(/server applies these bonuses only to opportunities this participant contributes to/i))
      .toBeVisible();
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
