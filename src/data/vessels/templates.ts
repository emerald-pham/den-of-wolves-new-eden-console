import type { ConsoleRole, ConsoleShipId } from '@/data/roles';
import type { ShipResourceInventory } from '@/data/resources';
import type { ShipPopulationTrack } from '@/data/shipPopulation';
import type { ShuttleDocking, ShuttleVisit } from '@/types/game';
import type { RoleId, ShuttleId, SupplementalVesselId, VesselId } from '@/types/identifiers';

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

export type MaintenanceStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface VesselCapacity {
  readonly length: string;
  readonly tonnage: number;
  readonly crewCapacity: number;
  readonly passengerCapacity: number;
}

export interface PrintedVesselStatistics {
  /** Small ships and the approaching vessel have no independent crew/passenger capacity. */
  readonly capacity: VesselCapacity | null;
  readonly population: number;
  readonly jumpCosts: {
    readonly short: number;
    readonly medium: number;
    readonly long: number;
  };
  readonly reactorCapacity: number;
  readonly maintenanceSteps: readonly MaintenanceStep[];
}

export interface FullPrintedVesselStatistics extends PrintedVesselStatistics {
  readonly capacity: VesselCapacity;
}

export interface ShipSystem {
  readonly id: string;
  readonly name: string;
  readonly effect: string;
  readonly timing?: 1 | 5 | 6 | 7 | 'ftl' | 'combat' | 'passive';
}

export interface Ship extends ShipIdentity {
  readonly printedStatistics: FullPrintedVesselStatistics;
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
  definition: Omit<Ship, 'workspace' | 'roles' | 'printedStatistics'> &
    Partial<Pick<Ship, 'workspace'>> & {
    readonly roles: readonly Omit<ConsoleRole, 'shipId'>[];
    readonly printedStatistics?: FullPrintedVesselStatistics;
  },
): Ship {
  const maintenance = definition.maintenance;
  const maintenanceStepCount = Math.max(6, ...(definition.systems ?? [])
    .map(system => typeof system.timing === 'number' ? system.timing : 0));
  const printedStatistics: FullPrintedVesselStatistics = definition.printedStatistics ?? {
    capacity: definition.specifications,
    population: definition.initialSurvivors,
    jumpCosts: {
      short: maintenance?.jump[0] ?? 0,
      medium: maintenance?.jump[1] ?? 0,
      long: maintenance?.jump[2] ?? 0,
    },
    reactorCapacity: maintenance?.reactor ?? 0,
    maintenanceSteps: Array.from({ length: maintenanceStepCount }, (_, index) => index + 1) as MaintenanceStep[],
  };
  return {
    workspace: 'scaffold', ...definition, printedStatistics,
    roles: definition.roles.map((role) => ({ ...role, shipId: definition.id })),
  };
}

export type SupplementalVesselKind = 'small-ship' | 'voyage';
export type SupplementalVesselAvailability = 'base-small' | 'approaching-vessel';

/**
 * Identity-only registrations for optional vessels whose gameplay is owned by
 * later prompts. Keeping them separate from full fleet ships prevents an
 * unimplemented small ship from receiving ship resources or a player seat.
 */
export interface SupplementalVessel extends ShipIdentity {
  readonly id: SupplementalVesselId;
  readonly kind: SupplementalVesselKind;
  readonly availability: SupplementalVesselAvailability;
  readonly printedStatistics: PrintedVesselStatistics;
}

export type RegisteredVessel = Ship | SupplementalVessel;

export function defineSupplementalVessel(definition: SupplementalVessel): SupplementalVessel {
  return { ...definition };
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
