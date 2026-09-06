import type { ConsoleRole, ConsoleShipId } from '@/data/roles';
import type { ShipResourceInventory } from '@/data/resources';
import type { ShipPopulationTrack } from '@/data/shipPopulation';
import type { ShuttleDocking, ShuttleVisit } from '@/types/game';

export type ShipOrigin = 'earth' | 'colonies';

export interface ShipIdentity {
  readonly id: string;
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
  readonly name: string;
  readonly card: string;
  readonly effect: string;
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
  definition: Omit<Ship, 'workspace' | 'roles'> & Partial<Pick<Ship, 'workspace'>> & {
    readonly roles: readonly Omit<ConsoleRole, 'shipId'>[];
  },
): Ship {
  return {
    workspace: 'scaffold', ...definition,
    roles: definition.roles.map((role) => ({ ...role, shipId: definition.id })),
  };
}

export type ShuttleCapability = 'newspaper-confetti';

export interface Shuttlecraft {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly consoleName: string;
  readonly operator: string;
  readonly operatorShort: string;
  readonly vesselType: string;
  readonly description: string;
  readonly captainRoleId: string;
  readonly consoleClass?: string;
  readonly mark?: string;
  readonly capabilities: readonly ShuttleCapability[];
  readonly dockingEntrance?: 'press';
  readonly initialDocking?: Omit<ShuttleDocking, 'shuttleId'>;
  readonly initialVisit?: Omit<ShuttleVisit, 'shuttleId'>;
}

export function defineShuttle(
  definition: Omit<Shuttlecraft, 'capabilities'> & Partial<Pick<Shuttlecraft, 'capabilities'>>,
): Shuttlecraft {
  return { capabilities: [], ...definition };
}
