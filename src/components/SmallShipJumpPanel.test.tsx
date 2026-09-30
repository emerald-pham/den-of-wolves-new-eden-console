import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { SmallShipJumpWorkspaceProjection } from '@/lib/smallShipJumpService';
import SmallShipJumpPanel from './SmallShipJumpPanel';

const coordinationProjection: SmallShipJumpWorkspaceProjection = {
  viewer: 'captain',
  sessionId: 'panel-sample',
  smallShipId: 'gorgoneion',
  hostShipId: 'aegis',
  currentCoordinate: '0000',
  movementRevision: 2,
  dockingRevision: 3,
  currentTurn: 4,
  phase: 'coordination',
  cycleRevision: 8,
  cycleStep: 4,
  cycleTurn: 4,
  cycleCharges: ['missile-array', 'jump-drive'],
  charged: true,
  hostFuel: 5,
  knownDestinations: [
    { coordinate: '5143', length: 'short', fuelCost: 1 },
    { coordinate: '1413', length: 'medium', fuelCost: 1 },
  ],
  arrivalCoordinates: ['0000'],
};

function renderPanel(overrides: Partial<Parameters<typeof SmallShipJumpPanel>[0]> = {}) {
  const onDestinationChange = vi.fn();
  const onJump = vi.fn();
  const onRefresh = vi.fn();
  render(
    <SmallShipJumpPanel
      smallShipId="gorgoneion"
      projection={coordinationProjection}
      selectedDestination=""
      loading={false}
      busy={false}
      onDestinationChange={onDestinationChange}
      onCharge={vi.fn()}
      onRetryCharge={vi.fn()}
      onJump={onJump}
      onRetryJump={vi.fn()}
      onRefresh={onRefresh}
      {...overrides}
    />,
  );
  return { onDestinationChange, onJump, onRefresh };
}

it('limits route choices to the Captain projection and requires a selected known route', () => {
  const { onDestinationChange, onJump } = renderPanel();
  const workspace = screen.getByRole('region', { name: 'Small-craft Jump Drive workspace' });
  const route = within(workspace).getByRole('combobox', { name: 'Known destination' });

  expect(within(route).getAllByRole('option').map((option) => option.textContent)).toEqual([
    'Select a known destination',
    '5143 // short // 1 host fuel',
    '1413 // medium // 1 host fuel',
  ]);
  expect(within(route).queryByRole('option', { name: /9997/ })).not.toBeInTheDocument();
  expect(within(workspace).getByRole('button', { name: 'Execute jump' })).toBeDisabled();

  fireEvent.change(route, { target: { value: '5143' } });
  expect(onDestinationChange).toHaveBeenCalledWith('5143');
  renderPanel({ selectedDestination: '5143' });
  expect(screen.getAllByRole('button', { name: 'Execute jump' }).at(-1)).toBeEnabled();
  expect(onJump).not.toHaveBeenCalled();
});

it('shows Team Phase readiness and withholds charge when the cycle is full', () => {
  const teamProjection: SmallShipJumpWorkspaceProjection = {
    ...coordinationProjection,
    phase: 'team',
    charged: false,
    cycleCharges: ['missile-array'],
  };
  const onCharge = vi.fn();
  renderPanel({ projection: teamProjection, onCharge });
  expect(screen.getByRole('button', { name: 'Charge Jump Drive' })).toBeEnabled();

  renderPanel({
    projection: { ...teamProjection, cycleCharges: ['missile-array', 'communications-array'] },
    onCharge,
  });
  const workspaces = screen.getAllByRole('region', { name: 'Small-craft Jump Drive workspace' });
  expect(within(workspaces.at(-1)!).queryByRole('button', { name: 'Charge Jump Drive' })).not.toBeInTheDocument();
  expect(onCharge).not.toHaveBeenCalled();
});

it('keeps uncertain charge and movement recovery as explicit retry actions', () => {
  const onRetryCharge = vi.fn();
  const onRetryJump = vi.fn();
  renderPanel({ pendingCharge: true, pendingJump: true, onRetryCharge, onRetryJump });
  const workspace = screen.getByRole('region', { name: 'Small-craft Jump Drive workspace' });

  expect(within(workspace).getByRole('button', { name: 'Retry exact charge' })).toBeEnabled();
  expect(within(workspace).getByRole('combobox', { name: 'Known destination' })).toBeDisabled();
  expect(within(workspace).getByRole('button', { name: 'Retry exact jump' })).toBeEnabled();
  fireEvent.click(within(workspace).getByRole('button', { name: 'Retry exact charge' }));
  fireEvent.click(within(workspace).getByRole('button', { name: 'Retry exact jump' }));
  expect(onRetryCharge).toHaveBeenCalledOnce();
  expect(onRetryJump).toHaveBeenCalledOnce();
});

it('presents a detached arrival and keeps stale-origin refresh as an explicit view action', () => {
  const { onRefresh } = renderPanel({
    projection: {
      ...coordinationProjection,
      hostShipId: null,
      currentCoordinate: '5143',
      hostFuel: null,
      arrivalCoordinates: ['0000', '5143'],
      knownDestinations: [],
    },
    resultMessage: 'STALE SAMPLE // The host position changed. Refresh before selecting another route.',
  });
  const workspace = screen.getByRole('region', { name: 'Small-craft Jump Drive workspace' });
  expect(within(workspace).getByText('Detached')).toBeVisible();
  expect(within(workspace).getByText('5143', { exact: true })).toBeVisible();
  expect(within(workspace).getByText(/successful jump detaches/i)).toBeVisible();
  fireEvent.click(within(workspace).getByText('Arrival knowledge recorded for this Captain'));
  expect(within(workspace).getByText(/0000 \/\/ 5143/)).toBeVisible();
  fireEvent.click(within(workspace).getByRole('button', { name: 'Refresh movement projection' }));
  expect(onRefresh).toHaveBeenCalledOnce();
});
