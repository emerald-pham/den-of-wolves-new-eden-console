import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EndeavourEcmDeviceView } from './EndeavourEcmDeviceView';

it('renders synthetic ready, working, successful, and spent states', () => {
  const { rerender } = render(
    <EndeavourEcmDeviceView state={{ status: 'ready', groupId: 'fleet-9', pursuit: 8 }} />,
  );
  expect(screen.getByText('Status: Ready')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Use ECM Device' })).toBeDisabled();

  rerender(<EndeavourEcmDeviceView state={{ status: 'working', groupId: 'fleet-9', pursuit: 8 }} />);
  expect(screen.getByText('Status: Working')).toBeVisible();

  rerender(<EndeavourEcmDeviceView state={{
    status: 'successful', groupId: 'fleet-9', pursuitBefore: 8, pursuitAfter: 5,
  }} />);
  expect(screen.getByText('Successful: Shepherd group pursuit reduced from 8 to 5.')).toBeVisible();

  rerender(<EndeavourEcmDeviceView state={{
    status: 'spent', groupId: 'fleet-9', pursuitBefore: 8, pursuitAfter: 5,
  }} />);
  expect(screen.getByText('ECM Device spent; Shepherd group pursuit changed from 8 to 5.')).toBeVisible();
});
