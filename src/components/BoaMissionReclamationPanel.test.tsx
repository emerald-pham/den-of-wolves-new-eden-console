import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import BoaMissionReclamationPanel from './BoaMissionReclamationPanel';

const mocks = vi.hoisted(() => ({ read: vi.fn(), choose: vi.fn() }));
vi.mock('@/lib/boaMissionReclamationService', () => ({
  readBoaMissionReclamationWorkspace: mocks.read,
  chooseBoaMissionReclamationOpportunity: mocks.choose,
}));

const control = { shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'holder',
  holderUid: 'holder', revision: 4 } as ShuttleControlEntry;
const docking = { shuttleId: 'boa', shipId: 'aegis', dockedAt: 'now' } as ShuttleDocking;
const opportunity = {
  missionOpportunityId: 'arrival-fleet-1-A-5143', groupId: 'fleet-1', chart: 'A', coordinate: '5143',
  siteCode: 'L', siteName: 'Asterion', sourceCycle: 3, choiceRevision: 0,
  taskOpportunities: [
    { id: 'L-1', description: 'Recover the stranded survey crew.', difficulty: 15, criticalThreshold: 25 },
    { id: 'L-2', description: 'Recover the abandoned research cache.', difficulty: 10, criticalThreshold: 20 },
  ],
};

function installSession(): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Recycler', role: 'player', seatId: null,
    assignedRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler', fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 3, expansion: 'capybara', capybaraEnabled: true,
    activeRoleIds: ['capybara-captain', 'capybara-recycler'], activeVesselIds: ['capybara', 'aegis'],
    shuttleControl: { boa: control }, shuttleDockings: [docking],
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function renderPanel() {
  return render(<BoaMissionReclamationPanel control={control} docking={docking} />);
}

beforeEach(() => {
  mocks.read.mockReset(); mocks.choose.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'boa-reclaim-request') });
  installSession();
  mocks.read.mockResolvedValue({
    status: 'available', sessionId: 's1', actorUid: 'holder', groupId: 'fleet-1',
    hostShipId: 'aegis', controlRevision: 4, cycle: 3, opportunities: [opportunity], lapsedChoices: [],
  });
});

it('tells the Recycler when their choice lapsed at the deal and the mission was dealt without it', async () => {
  mocks.read.mockResolvedValueOnce({
    status: 'available', sessionId: 's1', actorUid: 'holder', groupId: 'fleet-1',
    hostShipId: 'aegis', controlRevision: 4, cycle: 3, opportunities: [],
    lapsedChoices: [{ missionOpportunityId: 'arrival-fleet-1-A-5143', siteName: 'Asterion', coordinate: '5143',
      taskOpportunityId: 'L-1', reason: 'recycler-not-on-mission' }],
  });
  renderPanel();
  const panel = await screen.findByRole('region', { name: 'Boa mission reclamation' });
  const notice = await within(panel).findByText(/L-1 choice for Asterion \/\/ 5143 lapsed/);
  expect(notice).toHaveTextContent(/Boa Recycler was not on the mission/);
  expect(notice).toHaveTextContent(/dealt without the Boa adjustment/);
});

it('shows only the current fleet’s mission tasks and binds the pre-deal choice to server revisions', async () => {
  mocks.choose.mockResolvedValue({
    status: 'committed', sessionId: 's1', requestId: 'boa-reclaim-request',
    missionOpportunityId: opportunity.missionOpportunityId, taskOpportunityId: 'L-1', choiceRevision: 1,
  });
  renderPanel();
  const panel = await screen.findByRole('region', { name: 'Boa mission reclamation' });
  expect(mocks.read).toHaveBeenCalledWith('s1');
  expect(within(panel).getByText(/Asterion.*5143/)).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: /Review Asterion mission tasks/ }));
  const choice = within(panel).getByRole('group', { name: 'Select a mission-card task' });
  expect(within(choice).getByLabelText(/L-1.*Recover the stranded survey crew/i)).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('radio', { name: /L-1.*Recover the stranded survey crew/i }));
  fireEvent.click(within(panel).getByRole('button', { name: /Apply Boa reclamation to L-1/ }));
  await waitFor(() => expect(mocks.choose).toHaveBeenCalledWith({
    requestId: 'boa-reclaim-request',
    missionOpportunityId: opportunity.missionOpportunityId, taskOpportunityId: 'L-1',
    expectedControlRevision: 4, expectedChoiceRevision: 0, expectedCycle: 3,
  }));
  expect(await within(panel).findByRole('status')).toHaveTextContent(/selected L-1.*before the initial deal/i);
});

it('shows the rounded-up halved difficulty for the 17-difficulty mission task', async () => {
  mocks.read.mockResolvedValueOnce({
    status: 'available', sessionId: 's1', actorUid: 'holder', groupId: 'fleet-1',
    hostShipId: 'aegis', controlRevision: 4, cycle: 3,
    opportunities: [{
      ...opportunity, missionOpportunityId: 'arrival-fleet-1-A-asteroid', siteCode: 'A',
      taskOpportunities: [{
        id: 'A-1', description: 'Harvest proto-lichen from the asteroids to feed the fleet.',
        difficulty: 17, criticalThreshold: null,
      }],
    }],
    lapsedChoices: [],
  });

  renderPanel();
  const panel = await screen.findByRole('region', { name: 'Boa mission reclamation' });
  fireEvent.click(within(panel).getByRole('button', { name: /Review Asterion mission tasks/ }));

  expect(within(panel).getByText((_, element) => element?.tagName === 'SMALL' &&
    element.textContent === 'Printed difficulty 17; Boa difficulty 9 (odd halves round up).')).toBeVisible();
});

it('allows returning to the mission chooser without submitting a draft', async () => {
  renderPanel();
  const panel = await screen.findByRole('region', { name: 'Boa mission reclamation' });
  fireEvent.click(within(panel).getByRole('button', { name: /Review Asterion mission tasks/ }));
  fireEvent.click(within(panel).getByRole('button', { name: 'Back to mission locations' }));
  expect(within(panel).getByRole('button', { name: /Review Asterion mission tasks/ })).toBeInTheDocument();
  expect(mocks.choose).not.toHaveBeenCalled();
});

it('drops an in-flight acknowledgement after the current Boa holder loses station authority', async () => {
  let resolveChoice!: (value: unknown) => void;
  mocks.choose.mockReturnValueOnce(new Promise((resolve) => { resolveChoice = resolve; }));
  renderPanel();
  const panel = await screen.findByRole('region', { name: 'Boa mission reclamation' });
  fireEvent.click(within(panel).getByRole('button', { name: /Review Asterion mission tasks/ }));
  fireEvent.click(within(panel).getByRole('radio', { name: /L-1.*Recover the stranded survey crew/i }));
  fireEvent.click(within(panel).getByRole('button', { name: /Apply Boa reclamation to L-1/ }));
  await waitFor(() => expect(mocks.choose).toHaveBeenCalledTimes(1));
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, assignedRoleId: 'capybara-captain', activeConsoleRoleId: 'capybara-captain',
  }));
  await act(async () => resolveChoice({
    status: 'committed', sessionId: 's1', requestId: 'boa-reclaim-request',
    missionOpportunityId: opportunity.missionOpportunityId, taskOpportunityId: 'L-1', choiceRevision: 1,
  }));
  expect(within(panel).queryByText(/selected L-1.*before the initial deal/i)).not.toBeInTheDocument();
  expect(within(panel).getByText(/Only the current Boa Recycler at this station/i)).toBeInTheDocument();
});
