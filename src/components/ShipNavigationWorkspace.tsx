import ShipNavigationLog from './ShipNavigationLog';
import ShipNavigationMap from './ShipNavigationMap';
import type { ShipNavigationLogEntry } from '@/types/game';

interface Props {
  readonly shipId: string;
  readonly shipName: string;
  readonly currentCoordinate: string;
  readonly entries?: readonly ShipNavigationLogEntry[] | undefined;
  readonly knownCoordinates?: readonly string[] | undefined;
  readonly knownSystems?: Readonly<Record<string, string>> | undefined;
  readonly consoleLocked?: boolean | undefined;
}

export default function ShipNavigationWorkspace({
  shipId,
  shipName,
  currentCoordinate,
  entries = [],
  knownCoordinates,
  knownSystems,
  consoleLocked = false,
}: Props) {
  return (
    <div className="ship-navigation-workspace" data-console-locked={String(consoleLocked)}>
      <ShipNavigationMap
        shipId={shipId}
        shipName={shipName}
        currentCoordinate={currentCoordinate}
        navigationEntries={entries}
        {...(knownCoordinates ? { knownCoordinates } : {})}
        {...(knownSystems ? { knownSystems } : {})}
      />
      <ShipNavigationLog shipName={shipName} entries={entries} />
    </div>
  );
}
