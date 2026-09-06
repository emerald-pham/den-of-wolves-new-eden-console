import type { ReactNode } from 'react';
import RoleConsoleTemplate from './RoleConsoleTemplate';
import type { ShipDamageState } from '@/types/game';

interface Props<Page extends string> {
  readonly shipName: string;
  readonly roleName: string;
  readonly title: string;
  readonly galacticCoordinate: string;
  readonly fuel: number;
  readonly reactorCapacity: number;
  readonly jumpCosts: readonly number[];
  readonly damage?: ShipDamageState | undefined;
  readonly telemetry?: ReactNode;
  readonly children: ReactNode;
  readonly pages?: readonly { readonly id: Page; readonly label: string }[];
  readonly activePage?: Page;
  readonly onPageChange?: (page: Page) => void;
}

/** Fleet-wide command chrome derived from the AEGIS Admiral console. */
export default function FleetRoleConsoleTemplate<Page extends string>({
  shipName,
  roleName,
  title,
  galacticCoordinate,
  fuel,
  reactorCapacity,
  jumpCosts,
  damage,
  telemetry,
  children,
  pages,
  activePage,
  onPageChange,
}: Props<Page>) {
  const [short = 0, medium = 0, long = 0] = jumpCosts;
  const navigation = pages && activePage !== undefined && onPageChange
    ? { pages, activePage, onPageChange }
    : {};
  return (
    <RoleConsoleTemplate
      label={`${shipName} ${roleName} console`}
      eyebrow={`${shipName} command console // ${roleName}`}
      title={title}
      telemetry={<>
        <div><dt>Galactic coordinates</dt><dd>{galacticCoordinate}</dd></div>
        <div><dt>Fuel in stores</dt><dd>{fuel}</dd></div>
        <div><dt>Reactor capacity</dt><dd>{reactorCapacity} consoles</dd></div>
        <div>
          <dt>Damage state</dt>
          <dd>{damage?.destroyed
            ? 'Destroyed'
            : `${damage?.damagedSystemIds.length ?? 0} systems`}</dd>
        </div>
        {telemetry}
      </>}
      {...navigation}
    >
      <div className="console-workspace__status">
        <p>Jump requirement // Short {short} // Medium {medium} // Long {long}</p>
        <p>Maintenance and damage synchronized // Upgrades and procedure outcomes are tracked at the table</p>
      </div>
      {children}
    </RoleConsoleTemplate>
  );
}
