import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import { revealAndroidProof } from '@/lib/androidProofService';
import { submitWolfHomingBeacon, submitWolfIntelligence } from '@/lib/wolfActionService';
import { investigatePlayer } from '@/lib/intelligenceInvestigationService';
import {
  subscribeConnectedPlayers,
  subscribeIntelligenceInvestigation,
} from '@/lib/firestore';
import PrivateLoyaltyPanel from './PrivateLoyaltyPanel';

vi.mock('@/lib/androidProofService', () => ({ revealAndroidProof: vi.fn() }));
vi.mock('@/lib/wolfActionService', () => ({
  submitWolfHomingBeacon: vi.fn(),
  submitWolfIntelligence: vi.fn(),
}));
vi.mock('@/lib/intelligenceInvestigationService', () => ({ investigatePlayer: vi.fn() }));
vi.mock('@/lib/firestore', () => ({
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeIntelligenceInvestigation: vi.fn(() => vi.fn()),
}));

function prepareLivePlayer() {
  useSessionStore.getState().setSession({ id: 's1' } as never);
  useSessionStore.getState().setMe({ uid: 'u2', sessionId: 's1', role: 'player' } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  useSessionStore.getState().reset();
  vi.mocked(revealAndroidProof).mockReset();
  vi.mocked(submitWolfIntelligence).mockReset();
  vi.mocked(submitWolfHomingBeacon).mockReset();
  vi.mocked(investigatePlayer).mockReset();
  vi.mocked(subscribeConnectedPlayers).mockReset();
  vi.mocked(subscribeConnectedPlayers).mockReturnValue(vi.fn());
  vi.mocked(subscribeIntelligenceInvestigation).mockReset();
  vi.mocked(subscribeIntelligenceInvestigation).mockReturnValue(vi.fn());
});

it('deploys a homing beacon without a client target and explains after-cycle-start timing', async () => {
  const user = userEvent.setup();
  prepareLivePlayer();
  useSessionStore.getState().setSession({ id: 's1', phase: 'active', currentTurn: 2 } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 });
  vi.mocked(submitWolfHomingBeacon).mockResolvedValue({
    status: 'committed', type: 'wolf-homing-beacon', sessionId: 's1',
    requestId: 'wolf-beacon-1', cycle: 2, revision: 1,
    coverRoleId: 'dione-engineer', groupId: 'fleet-1', coordinate: '5143',
    dueCycle: 3, arrivalTiming: 'after-cycle-start', suspicion: 5,
  });

  render(<PrivateLoyaltyPanel />);
  await user.click(screen.getByRole('button', { name: 'Deploy homing beacon' }));

  await waitFor(() => expect(submitWolfHomingBeacon).toHaveBeenCalledWith());
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Homing beacon scheduled at 5143. Pressure becomes eligible after cycle 3 starts. Suspicion // 5.',
  );
  expect(useSessionStore.getState().privateLoyalty).toMatchObject({
    kind: 'wolf-agent', suspicion: 5,
  });
});
afterEach(() => {
  cleanup();
  useSessionStore.getState().reset();
});

it('shows only the current core player loyalty card and suspicion', () => {
  act(() => useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 }));

  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('region', { name: /private loyalty card/i })).toHaveTextContent('Wolf Agent');
  expect(screen.getByText(/Suspicion \/\/ 0/)).toBeInTheDocument();
  expect(screen.queryByText(/fleet loyalist/i)).not.toBeInTheDocument();
});

it('sends a short private Wolf handler message and applies the server suspicion result', async () => {
  const user = userEvent.setup();
  prepareLivePlayer();
  useSessionStore.getState().setSession({ id: 's1', phase: 'active', currentTurn: 2 } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 });
  vi.mocked(submitWolfIntelligence).mockResolvedValue({
    status: 'committed', type: 'wolf-intelligence', sessionId: 's1',
    requestId: 'wolf-intel-1', cycle: 2, revision: 1,
    coverRoleId: 'dione-engineer', message: 'Relay quiet.', suspicion: 3,
  });

  render(<PrivateLoyaltyPanel />);
  await user.type(screen.getByRole('textbox', { name: 'Short handler message' }), 'Relay quiet.');
  await user.click(screen.getByRole('button', { name: 'Send private intelligence' }));

  await waitFor(() => expect(submitWolfIntelligence).toHaveBeenCalledWith('Relay quiet.'));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Handler message sent privately. Suspicion // 3.',
  );
  expect(useSessionStore.getState().privateLoyalty).toMatchObject({
    kind: 'wolf-agent', suspicion: 3,
  });
});

