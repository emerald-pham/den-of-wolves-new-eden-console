import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import FocusDialog from './FocusDialog';

it('waits until an existing modal closes before presenting a new announcement', async () => {
  const props = {
    open: true,
    title: 'Queued announcement',
    description: 'A later announcement for the current session.',
    onClose: () => undefined,
    children: <p>Current status.</p>,
  };
  const { rerender } = render(
    <>
      <section role="dialog" aria-modal="true" aria-label="Existing access gate">
        <button type="button">Acknowledge gate</button>
      </section>
      <FocusDialog {...props} />
    </>,
  );

  expect(screen.queryByRole('dialog', { name: 'Queued announcement' })).not.toBeInTheDocument();
  rerender(<FocusDialog {...props} />);
  expect(await screen.findByRole('dialog', { name: 'Queued announcement' })).toBeVisible();
});
