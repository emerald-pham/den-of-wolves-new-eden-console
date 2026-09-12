import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { recommendedRoleIds } from '@/data/rolePresets';
import ShuttleConsole from './ShuttleConsole';

vi.mock('@/lib/sessionService', () => ({
  popShipConfetti: vi.fn(),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  selectConsoleRole: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/pressDispatchService', () => ({
  dismissPressDispatch: vi.fn(),
  publishPressDispatch: vi.fn(),
}));
const { dismissPressDispatch, publishPressDispatch } = await import('@/lib/pressDispatchService');
const { releaseConsoleRole, selectConsoleRole } = await import('@/lib/sessionService');

beforeEach(() => {
  vi.mocked(selectConsoleRole).mockReset();
  vi.mocked(selectConsoleRole).mockResolvedValue(undefined);
  vi.mocked(releaseConsoleRole).mockReset();
  vi.mocked(releaseConsoleRole).mockResolvedValue(undefined);
  vi.mocked(publishPressDispatch).mockReset();
  vi.mocked(publishPressDispatch).mockResolvedValue(undefined);
  vi.mocked(dismissPressDispatch).mockReset();
  vi.mocked(dismissPressDispatch).mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    activeRoleIds: ['press-officer'],
    shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'SESSION START' },
    ],
    shuttleVisitLog: [{
      id: 'visit-1', shuttleId: 'snn-press-shuttle', shipId: 'dione',
      action: 'docked', occurredAt: 'SESSION START',
    }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Reporter', role: 'player', seatId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setMode('console');
});

it('keeps a rejected Press claim locked and provides a keyboard return to Independent Stations', async () => {
  const user = userEvent.setup();
  vi.mocked(selectConsoleRole).mockRejectedValueOnce(new Error('Role already held.'));

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Independent Stations</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  const cover = screen.getByRole('button', { name: /open newspaper confetti cover/i });
  expect(cover).toBeDisabled();
  await waitFor(() => expect(selectConsoleRole).toHaveBeenCalledWith('press-officer'));
  expect(cover).toBeDisabled();
  const back = screen.getByRole('link', { name: /back to independent stations/i });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Independent Stations')).toBeInTheDocument();
  expect(releaseConsoleRole).not.toHaveBeenCalled();
});

it('does not claim the Press role while another console is held', async () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'admiral' });

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/ships/aegis/roles/admiral" element={<p>Admiral console</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Admiral console')).toBeInTheDocument();
  await act(async () => { await Promise.resolve(); });
  expect(selectConsoleRole).not.toHaveBeenCalled();
});

it('returns a Union engineer from Wobbly to the paired engineering console', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: recommendedRoleIds(14),
  });
  state.setMe({
    ...state.me!,
    activeConsoleRoleId: 'joint-engineering-quellon-refinery',
  });

  render(
    <MemoryRouter initialEntries={['/shuttles/wobbly']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/union/roles/:roleId" element={<p>Joint Engineering console</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: /u\.s\. wobbly/i })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: /back to joint engineering union/i }));
  expect(screen.getByText('Joint Engineering console')).toBeInTheDocument();
});

it('gives the Press Officer a dispatch desk that publishes to the fleet ticker', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me!;
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'press-officer' });
  useSessionStore.getState().setConnection('live');
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  const desk = screen.getByRole('region', { name: 'Press dispatch desk' });
  const publish = screen.getByRole('button', { name: 'Publish dispatch' });
  expect(publish).toBeDisabled();
  await user.type(screen.getByRole('textbox', { name: 'Dispatch' }), 'Convoy arrival confirmed');
  await user.click(publish);
  expect(publishPressDispatch).toHaveBeenCalledWith('Convoy arrival confirmed');
  expect(desk).toHaveTextContent('Dispatch transmitted');
});

it('keeps the claimed Press Officer dispatch desk actionable during Turn 0', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, activeConsoleRoleId: 'press-officer' });
  state.setSession({ ...state.session!, currentTurn: 0 });
  state.setConnection('live');
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  const desk = screen.getByRole('region', { name: 'Press dispatch desk' });
  const textbox = screen.getByRole('textbox', { name: 'Dispatch' });
  const publish = screen.getByRole('button', { name: 'Publish dispatch' });
  expect(textbox).toBeEnabled();
  await user.type(textbox, 'Turn Zero press check');
  await user.click(publish);
  expect(publishPressDispatch).toHaveBeenCalledWith('Turn Zero press check');
  expect(desk).toHaveTextContent('Dispatch transmitted');
  expect(screen.queryByText('Turn 0 // Awaiting Iris Authentication')).not.toBeInTheDocument();
});

