import { describe, expect, it } from 'vitest';
import {
  BASE_CAPYBARA_CARGO_TYPES,
  resolveBaseCapybaraCargoTransfer,
} from './baseCapybaraCargoTransfer';
import { emptySmallShipState } from './smallShip';

const hostResources = {
  ore: 7,
  fuel: 6,
  food: 5,
  water: 4,
  materials: 3,
  securityTeams: 2,
};

const base = {
  actorUid: 'captain-uid',
  activeRoleHolderUid: 'captain-uid',
  actorRoleId: 'capybara-small-captain',
  actorScope: 'player' as const,
  currentCycle: 4,
  turnPhase: { turn: 4, airspace: { state: 'lifted' } },
  vesselMode: 'base-capybara',
  isSmallShipAdmitted: true,
  activeVesselIds: ['aegis'],
  smallShipState: { ...emptySmallShipState('capybara-small', 'aegis'), dockingRevision: 2 },
  resourceId: 'materials' as const,
  direction: 'load' as const,
  amount: 2,
  expectedRevision: 0,
  cargoState: undefined,
  hostResources,
};

describe('base Capybara Cargo Transfer', () => {
  it('loads cargo from its one active docked host with one revision-safe result', () => {
    expect(resolveBaseCapybaraCargoTransfer(base)).toEqual({
      hostShipId: 'aegis',
      resourceId: 'materials',
      direction: 'load',
      amount: 2,
      hostResources: { ...hostResources, materials: 1 },
      cargoState: {
        revision: 1,
        inventory: {
          securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 2,
        },
      },
    });
  });

  it.each(BASE_CAPYBARA_CARGO_TYPES)('moves the printed %s cargo type and no implicit type', (resourceId) => {
    const result = resolveBaseCapybaraCargoTransfer({ ...base, resourceId, amount: 1 });
    expect(result.hostResources[resourceId]).toBe(hostResources[resourceId] - 1);
    expect(result.cargoState.inventory[resourceId]).toBe(1);
  });

  it('unloads held cargo back into the current docked host', () => {
    const cargoState = {
      revision: 7,
      inventory: {
        securityTeams: 1, ore: 2, fuel: 3, food: 4, water: 5, materials: 6,
      },
    };
    expect(resolveBaseCapybaraCargoTransfer({
      ...base,
      direction: 'unload',
      amount: 3,
      expectedRevision: 7,
      cargoState,
    })).toMatchObject({
      hostResources: { ...hostResources, materials: 6 },
      cargoState: { revision: 8, inventory: { ...cargoState.inventory, materials: 3 } },
    });
  });

  it.each([
    ['wrong role', { actorRoleId: 'gorgoneion-captain' }, /Capybara Captain/i],
    ['foreign holder', { actorUid: 'other' }, /current base Capybara Captain/i],
    ['facilitator scope', { actorScope: 'facilitator' }, /Capybara Captain/i],
    ['Team Phase', { turnPhase: { turn: 4, airspace: { state: 'restricted' } } }, /Coordination/i],
    ['unknown phase', { turnPhase: undefined }, /phase.*unavailable/i],
    ['stale phase cycle', { turnPhase: { turn: 3, airspace: { state: 'lifted' } } }, /current cycle/i],
    ['expansion mode', { vesselMode: 'expansion-capybara' }, /canonical base Capybara vessel mode/i],
    ['missing server-owned admission', { isSmallShipAdmitted: false }, /server-owned admission/i],
    ['expansion Capybara mixed in', { activeVesselIds: ['aegis', 'capybara'] }, /excludes the expansion ship/i],
    ['base Capybara inserted in core roster', { activeVesselIds: ['aegis', 'capybara-small'] }, /core-fleet authority is malformed/i],
    ['undocked Capybara', { smallShipState: emptySmallShipState('capybara-small') }, /docked with one host/i],
    ['inactive host', { activeVesselIds: ['dione'] }, /active core host/i],
    ['wrong small ship', { smallShipState: emptySmallShipState('warrior', 'aegis') }, /base Capybara/i],
    ['Scrap', { resourceId: 'scrap' }, /printed cargo/i],
    ['zero amount', { amount: 0 }, /positive whole/i],
    ['fractional amount', { amount: 1.5 }, /positive whole/i],
    ['unknown direction', { direction: 'sideways' }, /load or unload/i],
    ['overdraw', { amount: 4 }, /enough cargo/i],
    ['cargo overdraw', { direction: 'unload', amount: 1 }, /enough cargo/i],
    ['stale revision', { expectedRevision: 1 }, /changed/i],
  ] as const)('rejects %s without returning a mutation', (_label, patch, message) => {
    expect(() => resolveBaseCapybaraCargoTransfer({ ...base, ...patch } as never)).toThrow(message);
  });

  it.each([
    ['duplicate core vessel', { activeVesselIds: ['aegis', 'aegis'] }],
    ['rogue core vessel', { activeVesselIds: ['aegis', 'rogue-vessel'] }],
    ['extra-ship in core roster', { activeVesselIds: ['aegis', 'capybara-small'] }],
    ['extra cargo key', { cargoState: { revision: 0, inventory: { securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 0, scrap: 0 } } }],
    ['negative cargo', { cargoState: { revision: 0, inventory: { securityTeams: 0, ore: -1, fuel: 0, food: 0, water: 0, materials: 0 } } }],
    ['extra host key', { hostResources: { ...hostResources, scrap: 0 } }],
    ['fractional host value', { hostResources: { ...hostResources, food: 1.5 } }],
    ['malformed docking revision', { smallShipState: { ...base.smallShipState, dockingRevision: -1 } }],
  ] as const)('fails closed on %s', (_label, patch) => {
    expect(() => resolveBaseCapybaraCargoTransfer({ ...base, ...patch } as never)).toThrow(/malformed/i);
  });

  it('rejects destination and revision overflow', () => {
    expect(() => resolveBaseCapybaraCargoTransfer({
      ...base,
      cargoState: {
        revision: 0,
        inventory: {
          securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0,
          materials: Number.MAX_SAFE_INTEGER,
        },
      },
    })).toThrow(/safely hold/i);
    expect(() => resolveBaseCapybaraCargoTransfer({
      ...base,
      expectedRevision: Number.MAX_SAFE_INTEGER,
      cargoState: {
        revision: Number.MAX_SAFE_INTEGER,
        inventory: { securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 0 },
      },
    })).toThrow(/revision.*advance/i);
  });
});
