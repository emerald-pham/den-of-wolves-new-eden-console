import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import AwayMissionLifecycleWorkspace from './AwayMissionLifecycleWorkspace';

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  makeActions: vi.fn(),
  readContext: vi.fn(),
  actions: {
    requestExtraCards: vi.fn(),
    distributeExtraCard: vi.fn(),
    openDiscards: vi.fn(),
    discardCard: vi.fn(),
    reclamatorSalvage: vi.fn(),
    assignCards: vi.fn(),
    addFacilitatorCards: vi.fn(),
    resolve: vi.fn(),
    dropOff: vi.fn(),
  },
}));

vi.mock('@/lib/awayMissionLifecycleService', () => ({
  subscribeToOwnAwayMissionLifecycles: mocks.subscribe,
  createAwayMissionLifecycleActions: mocks.makeActions,
  createCurrentAwayMissionLifecycleContext: mocks.readContext,
}));

const publicState = {
  missionId: 'mission-1',
  groupId: 'fleet-1',
  siteCode: 'D',
  revision: 3,
  phase: 'assignment-ready' as const,
  status: 'active' as const,
  overrun: false,
  missionLeaderUid: 'alice',
  participantCount: 2,
  opportunities: [{ id: 'D-1', label: 'Kitchen supplies' }],
  requestCounts: [{ participantUid: 'bob', count: 1 }],
  outcomes: null,
  rewards: null,
  specialRewards: null,
  custody: { status: 'mission-leader' as const, holderUid: 'alice', shipId: null },
  legalDropOffShipIds: ['aegis'],
};

const ownPrivateState = {
  missionId: 'mission-1',
  participantUid: 'bob',
  revision: 3,
  phase: 'assignment-ready' as const,
  cards: [{ id: 'A♥', value: 10, status: 'remaining' as const, opportunityId: null }],
  reclamatorSalvage: null,
};

function publishReadyState(privateState = ownPrivateState, currentPublicState = publicState) {
  mocks.subscribe.mockImplementation((_sessionId, _actorUid, onState) => {
    onState({
      status: 'ready',
      missions: [{ publicState: currentPublicState, privateState }],
      projectionMissing: false,
    });
    return vi.fn();
  });
}

function setAuthorizedActor(sessionId: string, uid = 'bob', roleId = 'shepherd-scientist') {
  useSessionStore.setState({
    session: { id: sessionId, phase: 'active' } as never,
    me: {
      uid,
      sessionId,
      role: 'player',
      assignedRoleId: roleId,
      activeConsoleRoleId: roleId,
      replacementRoleId: null,
      replacementStatus: null,
    } as never,
    connection: 'live',
    sessionSnapshotFreshness: 'server',
  });
}

