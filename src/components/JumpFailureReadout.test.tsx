import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { expect, it } from 'vitest';
import JumpFailureReadout from './JumpFailureReadout';

it('shows the printed damaged-drive thresholds, including the upgraded threshold', () => {
  const Readout = JumpFailureReadout as unknown as ComponentType<{ upgraded: boolean }>;
  const { rerender } = render(<Readout upgraded={false} />);

  expect(screen.getByText(/damaged drive.*1–3/i)).toBeInTheDocument();
  expect(screen.getByText(/upgraded.*damaged.*1 only/i)).toBeInTheDocument();

  rerender(<Readout upgraded />);
  expect(screen.getByText(/damaged drive.*1 only/i)).toBeInTheDocument();
});