it('shows every current dispatch and dismisses only the selected dispatch', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, activeConsoleRoleId: 'press-officer' });
  state.setSession({
    ...state.session!,
    pressDispatch: {
      dispatches: [
        { id: 'dispatch-1', text: 'SNN // Convoy arrival confirmed' },
        { id: 'dispatch-2', text: 'SNN // Water rationing lifted' },
      ],
      revision: 2,
    },
  });
  state.setConnection('live');
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  const desk = screen.getByRole('region', { name: 'Press dispatch desk' });
  expect(desk).toHaveTextContent('Current dispatches');
  expect(desk).toHaveTextContent('SNN // Convoy arrival confirmed');
  expect(desk).toHaveTextContent('SNN // Water rationing lifted');
  await user.click(screen.getByRole('button', {
    name: 'Dismiss dispatch: SNN // Convoy arrival confirmed',
  }));

  expect(dismissPressDispatch).toHaveBeenCalledWith('dispatch-1');
  expect(desk).toHaveTextContent('Dispatch dismissed');
  expect(desk).toHaveTextContent('SNN // Convoy arrival confirmed');
  expect(desk).toHaveTextContent('SNN // Water rationing lifted');
});

it('uses the shared full-screen shuttlecraft console template for SNN', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  expect(container.querySelector('.ship-console.shuttle-console')).toHaveAttribute(
    'data-console-kind', 'shuttlecraft',
  );
  expect(screen.getByRole('heading', { name: /snn.*system news network/i })).toBeInTheDocument();
  const description = screen.getByText(/carries the system news network/i);
  const assignment = screen.getByText('Role assignment');
  const captain = screen.getByText('Press Officer // Captain');
  expect(assignment.tagName).toBe('DT');
  expect(captain.tagName).toBe('DD');
  expect(description.compareDocumentPosition(captain))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByRole('region', { name: /shuttle systems/i })).toHaveTextContent(
    /docked.*dione/i,
  );
  expect(screen.queryByText(/travel log/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: /shuttle travel log/i })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: /newspaper confetti dispenser/i })).toBeInTheDocument();
});

it('lets a GM return from the shuttle console to role selection', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test',
    claimedAt: '2026-01-01T00:00:00.000Z',
  });
  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /leave shuttle/i }));
  expect(screen.getByText('Role selection')).toBeInTheDocument();
  expect(selectConsoleRole).not.toHaveBeenCalled();
});

it('lets a non-GM Press holder release authority through a keyboard return', async () => {
  const user = userEvent.setup();
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'press-officer' });

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Independent Stations</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  const back = screen.getByRole('button', { name: /back to independent stations/i });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(releaseConsoleRole).toHaveBeenCalledOnce();
  expect(await screen.findByText('Independent Stations')).toBeInTheDocument();
});

it('returns a Press holder to role selection when the GM disables Press', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected test session state.');
  useSessionStore.getState().setSession({ ...session, activeRoleIds: [], pressEnabled: false });
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'press-officer' });

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Role selection')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /snn.*system news network/i })).not.toBeInTheDocument();
});

it('opens a printed shipboard shuttle for its owning role without press-only equipment', () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['quellon-explorer'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-explorer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/hummingbird']}>
      <Routes><Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'P.S. Hummingbird' })).toBeInTheDocument();
  expect(screen.getByText('Explorer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*quellon/i,
  );
  expect(screen.getByRole('heading', { name: 'Scout system' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Newspaper confetti dispenser' })).not.toBeInTheDocument();
});

it('opens Starlight on its Wing Commander route with its routed operation envelope', () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['wing-commander'],
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'wing-commander' });

  render(
    <MemoryRouter initialEntries={['/shuttles/starlight']}>
      <Routes><Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'I.C.S.S. Starlight' })).toBeInTheDocument();
  expect(screen.getByText('Wing Commander // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*aegis/i,
  );
  expect(screen.getByRole('heading', { name: 'Scouting' })).toBeInTheDocument();
  expect(screen.getByText(/within 2 jumps.*fuelled.*second system/i)).toBeInTheDocument();
  expect(screen.getByText(/\+3.*exploration.*\+1.*salvage/i)).toBeInTheDocument();
  expect(screen.queryByText(/cargo transfer/i)).not.toBeInTheDocument();
});

it('opens Pallas on its Executive Officer route with its security and boarding envelope', () => {
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['executive-officer'],
    shuttleDockings: [{ shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' }],
    shuttleFuelled: { pallas: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'executive-officer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/pallas']}>
      <Routes><Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'I.C.S.S. Pallas' })).toBeInTheDocument();
  expect(screen.getByText('Executive Officer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*aegis/i,
  );
  expect(screen.getByText('Fuelled this turn')).toBeInTheDocument();
  expect(screen.getByText('Security teams only')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Cargo transfer' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  expect(screen.getByText(/security teams.*defend.*reroll up to 3 boarding dice/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled redeployment' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*chosen ship.*start of the Boarding Action step/i)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
});

it('keeps a GM-controlled Union shuttle out of the default roster', () => {
  render(
    <MemoryRouter initialEntries={['/shuttles/wobbly']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Role selection')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'U.S. Wobbly' })).not.toBeInTheDocument();
});
