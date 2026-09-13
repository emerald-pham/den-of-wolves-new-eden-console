import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import { revealAndroidProof } from '@/lib/androidProofService';
import PrivateLoyaltyPanel from './PrivateLoyaltyPanel';

vi.mock('@/lib/androidProofService', () => ({ revealAndroidProof: vi.fn() }));

beforeEach(() => useSessionStore.getState().reset());
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
  useSessionStore.getState().setSession({ id: 's1' } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'android', suspicion: null });

  render(<PrivateLoyaltyPanel />);

  expect(screen.getByRole('button', { name: /disclose Android proof/i })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /disclose Android proof/i }));

  await waitFor(() => expect(revealAndroidProof).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('status')).toHaveTextContent(/proof disclosed to the fleet/i);
  expect(screen.queryByRole('button', { name: /disclose Android proof/i })).not.toBeInTheDocument();
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