it('does not offer live Wolf intelligence outside an active cycle', () => {
  prepareLivePlayer();
  useSessionStore.getState().setSession({ id: 's1', phase: 'briefing', currentTurn: 0 } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 });
  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('textbox', { name: 'Short handler message' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Send private intelligence' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(/available during active cycles/i);
});

it('does not offer Wolf intelligence when an active snapshot still reports cycle zero', () => {
  prepareLivePlayer();
  useSessionStore.getState().setSession({ id: 's1', phase: 'active', currentTurn: 0 } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 });
  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('textbox', { name: 'Short handler message' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Send private intelligence' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(/available during active cycles/i);
});

it('does not apply a stale Wolf intelligence result after the private card changes', async () => {
  const user = userEvent.setup();
  const reply = deferred<Awaited<ReturnType<typeof submitWolfIntelligence>>>();
  prepareLivePlayer();
  useSessionStore.getState().setSession({ id: 's1', phase: 'active', currentTurn: 2 } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 });
  vi.mocked(submitWolfIntelligence).mockReturnValue(reply.promise);

  render(<PrivateLoyaltyPanel />);
  await user.type(screen.getByRole('textbox', { name: 'Short handler message' }), 'Relay quiet.');
  await user.click(screen.getByRole('button', { name: 'Send private intelligence' }));
  await waitFor(() => expect(submitWolfIntelligence).toHaveBeenCalledTimes(1));
  act(() => useSessionStore.getState().setPrivateLoyalty({ kind: 'fleet-loyalist', suspicion: 0 }));
  await act(async () => reply.resolve({
    status: 'committed', type: 'wolf-intelligence', sessionId: 's1',
    requestId: 'wolf-intel-1', cycle: 2, revision: 1,
    coverRoleId: 'dione-engineer', message: 'Relay quiet.', suspicion: 3,
  }));

  expect(useSessionStore.getState().privateLoyalty).toEqual({
    kind: 'fleet-loyalist', suspicion: 0,
  });
  expect(screen.queryByText(/handler message sent privately/i)).not.toBeInTheDocument();
});

it('privately investigates one selected player and locks the action for that cycle', async () => {
  const user = userEvent.setup();
  prepareLivePlayer();
  useSessionStore.getState().setSession({ id: 's1', phase: 'active', currentTurn: 2 } as never);
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, displayName: 'Agent', fleetGroupId: 'fleet-1',
  });
  useSessionStore.getState().setPrivateLoyalty({ kind: 'intelligence-agent', suspicion: 6 });
  vi.mocked(subscribeConnectedPlayers).mockImplementation((_sessionId, onPlayers) => {
    onPlayers([
      { uid: 'u2', role: 'player', displayName: 'Agent' },
      { uid: 'u3', role: 'player', displayName: 'Morgan' },
    ] as never);
    return vi.fn();
  });
  vi.mocked(investigatePlayer).mockResolvedValue({
    status: 'committed', type: 'intelligence-investigation', sessionId: 's1',
    requestId: 'investigate-1', cycle: 2, revision: 1, investigatorUid: 'u2',
    targetUid: 'u3', targetDisplayName: 'Morgan', reportedWolf: true, suspicion: 8,
  });

  render(<PrivateLoyaltyPanel />);
  expect(screen.getByRole('combobox', { name: 'Investigation target' })).toHaveValue('u3');
  await user.click(screen.getByRole('button', { name: 'Run private investigation' }));

  await waitFor(() => expect(investigatePlayer).toHaveBeenCalledWith('u3'));
  expect(screen.getByRole('status')).toHaveTextContent('Cycle 2 // Morgan // WOLF AGENT');
  expect(screen.getByRole('button', { name: 'Run private investigation' })).toBeDisabled();
  expect(useSessionStore.getState().privateLoyalty).toEqual({
    kind: 'intelligence-agent', suspicion: 8,
  });
});

it('hydrates a prior private investigation without exposing a new action outside active cycles', () => {
  prepareLivePlayer();
  useSessionStore.getState().setSession({ id: 's1', phase: 'briefing', currentTurn: 2 } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'intelligence-agent', suspicion: 6 });
  vi.mocked(subscribeIntelligenceInvestigation).mockImplementation(
    (_sessionId, _uid, onInvestigation) => {
      onInvestigation({
        type: 'intelligence-investigation', sessionId: 's1', requestId: 'investigate-1',
        cycle: 1, revision: 1, investigatorUid: 'u2', targetUid: 'u3',
        targetDisplayName: 'Morgan', reportedWolf: false,
      });
      return vi.fn();
    },
  );

  render(<PrivateLoyaltyPanel />);

  expect(screen.getByText(/Cycle 1.*NOT WOLF AGENT/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Run private investigation' })).toBeDisabled();
  expect(screen.getByText(/available during active cycles/i)).toBeVisible();
});

it('shows a Press holder card with its private partner pointer when present', () => {
  useSessionStore.getState().setPrivateLoyalty({
    kind: 'fleet-loyalist', suspicion: 5, partnerUid: 'press-partner-uid',
  });

  render(<PrivateLoyaltyPanel />);

  const panel = screen.getByRole('region', { name: /private loyalty card/i });
  expect(panel).toHaveTextContent('Fleet Loyalist');
  expect(panel).toHaveTextContent('Suspicion // 5');
  expect(panel).toHaveTextContent('Partner assignment // press-partner-uid');
});

it('lets the Android holder voluntarily disclose proof and records the committed state', async () => {
  const user = userEvent.setup();
  vi.mocked(revealAndroidProof).mockResolvedValue({ disclosed: true });
  prepareLivePlayer();
  useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });

  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('button', { name: /disclose Android proof/i })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /disclose Android proof/i }));

  await waitFor(() => expect(revealAndroidProof).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('status')).toHaveTextContent(/proof disclosed to the fleet/i);
  expect(screen.queryByRole('button', { name: /disclose Android proof/i })).not.toBeInTheDocument();
});

