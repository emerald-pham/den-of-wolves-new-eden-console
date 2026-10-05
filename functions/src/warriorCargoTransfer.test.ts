import { describe, expect, it } from 'vitest';
import * as cargo from './baseCapybaraCargoTransfer';
import { emptySmallShipState } from './smallShip';

const hostResources = { securityTeams: 2, ore: 3, fuel: 4, food: 5, water: 6, materials: 7 };
const input = {
  actorUid: 'original-captain', activeRoleHolderUid: 'original-captain', actorRoleId: 'warrior-captain',
  actorScope: 'player' as const, currentCycle: 4, currentTime: Date.parse('2099-09-24T12:05:00.000Z'),
  turnPhase: { turn: 4, teamPhaseEndsAt: '2099-09-24T12:00:00.000Z', openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
  vesselMode: 'base-capybara', isSmallShipAdmitted: true, activeVesselIds: ['aegis'],
  smallShipState: { ...emptySmallShipState('warrior', 'aegis'), dockingRevision: 2 },
  resourceId: 'materials', direction: 'load', amount: 2, expectedRevision: 0, cargoState: undefined,
  hostResources, hostDamage: { damagedSystemIds: [], destroyed: false },
};
const resolve = (patch: Record<string, unknown> = {}) => {
  expect(cargo).toHaveProperty('resolveSmallShipCargoTransfer');
  return (cargo as unknown as {resolveSmallShipCargoTransfer: (input: unknown, id: string) => {
    hostResources: typeof hostResources; cargoState: {revision: number; inventory: typeof hostResources};
  }}).resolveSmallShipCargoTransfer({ ...input, ...patch }, 'warrior');
};

describe('Warrior printed six-resource cargo contract', () => {
  it.each(cargo.BASE_CAPYBARA_CARGO_TYPES)('moves %s once while preserving the independent cargo ledger', resourceId => {
    const result = resolve({resourceId, amount: 1});
    expect(result.hostResources[resourceId]).toBe(hostResources[resourceId] - 1);
    expect(result.cargoState.inventory[resourceId]).toBe(1);
    expect(result.cargoState.revision).toBe(1);
  });
  it.each([
    {actorUid:'foreign'}, {actorRoleId:'capybara-small-captain'}, {actorScope:'facilitator'},
    {isSmallShipAdmitted:false}, {smallShipState:emptySmallShipState('warrior')},
    {smallShipState:emptySmallShipState('vulcan','aegis')}, {amount:0}, {amount:1.5}, {amount:8},
    {resourceId:'scrap'}, {expectedRevision:1}, {hostDamage:{destroyed:true,damagedSystemIds:[]}},
    {turnPhase:{...input.turnPhase,airspace:{state:'restricted',tickerActive:true,pressAccess:false}}},
    {cargoState:{revision:0,inventory:{...hostResources,food:-1}}},
  ])('fails closed for invalid actor, authority, phase, cost or ledger %j', patch => {
    expect(() => resolve(patch)).toThrow();
  });
  it('unloads only stored cargo into the actual current host', () => {
    const result = resolve({direction:'unload',amount:2,expectedRevision:5,
      cargoState:{revision:5,inventory:{...hostResources,materials:2}}});
    expect(result.hostResources.materials).toBe(9);
    expect(result.cargoState.inventory.materials).toBe(0);
    expect(result.cargoState.revision).toBe(6);
  });
});
