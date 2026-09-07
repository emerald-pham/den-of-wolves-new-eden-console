import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SessionWaiver from './SessionWaiver';

describe('SessionWaiver', () => {
  it('shows the two regulations together in a code-of-conduct layout', () => {
    render(<SessionWaiver onAcknowledge={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /code of conduct/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CODE OF CONDUCT' })).toBeInTheDocument();
    expect(screen.getByRole('article', {
      name: /ICNY registered vessel consoles cannot be removed from the tables/i,
    })).toHaveTextContent(/role-play.*table rule.*wireless commands are illegal/i);
    expect(screen.getByRole('article', {
      name: /CIC authorized personnel may hide resource counts/i,
    })).toHaveTextContent(/not compelled to share.*may lie about resource counts.*jump coordinates/i);
    expect(screen.getAllByRole('img', { name: 'Regulation acknowledged' })).toHaveLength(2);
    expect(screen.getByText(/saved for 24 hours on this device/i)).toBeInTheDocument();
  });

  it('acknowledges the regulations with one explicit continue action', async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();
    render(<SessionWaiver onAcknowledge={onAcknowledge} />);

    await user.click(screen.getByRole('button', { name: 'Acknowledge regulations and continue' }));

    expect(onAcknowledge).toHaveBeenCalledOnce();
  });
});
