import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { WolfFighterRangeActionPanelView } from './WolfFighterRangeActionPanel';

const mediumView = {
  type: 'wolf-fighter-range-action-view', sessionId: 's1', attackId: 'wolf-1', turn: 1,
  revision: 4, wingId: 'fighter-wing-alpha', wingLabel: 'Fighter Wing Alpha',
  range: 'medium-range', choiceStatus: 'pending',
  fighters: [{ fighterIndex: 0 }, { fighterIndex: 1 }],
  targets: [
    { instanceId: 'roster-a', label: 'AEGIS', targetNumber: 1 },
    { instanceId: 'roster-b', label: 'Dione', targetNumber: 4 },
  ],
} as const;

it('requires each Medium fighter to choose one attack or target shift', async () => {
  const user = userEvent.setup();
  const onResolveMedium = vi.fn();
  render(<WolfFighterRangeActionPanelView view={mediumView}
    onResolveMedium={onResolveMedium} onResolveShort={vi.fn()} />);

  expect(screen.getByText(/for each fighter you commit, choose one attack or one target shift/i)).toBeVisible();
  const submit = screen.getByRole('button', { name: /resolve medium actions/i });
  expect(submit).toBeDisabled();

  await user.selectOptions(screen.getByLabelText('Fighter 1 action'), 'attack');
  await user.selectOptions(screen.getByLabelText('Fighter 1 target'), 'roster-b');
  await user.selectOptions(screen.getByLabelText('Fighter 2 action'), 'target-shift');
  await user.selectOptions(screen.getByLabelText('Fighter 2 target'), 'roster-a');
  await user.selectOptions(screen.getByLabelText('Fighter 2 shift'), '1');
  expect(submit).toBeEnabled();
  await user.click(submit);

  expect(onResolveMedium).toHaveBeenCalledWith([
    { fighterIndex: 0, kind: 'attack', targetInstanceId: 'roster-b' },
    { fighterIndex: 1, kind: 'target-shift', targetInstanceId: 'roster-a', targetNumber: 1, shift: 1 },
  ]);
});

it('allows a wing commander to commit only the fighters selected for Medium Range', async () => {
  const user = userEvent.setup();
  const onResolveMedium = vi.fn();
  render(<WolfFighterRangeActionPanelView view={mediumView}
    onResolveMedium={onResolveMedium} onResolveShort={vi.fn()} />);

  await user.selectOptions(screen.getByLabelText('Fighter 1 action'), 'attack');
  await user.selectOptions(screen.getByLabelText('Fighter 1 target'), 'roster-b');
  await user.click(screen.getByRole('button', { name: /resolve medium actions/i }));
  expect(onResolveMedium).toHaveBeenCalledWith([
    { fighterIndex: 0, kind: 'attack', targetInstanceId: 'roster-b' },
  ]);
});

it('lets the wing commander choose which fighters risk a Short Range roll', async () => {
  const user = userEvent.setup();
  const onResolveShort = vi.fn();
  render(<WolfFighterRangeActionPanelView view={{ ...mediumView, range: 'short-range' }}
    onResolveMedium={vi.fn()} onResolveShort={onResolveShort} />);

  expect(screen.getByText(/choose up to one die per fighter/i)).toBeVisible();
  expect(screen.getByText(/3\+ deals one damage/i)).toBeVisible();
  expect(screen.getByText(/1 or 2 destroys the fighter that rolled it/i)).toBeVisible();
  await user.click(screen.getByRole('checkbox', { name: /fighter 1 short attack/i }));
  await user.click(screen.getByRole('checkbox', { name: /fighter 2 short attack/i }));
  await user.click(screen.getByRole('button', { name: /resolve selected short attacks/i }));
  expect(onResolveShort).toHaveBeenCalledWith([0, 1]);
});

it('allows an explicit zero-fighter Short Range pass', async () => {
  const user = userEvent.setup();
  const onResolveShort = vi.fn();
  render(<WolfFighterRangeActionPanelView view={{ ...mediumView, range: 'short-range' }}
    onResolveMedium={vi.fn()} onResolveShort={onResolveShort} />);

  await user.click(screen.getByRole('button', { name: /pass short range/i }));
  expect(onResolveShort).toHaveBeenCalledWith([]);
});

it('offers an explicit Medium Range pass to decline all fighter actions', async () => {
  const user = userEvent.setup();
  const onResolveMedium = vi.fn();
  render(<WolfFighterRangeActionPanelView view={mediumView}
    onResolveMedium={onResolveMedium} onResolveShort={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: /pass medium range/i }));
  expect(onResolveMedium).toHaveBeenCalledWith([]);
});
