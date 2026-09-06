import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { defineShuttle } from '@/data/vessels/templates';
import { SHUTTLECRAFT } from '@/data/shuttles';
import ShuttleConsoleTemplate from './ShuttleConsoleTemplate';

vi.mock('./PressConfetti', () => ({ default: () => <section aria-label="Newspaper confetti dispenser" /> }));
vi.mock('./PressDispatch', () => ({ default: () => <section aria-label="Press dispatch desk" /> }));

it('renders a second craft through the base with its own identity and opt-in equipment', () => {
  const shuttle = defineShuttle({
    id: 'test-shuttle', name: 'Test Shuttle', shortName: 'Test', consoleName: 'Survey Console',
    operator: 'Survey Fleet', operatorShort: 'SURVEY', vesselType: 'Survey shuttle',
    description: 'Surveys the fleet.', captainRoleId: 'test-captain',
  });
  const { rerender } = render(<MemoryRouter><ShuttleConsoleTemplate
    shuttle={shuttle} captainName="Survey Officer" canLeave={true}
  /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Survey Console' })).toBeInTheDocument();
  expect(screen.getByText('Survey Officer // Captain')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Shuttle systems' })).toHaveTextContent('In transit');
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
  expect(within(workspace).getByText('Fuelled this turn')).toBeInTheDocument();
  expect(within(workspace).queryByRole('region', { name: 'Press dispatch desk' })).not.toBeInTheDocument();
});
