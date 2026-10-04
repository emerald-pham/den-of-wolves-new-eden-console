import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { WolfRangeActionChoiceView } from '@/types/game';
import { WolfRangeActionPanelView } from './WolfRangeActionPanel';

const pendingView: WolfRangeActionChoiceView = {
  type: 'wolf-range-action-choice-view', sessionId: 'session-1', turn: 1, revision: 8,
  currentStep: 'medium-range', range: 'medium-range', choiceStatus: 'pending',
  deadlineAt: '2026-10-03T12:10:00.000Z',
  eligibleActions: [
    { actionId: 'aegis-missile-launchers-medium', sourceId: 'aegis-missile-launchers', range: 'medium-range' },
    { actionId: 'aegis-point-defence-lasers-medium', sourceId: 'aegis-point-defence-lasers', range: 'medium-range' },
  ],
  hitSlots: [],
  contacts: [
    { contactId: 'contact-1', targetShipId: 'aegis', available: true },
    { contactId: 'contact-2', targetShipId: 'dione', available: true },
    { contactId: 'contact-3', targetShipId: 'icebreaker', available: false },
  ],
};

it('requires a deliberate use or pass choice and explains the authoritative deadline', async () => {
  const user = userEvent.setup();
  const onUseActions = vi.fn();
  const onPass = vi.fn();
  render(<WolfRangeActionPanelView view={pendingView} onUseActions={onUseActions} onPass={onPass} onAssignTargets={vi.fn()} />);

  expect(screen.getByText(/no automatic pass is applied at the deadline/i)).toBeInTheDocument();
  expect(screen.getByText('2026-10-03T12:10:00.000Z')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /use selected actions/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /pass this range/i })).toBeEnabled();

  await user.click(screen.getByRole('checkbox', { name: /missile launchers/i }));
  await user.click(screen.getByRole('button', { name: /use selected actions/i }));
  expect(onUseActions).toHaveBeenCalledWith(['aegis-missile-launchers-medium']);
  await user.click(screen.getByRole('button', { name: /pass this range/i }));
  expect(onPass).toHaveBeenCalledTimes(1);
});

it('restores fixed hit counts, hides unavailable contacts, and requires distinct targets per action', async () => {
  const user = userEvent.setup();
  const onAssignTargets = vi.fn();
  render(<WolfRangeActionPanelView
    view={{ ...pendingView, choiceStatus: 'targets-required', hitSlots: [
      { actionId: 'aegis-missile-launchers-medium', count: 2 },
    ] }}
    onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={onAssignTargets}
  />);

  expect(screen.getByText(/dice are already locked/i)).toBeInTheDocument();
  expect(screen.getByText(/2 hits/i)).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /contact-3/i })).not.toBeInTheDocument();
  const first = screen.getByRole('combobox', { name: /missile launchers hit 1/i });
  const second = screen.getByRole('combobox', { name: /missile launchers hit 2/i });
  await user.selectOptions(first, 'contact-1');
  await user.selectOptions(second, 'contact-1');
  expect(screen.getByRole('button', { name: /commit target assignments/i })).toBeDisabled();
  await user.selectOptions(second, 'contact-2');
  await user.click(screen.getByRole('button', { name: /commit target assignments/i }));

  expect(onAssignTargets).toHaveBeenCalledWith([
    { actionId: 'aegis-missile-launchers-medium', contactIds: ['contact-1', 'contact-2'] },
  ]);
  expect(screen.getByText(/targets never cause another roll/i)).toBeInTheDocument();
  expect(first).toBeInTheDocument();
  fireEvent.blur(first);
});

it('commits only distinct live contacts and clearly records over-limit hits as unused', async () => {
  const user = userEvent.setup();
  const onAssignTargets = vi.fn();
  render(<WolfRangeActionPanelView
    view={{ ...pendingView, choiceStatus: 'targets-required', hitSlots: [
      { actionId: 'aegis-missile-launchers-medium', count: 5 },
    ], contacts: [
      { contactId: 'contact-1', targetShipId: 'aegis', available: true },
      { contactId: 'contact-2', targetShipId: 'dione', available: false },
    ] }}
    onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={onAssignTargets}
  />);

  expect(screen.getByLabelText(/missile launchers hit 1/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/missile launchers hit 2/i)).not.toBeInTheDocument();
  expect(screen.getByText(/4 hits have no additional distinct live legal contact/i)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText(/missile launchers hit 1/i), 'contact-1');
  await user.click(screen.getByRole('button', { name: /commit target assignments/i }));

  expect(onAssignTargets).toHaveBeenCalledWith([
    { actionId: 'aegis-missile-launchers-medium', contactIds: ['contact-1'] },
  ]);
});

