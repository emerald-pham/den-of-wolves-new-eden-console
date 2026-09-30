import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Voyage33MovementPanel from './Voyage33MovementPanel';

type TestProps = {
  admitted: boolean;
  connection: 'live' | 'connecting' | 'offline';
  phase: 'team' | 'coordination' | 'other';
  currentLocation: { coordinate: string; label: string };
  host: null | {
    shipId: string;
    name: string;
    coordinate: string;
    fuel: number;
    status: 'operational' | 'destroyed' | 'unavailable';
  };
  dockableHosts: { shipId: string; name: string }[];
  legalDestinations: { coordinate: string; label: string; length: 'short' | 'medium' | 'long' }[];
  outcome:
    | { status: 'idle' }
    | { status: 'pending' | 'stale' | 'denied'; message: string };
  onDock: (shipId: string) => void;
  onJump: (destination: string) => void;
};

function makeProps(overrides: Partial<TestProps> = {}): TestProps {
  return {
    admitted: true,
    connection: 'live',
    phase: 'team',
    currentLocation: { coordinate: '0101', label: 'Tycho' },
    host: null,
    dockableHosts: [{ shipId: 'dione', name: 'Dione' }],
    legalDestinations: [],
    outcome: { status: 'idle' },
    onDock: vi.fn(),
    onJump: vi.fn(),
    ...overrides,
  };
}

describe('Voyage33MovementPanel', () => {
  it('shows its distinct extra-ship identity, current location, host state, and printed host-fuel costs', () => {
    render(<Voyage33MovementPanel {...makeProps()} />);

    expect(screen.getByRole('heading', { name: 'Voyage 33-0 movement' })).toBeInTheDocument();
    expect(screen.getByText(/extra ship, not a base small ship/i)).toBeInTheDocument();
    expect(screen.getByText('0101 // Tycho')).toBeInTheDocument();
    expect(screen.getByText(/no host ship is assigned/i)).toBeInTheDocument();

    const costs = screen.getByRole('table', { name: 'Voyage 33-0 host fuel costs' });
    expect(within(costs).getByText('Short jump // 1 host fuel')).toBeInTheDocument();
    expect(within(costs).getByText('Medium jump // 1 host fuel')).toBeInTheDocument();
    expect(within(costs).getByText('Long jump // 2 host fuel')).toBeInTheDocument();
  });

  it('offers only supplied host choices during Team and calls the docking callback', () => {
    const props = makeProps({
      dockableHosts: [
        { shipId: 'dione', name: 'Dione' },
        { shipId: 'shepherd', name: 'Shepherd' },
      ],
    });
    render(<Voyage33MovementPanel {...props} />);

    expect(screen.getByRole('button', { name: 'Dock with Dione' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Dock with Shepherd' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /dock with aegs/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dock with Dione' }));
    expect(props.onDock).toHaveBeenCalledWith('dione');
  });

  it('offers only server-supplied legal destinations during Coordination and reports host fuel cost', () => {
    const props = makeProps({
      phase: 'coordination',
      host: { shipId: 'dione', name: 'Dione', coordinate: '0101', fuel: 8, status: 'operational' },
      legalDestinations: [
        { coordinate: '0102', label: 'Pallas', length: 'short' },
        { coordinate: '0202', label: 'Ceres', length: 'long' },
      ],
    });
    render(<Voyage33MovementPanel {...props} />);

    expect(screen.getByText(/Dione.*8 host fuel.*operational/i)).toBeInTheDocument();
    const pallas = screen.getByRole('button', { name: /jump to Pallas.*1 host fuel/i });
    expect(screen.getByRole('button', { name: /jump to Ceres.*2 host fuel/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /jump to Earth/i })).not.toBeInTheDocument();

    fireEvent.click(pallas);
    expect(props.onJump).toHaveBeenCalledWith('0102');
  });

  it('disables actions while disconnected or outside their valid phase', () => {
    const jump = { coordinate: '0102', label: 'Pallas', length: 'short' };
    const host = { shipId: 'dione', name: 'Dione', coordinate: '0101', fuel: 8, status: 'operational' };
    const { rerender } = render(<Voyage33MovementPanel {...makeProps({ connection: 'offline' })} />);
    expect(screen.getByRole('button', { name: 'Dock with Dione' })).toBeDisabled();

    rerender(<Voyage33MovementPanel {...makeProps({ phase: 'coordination', host, legalDestinations: [jump] })} />);
    expect(screen.getByRole('button', { name: /jump to Pallas/i })).toBeDisabled();

    rerender(<Voyage33MovementPanel {...makeProps({ admitted: false })} />);
    expect(screen.getByRole('button', { name: 'Dock with Dione' })).toBeDisabled();
  });

  it('announces pending, stale, and denied server outcomes', () => {
    const { rerender } = render(<Voyage33MovementPanel {...makeProps({
      outcome: { status: 'pending', message: 'Dock request is awaiting the facilitator connection.' },
    })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Dock request is awaiting the facilitator connection.');

    rerender(<Voyage33MovementPanel {...makeProps({
      outcome: { status: 'stale', message: 'Movement state changed. Refresh the current location.' },
    })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Movement state changed. Refresh the current location.');

    rerender(<Voyage33MovementPanel {...makeProps({
      outcome: { status: 'denied', message: 'The server denied this Voyage 33-0 action.' },
    })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The server denied this Voyage 33-0 action.');
  });
});
