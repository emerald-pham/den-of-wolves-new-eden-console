import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { WolfBoardingDefenceChoiceView } from '@/types/game';
import { WolfBoardingDefencePanelView } from './WolfBoardingDefencePanel';

const pending: WolfBoardingDefenceChoiceView = {
  type: 'wolf-boarding-defence-choice-view', sessionId: 's1', turn: 1, revision: 12,
  targetShipId: 'aegis', boardingParties: 3, availableSecurityTeams: 2,
  choiceStatus: 'pending', deadlineAt: '2026-10-03T12:10:00.000Z',
};

it('requires a real target-crew choice from zero through current Security Team inventory', async () => {
  const user = userEvent.setup();
  const onChoose = vi.fn();
  render(<WolfBoardingDefencePanelView view={pending} onChoose={onChoose} />);

  expect(screen.getByText(/3 surviving boarding parties/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /commit defence/i })).toBeDisabled();
  const choice = screen.getByRole('combobox', { name: /security teams committed/i });
  expect(choice).toHaveDisplayValue('');
  expect(screen.getByRole('option', { name: '0 teams' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '2 teams' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '3 teams' })).not.toBeInTheDocument();

  await user.selectOptions(choice, '0');
  await user.click(screen.getByRole('button', { name: /commit defence/i }));
  expect(onChoose).toHaveBeenCalledWith(0);
});

it('shows the committed defence after reconnect without reopening the choice', () => {
  render(<WolfBoardingDefencePanelView
    view={{ ...pending, choiceStatus: 'committed', chosenSecurityTeams: 2 }}
    onChoose={vi.fn()}
  />);

  expect(screen.getByText(/2 security teams committed/i)).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /commit defence/i })).not.toBeInTheDocument();
});
