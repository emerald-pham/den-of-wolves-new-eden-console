import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GmSetupChecklist } from './GmSetupChecklist';

it('shows one-facilitator setup lanes and keeps local checklist marks outside gameplay state', () => {
  render(
    <GmSetupChecklist
      chartId="B"
      chartLocked
      playerCount={12}
      connectedPlayerCount={12}
      roleAssignmentCount={12}
      setupReceipt={{ playerCount: 12, wolfCount: 1, wolfRule: 'one Wolf', privateCardCount: 1 }}
    />,
  );

  const checklist = screen.getByRole('region', { name: 'Setup checklist' });
  expect(checklist).toHaveTextContent('One facilitator can run the session.');
  expect(checklist).toHaveTextContent('Star chart is selected and ready for the session');
  expect(checklist).toHaveTextContent('Primary facilitator // room, components, teaching, setup, and phase calls.');
  expect(checklist).toHaveTextContent('Assistant help is optional');
  expect(checklist).toHaveTextContent('Chart B // locked');
  expect(checklist).toHaveTextContent('12 players connected');
  expect(checklist).toHaveTextContent('12 roles assigned');
  expect(checklist).toHaveTextContent('Wolf rule // one Wolf // 1 private card');
  expect(checklist).toHaveTextContent('The server validates readiness when Start Production is requested.');

  const room = within(checklist).getByRole('checkbox', { name: 'Room and components are ready' });
  fireEvent.click(room);
  expect(room).toBeChecked();
});
