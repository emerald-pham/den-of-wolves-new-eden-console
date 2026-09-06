import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { useState } from 'react';
import RoleConsoleTemplate from './RoleConsoleTemplate';

it('shares the accessible workspace header and page controls across role modules', async () => {
  function Role() {
    const [page, setPage] = useState('systems');
    return <RoleConsoleTemplate label="Survey Officer console" eyebrow="Survey operations"
      title={page} telemetry={<div><dt>Coordinates</dt><dd>1234</dd></div>}
      pages={[{ id: 'systems', label: 'Systems' }, { id: 'maintenance', label: 'Maintenance' }]}
      activePage={page} onPageChange={setPage}>
      <p>{page === 'systems' ? 'Survey systems' : 'Survey maintenance'}</p>
    </RoleConsoleTemplate>;
  }
  render(<Role />);
  expect(screen.getByRole('region', { name: 'Survey Officer console' })).toHaveTextContent('1234');
  await userEvent.click(screen.getByRole('button', { name: 'Maintenance' }));
  expect(screen.getByRole('button', { name: 'Maintenance' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Survey maintenance')).toBeInTheDocument();
});
