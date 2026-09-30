import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AwayMissionLifecyclePanel, { type AwayMissionLifecyclePanelProps } from './AwayMissionLifecyclePanel';

const basePublicMission = {
  missionId: 'mission-1',
  groupId: 'fleet-1',
  siteCode: 'D',
  revision: 3,
  phase: 'assignment-ready' as const,
  status: 'active' as const,
  overrun: false,
  missionLeaderUid: 'alice',
  participantCount: 2,
  opportunities: [
    { id: 'D-1', label: 'Kitchen supplies' },
    { id: 'D-2', label: 'Engineering supplies' },
  ],
  requestCounts: [{ participantUid: 'bob', count: 1 }],
  outcomes: null,
  rewards: null,
  custody: { status: 'mission-leader' as const, holderUid: 'alice', shipId: null },
  legalDropOffShipIds: ['aegis'],
};

const privateHand = {
  missionId: 'mission-1',
  participantUid: 'bob',
  revision: 3,
  phase: 'assignment-ready' as const,
  cards: [
    { id: '10♦', value: 10, status: 'discarded' as const, opportunityId: null },
    { id: 'A♥', value: 10, status: 'remaining' as const, opportunityId: null },
  ],
};

function renderPanel(overrides: Record<string, unknown> = {}) {
  const actions = {
    requestExtraCards: vi.fn().mockResolvedValue(undefined),
    distributeExtraCard: vi.fn().mockResolvedValue(undefined),
    openDiscards: vi.fn().mockResolvedValue(undefined),
    discardCard: vi.fn().mockResolvedValue(undefined),
    assignCards: vi.fn().mockResolvedValue(undefined),
    addFacilitatorCards: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(undefined),
    dropOff: vi.fn().mockResolvedValue(undefined),
  };
  const props = {
    actorUid: 'bob',
    isGm: false,
    isMissionLeader: false,
    publicState: basePublicMission,
    privateState: privateHand,
    actions,
    ...overrides,
  };
  render(<AwayMissionLifecyclePanel {...props as unknown as AwayMissionLifecyclePanelProps} />);
  return actions;
}

describe('AwayMissionLifecyclePanel', () => {
  it('lets a participant see and discard only their own hand and submit every remaining placement', async () => {
    const actions = renderPanel();
    const panel = screen.getByRole('region', { name: 'Away mission // mission-1' });
    expect(within(panel).getByText('A♥')).toBeInTheDocument();
    expect(within(panel).queryByText('10♥')).not.toBeInTheDocument();
    expect(within(panel).getAllByRole('status').some((status) => /private discard recorded/i.test(status.textContent ?? ''))).toBe(true);

    await act(async () => {
      fireEvent.change(within(panel).getByLabelText('Opportunity for A♥'), { target: { value: 'D-1' } });
      fireEvent.click(within(panel).getByRole('button', { name: 'Submit mission assignments' }));
      await Promise.resolve();
    });
    expect(actions.assignCards).toHaveBeenCalledWith([
      { cardId: 'A♥', opportunityId: 'D-1' },
    ]);
  });

  it('lets a participant privately discard one of their own cards during the discard phase', async () => {
    const actions = renderPanel({
      publicState: { ...basePublicMission, phase: 'discarding' },
      privateState: {
        ...privateHand,
        phase: 'discarding',
        cards: [{ id: 'A♥', value: 10, status: 'remaining', opportunityId: null }],
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard A♥ secretly' }));
      await Promise.resolve();
    });
    expect(actions.discardCard).toHaveBeenCalledWith('A♥');
  });

  it('shows a leader request count without a reason or another participant card value', () => {
    renderPanel({
      actorUid: 'alice', isMissionLeader: true, privateState: null,
      publicState: { ...basePublicMission, phase: 'awaiting-card-selection' },
    });
    const panel = screen.getByRole('region', { name: 'Away mission // mission-1' });
    expect(within(panel).getByText('bob // requested 1 extra card')).toBeInTheDocument();
    expect(within(panel).queryByText(/reason|10♦|A♥/i)).not.toBeInTheDocument();
    expect(within(panel).getByLabelText('Participant for extra card')).toBeInTheDocument();
  });

  it('gives the facilitator readiness and resolution controls without exposing private hands', () => {
    renderPanel({
      actorUid: 'gm', isGm: true, isMissionLeader: false, privateState: null,
      publicState: { ...basePublicMission, phase: 'assignments-complete' },
    });
    const panel = screen.getByRole('region', { name: 'Away mission // mission-1' });
    expect(within(panel).getByRole('button', { name: 'Add facilitator cards' })).toBeInTheDocument();
    expect(within(panel).queryByText('10♦')).not.toBeInTheDocument();
    expect(within(panel).queryByText('A♥')).not.toBeInTheDocument();
  });

  it('shows resolved outcome and one legal reward drop-off, with responsive and reduced-motion styles', () => {
    renderPanel({
      actorUid: 'alice', isMissionLeader: true, privateState: null,
      publicState: {
        ...basePublicMission,
        status: 'resolved', phase: 'resolved',
        outcomes: [{ opportunityId: 'D-1', total: 20, outcome: 'critical-success' }],
        rewards: [{ opportunityId: 'D-1', resources: { food: 11, water: 9 } }],
        specialRewards: [{ opportunityId: 'D-1', resources: { food: 2, materials: 1 } }],
      },
    });
    const panel = screen.getByRole('region', { name: 'Away mission // mission-1' });
    expect(within(panel).getByText(/critical success/i)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Drop mission rewards at selected ship' })).toBeInTheDocument();
    expect(within(panel).getByRole('option', { name: 'AEGIS' })).toBeInTheDocument();
    expect(within(panel).getByText(/Reclamator salvage \/\/ food 2 \/\/ materials 1/i)).toBeInTheDocument();

    const css = document.querySelector('style[data-away-mission-lifecycle]')?.textContent ?? '';
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).toMatch(/min-width:\s*320px|@media\s*\(max-width/);
  });
});
