import ShipNavigationLog from './ShipNavigationLog';
import ShipNavigationMap from './ShipNavigationMap';
import FleetGroupContext from './FleetGroupContext';
import { useSessionStore } from '@/store/useSessionStore';
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
  const fleetGroupId = useSessionStore((state) => state.me?.fleetGroupId);
  const discovery = useSessionStore((state) => state.session?.playerDiscovery);
  const groupContext = fleetGroupId && discovery?.groupId === fleetGroupId &&
    discovery.fleetGroupVesselIds?.includes(shipId)
    ? discovery
    : undefined;

  return (
    <div className="ship-navigation-workspace" data-console-locked={String(consoleLocked)}>
      {groupContext && <FleetGroupContext
        groupId={groupContext.groupId}
        currentCoordinate={currentCoordinate}
        vesselIds={groupContext.fleetGroupVesselIds}
        {...(groupContext.pursuitValue === undefined
          ? {}
          : { pursuitValue: groupContext.pursuitValue })}
      />}
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
