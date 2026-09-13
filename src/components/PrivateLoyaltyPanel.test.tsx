import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import { revealAndroidProof } from '@/lib/androidProofService';
import PrivateLoyaltyPanel from './PrivateLoyaltyPanel';

vi.mock('@/lib/androidProofService', () => ({ revealAndroidProof: vi.fn() }));

function prepareLivePlayer() {
  useSessionStore.getState().setSession({ id: 's1' } as never);
  useSessionStore.getState().setMe({ uid: 'u2', sessionId: 's1', role: 'player' } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  useSessionStore.getState().reset();
  vi.mocked(revealAndroidProof).mockReset();
});
afterEach(() => {
  cleanup();
  useSessionStore.getState().reset();
});

it('shows only the current core player loyalty card and suspicion', () => {
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 });

  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('region', { name: /private loyalty card/i })).toHaveTextContent('Wolf Agent');
  expect(screen.getByText(/Suspicion \/\/ 0/)).toBeInTheDocument();
  expect(screen.queryByText(/fleet loyalist/i)).not.toBeInTheDocument();
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
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
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

it.each([
  ['universal-arbour', 'Universal Arbour'],
  ['wolf-cult', 'Wolf Cult'],
] as const)('uses the source name for the private %s card', (kind, label) => {
  useSessionStore.getState().setPrivateLoyalty({ kind, suspicion: kind === 'wolf-cult' ? 15 : 10 });

  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('region', { name: /private loyalty card/i })).toHaveTextContent(label);
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
