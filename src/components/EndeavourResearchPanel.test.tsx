import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ read: vi.fn(), advance: vi.fn() }));
vi.mock('@/lib/endeavourResearchService', () => ({
  readEndeavourResearchWorkspace: mocks.read,
  advanceEndeavourResearchTrack: mocks.advance,
}));

import EndeavourResearchPanel from './EndeavourResearchPanel';

const control = {
  shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'scientist',
  holderUid: 'scientist', revision: 4,
} as const;

const workspace = {
  status: 'ready' as const, sessionId: 's1', cycle: 3, researchRevision: 0,
  cadence: { cycle: 3, revision: 0, choices: [] },
  progress: { reactor: 1 },
  tracks: [
    { trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5, currentMaterialCost: 7, complete: false },
    { trackId: 'jump-drive', name: 'Jump Drive', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 14, complete: false },
  ],
  shepherdOre: 10,
};

beforeEach(() => {
  mocks.read.mockReset();
  mocks.advance.mockReset();
  mocks.read.mockResolvedValue(workspace);
  mocks.advance.mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist'],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { endeavour: control },
    createdAt: '', updatedAt: '',
  }, {
    uid: 'scientist', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('shows private left-most progress and field-upgrade cost to the current Scientist', async () => {
  render(<EndeavourResearchPanel control={control} />);
  expect(await screen.findByRole('region', { name: 'Endeavour research controls' })).toBeVisible();
  expect(screen.getByLabelText('Research track')).toHaveTextContent('Reactor');
  expect(screen.getByText(/cross the left-most research box.*reactor.*cost is 7 materials/i)).toBeVisible();
  expect(screen.getByRole('list', { name: 'Research progress' })).toHaveTextContent(
    'Reactor: 1 of 5 boxes crossed; next field-upgrade cost is 7 materials. Available for a research choice.',
  );
  expect(screen.getByText('Shepherd // 10 ore available')).toBeVisible();
  expect(mocks.read).toHaveBeenCalledTimes(1);
});

it('submits the selected standard choice and refreshes from the server without an optimistic advance', async () => {
  const user = userEvent.setup();
  const after = {
    ...workspace,
    researchRevision: 1,
    cadence: { cycle: 3, revision: 1, choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }] },
    progress: { reactor: 2 },
    tracks: [
      { ...workspace.tracks[0]!, crossedBoxes: 2, currentMaterialCost: 6 },
      workspace.tracks[1]!,
    ],
  };
  mocks.read.mockResolvedValueOnce(workspace).mockResolvedValueOnce(after);
  render(<EndeavourResearchPanel control={control} />);
  await screen.findByRole('region', { name: 'Endeavour research controls' });
  await user.click(screen.getByRole('button', { name: 'Advance standard research' }));
  await waitFor(() => expect(mocks.advance).toHaveBeenCalledWith({
    workspace, trackId: 'reactor', funding: 'standard',
  }));
  expect(await screen.findByText(/reactor advanced one research box/i)).toHaveAttribute('role', 'status');
  expect(screen.getByRole('list', { name: 'Research progress' })).toHaveTextContent(
    'Reactor: 2 of 5 boxes crossed; next field-upgrade cost is 6 materials. Chosen this cycle.',
  );
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it('offers additional choices as explicit five-Shepherd-ore requests', async () => {
  const user = userEvent.setup();
  render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance with 5 Shepherd ore' }));
  await waitFor(() => expect(mocks.advance).toHaveBeenCalledWith({
    workspace, trackId: 'reactor', funding: 'shepherd-ore',
  }));
});

it('keeps the ore-funded choice unavailable without five current Shepherd ore', async () => {
  mocks.read.mockResolvedValue({ ...workspace, shepherdOre: 4 });
  render(<EndeavourResearchPanel control={control} />);
  expect(await screen.findByRole('button', { name: 'Advance with 5 Shepherd ore' })).toBeDisabled();
  expect(mocks.advance).not.toHaveBeenCalled();
});

it('shows completed tracks without inventing another field-upgrade price', async () => {
  mocks.read.mockResolvedValue({
    ...workspace,
    progress: { reactor: 5 },
    tracks: [{ ...workspace.tracks[0]!, crossedBoxes: 5, totalBoxes: 5, currentMaterialCost: null, complete: true }],
  });
  render(<EndeavourResearchPanel control={control} />);
  expect(await screen.findByRole('list', { name: 'Research progress' })).toHaveTextContent(
    'Reactor: 5 of 5 boxes crossed; no further field-upgrade cost. Research complete.',
  );
});

it('does not show or retain private prices after the active console role changes during a read', async () => {
  let resolve!: (value: typeof workspace) => void;
  mocks.read.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { container } = render(<EndeavourResearchPanel control={control} />);
  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  }));
  resolve(workspace);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  expect(screen.queryByText(/costs 7 materials/i)).not.toBeInTheDocument();
});

it('hides one session private workspace immediately when an equally entitled Scientist switches sessions', async () => {
  mocks.read.mockResolvedValueOnce(workspace).mockRejectedValueOnce(new Error('Research is unavailable.'));
  render(<EndeavourResearchPanel control={control} />);
  expect(await screen.findByRole('list', { name: 'Research progress' })).toHaveTextContent(
    'Reactor: 1 of 5 boxes crossed; next field-upgrade cost is 7 materials.',
  );

  act(() => useSessionStore.getState().setIdentity({
    id: 's2', name: 'Second Fleet', joinCode: '5678', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist'],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { endeavour: control }, createdAt: '', updatedAt: '',
  }, {
    uid: 'scientist', sessionId: 's2', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', joinedAt: '',
  }));

  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('list', { name: 'Research progress' })).not.toBeInTheDocument();
  expect(screen.queryAllByText(/next field-upgrade cost is 7 materials/i)).toHaveLength(0);
  expect(await screen.findByRole('alert')).toHaveTextContent('Research is unavailable.');
});

it('clears a settled in-flight action after authority loss so a returning Scientist can continue', async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  mocks.advance.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  const { container } = render(<EndeavourResearchPanel control={control} />);
  await user.click(await screen.findByRole('button', { name: 'Advance standard research' }));
  expect(screen.getByRole('button', { name: 'Advancing research…' })).toBeDisabled();

  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  }));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
  await act(async () => {
    finish();
    await Promise.resolve();
  });

  act(() => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-scientist',
  }));
  expect(await screen.findByRole('button', { name: 'Advance standard research' })).toBeEnabled();
});
