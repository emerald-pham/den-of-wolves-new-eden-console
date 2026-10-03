import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GmScoutRevealPanel, ScoutResultPanel } from './ScoutResultPanels';

const report = {
  requestId: 'scout-1', cycle: 4, entitlementId: 'endeavour' as const,
  targetCoordinate: '0408', status: 'pending' as const, noteId: null,
};
const result = {
  type: 'private-scout-result' as const, sessionId: 's1', requestId: 'scout-1',
  requesterUid: 'scientist', sourceId: 'endeavour' as const, cycle: 4,
  targetCoordinate: '0408', systemFact: { coordinate: '0408', code: 'O', title: 'Deep Nebula' },
};

describe('scout result presentational panels', () => {
  it('shows a pending Scientist request without a chart fact', () => {
    render(<ScoutResultPanel report={report} />);
    expect(screen.getByRole('region', { name: 'Endeavour scout report' })).toHaveTextContent('Cycle 4');
    expect(screen.getByText(/awaiting automatic scout result/i)).toBeVisible();
    expect(screen.queryByText('Deep Nebula')).not.toBeInTheDocument();
  });

  it('shows one private fact, a durable note, and a nonnumeric Nebula hint', () => {
    render(<ScoutResultPanel report={{ ...report, status: 'resolved', noteId: 'note-1' }}
      result={result} note={{ type: 'player-discovery-note', id: 'note-1', cycle: 4,
        targetCoordinate: '0408', systemFact: result.systemFact,
        recordedAt: '2026-09-27T21:40:00.000Z' }} />);
    const panel = screen.getByRole('region', { name: 'Endeavour scout report' });
    expect(panel).toHaveTextContent('0408');
    expect(panel).toHaveTextContent('Deep Nebula');
    expect(panel).toHaveTextContent(/discovery note saved/i);
    expect(panel).toHaveTextContent(/scouting recorded/i);
    expect(panel.textContent).not.toMatch(/\+\d|modifier|accrued bonus/i);
  });

  it('shows GM pending coordinates with a one-request reveal action', () => {
    const onReveal = vi.fn();
    render(<GmScoutRevealPanel requests={[{ requestId: 'scout-1', cycle: 4,
      entitlementId: 'endeavour', anchorShipId: 'shepherd', targetCoordinate: '0408' }]}
      onReveal={onReveal} />);
    expect(screen.getByRole('region', { name: 'GM scout reveals' })).toHaveTextContent('0408');
    fireEvent.click(screen.getByRole('button', { name: /reveal endeavour scout at 0408/i }));
    expect(onReveal).toHaveBeenCalledWith('scout-1');
    expect(screen.queryByText('Deep Nebula')).not.toBeInTheDocument();
  });
});
