import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import FleetRoleConsoleTemplate from './FleetRoleConsoleTemplate';

it('shows effective jump costs when the installed drive upgrade reduces fuel use', () => {
  render(
    <FleetRoleConsoleTemplate
      shipName="AEGIS"
      roleName="Admiral"
      title="Ship systems"
      galacticCoordinate="0000"
      fuel={4}
      reactorCapacity={7}
      jumpCosts={[2, 3, 6]}
      jumpDriveUpgraded
    >
      <p>Systems view</p>
    </FleetRoleConsoleTemplate>,
  );

  expect(screen.getByText(/Jump requirement \/\/ Short/)).toHaveTextContent(
    'Jump requirement // Short 1 // Medium 2 // Long 5',
  );
  expect(screen.getByText(/Jump costs reflect the installed drive upgrade/i)).toBeInTheDocument();
  expect(screen.queryByText(/upgrades and procedure outcomes are tracked at the table/i)).not.toBeInTheDocument();
});
