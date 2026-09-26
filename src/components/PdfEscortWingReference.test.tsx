import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PdfEscortWingReference from './PdfEscortWingReference';

describe('PDF Escort Wing reference', () => {
  it('shows the registered baseline for a legacy session without a state projection', () => {
    render(<PdfEscortWingReference />);

    const wing = screen.getByRole('region', { name: 'PDF Escort Fighter Wing' });
    expect(within(wing).getByText('4 of 4')).toBeInTheDocument();
    expect(within(wing).getByText('Not launched')).toBeInTheDocument();
    expect(within(wing).getAllByText('Not resolved')).toHaveLength(2);
  });

  it('shows the member-safe live fighter, launch, range, and loss state', () => {
    render(<PdfEscortWingReference state={{
      type: 'pdf-escort-fighter-wing-view',
      revision: 3,
      capacity: 4,
      fighters: 2,
      launched: true,
      mediumResolved: true,
      mediumActionCount: 3,
      shortResolved: true,
      shortRollCount: 4,
      losses: 2,
    }} />);

    const wing = screen.getByRole('region', { name: 'PDF Escort Fighter Wing' });
    expect(within(wing).getByText('2 of 4')).toBeInTheDocument();
    expect(within(wing).getByText('Launched')).toBeInTheDocument();
    expect(within(wing).getByText('Resolved // 3 fighter actions')).toBeInTheDocument();
    expect(within(wing).getByText('Resolved // 4 fighter rolls')).toBeInTheDocument();
    expect(within(wing).getByText('2')).toBeInTheDocument();
  });
});
