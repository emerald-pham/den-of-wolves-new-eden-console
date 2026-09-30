import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DemoJumpUnavailableToast } from './DemoJumpUnavailableToast';

it('announces the Demo jump denial in an on-screen status without adding a jump control', () => {
  render(<DemoJumpUnavailableToast open />);

  const notice = screen.getByRole('status');
  expect(notice).toHaveTextContent('Jumps are unavailable in Demo mode.');
  expect(notice).toHaveAttribute('aria-live', 'polite');
  expect(notice).toHaveAttribute('aria-atomic', 'true');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('does not display or announce the notice while closed', () => {
  render(<DemoJumpUnavailableToast open={false} />);

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
