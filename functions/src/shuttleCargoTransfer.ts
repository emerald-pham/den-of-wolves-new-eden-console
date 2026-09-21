import type { ShuttleControlEntry } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import { RESOURCE_IDS, type ResourceId } from './resources';

const FULL_CARGO = ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'] as const;

/** Exact server-side copy of each printed shuttle cargo permission. */
export const SHUTTLE_CARGO_TYPES: Readonly<Record<string, readonly ResourceId[]>> = {
  pallas: ['securityTeams'],
  philia: FULL_CARGO,
  highwall: ['ore', 'materials'],
  blacksmith: FULL_CARGO,
  macaw: [...FULL_CARGO, 'scrap'],
  boa: ['scrap'],
  'black-sheep': FULL_CARGO,
  hummingbird: ['food', 'water'],
  condor: FULL_CARGO,
  chacau: FULL_CARGO,
  chepu: ['securityTeams'],
  wobbly: FULL_CARGO,
  ally: FULL_CARGO,
};

export interface ShuttleCargoTransferResult {
  readonly hostShipId: string;
  readonly resourceId: ResourceId;
  readonly direction: 'load' | 'unload';
  readonly amount: number;
  readonly shipAmount: number;
  readonly shuttleAmount: number;
  readonly shipInventory: Readonly<Record<string, number>>;
  readonly shuttleInventory: Readonly<Record<string, number>>;
}

function exactInventory(value: unknown): Record<string, number> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !RESOURCE_IDS.includes(key as ResourceId)) ||
      Object.values(raw).some((amount) => !Number.isSafeInteger(amount) || (amount as number) < 0)) {
    return null;
  }
  return raw as Record<string, number>;
}

export function transferShuttleCargo(input: Readonly<{
  actorUid: string;
  shuttleId: string;
  resourceId: ResourceId;
  direction: 'load' | 'unload';
  amount: number;
  expectedControlRevision: number;
  control: ShuttleControlEntry;
  dockings: readonly AuthoritativeShuttleDocking[];
  shipResources: unknown;
  shuttleCargo: unknown;
}>): ShuttleCargoTransferResult {
  if (input.control.shuttleId !== input.shuttleId || input.control.holderUid !== input.actorUid) {
    throw new Error('Only the current shuttle holder may transfer its cargo.');
  }
  if (input.control.revision !== input.expectedControlRevision) {
    throw new Error('Shuttle control changed; refresh before transferring cargo.');
  }
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new Error('Cargo amount must be a positive whole number.');
  }
  if (!SHUTTLE_CARGO_TYPES[input.shuttleId]?.includes(input.resourceId)) {
    throw new Error('That resource is not permitted by this shuttle’s printed cargo rule.');
  }
  const currentDockings = input.dockings.filter((docking) => docking.shuttleId === input.shuttleId);
  if (currentDockings.length !== 1) {
    throw new Error('Cargo may move only while the shuttle is docked at one host ship.');
  }
  const hostShipId = currentDockings[0]!.shipId;
  if (typeof input.shipResources !== 'object' || input.shipResources === null ||
      Array.isArray(input.shipResources)) {
    throw new Error('The docked host inventory ledger is malformed.');
  }
  const shipInventory = exactInventory(
    (input.shipResources as Record<string, unknown>)[hostShipId],
  );
  if (!shipInventory || !Object.prototype.hasOwnProperty.call(shipInventory, input.resourceId)) {
    throw new Error('The docked host has no permitted inventory for that resource.');
  }
  if (typeof input.shuttleCargo !== 'object' || input.shuttleCargo === null ||
      Array.isArray(input.shuttleCargo)) {
    throw new Error('The shuttle cargo ledger is malformed.');
  }
  const cargoRoot = input.shuttleCargo as Record<string, unknown>;
  const shuttleInventory = cargoRoot[input.shuttleId] === undefined
    ? {} : exactInventory(cargoRoot[input.shuttleId]);
  if (!shuttleInventory) throw new Error('The shuttle cargo ledger is malformed.');
  const shipAmount = shipInventory[input.resourceId] ?? 0;
  const shuttleAmount = shuttleInventory[input.resourceId] ?? 0;
  const sourceAmount = input.direction === 'load' ? shipAmount : shuttleAmount;
  const destinationAmount = input.direction === 'load' ? shuttleAmount : shipAmount;
  if (sourceAmount < input.amount) throw new Error('The source inventory does not hold enough cargo.');
  if (destinationAmount > Number.MAX_SAFE_INTEGER - input.amount) {
    throw new Error('The destination inventory cannot safely hold that cargo.');
  }
  const nextShipAmount = shipAmount + (input.direction === 'load' ? -input.amount : input.amount);
  const nextShuttleAmount = shuttleAmount + (input.direction === 'load' ? input.amount : -input.amount);
  return {
    hostShipId,
    resourceId: input.resourceId,
    direction: input.direction,
    amount: input.amount,
    shipAmount: nextShipAmount,
    shuttleAmount: nextShuttleAmount,
    shipInventory: { ...shipInventory, [input.resourceId]: nextShipAmount },
    shuttleInventory: { ...shuttleInventory, [input.resourceId]: nextShuttleAmount },
  };
}
