import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import PrivateLoyaltyPanel from './PrivateLoyaltyPanel';

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

it('renders no panel before the entitled secret hydrates', () => {
  render(<PrivateLoyaltyPanel />);
  expect(screen.queryByRole('region', { name: /private loyalty card/i })).not.toBeInTheDocument();
});