it('allows an empty assignment only when every target is unavailable', async () => {
  const user = userEvent.setup();
  const onAssignTargets = vi.fn();
  render(<WolfRangeActionPanelView
    view={{ ...pendingView, choiceStatus: 'targets-required', hitSlots: [
      { actionId: 'aegis-point-defence-lasers-medium', count: 2 },
    ], contacts: [{ contactId: 'contact-1', targetShipId: 'aegis', available: false }] }}
    onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={onAssignTargets}
  />);

  expect(screen.getByText(/no live legal contacts remain/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /commit target assignments/i })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /commit target assignments/i }));
  expect(onAssignTargets).toHaveBeenCalledWith([
    { actionId: 'aegis-point-defence-lasers-medium', contactIds: [] },
  ]);
});

it('presents a locked AEGIS fighter Short hit as an automatic target slot', async () => {
  const user = userEvent.setup();
  const onAssignTargets = vi.fn();
  render(<WolfRangeActionPanelView
    view={{ ...pendingView, range: 'short-range', currentStep: 'short-range', choiceStatus: 'targets-required',
      eligibleActions: [
        { actionId: 'aegis-alpha-wing-short-0', sourceId: 'aegis-alpha-wing', range: 'short-range' },
      ],
      hitSlots: [{ actionId: 'aegis-alpha-wing-short-0', count: 1 }],
    }}
    onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={onAssignTargets}
  />);

  expect(screen.getByText('Alpha Fighter Wing // 1 hits')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: /alpha fighter wing hit 1/i }), 'contact-1');
  await user.click(screen.getByRole('button', { name: /commit target assignments/i }));
  expect(onAssignTargets).toHaveBeenCalledWith([
    { actionId: 'aegis-alpha-wing-short-0', contactIds: ['contact-1'] },
  ]);
});

it('keeps a Wing Commander Medium fighter target fixed during EO hit assignment', async () => {
  const user = userEvent.setup();
  const onAssignTargets = vi.fn();
  render(<WolfRangeActionPanelView
    view={{ ...pendingView, choiceStatus: 'targets-required', hitSlots: [
      { actionId: 'aegis-alpha-wing-medium-0', count: 1 },
    ], eligibleActions: [
      { actionId: 'aegis-alpha-wing-medium-0', sourceId: 'aegis-alpha-wing', range: 'medium-range' },
    ] }}
    onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={onAssignTargets}
  />);

  expect(screen.getByText(/target set by the Wing Commander/i)).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  const commit = screen.getByRole('button', { name: /commit target assignments/i });
  expect(commit).toBeEnabled();
  await user.click(commit);
  expect(onAssignTargets).toHaveBeenCalledWith([]);
});

it('guides the EO through remaining Short Wing damage and labels a three-damage Highwall hit', () => {
  const shortView = {
    ...pendingView,
    range: 'short-range' as const,
    currentStep: 'short-range' as const,
    choiceStatus: 'targets-required' as const,
    eligibleActions: [
      { actionId: 'highwall-short-range', sourceId: 'highwall', range: 'short-range' as const },
      { actionId: 'gorgoneion-missile-array-short', sourceId: 'gorgoneion-missile-array', range: 'short-range' as const },
    ],
    hitSlots: [
      { actionId: 'highwall-short-range', count: 1, damagePerHit: 3 },
      { actionId: 'gorgoneion-missile-array-short', count: 2, damagePerHit: 1 },
    ],
    contacts: [
      { contactId: 'contact-1', targetShipId: 'aegis', available: true, requiredCoverageDamage: 2 },
      { contactId: 'contact-2', targetShipId: 'dione', available: true, requiredCoverageDamage: null },
    ],
  } as unknown as WolfRangeActionChoiceView;
  render(<WolfRangeActionPanelView view={shortView} onUseActions={vi.fn()} onPass={vi.fn()} onAssignTargets={vi.fn()} />);

  expect(screen.getByText(/cover first.*2 damage remains/i)).toBeInTheDocument();
  expect(screen.getByText(/available after all fighter wings are covered/i)).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /highwall hit 1/i })).toBeInTheDocument();
  expect(screen.getByText(/highwall cannon.*3 damage per hit/i)).toBeInTheDocument();
});
