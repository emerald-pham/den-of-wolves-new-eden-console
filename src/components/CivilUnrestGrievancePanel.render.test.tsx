import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CivilUnrestGrievancePanel from './CivilUnrestGrievancePanel';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({
  publicCallbacks: [] as Array<(value: unknown) => void>,
  teamCallbacks: [] as Array<(value: unknown) => void>,
  submit: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeCivilUnrestPublic: vi.fn((_sessionId: string, callback: (value: unknown) => void) => {
    mocks.publicCallbacks.push(callback);
    return vi.fn();
  }),
  subscribeCivilUnrestGrievance: vi.fn((_sessionId: string, _shipId: string, callback: (value: unknown) => void) => {
    mocks.teamCallbacks.push(callback);
    return vi.fn();
  }),
}));
vi.mock('@/lib/sessionService', () => ({ submitCivilUnrestGrievance: mocks.submit }));

const privateGrievance = {
  sessionId: 's1', crisisId: 'civil-unrest', shipId: 'icebreaker', visibility: 'private',
  text: 'A private team concern.', revision: 1, crisisRevision: 4,
} as const;

beforeEach(() => {
  mocks.publicCallbacks = [];
  mocks.teamCallbacks = [];
  mocks.submit.mockReset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table', joinCode: '1234', phase: 'active', ownerUid: 'gm', createdAt: '', updatedAt: '',
      activeVesselIds: ['icebreaker'],
      currentTurn: 1,
      turnPhase: {
        turn: 1,
        teamPhaseEndsAt: '2026-09-13T12:05:00.000Z',
        openAirspaceEndsAt: '2026-09-13T12:20:00.000Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Miner', role: 'player', seatId: null,
      assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner', joinedAt: '',
    },
  );
});

afterEach(() => cleanup());

it('renders the audience contract and shows pending, success, and error states with keyboard controls', async () => {
  render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="delivered" />);
  expect(screen.getByRole('region', { name: 'Civil Unrest team grievances' })).toBeVisible();
  expect(screen.getByText('Private — your current team and facilitators')).toBeVisible();
  expect(screen.getByText('Public — all session members')).toBeVisible();
  expect(screen.getByLabelText("Your team's grievance")).toBeVisible();
  act(() => mocks.teamCallbacks[0]!(privateGrievance));
  act(() => mocks.publicCallbacks[0]!({
    type: 'civil-unrest-public', sessionId: 's1', crisisId: 'civil-unrest', state: 'delivered', revision: 4,
    grievances: [{ shipId: 'icebreaker', text: 'A public concern.', revision: 1 }],
  }));
  expect(screen.getByText('A public concern.')).toBeVisible();
  const textarea = screen.getByLabelText("Your team's grievance");
  fireEvent.change(textarea, { target: { value: 'A revised public concern.' } });
  fireEvent.click(screen.getByLabelText('Public — all session members'));
  let resolveSubmit!: (value: 'applied') => void;
  mocks.submit.mockReturnValueOnce(new Promise<'applied'>((resolve) => { resolveSubmit = resolve; }));
  const submit = screen.getByRole('button', { name: 'Revise grievance' });
  submit.focus();
  expect(submit).toHaveFocus();
  fireEvent.click(submit);
  expect(submit).toBeDisabled();
  await act(async () => resolveSubmit('applied'));
  expect(await screen.findByRole('status')).toHaveTextContent('Grievance submitted.');

  fireEvent.change(textarea, { target: { value: 'Another revision.' } });
  mocks.submit.mockRejectedValueOnce(new Error('The grievance changed. Refresh before revising it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Revise grievance' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('The grievance changed. Refresh before revising it.'));
});

it('resolves every eligible replacement role to its affected team editor', () => {
  const replacements = [
    ['vip-host', 'dione'],
    ['commissar', 'icebreaker'],
    ['rosal-militia-leader', 'shepherd'],
    ['doctor', 'quellon'],
    ['pdf-fighter-ace', 'refinery-124'],
  ] as const;
  for (const [replacementRoleId, shipId] of replacements) {
    useSessionStore.getState().setIdentity(
      { ...useSessionStore.getState().session!, activeVesselIds: [shipId] },
      {
        ...useSessionStore.getState().me!, replacementRoleId,
        assignedRoleId: null, activeConsoleRoleId: null,
      },
    );
    const view = render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="delivered" />);
    expect(screen.getByRole('region', { name: 'Civil Unrest team grievances' })).toBeVisible();
    expect(screen.getByLabelText("Your team's grievance")).toBeEnabled();
    view.unmount();
  }
});

it('keeps public records readable to unaffected members and private records readable to the GM', () => {
  useSessionStore.getState().setIdentity(
    { ...useSessionStore.getState().session!, activeVesselIds: ['aegis'] },
    { ...useSessionStore.getState().me!, assignedRoleId: null, activeConsoleRoleId: 'press-officer' },
  );
  const member = render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="delivered" />);
  act(() => mocks.publicCallbacks[0]!({
    type: 'civil-unrest-public', sessionId: 's1', crisisId: 'civil-unrest', state: 'delivered', revision: 4,
    grievances: [{ shipId: 'icebreaker', text: 'A public account.', revision: 1 }],
  }));
  expect(screen.getByText('A public account.')).toBeVisible();
  expect(screen.queryByLabelText("Your team's grievance")).not.toBeInTheDocument();
  member.unmount();

  useSessionStore.getState().setIdentity(
    { ...useSessionStore.getState().session!, activeVesselIds: ['icebreaker', 'dione'] },
    { ...useSessionStore.getState().me!, role: 'gm', assignedRoleId: null, activeConsoleRoleId: null },
  );
  render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="delivered" />);
  act(() => mocks.teamCallbacks[0]!(privateGrievance));
  expect(screen.getByRole('region', { name: 'GM private grievance records' })).toBeVisible();
  expect(screen.getByText('A private team concern.')).toBeVisible();
  expect(screen.queryByLabelText("Your team's grievance")).not.toBeInTheDocument();
});

it('revokes stale private text synchronously when the live team changes', () => {
  render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="delivered" />);
  act(() => mocks.teamCallbacks[0]!(privateGrievance));
  expect(screen.getByText('A private team concern.')).toBeVisible();

  const session = useSessionStore.getState().session!;
  const me = useSessionStore.getState().me!;
  act(() => useSessionStore.setState({
    session: { ...session, activeVesselIds: ['shepherd'] },
    me: { ...me, assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist' },
  }));
  expect(screen.queryByText('A private team concern.')).not.toBeInTheDocument();
});

it('revokes private text when the crisis leaves its accepting lifecycle', () => {
  const view = render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="delivered" />);
  act(() => mocks.teamCallbacks[0]!(privateGrievance));
  expect(screen.getByText('A private team concern.')).toBeVisible();
  view.rerender(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="resolved" />);
  expect(screen.queryByText('A private team concern.')).not.toBeInTheDocument();
});

it('disables editing outside Team Phase and after the crisis resolves', () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    turnPhase: { ...session.turnPhase!, airspace: { ...session.turnPhase!.airspace, state: 'lifted' } },
  });
  const coordination = render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="delivered" />);
  expect(screen.getByLabelText("Your team's grievance")).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('only during Team Phase');
  coordination.unmount();

  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnPhase: { ...useSessionStore.getState().session!.turnPhase!, airspace: { ...useSessionStore.getState().session!.turnPhase!.airspace, state: 'restricted' } },
  });
  render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} crisisState="resolved" />);
  expect(screen.getByLabelText("Your team's grievance")).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('delivered, debated, or escalated');
});
