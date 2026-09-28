import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useState } from 'react';
import { OnboardingFirstAction } from './OnboardingFirstAction';

it('hands off to a first action and returns through presentation-only callbacks', () => {
  const onAction = vi.fn();
  const onReturn = vi.fn();
  render(
    <ReviewScene onAction={onAction} onReturn={onReturn} />,
  );

  expect(screen.getByRole('region', { name: 'First action' })).toHaveTextContent(
    'Choose one available action with your team.',
  );
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open assigned console' }));
  expect(onAction).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent('Action complete in this review scene.');
  fireEvent.click(screen.getByRole('button', { name: 'Return to briefing' }));
  expect(onReturn).toHaveBeenCalledOnce();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

function ReviewScene({ onAction, onReturn }: { readonly onAction: () => void; readonly onReturn: () => void }) {
  const [complete, setComplete] = useState(false);
  return (
    <OnboardingFirstAction
      actionLabel="Open assigned console"
      actionHint="Choose one available action with your team."
      onAction={() => {
        onAction();
        setComplete(true);
      }}
      actionComplete={complete}
      returnLabel="Return to briefing"
      onReturn={() => {
        onReturn();
        setComplete(false);
      }}
    />
  );
}
