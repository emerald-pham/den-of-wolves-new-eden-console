import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { PressLogEntry } from '@/lib/pressLogState';
import { PressEventLogView } from './PressEventLog';
import { PressDispatchDesk } from './PressDispatchDesk';

it('renders synthetic Press intake and routes desk actions only through supplied callbacks', () => {
  const onTextChange = vi.fn();
  const onPublish = vi.fn();
  const onDismiss = vi.fn();
  const syntheticEntries: readonly PressLogEntry[] = [{
    id: 'demo', type: 'president-action', sourceId: 'demo:president',
    actionKind: 'address', text: 'Synthetic presidential address.', cycle: 2,
    recordedAt: '2026-09-27T21:00:00.000Z',
  }];

  render(
    <PressDispatchDesk
      operatorShort="SNN"
      dispatches={[{ id: 'dispatch-demo', text: 'Synthetic live ticker item.' }]}
      text=""
      authorized
      connectionReady
      sending={false}
      dismissingId={null}
      notice="Review scene"
      status="SIMULATION // NO SERVER CONNECTION"
      eventLog={<PressEventLogView entries={syntheticEntries} status="" />}
      onTextChange={onTextChange}
      onPublish={onPublish}
      onDismiss={onDismiss}
    />,
  );

  fireEvent.change(screen.getByLabelText('Dispatch'), { target: { value: 'Synthetic new dispatch.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish dispatch' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss dispatch: Synthetic live ticker item.' }));

  expect(screen.getByText('Synthetic presidential address.')).toBeInTheDocument();
  expect(screen.getByText('SIMULATION // NO SERVER CONNECTION')).toBeInTheDocument();
  expect(onTextChange).toHaveBeenCalledWith('Synthetic new dispatch.');
  expect(onPublish).toHaveBeenCalledOnce();
  expect(onDismiss).toHaveBeenCalledWith('dispatch-demo');
});
