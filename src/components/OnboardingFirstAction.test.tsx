import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OnboardingFirstAction } from './OnboardingFirstAction';

it('hands off to a first action and returns through presentation-only callbacks', () => {
  const onAction = vi.fn();
  const onReturn = vi.fn();
  render(
    <OnboardingFirstAction
      actionLabel="Open assigned console"
      actionHint="Choose one available action with your team."
      onAction={onAction}
      actionComplete
      returnLabel="Return to briefing"
      onReturn={onReturn}
    />,
  );

  expect(screen.getByRole('region', { name: 'First action' })).toHaveTextContent(
    'Choose one available action with your team.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open assigned console' }));
  expect(onAction).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent('Action complete in this review scene.');
  fireEvent.click(screen.getByRole('button', { name: 'Return to briefing' }));
  expect(onReturn).toHaveBeenCalledOnce();
});
