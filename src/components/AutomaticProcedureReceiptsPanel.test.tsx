import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import type { GmActionAuditDetail } from '@/lib/firestore';

const mocks = vi.hoisted(() => ({
  subscribeGmActionAuditDetails: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeGmActionAuditDetails: mocks.subscribeGmActionAuditDetails,
}));

import AutomaticProcedureReceiptsPanel from './AutomaticProcedureReceiptsPanel';

const repair: GmActionAuditDetail = {
  requestId: 'repair-1', action: 'blacksmith-repair', actorUid: 'holder', revision: 2,
  resolutionSource: 'server-rules',
  choice: { hostShipId: 'icebreaker', systemIds: ['reactor', 'storage'] },
  result: { status: 'committed', systemIds: ['reactor', 'storage'], materialsRemaining: 1 },
  createdAt: '2026-11-14T12:00:00.000Z',
};

beforeEach(() => {
  mocks.subscribeGmActionAuditDetails.mockReset().mockReturnValue(mocks.stop);
  mocks.stop.mockReset();
});

afterEach(cleanup);

it('shows the facilitator each automatic choice, calculation and committed consequence', () => {
  render(<AutomaticProcedureReceiptsPanel sessionId="s1" isGm />);
  expect(mocks.subscribeGmActionAuditDetails).toHaveBeenCalledWith('s1', expect.any(Function));
  const publish = mocks.subscribeGmActionAuditDetails.mock.calls[0]![1] as
    (details: readonly GmActionAuditDetail[]) => void;

  expect(screen.getByRole('status')).toHaveTextContent('No automatic procedure receipts yet.');
  act(() => publish([repair]));

  const receipt = screen.getByRole('article', { name: /Blacksmith repair/ });
  expect(receipt).toHaveTextContent('server rules');
  expect(receipt).toHaveTextContent('revision 2');
  const choice = within(receipt).getByRole('group', { name: 'Choice' });
  expect(choice).toHaveTextContent('hostShipId');
  expect(choice).toHaveTextContent('icebreaker');
  expect(choice).toHaveTextContent('reactor, storage');
  const result = within(receipt).getByRole('group', { name: 'Committed result' });
  expect(result).toHaveTextContent('materialsRemaining');
  expect(result).toHaveTextContent('1');
});

it('does not open the facilitator receipt read for a non-GM device and stops on unmount', () => {
  const { unmount, rerender } = render(<AutomaticProcedureReceiptsPanel sessionId="s1" isGm={false} />);
  expect(mocks.subscribeGmActionAuditDetails).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Automatic procedure receipts' })).toBeNull();

  rerender(<AutomaticProcedureReceiptsPanel sessionId="s1" isGm />);
  expect(mocks.subscribeGmActionAuditDetails).toHaveBeenCalledTimes(1);
  unmount();
  expect(mocks.stop).toHaveBeenCalledTimes(1);
});

it('tells the committed audit revision apart from the revision a damage reply reports', () => {
  render(<AutomaticProcedureReceiptsPanel sessionId="s1" isGm />);
  const publish = mocks.subscribeGmActionAuditDetails.mock.calls[0]![1] as
    (details: readonly GmActionAuditDetail[]) => void;
  act(() => publish([{
    requestId: 'damage-1', action: 'ship-damage', actorUid: 'gm-1', revision: 1,
    resolutionSource: 'server-random',
    choice: { shipId: 'aegis' },
    result: { card: { card: '10♥', systemId: 'reactor' }, destroyed: false, turn: 3, revision: 0 },
  }]));

  const receipt = screen.getByRole('article', { name: /Ship damage/ });
  expect(receipt).toHaveTextContent('committed revision 1');
  const result = within(receipt).getByRole('group', { name: 'Committed result' });
  expect(within(result).getByText('reply revision').nextElementSibling).toHaveTextContent('0');
  expect(within(result).getByText('cycle').nextElementSibling).toHaveTextContent('3');
  expect(result).not.toHaveTextContent(/\bturn\b/);
});
