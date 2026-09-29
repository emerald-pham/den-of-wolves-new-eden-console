import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { expect, it } from 'vitest';
import JumpFailureReadout from './JumpFailureReadout';

it('shows the printed damaged-drive thresholds, including the upgraded threshold', () => {
  const Readout = JumpFailureReadout as unknown as ComponentType<{ upgraded: boolean }>;
  const { rerender } = render(<Readout upgraded={false} />);

  expect(screen.getByText(/if the jump drive is damaged.*1–3/i)).toBeInTheDocument();
  rerender(<Readout upgraded />);
  expect(screen.getByText(/if the jump drive is damaged.*1 when upgraded/i)).toBeInTheDocument();
});