it.each(['failure', 'success', 'debrief'] as const)(
  'freezes Android proof disclosure during %s endgame evaluation',
  async (phase) => {
    const user = userEvent.setup();
    prepareLivePlayer();
    useSessionStore.getState().setSession({ id: 's1', phase } as never);
    useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });

    render(<PrivateLoyaltyPanel />);

    const button = screen.getByRole('button', { name: /disclose Android proof/i });
    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      /endgame evaluation active.*android proof disclosure is frozen/i,
    );
    await user.click(button);
    expect(revealAndroidProof).not.toHaveBeenCalled();
  },
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it('does not resurrect an Android proof marker after the private card switches', async () => {
  const user = userEvent.setup();
  const reply = deferred<{ disclosed: boolean }>();
  vi.mocked(revealAndroidProof).mockReturnValue(reply.promise);
  prepareLivePlayer();
  useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });
  render(<PrivateLoyaltyPanel />);

  await user.click(screen.getByRole('button', { name: /disclose Android proof/i }));
  await waitFor(() => expect(revealAndroidProof).toHaveBeenCalledTimes(1));
  act(() => useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 }));
  await act(async () => reply.resolve({ disclosed: true }));

  expect(useSessionStore.getState().privateLoyalty).toEqual({ kind: 'wolf-agent', suspicion: 0 });
  expect(screen.queryByText(/proof disclosed/i)).not.toBeInTheDocument();
});

it('does not surface a stale Android error after demotion or identity change', async () => {
  const user = userEvent.setup();
  const reply = deferred<{ disclosed: boolean }>();
  vi.mocked(revealAndroidProof).mockReturnValue(reply.promise);
  prepareLivePlayer();
  useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });
  render(<PrivateLoyaltyPanel />);

  await user.click(screen.getByRole('button', { name: /disclose Android proof/i }));
  await waitFor(() => expect(revealAndroidProof).toHaveBeenCalledTimes(1));
  act(() => {
    useSessionStore.getState().setMe(null);
    useSessionStore.getState().setPrivateLoyalty(null);
  });
  await act(async () => reply.reject(new Error('old identity failed')));

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(useSessionStore.getState().privateLoyalty).toBeNull();
});

it('does not offer a second disclosure after server hydration marks proof revealed', () => {
  useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null, proofRevealed: true });

  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('status')).toHaveTextContent(/proof disclosed to the fleet/i);
  expect(screen.queryByRole('button', { name: /disclose Android proof/i })).not.toBeInTheDocument();
});

it('uses the replacement role catalog and never falls back to a Friend UID', () => {
  useSessionStore.getState().setPrivateLoyalty({
    kind: 'friend', suspicion: 0, partnerUid: 'legacy-partner-uid', partnerRoleId: 'wolf-commander',
  });

  const { rerender } = render(<PrivateLoyaltyPanel />);
  const panel = screen.getByRole('region', { name: /private loyalty card/i });
  expect(panel).toHaveTextContent('Friend trust // partner role // Wolf Commander');
  expect(panel).not.toHaveTextContent('legacy-partner-uid');

  act(() => useSessionStore.getState().setPrivateLoyalty({
    kind: 'friend', suspicion: 0, partnerUid: 'legacy-partner-uid',
  }));
  rerender(<PrivateLoyaltyPanel />);
  expect(screen.getByRole('region', { name: /private loyalty card/i })).not.toHaveTextContent('legacy-partner-uid');
});

it.each([
  ['universal-arbour', 'Universal Arbour'],
  ['wolf-cult', 'Wolf Cult'],
  ['intelligence-agent', 'Intelligence Agent'],
] as const)('uses the source name for the private %s card', (kind, label) => {
  const suspicion = kind === 'wolf-cult' ? 15 : kind === 'intelligence-agent' ? 6 : 10;
  useSessionStore.getState().setPrivateLoyalty({ kind, suspicion });

  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('region', { name: /private loyalty card/i })).toHaveTextContent(label);
  expect(screen.getByRole('region', { name: /private loyalty card/i })).toHaveTextContent(`Suspicion // ${suspicion}`);
});

