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

it('opens Ally with its Shepherd / Icebreaker Union envelope and returns by keyboard', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['joint-engineering-shepherd-icebreaker'],
    shuttleDockings: [],
    shuttleFuelled: { ally: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'joint-engineering-shepherd-icebreaker' });

  render(
    <MemoryRouter initialEntries={['/shuttles/ally']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/union/roles/:roleId" element={<p>Joint Engineering console</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'U.S. Ally' })).toBeInTheDocument();
  expect(screen.getByText('Shepherd / Icebreaker Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(/in transit/i);
  expect(screen.getByText('Fuelled this turn')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Repair' })).toBeInTheDocument();
  expect(screen.getByText(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled repair' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*repair consoles on a second ship/i)).toBeInTheDocument();
  expect(screen.queryByText(/fuelled.*repair or scrap/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to joint engineering union/i });
  expect(back).toHaveAttribute('href', '/union/roles/joint-engineering-shepherd-icebreaker');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
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

it('opens a printed shipboard shuttle for its owning role and returns by keyboard', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['quellon-explorer'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-explorer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/hummingbird']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/quellon/roles/quellon-explorer" element={<p>Quellon Explorer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'P.S. Hummingbird' })).toBeInTheDocument();
  expect(screen.getByText('Explorer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*quellon/i,
  );
  expect(screen.getByRole('heading', { name: 'Scout system' })).toBeInTheDocument();
  expect(screen.getByText('Food and water only')).toBeInTheDocument();
  expect(screen.getByText(/one system within 3 jumps of Quellon/i)).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*roll 2d6.*food.*water/i)).toBeInTheDocument();
  expect(screen.getByText(/\+3 to exploration and \+1 to mining checks/i)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Newspaper confetti dispenser' })).not.toBeInTheDocument();
  const back = screen.getByRole('link', { name: /back to quellon explorer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/quellon/roles/quellon-explorer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Quellon Explorer parent')).toBeInTheDocument();
});

it('opens Condor on the Quellon Engineer route with its recharge and cargo envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['quellon-engineer'],
    shuttleDockings: [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'quellon-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/condor']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/quellon/roles/quellon-engineer" element={<p>Quellon Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'P.S. Condor' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(/docked.*quellon/i);
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Recharge' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*charge one console.*immediate maintenance effect resolves immediately/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  expect(screen.getByText(/docked ship.*security teams.*repel boarders/i)).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to quellon engineer console/i });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Quellon Engineer parent')).toBeInTheDocument();
});

it('opens Maliades on its Dione Engineer route and returns by keyboard', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['dione-engineer'],
    shuttleDockings: [{ shuttleId: 'maliades', shipId: 'dione', dockedAt: 'SESSION START' }],
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'dione-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/maliades']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/dione/roles/dione-engineer" element={<p>Dione Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'F.S.F. Maliades' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*dione/i,
  );
  expect(screen.getByRole('heading', { name: 'Damage capacity' })).toBeInTheDocument();
  expect(screen.getByText(/up to 3 damage.*destroyed.*fuelled.*1 material per damage/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Medium range' })).toBeInTheDocument();
  expect(screen.getByText(/1s and 6s wrap.*up to 1 die.*4\+/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Short range' })).toBeInTheDocument();
  expect(screen.getByText(/up to 2 dice.*2\+.*different targets/i)).toBeInTheDocument();
  expect(screen.queryByText(/cargo transfer/i)).not.toBeInTheDocument();
  const back = screen.getByRole('link', { name: /back to dione engineer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/dione/roles/dione-engineer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Dione Engineer parent')).toBeInTheDocument();
});

it('opens Blacksmith on its Icebreaker Engineer route with its repair and cargo envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['icebreaker-engineer'],
    shuttleDockings: [{ shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'SESSION START' }],
    shuttleFuelled: { blacksmith: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'icebreaker-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/blacksmith']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/icebreaker/roles/icebreaker-engineer" element={<p>Icebreaker Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'C.S.S. Blacksmith' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*icebreaker/i,
  );
  expect(screen.getByText('Fuelled this turn')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Repair' })).toBeInTheDocument();
  expect(screen.getByText(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled repair' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*repair consoles on a second ship/i)).toBeInTheDocument();
  expect(screen.queryByText(/fuelled.*repair or scrap/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to icebreaker engineer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/icebreaker/roles/icebreaker-engineer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Icebreaker Engineer parent')).toBeInTheDocument();
});

it('opens Black Sheep on its Shepherd Engineer route with the owned recharge envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['shepherd-engineer'],
    shuttleDockings: [{ shuttleId: 'black-sheep', shipId: 'shepherd', dockedAt: 'SESSION START' }],
    shuttleFuelled: { 'black-sheep': true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'shepherd-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/black-sheep']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/shepherd/roles/shepherd-engineer" element={<p>Shepherd Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'R.S.S. Black Sheep' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*shepherd/i,
  );
  expect(screen.getByText('Fuelled this turn')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Recharge' })).toBeInTheDocument();
  expect(screen.getByText(/when fuelled.*charge one console.*immediate maintenance effect.*resolves immediately/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to shepherd engineer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/shepherd/roles/shepherd-engineer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Shepherd Engineer parent')).toBeInTheDocument();
});

it('opens Chacau on its Refinery 124 Engineer route with its repair and cargo envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['refinery-124-engineer'],
    shuttleDockings: [{ shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'SESSION START' }],
    shuttleFuelled: { chacau: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'refinery-124-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/chacau']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/refinery-124/roles/refinery-124-engineer" element={<p>Refinery 124 Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'G.S. Chacau' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(/docked.*refinery 124/i);
  expect(screen.getByText('Fuelled this turn')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Repair' })).toBeInTheDocument();
  expect(screen.getByText(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled repair' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*repair consoles on a second ship/i)).toBeInTheDocument();
  expect(screen.queryByText(/fuelled.*repair or scrap/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to refinery 124 engineer console/i });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Refinery 124 Engineer parent')).toBeInTheDocument();
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

it('opens Philia on its Dione Engineer route with its repair and cargo envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['dione-engineer'],
    shuttleDockings: [{ shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' }],
    shuttleFuelled: { philia: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'dione-engineer' });

  render(
    <MemoryRouter initialEntries={['/shuttles/philia']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/dione/roles/dione-engineer" element={<p>Dione Engineer parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'F.S. Philia' })).toBeInTheDocument();
  expect(screen.getByText('Engineer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*dione/i,
  );
  expect(screen.getByText('Fuelled this turn')).toBeInTheDocument();
  expect(screen.getByText('Security teams, strytium ore, fuel, food, water, and materials'))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Repair' })).toBeInTheDocument();
  expect(screen.getByText(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i))
    .toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled repair' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*repair consoles on a second ship/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
  const back = screen.getByRole('link', { name: /back to dione engineer console/i });
  expect(back).toHaveClass('ship-console__back', 'cic-text-button');
  expect(back).toHaveAttribute('href', '/ships/dione/roles/dione-engineer');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Dione Engineer parent')).toBeInTheDocument();
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

it('opens Chepu on its PDF Colonel route with its security and boarding envelope', async () => {
  const user = userEvent.setup();
  const state = useSessionStore.getState();
  state.setSession({
    ...state.session!,
    activeRoleIds: ['refinery-124-pdf-colonel'],
    shuttleDockings: [{ shuttleId: 'chepu', shipId: 'refinery-124', dockedAt: 'SESSION START' }],
    shuttleFuelled: { chepu: true },
  });
  state.setMe({ ...state.me!, activeConsoleRoleId: 'refinery-124-pdf-colonel' });

  render(
    <MemoryRouter initialEntries={['/shuttles/chepu']}>
      <Routes>
        <Route path="/shuttles/:shuttleId" element={<ShuttleConsole />} />
        <Route path="/ships/refinery-124/roles/refinery-124-pdf-colonel" element={<p>PDF Colonel parent</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'P.D.S. Chepu' })).toBeInTheDocument();
  expect(screen.getByText('P.D.F. Colonel // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent(
    /docked.*refinery 124/i,
  );
  expect(screen.getByText('Fuelled this turn')).toBeInTheDocument();
  expect(screen.getByText('Security teams only')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Cargo transfer' })).toBeInTheDocument();
  expect(screen.getByText(/security teams.*to and from ships.*Chepu.*docked/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Boarding defence' })).toBeInTheDocument();
  expect(screen.getByText(/docked ship.*security teams.*repel boarders/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fuelled redeployment' })).toBeInTheDocument();
  expect(screen.getByText(/fuelled.*chosen ship.*start of the Boarding Action step/i)).toBeInTheDocument();

  const back = screen.getByRole('link', { name: /back to refinery 124 p.d.f. colonel console/i });
  expect(back).toHaveAttribute('href', '/ships/refinery-124/roles/refinery-124-pdf-colonel');
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('PDF Colonel parent')).toBeInTheDocument();
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