describe('AwayMissionLifecycleWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().reset();
    Object.values(mocks.actions).forEach((action) => action.mockResolvedValue(undefined));
    mocks.makeActions.mockReturnValue(mocks.actions);
    mocks.readContext.mockImplementation((mission, sessionId, actorUid) => ({
      sessionId,
      actorUid,
      authenticatedUid: actorUid,
      actorRole: 'player',
      missionId: mission.missionId,
      missionLeaderUid: 'alice',
      revision: mission.revision,
      sessionIsActive: true,
      hasFreshServerAuthority: true,
    }));
  });

  it('loads the signed-in participant’s own hand beside the public mission state', async () => {
    setAuthorizedActor('s1');
    publishReadyState();
    const user = userEvent.setup();
    render(<AwayMissionLifecycleWorkspace sessionId="s1" actorUid="bob" actorRoleId="shepherd-scientist" />);

    const panel = screen.getByRole('region', { name: 'Away mission // mission-1' });
    expect(within(panel).getByText('A♥')).toBeVisible();
    expect(within(panel).getByText('D-1')).toBeVisible();
    expect(mocks.subscribe).toHaveBeenCalledWith('s1', 'bob', expect.any(Function));

    await user.selectOptions(within(panel).getByLabelText('Opportunity for A♥'), 'D-1');
    await user.click(within(panel).getByRole('button', { name: 'Submit mission assignments' }));
    expect(mocks.actions.assignCards).toHaveBeenCalledWith([
      { cardId: 'A♥', opportunityId: 'D-1' },
    ]);
  });

  it('hides private cards if a projection is mismatched to the authenticated participant', () => {
    setAuthorizedActor('s1');
    publishReadyState({ ...ownPrivateState, participantUid: 'alice' });
    render(<AwayMissionLifecycleWorkspace sessionId="s1" actorUid="bob" actorRoleId="shepherd-scientist" />);

    expect(screen.queryByRole('region', { name: 'Away mission // mission-1' })).not.toBeInTheDocument();
    expect(screen.queryByText('A♥')).not.toBeInTheDocument();
    expect(mocks.makeActions).not.toHaveBeenCalled();
  });

  it('announces reconnect and waits for a server projection after a cached read', () => {
    mocks.subscribe.mockImplementation((_sessionId, _actorUid, onState) => {
      onState({ status: 'stale', missions: [], projectionMissing: false });
      return vi.fn();
    });
    render(<AwayMissionLifecycleWorkspace sessionId="s1" actorUid="bob" actorRoleId="shepherd-scientist" />);

    expect(screen.getByRole('status')).toHaveTextContent(/reconnect.*current mission state/i);
    expect(screen.queryByText('A♥')).not.toBeInTheDocument();
  });

  it('clears its Firestore subscriptions when the role brief unmounts', () => {
    const unsubscribe = vi.fn();
    mocks.subscribe.mockReturnValue(unsubscribe);
    const { unmount } = render(<AwayMissionLifecycleWorkspace sessionId="s1" actorUid="bob" actorRoleId="shepherd-scientist" />);

    act(() => unmount());

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('restores only the current participant’s unsubmitted assignments after leaving and reselecting the role', async () => {
    const sessionId = 'assignment-draft-reselect';
    setAuthorizedActor(sessionId);
    publishReadyState();
    const user = userEvent.setup();
    const workspace = <AwayMissionLifecycleWorkspace sessionId={sessionId} actorUid="bob" actorRoleId="shepherd-scientist" />;
    const first = render(workspace);

    await user.selectOptions(screen.getByLabelText('Opportunity for A♥'), 'D-1');
    expect(mocks.actions.assignCards).not.toHaveBeenCalled();
    first.unmount();

    render(workspace);

    expect(screen.getByLabelText('Opportunity for A♥')).toHaveValue('D-1');
    expect(mocks.actions.assignCards).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Submit mission assignments' }));
    expect(mocks.actions.assignCards).toHaveBeenCalledWith([
      { cardId: 'A♥', opportunityId: 'D-1' },
    ]);
  });

  it('does not reveal a saved assignment while the station is lost, then restores it only after fresh reselection', async () => {
    const sessionId = 'assignment-draft-station-loss';
    setAuthorizedActor(sessionId);
    publishReadyState();
    const user = userEvent.setup();
    const workspace = <AwayMissionLifecycleWorkspace sessionId={sessionId} actorUid="bob" actorRoleId="shepherd-scientist" />;
    const view = render(workspace);

    await user.selectOptions(screen.getByLabelText('Opportunity for A♥'), 'D-1');
    act(() => useSessionStore.setState(state => ({
      me: { ...state.me!, activeConsoleRoleId: null } as never,
    })));

    expect(screen.getByLabelText('Opportunity for A♥')).toHaveValue('');
    expect(mocks.actions.assignCards).not.toHaveBeenCalled();

    act(() => useSessionStore.setState(state => ({
      me: { ...state.me!, activeConsoleRoleId: 'shepherd-scientist' } as never,
    })));

    expect(screen.getByLabelText('Opportunity for A♥')).toHaveValue('D-1');
    expect(mocks.actions.assignCards).not.toHaveBeenCalled();
    view.unmount();
  });

  it('does not restore assignment choices onto a changed mission revision', async () => {
    const sessionId = 'assignment-draft-revision';
    setAuthorizedActor(sessionId);
    publishReadyState();
    const user = userEvent.setup();
    const workspace = <AwayMissionLifecycleWorkspace sessionId={sessionId} actorUid="bob" actorRoleId="shepherd-scientist" />;
    const first = render(workspace);

    await user.selectOptions(screen.getByLabelText('Opportunity for A♥'), 'D-1');
    first.unmount();

    const updatedPublicState = { ...publicState, revision: 4 };
    publishReadyState({ ...ownPrivateState, revision: 4 }, updatedPublicState);
    render(workspace);

    expect(screen.getByLabelText('Opportunity for A♥')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Submit mission assignments' }));
    expect(mocks.actions.assignCards).not.toHaveBeenCalled();
  });

  it('hides the former participant hand if the current authenticated actor changes', () => {
    const sessionId = 'assignment-draft-actor-change';
    setAuthorizedActor(sessionId);
    publishReadyState();
    const workspace = <AwayMissionLifecycleWorkspace sessionId={sessionId} actorUid="bob" actorRoleId="shepherd-scientist" />;
    const view = render(workspace);
    expect(screen.getByLabelText('Opportunity for A♥')).toBeInTheDocument();

    act(() => useSessionStore.setState(state => ({
      me: { ...state.me!, uid: 'alice' } as never,
    })));
    view.rerender(workspace);

    expect(screen.queryByLabelText('Opportunity for A♥')).not.toBeInTheDocument();
    expect(screen.queryByText('A♥')).not.toBeInTheDocument();
  });
});
