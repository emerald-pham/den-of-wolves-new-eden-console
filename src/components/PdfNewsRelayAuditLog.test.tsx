import { act, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PdfNewsRelayAuditLog from './PdfNewsRelayAuditLog';
import type { PdfNewsRelayAudit } from '@/lib/firestore';

it('shows the facilitator each P.D.F. relay with its time, Colonel role, group, text and Press hand-off', () => {
  let push: (audits: readonly PdfNewsRelayAudit[] | null) => void = () => undefined;
  const stop = vi.fn();
  const subscribe = vi.fn((_sessionId: string, onAudits: typeof push) => { push = onAudits; return stop; });
  const view = render(<PdfNewsRelayAuditLog sessionId="s1" subscribe={subscribe} />);

  const log = screen.getByRole('region', { name: 'P.D.F. news relay record' });
  expect(within(log).getByText('No P.D.F. Colonel relay has been sent.')).toBeVisible();
  act(() => push([{ requestId: 'relay-1', actorRoleId: 'refinery-124-pdf-colonel', groupId: 'fleet-2', cycle: 4,
    text: 'Raiders sighted near the refinery.', handedToPress: true, createdAt: '2026-11-05T20:00:00.000Z' }]));
  const entry = within(log).getByRole('listitem');
  expect(entry).toHaveTextContent(/cycle 4 \/\/ P\.D\.F\. Colonel \/\/ fleet-2/i);
  expect(entry).toHaveTextContent('Raiders sighted near the refinery.');
  expect(entry).toHaveTextContent(/handed to the Press/i);
  expect(within(entry).getByText((_, element) => element?.tagName === 'TIME')).toHaveAttribute('datetime', '2026-11-05T20:00:00.000Z');
  act(() => push(null));
  expect(within(log).getByRole('status')).toHaveTextContent(/unavailable/i);
  view.unmount();
  expect(stop).toHaveBeenCalledOnce();
  expect(subscribe).toHaveBeenCalledWith('s1', expect.any(Function));
});
