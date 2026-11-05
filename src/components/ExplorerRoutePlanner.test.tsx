import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ShipNavigationLogEntry } from '@/types/game';
import ExplorerRoutePlanner, { type ExplorerJumpReadiness } from './ExplorerRoutePlanner';

const knownCoordinates = ['0000', '5143', '1413', '9997'] as const;
const knownSystems = {
  'system-01': '0000',
  'system-02': '5143',
  'system-03': '1413',
  'system-04': '9997',
} as const;

const ready: ExplorerJumpReadiness = {
  shipName: 'Quellon',
  fuel: 6,
  jumpCosts: [2, 4, 8],
  upgraded: false,
  charged: true,
  damaged: false,
  jumpedThisCycle: false,
  current: true,
};

function selfJump(origin: string, destination: string, overrides: Partial<ShipNavigationLogEntry> = {}):
ShipNavigationLogEntry {
  return {
    id: `jump-${origin}-${destination}`,
    shipId: 'quellon',
    type: 'self-jump',
    origin,
    destination,
    navigationalError: false,
    occurredAt: '2026-11-05T10:00:00.000Z',
    stardate: '2026.309.100000',
    ...overrides,
  };
}

async function plan(destination: string, props: Partial<Parameters<typeof ExplorerRoutePlanner>[0]> = {}) {
  const user = userEvent.setup();
  render(<ExplorerRoutePlanner
    currentCoordinate="0000"
    knownCoordinates={knownCoordinates}
    knownSystems={knownSystems}
    readiness={ready}
    {...props}
  />);
  const planner = screen.getByRole('region', { name: 'Explorer route planner' });
  await user.selectOptions(within(planner).getByLabelText('Known route destination'), destination);
  return { planner, user };
}

describe('Explorer route planner // current legal jump state', () => {
  it('prices the planned route from the ship cost bands and the fuel it currently holds', async () => {
    const { planner } = await plan('9997');

    expect(planner).toHaveTextContent('Planned route // 0000 → 5143 → 9997 // 2 jumps');
    expect(within(planner).getByLabelText('Jump estimate'))
      .toHaveTextContent('One jump // MEDIUM at most // up to 4 fuel // Quellon holds 6');
    expect(within(planner).getByLabelText('Jump readiness'))
      .toHaveTextContent(/jump drive charged.*commit the jump from ship systems/i);
  });

  it('applies the Jump Drive upgrade discount to the estimate', async () => {
    const { planner } = await plan('5143', { readiness: { ...ready, upgraded: true } });

    expect(within(planner).getByLabelText('Jump estimate'))
      .toHaveTextContent('One jump // SHORT at most // up to 1 fuel // Quellon holds 6');
  });

  it.each([
    [{ jumpedThisCycle: true }, /quellon already jumped this cycle/i],
    [{ charged: false }, /jump drive not charged this cycle/i],
    [{ fuel: 3 }, /fuel may be short \/\/ 3 held; up to 4 required/i],
    [{ damaged: true }, /jump drive damaged \/\/ the jump may fail/i],
  ] as const)('reports the blocking jump condition %o', async (change, message) => {
    const { planner } = await plan('9997', { readiness: { ...ready, ...change } });

    expect(within(planner).getByLabelText('Jump readiness')).toHaveTextContent(message);
    expect(within(planner).getByLabelText('Jump readiness')).not.toHaveTextContent(/jump drive charged/i);
  });

  it('withholds fuel and charge guidance until the ship state is server-current', async () => {
    const { planner } = await plan('9997', { readiness: { ...ready, current: false } });

    expect(within(planner).getByLabelText('Jump readiness'))
      .toHaveTextContent(/live ship state unavailable.*reconnect/i);
    expect(within(planner).queryByLabelText('Jump estimate')).not.toBeInTheDocument();
  });
});

describe('Explorer route planner // committed movement', () => {
  it('shows the latest server-committed jump of the ship, not another ship arrival', () => {
    render(<ExplorerRoutePlanner
      currentCoordinate="5143"
      knownCoordinates={knownCoordinates}
      knownSystems={knownSystems}
      readiness={ready}
      navigationEntries={[
        selfJump('1413', '0000', { id: 'older', stardate: '2026.309.090000' }),
        selfJump('0000', '5143'),
        {
          id: 'other', shipId: 'quellon', type: 'ship-jump-arrival', origin: '0000', destination: '5143',
          subjectShipId: 'aegis', subjectShipName: 'AEGIS', occurredAt: '2026-11-05T10:05:00.000Z',
          stardate: '2026.309.100500',
        },
      ]}
    />);

    const committed = screen.getByRole('region', { name: 'Explorer route planner' });
    expect(within(committed).getByLabelText('Committed movement'))
      .toHaveTextContent('Last committed jump // 0000 → 5143 // stardate 2026.309.100000');
    expect(committed).not.toHaveTextContent('AEGIS');
  });

  it('marks a facilitator relocation as a navigational error', () => {
    render(<ExplorerRoutePlanner
      currentCoordinate="5143"
      knownCoordinates={knownCoordinates}
      knownSystems={knownSystems}
      navigationEntries={[selfJump('0000', '5143', { navigationalError: true })]}
    />);

    expect(screen.getByLabelText('Committed movement'))
      .toHaveTextContent('Last committed movement // navigational error // 0000 → 5143');
  });

  it('says when no movement has been committed yet', () => {
    render(<ExplorerRoutePlanner
      currentCoordinate="0000"
      knownCoordinates={knownCoordinates}
      knownSystems={knownSystems}
    />);

    expect(screen.getByLabelText('Committed movement'))
      .toHaveTextContent(/no jump committed yet \/\/ position 0000/i);
  });

  it('reports arrival when the committed position reaches the planned destination', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ExplorerRoutePlanner
      currentCoordinate="0000"
      knownCoordinates={knownCoordinates}
      knownSystems={knownSystems}
      readiness={ready}
    />);
    await user.selectOptions(screen.getByLabelText('Known route destination'), '9997');

    rerender(<ExplorerRoutePlanner
      currentCoordinate="9997"
      knownCoordinates={knownCoordinates}
      knownSystems={knownSystems}
      readiness={{ ...ready, fuel: 2, jumpedThisCycle: true }}
      navigationEntries={[selfJump('0000', '9997')]}
    />);

    const planner = screen.getByRole('region', { name: 'Explorer route planner' });
    expect(planner).toHaveTextContent('Arrived // 9997 is the committed position of the Quellon');
    expect(within(planner).getByLabelText('Committed movement'))
      .toHaveTextContent('Last committed jump // 0000 → 9997');
  });
});
