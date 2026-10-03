import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { WolfForceFieldChoiceView } from '@/types/game';
import { WolfForceFieldChoicePanelView } from './WolfForceFieldChoicePanel';

const pending: WolfForceFieldChoiceView = {
  type: 'wolf-force-field-choice-view', sessionId: 'session-1', turn: 1, revision: 5,
  attackId: 'attack-1', hostShipId: 'aegis', dockingRevision: 2, fleetGroupId: 'fleet-1',
  choiceStatus: 'pending', targetShipIds: ['aegis', 'dione'], deadlineAt: '2026-10-03T12:10:00.000Z',
};

it('requires the Captain to choose a current group target or explicitly pass before targeting', async () => {
  const user = userEvent.setup();
  const onChoose = vi.fn();
  const onPass = vi.fn();
  render(<WolfForceFieldChoicePanelView view={pending} onChoose={onChoose} onPass={onPass} />);

  expect(screen.getByText(/before targeting rolls are exposed/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /protect selected ship/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /pass force field/i })).toBeEnabled();
  expect(screen.getByText('2026-10-03T12:10:00.000Z')).toBeInTheDocument();
  expect(screen.queryByText(/dice|composition|facilitator notes/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole('radio', { name: /aegis/i }));
  await user.click(screen.getByRole('button', { name: /protect selected ship/i }));
  expect(onChoose).toHaveBeenCalledWith('aegis');
  await user.click(screen.getByRole('button', { name: /pass force field/i }));
  expect(onPass).toHaveBeenCalledTimes(1);
});

it('shows committed use and pass as final while keeping a disconnected choice pending', () => {
  const { rerender } = render(<WolfForceFieldChoicePanelView view={pending} onChoose={vi.fn()} onPass={vi.fn()} />);
  expect(screen.getByText(/choice is still pending/i)).toBeInTheDocument();

  rerender(<WolfForceFieldChoicePanelView view={{ ...pending, choiceStatus: 'selected', targetShipId: 'dione' }}
    onChoose={vi.fn()} onPass={vi.fn()} />);
  expect(screen.getByText(/force field protects dione/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /protect selected ship/i })).not.toBeInTheDocument();

  rerender(<WolfForceFieldChoicePanelView view={{ ...pending, choiceStatus: 'passed', targetShipId: null }}
    onChoose={vi.fn()} onPass={vi.fn()} />);
  expect(screen.getByText(/captain recorded a pass/i)).toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
