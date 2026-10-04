import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { defineShuttle } from '@/data/vessels/templates';
import { SHUTTLECRAFT } from '@/data/shuttles';
import ShuttleConsoleTemplate from './ShuttleConsoleTemplate';

const shuttleControlMocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('./ShuttleControl', () => ({
  default: () => {
    shuttleControlMocks.render();
    return null;
  },
}));

vi.mock('./PressConfetti', () => ({ default: () => <section aria-label="Newspaper confetti dispenser" /> }));
vi.mock('./PressDispatch', () => ({ default: () => <section aria-label="Press dispatch desk" /> }));
vi.mock('./MacawRepairPanel', () => ({ default: () => <section aria-label="Macaw repair controls" /> }));
vi.mock('./BoaRecyclingPanel', () => ({ default: () => <section aria-label="Boa recycling controls" /> }));
vi.mock('@/components/WolfAttackAftermathActionPanel', () => ({
  default: ({ operator }: { operator: { shuttleId: string } }) => <section aria-label={`${operator.shuttleId} aftermath controls`} />,
}));

it('renders a second craft through the base with its own identity and opt-in equipment', () => {
  const shuttle = defineShuttle({
    id: 'test-shuttle', name: 'Test Shuttle', shortName: 'Test', consoleName: 'Survey Console',
    operator: 'Survey Fleet', operatorShort: 'SURVEY', vesselType: 'Survey shuttle',
    description: 'Surveys the fleet.', captainRoleId: 'test-captain',
    operations: [{ name: 'Launch', phase: 'Team', effect: 'Depart only when cleared.' }],
  });
  const { rerender } = render(<MemoryRouter><ShuttleConsoleTemplate
    shuttle={shuttle} captainName="Survey Officer" canLeave={true}
  /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Survey Console' })).toBeInTheDocument();
  expect(screen.getByText('Printed shuttle procedures // Resolve outcomes with the facilitator and crew')).toBeVisible();
  expect(screen.getByText('Survey Officer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent('In transit');
  expect(screen.getByText('Airspace closed')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Leave shuttle' })).toHaveAttribute('href', '/console');
  expect(screen.queryByText('SNN')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Newspaper confetti dispenser' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
  rerender(<MemoryRouter><ShuttleConsoleTemplate
    shuttle={{ ...shuttle, capabilities: ['newspaper-confetti'] }} captainName="Survey Officer"
    canLeave={true} docking={{ shuttleId: shuttle.id, shipId: 'dione', dockedAt: 'NOW' }}
  /></MemoryRouter>);
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent('Docked // Dione');
  expect(screen.getByRole('region', { name: 'Newspaper confetti dispenser' })).toBeInTheDocument();
});

it.each(['snn-press-shuttle', 'survey-shuttle'])('places %s role capabilities in the main ship gameplay workspace', id => {
  const shuttle = defineShuttle({
    id, name: 'Test Shuttle', shortName: 'Test', consoleName: 'Test Console',
    operator: 'Test Fleet', operatorShort: 'TEST', vesselType: 'Shuttle',
    description: 'Test craft.', captainRoleId: 'test-captain',
    capabilities: ['press-dispatches', 'newspaper-confetti'],
  });
  render(<MemoryRouter><ShuttleConsoleTemplate shuttle={shuttle} captainName="Test Captain" canLeave={true} /></MemoryRouter>);
  expect(screen.getByRole('main')).toHaveClass('ship-console--gameplay');
  const identity = screen.getByRole('region', { name: 'Test Console' });
  const workspace = within(identity).getByRole('region', { name: 'Test Captain console' });
  expect(within(workspace).getByRole('region', { name: 'Press dispatch desk' })).toBeInTheDocument();
  const instruments = screen.getByRole('complementary', { name: 'Test Console instruments' });
  expect(within(instruments).queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
  expect(within(instruments).getByRole('region', { name: 'Newspaper confetti dispenser' })).toBeInTheDocument();
  expect(within(instruments).getByRole('region', { name: 'Shuttle systems' })).toBeInTheDocument();
});

it('renders a printed shuttle’s operational sheet through the shared ship workspace', () => {
  const shuttle = SHUTTLECRAFT.find((craft) => craft.id === 'hummingbird')!;

  render(<MemoryRouter><ShuttleConsoleTemplate
    shuttle={shuttle} captainName="Explorer" canLeave={true}
    docking={{ shuttleId: shuttle.id, shipId: 'quellon', dockedAt: 'SESSION START' }}
    fuelled={true}
  /></MemoryRouter>);

  const workspace = screen.getByRole('region', { name: 'Explorer console' });
  expect(workspace).toHaveClass('shuttle-console__workspace');
  expect(within(workspace).getByRole('heading', { name: /hummingbird operations/i })).toBeInTheDocument();
  expect(within(workspace).getByRole('heading', { name: 'Scout system' })).toBeInTheDocument();
  expect(within(workspace).getByText(/within 3 jumps of quellon/i)).toBeInTheDocument();
  expect(within(workspace).getByText(/resource harvesting/i)).toBeInTheDocument();
  expect(within(workspace).getAllByText('Airspace open')).toHaveLength(2);
  expect(within(workspace).getByText('Fuelled this cycle')).toBeInTheDocument();
  expect(within(workspace).queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
});

it.each(['macaw', 'boa'] as const)('mounts %s aftermath Scrap collection only in the live shuttle workspace', async (id) => {
  const shuttle = SHUTTLECRAFT.find((craft) => craft.id === id)!;
  render(<MemoryRouter><ShuttleConsoleTemplate shuttle={shuttle} captainName="Recycler" canLeave={false}
    control={{ shuttleId: id, holderUid: 'captain' } as never}
    docking={{ shuttleId: id, shipId: 'capybara', dockedAt: 'SESSION START' }}
  /></MemoryRouter>);

  expect(await screen.findByRole('region', { name: `${id} aftermath controls` })).toBeInTheDocument();
});

it('renders a presentation-only shuttle control snapshot without mounting live controls', () => {
  const shuttle = defineShuttle({
    id: 'review-shuttle', name: 'Review Shuttle', shortName: 'Review', consoleName: 'Review Console',
    operator: 'Review Fleet', operatorShort: 'REVIEW', vesselType: 'Review shuttle',
    description: 'Presents a prepared operational snapshot.', captainRoleId: 'review-captain',
  });
  const controlPreview = {
    holderLabel: 'Explorer',
    locationLabel: 'Docked // Quellon',
    movement: {
      actionLabel: 'Request departure', status: 'pending',
      message: 'Departure request is awaiting the server.',
    },
    cargo: {
      actionLabel: 'Load food', status: 'stale',
      message: 'Cargo state changed. Review before sending a fresh request.',
    },
    service: {
      actionLabel: 'Recharge console', status: 'committed',
      message: 'Recharge receipt confirmed for this host.',
    },
  } as const;
  shuttleControlMocks.render.mockClear();
  render(<MemoryRouter><ShuttleConsoleTemplate
    shuttle={shuttle} captainName="Explorer" canLeave={false}
    control={{ shuttleId: shuttle.id, holderUid: 'synthetic-holder' } as never}
    controlPreview={controlPreview}
  /></MemoryRouter>);

  const preview = screen.getByRole('region', { name: 'Shuttle control preview' });
  expect(within(preview).getByText('Current holder // Explorer')).toBeVisible();
  expect(within(preview).getByText('Shuttle location // Docked // Quellon')).toBeVisible();
  expect(within(preview).getByText('Departure request is awaiting the server.')).toBeVisible();
  expect(within(preview).getByText('Cargo state changed. Review before sending a fresh request.')).toBeVisible();
  expect(within(preview).getByText('Recharge receipt confirmed for this host.')).toBeVisible();
  expect(within(preview).getByRole('button', { name: 'Request departure' })).toBeDisabled();
  expect(within(preview).getByRole('button', { name: 'Load food' })).toBeDisabled();
  expect(within(preview).getByRole('button', { name: 'Recharge console' })).toBeDisabled();
  expect(within(preview).getByText('Review view only. No shuttle action is sent.')).toBeVisible();
  expect(shuttleControlMocks.render).not.toHaveBeenCalled();
});
