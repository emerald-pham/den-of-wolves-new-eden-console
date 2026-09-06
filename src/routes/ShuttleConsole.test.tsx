import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ShuttleConsole from './ShuttleConsole';

vi.mock('@/lib/sessionService', () => ({
  popShipConfetti: vi.fn(),
  selectConsoleRole: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/pressDispatchService', () => ({
  dismissPressDispatch: vi.fn(),
  publishPressDispatch: vi.fn(),
}));
const { dismissPressDispatch, publishPressDispatch } = await import('@/lib/pressDispatchService');

beforeEach(() => {
  vi.mocked(publishPressDispatch).mockReset();
  vi.mocked(publishPressDispatch).mockResolvedValue(undefined);
  vi.mocked(dismissPressDispatch).mockReset();
  vi.mocked(dismissPressDispatch).mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    activeRoleIds: ['press-officer'],
    shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
    ],
    shuttleVisitLog: [{
      id: 'visit-1', shuttleId: 'snn-press-shuttle', shipId: 'aegis',
      action: 'docked', occurredAt: 'SESSION START',
    }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Reporter', role: 'player', seatId: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setMode('console');
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
    /docked.*aegis/i,
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
});

it('keeps a non-GM press officer aboard until settings releases the role', () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'press-officer' });

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes><Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} /></Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: /leave shuttle/i })).not.toBeInTheDocument();
});

it('keeps a press officer aboard if the GM disables the held role', () => {
  const session = useSessionStore.getState().session;
  const me = useSessionStore.getState().me;
  if (!session || !me) throw new Error('Expected test session state.');
  useSessionStore.getState().setSession({ ...session, activeRoleIds: [] });
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: 'press-officer' });

  render(
    <MemoryRouter initialEntries={['/press']}>
      <Routes>
        <Route path="/console" element={<p>Role selection</p>} />
        <Route path="/press" element={<ShuttleConsole shuttleId="snn-press-shuttle" />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: /snn.*system news network/i })).toBeInTheDocument();
});
