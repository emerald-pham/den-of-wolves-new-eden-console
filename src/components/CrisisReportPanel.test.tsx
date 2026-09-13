import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { CrisisReport } from '@/types/crisis';
import CrisisReportPanel from './CrisisReportPanel';
const subscribers = vi.hoisted(() => ({ callbacks: [] as ((report: CrisisReport | null) => void)[], stop: vi.fn() }));
vi.mock('@/lib/firestore', () => ({ subscribeCrisisReport: vi.fn((_id: string, callback: (report: CrisisReport | null) => void) => {
  subscribers.callbacks.push(callback); return subscribers.stop;
}) }));
const report: CrisisReport = { sessionId: 's1', crisisId: 'vessel-1', state: 'delivered', revision: 2, title: 'Approaching vessel', body: 'A Gliese scout reported a vessel needing help.' };
function identity(id: string, uid = 'u1') {
  useSessionStore.getState().setIdentity({ id, name: 'Table', joinCode: '1234', phase: 'active', ownerUid: 'gm', createdAt: '', updatedAt: '' },
    { uid, sessionId: id, displayName: 'Crew', role: 'player', seatId: null, joinedAt: '' });
}
beforeEach(() => { subscribers.callbacks = []; subscribers.stop.mockClear(); identity('s1'); });
it('shows the delivered report with accessible persistent read and hide controls', () => {
  render(<CrisisReportPanel />);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  act(() => subscribers.callbacks[0]!(report));
  expect(screen.getByRole('region', { name: 'Fleet crisis report' })).toHaveTextContent(report.body);
  expect(screen.getByRole('status')).toHaveTextContent('delivered');
  fireEvent.click(screen.getByRole('button', { name: 'Hide report' }));
  expect(screen.queryByText(report.body)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read report' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Read report' }));
  expect(screen.getByText(report.body)).toBeVisible();
  act(() => subscribers.callbacks[0]!({ ...report, state: 'closed' }));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
it('clears the former identity immediately and ignores its delayed callbacks', () => {
  render(<CrisisReportPanel />);
  act(() => subscribers.callbacks[0]!(report));
  act(() => identity('s2', 'u2'));
  expect(subscribers.stop).toHaveBeenCalledOnce();
  expect(screen.queryByText(report.body)).not.toBeInTheDocument();
  act(() => subscribers.callbacks[0]!(report));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  act(() => subscribers.callbacks[1]!({ ...report, sessionId: 's2', crisisId: 'vessel-2' }));
  expect(screen.getByText(report.body)).toBeVisible();
  act(() => subscribers.callbacks[1]!(null));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
