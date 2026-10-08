import { expect, it } from 'vitest';
import { resolveJumpAttempt } from './jumpDrive';
import { environmentalMaintenanceHazard } from './environmentalMaintenanceHazard';
import { navigationState } from './navigationProjection';
import { wolfAttackWindowState } from './wolfAttackWindow';
import { wolfAttackCompositionForRule } from './wolfAttackPreparation';
import { applyShipNavigationMove } from './navigation';

const benefit = { missionId: 'mission-parity', coordinate: '1096', suppressMaintenanceDamage: true, freeExitFuel: true };

it('preserves protected mission benefits through the existing navigation reader without projecting them to other ships', () => {
  const previous = { shipGalacticCoordinates: { aegis: '1096', dione: '1096' }, shipNavigationLogs: {},
    pursuitGroups: { 'fleet-1': 1 }, missionNebulaBenefitsByShip: { aegis: benefit } };
  expect(navigationState(previous, ['aegis', 'dione'])).toMatchObject({ missionNebulaBenefitsByShip: { aegis: benefit } });
});

it('expires a departed ship grant in the actual movement projection while retaining the other entitled ship grant', () => {
  const previous = navigationState({ shipGalacticCoordinates: { aegis: '1096', dione: '1096' }, shipNavigationLogs: {},
    pursuitGroups: { 'fleet-1': 1 }, missionNebulaBenefitsByShip: { aegis: benefit, dione: benefit } }, ['aegis', 'dione']);
  const move = applyShipNavigationMove({ shipId: 'aegis', destination: '0000', now: new Date('2026-10-08T12:00:00Z'),
    eventIdPrefix: 'actual-mission-departure', navigationalError: false, coordinates: previous.shipGalacticCoordinates,
    logs: previous.shipNavigationLogs, shipNames: { aegis: 'AEGIS', dione: 'Dione' } });
  const departed = navigationState({ ...previous, shipGalacticCoordinates: move.coordinates, shipNavigationLogs: move.logs }, ['aegis', 'dione']);
  expect(departed.missionNebulaBenefitsByShip).toEqual({ dione: benefit });
  const returned = applyShipNavigationMove({ shipId: 'aegis', destination: '1096', now: new Date('2026-10-08T12:05:00Z'),
    eventIdPrefix: 'actual-mission-return', navigationalError: false, coordinates: departed.shipGalacticCoordinates,
    logs: departed.shipNavigationLogs, shipNames: { aegis: 'AEGIS', dione: 'Dione' } });
  expect(navigationState({ ...departed, shipGalacticCoordinates: returned.coordinates, shipNavigationLogs: returned.logs }, ['aegis', 'dione'])
    .missionNebulaBenefitsByShip).toEqual({ dione: benefit });
});

it('uses an entitled free exit in the actual charged jump resolver while retaining damaged-drive failure behavior', () => {
  const input = { shipId: 'aegis', origin: '1096', destination: '0000', currentTurn: 2, fuel: 0,
    charged: true, damaged: false, upgraded: false, now: new Date('2026-10-08T12:00:00Z'),
    transitionId: 'exit-parity', freeExitFuel: true };
  expect(resolveJumpAttempt(input)).toMatchObject({ status: 'jumped', fuelCost: 0, remainingFuel: 0,
    transition: { origin: '1096', destination: '0000' }, state: { lastJumpTurn: 2 } });
  expect(resolveJumpAttempt({ ...input, damaged: true, integrityRoll: 1 })).toMatchObject({ status: 'drive-failure' });
  expect(() => resolveJumpAttempt({ ...input, freeExitFuel: false })).toThrow(/fuel/i);
});

it('suppresses only the entitled ship current Ion hazard in the existing hazard consumer', () => {
  const consume = environmentalMaintenanceHazard as (...args: unknown[]) => unknown;
  expect(consume('A', '1096', { shipId: 'aegis', benefits: { aegis: benefit } })).toBeUndefined();
  expect(consume('A', '1096', { shipId: 'dione', benefits: { aegis: benefit } })).toMatchObject({ code: 'I' });
  expect(consume('A', '8378', { shipId: 'aegis', benefits: { aegis: benefit } })).toMatchObject({ code: 'J' });
});

it('reads an authoritative K window and applies the existing ordinary attack composition without inventing a K budget', () => {
  expect(wolfAttackWindowState({ status: 'due', turn: 2, revision: 1, targetGroupId: 'fleet-1',
    threatSiteCode: 'K', threatSourceId: 'mission-mission-parity' })).toMatchObject({ threatSiteCode: 'K' });
  const roster = Array<string>(15).fill('wolf-fighter-wing');
  expect(wolfAttackCompositionForRule(2, roster, { kind: 'K', targetGroupId: 'fleet-1' } as never)).toMatchObject({ damageCapacity: 15 });
  expect(() => wolfAttackCompositionForRule(2, roster.slice(1), { kind: 'K', targetGroupId: 'fleet-1' } as never)).toThrow(/15 to 24/i);
  expect(wolfAttackWindowState({ status: 'due', turn: 2, revision: 1, targetGroupId: 'fleet-1',
    threatSiteCode: 'K', threatSourceId: 'arrival-forged' })).toBeUndefined();
});

it('uses the actual existing composition consumer for K independently of the window reader', () => {
  const roster = Array<string>(15).fill('wolf-fighter-wing');
  expect(wolfAttackCompositionForRule(2, roster, { kind: 'K', targetGroupId: 'fleet-1' } as never))
    .toMatchObject({ damageCapacity: 15 });
  expect(() => wolfAttackCompositionForRule(2, roster.slice(1), { kind: 'K', targetGroupId: 'fleet-1' } as never))
    .toThrow(/15 to 24/i);
});
