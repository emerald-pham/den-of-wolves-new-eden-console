import type { ConsoleRole, ConsoleShipId } from '@/data/roles';
import type { ShipResourceInventory } from '@/data/resources';
import type { ShipPopulationTrack } from '@/data/shipPopulation';
import type { ShuttleDocking, ShuttleVisit } from '@/types/game';
import type { RoleId, ShuttleId, VesselId } from '@/types/identifiers';

export type ShipOrigin = 'earth' | 'colonies';

export interface ShipIdentity {
  readonly id: VesselId;
  readonly name: string;
  readonly vesselType: string;
  readonly nation: string;
  readonly nationShort: string;
  readonly origin: ShipOrigin;
  readonly description: string;
  readonly flag: string;
  readonly color: string;
  readonly dradisColor?: string;
  readonly secondaryColor?: string;
}

export interface ShipSystem {
  readonly id: string;
  readonly name: string;
  readonly effect: string;
  readonly timing?: 1 | 5 | 6 | 7 | 'ftl' | 'combat' | 'passive';
}

export interface Ship extends ShipIdentity {
  readonly systems?: readonly ShipSystem[];
  readonly maintenance?: {
    readonly reactor: number;
    readonly jump: readonly number[];
    readonly food: readonly number[];
    readonly water: readonly number[];
  };
  readonly id: Exclude<ConsoleShipId, 'press' | 'joint-engineering-union'>;
  readonly roles: readonly ConsoleRole[];
  readonly workspace: 'scaffold' | 'aegis';
  readonly resources: ShipResourceInventory;
  readonly initialSurvivors: number;
  readonly populationTrack?: ShipPopulationTrack;
  readonly specifications: {
    readonly length: string;
    readonly tonnage: number;
    readonly crewCapacity: number;
    readonly passengerCapacity: number;
  };
}

export function defineShip(
  definition: Omit<Ship, 'workspace' | 'roles'> &
    Partial<Pick<Ship, 'workspace'>> & {
    readonly roles: readonly Omit<ConsoleRole, 'shipId'>[];
  },
): Ship {
  return {
    workspace: 'scaffold', ...definition,
    roles: definition.roles.map((role) => ({ ...role, shipId: definition.id })),
  };
}

export type ShuttleCapability = 'newspaper-confetti' | 'press-dispatches';

/** GM-controlled craft only become available when the GM enables their owner role. */
export type ShuttleAvailability = 'standard' | 'gm-controlled';

export type ShuttleOperationPhase = 'Team' | 'Coordination' | 'Away mission' | 'Wolf attack';

/** Printed operational rule shown in the shared shuttle role workspace. */
export interface ShuttleOperation {
  readonly name: string;
  readonly phase: ShuttleOperationPhase;
  readonly effect: string;
}

export interface Shuttlecraft {
  readonly id: ShuttleId;
  readonly name: string;
  readonly shortName: string;
  readonly consoleName: string;
  readonly operator: string;
  readonly operatorShort: string;
  readonly vesselType: string;
  readonly description: string;
  readonly captainRoleId: RoleId;
  readonly availability: ShuttleAvailability;
  readonly consoleClass?: string;
  readonly mark?: string;
  readonly capabilities: readonly ShuttleCapability[];
  readonly operations: readonly ShuttleOperation[];
  /** The actual resource categories this craft may transfer, when its sheet supplies them. */
  readonly cargoTransfer?: string;
  readonly dockingEntrance?: 'press';
  readonly dockingPort?: string;
  readonly initialDocking?: Omit<ShuttleDocking, 'shuttleId'>;
  readonly initialVisit?: Omit<ShuttleVisit, 'shuttleId'>;
}

export function defineShuttle(
  definition: Omit<Shuttlecraft, 'availability' | 'capabilities' | 'operations' | 'initialVisit'> &
    Partial<Pick<Shuttlecraft, 'availability' | 'capabilities' | 'operations' | 'initialVisit'>>,
): Shuttlecraft {
  const initialVisit = definition.initialVisit ?? (definition.initialDocking
    ? {
      id: `${definition.id}-initial-${definition.initialDocking.shipId}-docking`,
      shipId: definition.initialDocking.shipId,
      action: 'docked' as const,
      occurredAt: definition.initialDocking.dockedAt,
    }
    : undefined);
  return {
    availability: 'standard',
    capabilities: [],
    operations: [],
    ...definition,
    ...(initialVisit ? { initialVisit } : {}),
  };
}
