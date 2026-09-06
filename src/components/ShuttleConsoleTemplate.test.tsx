import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { defineShuttle } from '@/data/vessels/templates';
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