it('shows facilitator-authored Wolf Cult intelligence only on the entitled Cult card', () => {
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-cult', suspicion: 15 });
  useSessionStore.getState().setWolfCultIntelligence({
    sessionId: 's1', recipientUid: 'u2', revision: 1,
    fortressCoordinate: '4454', suppliesCoordinate: '1964',
    agentUid: 'u3', codeWord: 'NIGHTFALL', label: 'WOLF INTEL',
  });

  render(<PrivateLoyaltyPanel />);

  const panel = screen.getByRole('region', { name: /private loyalty card/i });
  expect(panel).toHaveTextContent(/Wolf Cult intelligence/);
  expect(panel).toHaveTextContent('Active Wolf fortress // 4454');
  expect(panel).toHaveTextContent('Abandoned supplies // 1964');
  expect(panel).toHaveTextContent('Other Wolf agent // u3');
  expect(panel).toHaveTextContent('Code word // NIGHTFALL');

  act(() => useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 }));
  expect(screen.getByRole('region', { name: /private loyalty card/i })).not.toHaveTextContent(/Wolf Cult intelligence/);
});

it('renders no panel before the entitled secret hydrates', () => {
  render(<PrivateLoyaltyPanel />);
  expect(screen.queryByRole('region', { name: /private loyalty card/i })).not.toBeInTheDocument();
});

it('keeps the private card in routed flow below the persistent session chrome', () => {
  useSessionStore.getState().setPrivateLoyalty({ kind: 'fleet-loyalist', suspicion: 0 });

  render(
    <div className="screen-fade__content">
      <PrivateLoyaltyPanel />
    </div>,
  );

  const panel = screen.getByRole('region', { name: /private loyalty card/i });
  const flow = panel.closest('[data-private-loyalty-flow]');
  expect(flow).toHaveAttribute('data-private-loyalty-flow', 'true');
  expect(flow).toContainElement(panel);

  const stylesheet = readFileSync('src/index.css', 'utf8');
  expect(stylesheet).toMatch(
    /\.private-loyalty-flow\s*\{[\s\S]*padding-top:\s*calc\(var\(--app-header-height/,
  );
});

it('clears existing disclosure errors when the Android card is reassigned', async () => {
  const user = userEvent.setup();
  vi.mocked(revealAndroidProof).mockRejectedValue(new Error('Previous card failed'));
  prepareLivePlayer();
  useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });
  render(<PrivateLoyaltyPanel />);
  await user.click(screen.getByRole('button', { name: /disclose Android proof/i }));
  expect(await screen.findByRole('alert')).toBeVisible();
  act(() => useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /disclose Android proof/i })).toBeEnabled();
});

it('gives a new Android identity independent pending feedback and ignores the old completion', async () => {
  const user = userEvent.setup();
  const oldReply = deferred<{ disclosed: boolean }>();
  const newReply = deferred<{ disclosed: boolean }>();
  vi.mocked(revealAndroidProof).mockReturnValueOnce(oldReply.promise).mockReturnValueOnce(newReply.promise);
  prepareLivePlayer();
  useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });
  render(<PrivateLoyaltyPanel />);
  await user.click(screen.getByRole('button', { name: /disclose Android proof/i }));
  act(() => {
    useSessionStore.getState().setSession({ id: 's2' } as never);
    useSessionStore.getState().setMe({ uid: 'u3', sessionId: 's2', role: 'player' } as never);
    useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });
    useSessionStore.getState().setSessionSnapshotFreshness('server');
  });
  const button = screen.getByRole('button', { name: /disclose Android proof/i });
  expect(button).toBeEnabled();
  await user.click(button);
  expect(screen.getByRole('button', { name: /disclosing/i })).toBeDisabled();
  await act(async () => oldReply.resolve({ disclosed: true }));
  expect(screen.getByRole('button', { name: /disclosing/i })).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => newReply.resolve({ disclosed: true }));
  expect(screen.getByRole('status')).toHaveTextContent(/Android proof disclosed/i);
});

it('shows a Friend partner by the server-authored role on the private card', () => {
  useSessionStore.getState().setPrivateLoyalty({
    kind: 'friend', suspicion: 0, partnerUid: 'hidden-partner-uid', partnerRoleId: 'admiral',
  });

  render(<PrivateLoyaltyPanel />);

  const panel = screen.getByRole('region', { name: /private loyalty card/i });
  expect(panel).toHaveTextContent('Friend trust // partner role // Admiral');
  expect(panel).not.toHaveTextContent('hidden-partner-uid');
});
