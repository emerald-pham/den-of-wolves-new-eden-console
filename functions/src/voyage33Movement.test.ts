import { describe, expect, it } from 'vitest';
import { resolveJumpAttempt, type JumpAttemptResult } from './jumpDrive';
import { VOYAGE_33_ID, VOYAGE_33_COMMITMENTS } from './voyageAdmission';
import { emptyVoyage33MaintenanceState } from './voyage33Maintenance';
import type { ShipResourceInventory } from './resources';
import {
  dockVoyage33,
  emptyVoyage33MovementState,
  resolveVoyage33JumpCommit,
  voyage33JumpFuelCost,
  type Voyage33MovementState,
} from './voyage33Movement';

const sessionId = 'session-1';
const hostShipId = 'aegis';
const currentTurn = 2;
const now = new Date('2026-09-30T12:00:00.000Z');
const admission = {
  type: 'voyage-admission',
  sessionId,
  id: VOYAGE_33_ID,
  status: 'admitted',
  crisisId: 'approach-1',
  crisisRevision: 4,
  population: 40_000,
  unrest: 0,
  hostShipId: null,
  commitments: VOYAGE_33_COMMITMENTS,
} as const;

const movement = emptyVoyage33MovementState('0000');
const maintenance = emptyVoyage33MaintenanceState();
const resources: ShipResourceInventory = {
  ore: 0, fuel: 8, food: 8, water: 6, materials: 5, securityTeams: 9,
};
const activeVesselIds = ['aegis', 'dione', 'icebreaker'] as const;

function jumpedAttempt(overrides: Partial<{
  origin: string;
  destination: string;
  fuel: number;
  transitionId: string;
}> = {}): JumpAttemptResult {
  return resolveJumpAttempt({
    shipId: VOYAGE_33_ID,
    origin: '0000',
    destination: '5143',
    currentTurn,
    fuel: resources.fuel,
    charged: true,
    damaged: false,
    upgraded: false,
    now,
    transitionId: 'voyage-jump-1',
    ...overrides,
  });
}

function commitInput(overrides: Partial<Parameters<typeof resolveVoyage33JumpCommit>[0]> = {}) {
  return {
    sessionId,
    admission,
    phase: 'coordination' as const,
    currentTurn,
    movementState: movement,
    expectedMovementRevision: movement.revision,
    maintenanceState: { ...maintenance, hostShipId, dockingRevision: 3 },
    expectedDockingRevision: 3,
    activeVesselIds,
    hostShipId,
    hostCoordinate: '0000',
    hostDamage: { damagedSystemIds: [], destroyed: false },
    hostResources: resources,
    jumpResult: jumpedAttempt(),
    ...overrides,
  };
}

describe('Voyage 33-0 movement', () => {
  it('keeps its printed host-fuel costs distinct at all three jump lengths', () => {
    expect(voyage33JumpFuelCost('short')).toBe(1);
    expect(voyage33JumpFuelCost('medium')).toBe(1);
    expect(voyage33JumpFuelCost('long')).toBe(2);
  });

  it('docks only during Team with one active co-located resource host', () => {
    const next = dockVoyage33({
      sessionId,
      admission,
      phase: 'team',
      maintenanceState: maintenance,
      expectedDockingRevision: 0,
      movementState: movement,
      hostShipId,
      hostCoordinate: '0000',
      hostDamage: { damagedSystemIds: [], destroyed: false },
      activeVesselIds,
    });

    expect(next).toMatchObject({ hostShipId, dockingRevision: 1 });
    expect(movement).toEqual(emptyVoyage33MovementState('0000'));
    expect(activeVesselIds).not.toContain(VOYAGE_33_ID);
  });

  it.each([
    ['not admitted', { admission: undefined }],
    ['Coordination phase', { phase: 'coordination' as const }],
    ['stale docking revision', { expectedDockingRevision: 1 }],
    ['already docked state', { maintenanceState: { ...maintenance, hostShipId, dockingRevision: 0 } }],
    ['host outside core roster', { hostShipId: 'warrior' }],
    ['non-resource craft host', { hostShipId: 'capybara-small' }],
    ['remote host', { hostCoordinate: '5143' }],
    ['destroyed host', { hostDamage: { damagedSystemIds: [], destroyed: true } }],
    ['Voyage inserted in core roster', { activeVesselIds: [...activeVesselIds, VOYAGE_33_ID] }],
  ])('rejects docking with %s', (_label, change) => {
    expect(() => dockVoyage33({
      sessionId,
      admission,
      phase: 'team',
      maintenanceState: maintenance,
      expectedDockingRevision: 0,
      movementState: movement,
      hostShipId,
      hostCoordinate: '0000',
      hostDamage: { damagedSystemIds: [], destroyed: false },
      activeVesselIds,
      ...change,
    } as never)).toThrow();
  });

  it.each([
    ['short', '5143', 1],
    ['medium', '9997', 1],
    ['long', '4888', 2],
  ] as const)('spends %i host fuel on a committed %s jump', (_length, destination, cost) => {
    const attempt = jumpedAttempt({ destination });
    const result = resolveVoyage33JumpCommit(commitInput({ jumpResult: attempt }));
    expect(result).toMatchObject({
      status: 'jumped',
      movementState: {
        id: VOYAGE_33_ID,
        coordinate: destination,
        revision: movement.revision + 1,
        jumpState: { lastJumpTurn: currentTurn },
      },
      maintenanceState: { hostShipId: null, dockingRevision: 4 },
      hostResources: { ...resources, fuel: resources.fuel - cost },
      transition: { shipId: VOYAGE_33_ID, origin: '0000', destination },
    });
    expect(resources.fuel).toBe(8);
  });

  it.each([
    ['wrong session', { sessionId: 'another-session' }],
    ['wrong phase', { phase: 'team' as const }],
    ['not admitted', { admission: undefined }],
    ['stale movement revision', { expectedMovementRevision: 1 }],
    ['stale docking revision', { expectedDockingRevision: 2 }],
    ['host outside core roster', { hostShipId: 'warrior' }],
    ['host not docked', { maintenanceState: maintenance }],
    ['remote host', { hostCoordinate: '5143' }],
    ['destroyed host', { hostDamage: { damagedSystemIds: [], destroyed: true } }],
    ['already jumped this cycle', {
      movementState: { ...movement, jumpState: { lastJumpTurn: currentTurn } },
    }],
  ])('rejects a jump commit with %s', (_label, change) => {
    expect(() => resolveVoyage33JumpCommit(commitInput(change as never))).toThrow();
  });

  it('leaves fuel, position, and docking unchanged when the common jump result did not commit', () => {
    const failed = resolveJumpAttempt({
      shipId: VOYAGE_33_ID,
      origin: '0000',
      destination: '5143',
      currentTurn,
      fuel: resources.fuel,
      charged: true,
      damaged: true,
      upgraded: false,
      integrityRoll: 1,
      now,
      transitionId: 'voyage-jump-failure',
    });
    const result = resolveVoyage33JumpCommit(commitInput({ jumpResult: failed }));
    expect(result).toMatchObject({
      status: 'drive-failure',
      movementState: movement,
      maintenanceState: { hostShipId, dockingRevision: 3 },
      hostResources: resources,
    });
  });

  it('persists the common resolver lockout without moving or undocking Voyage', () => {
    const locked = resolveJumpAttempt({
      shipId: VOYAGE_33_ID,
      origin: '0000',
      destination: '9999',
      currentTurn,
      fuel: resources.fuel,
      charged: true,
      damaged: false,
      upgraded: false,
      now,
      transitionId: 'voyage-jump-invalid-route',
    });
    const result = resolveVoyage33JumpCommit(commitInput({ jumpResult: locked }));
    expect(result).toMatchObject({
      status: 'integrity-lockout',
      movementState: {
        ...movement,
        jumpState: { integrityLockedUntil: '2026-09-30T13:00:00.000Z' },
      },
      maintenanceState: { hostShipId, dockingRevision: 3 },
      hostResources: resources,
    });
  });

  it('rejects forged jump results that change the vessel, origin, distance, or host debit', () => {
    const attempt = jumpedAttempt();
    const changes: Array<[string, JumpAttemptResult]> = [
      ['vessel', { ...attempt, transition: { ...attempt.transition, shipId: 'aegis' } }],
      ['origin', { ...attempt, origin: '5143', transition: { ...attempt.transition, origin: '5143' } }],
      ['fuel cost', { ...attempt, fuelCost: 2, remainingFuel: 6 }],
      ['remaining fuel', { ...attempt, remainingFuel: 99 }],
      ['transition destination', { ...attempt, transition: { ...attempt.transition, destination: '9997' } }],
    ];
    for (const [_label, jumpResult] of changes) {
      expect(() => resolveVoyage33JumpCommit(commitInput({ jumpResult }))).toThrow();
    }
  });

  it('fails closed on malformed Voyage movement state', () => {
    const malformed = { ...movement, coordinate: 'not-on-chart', revision: -1 } as Voyage33MovementState;
    expect(() => resolveVoyage33JumpCommit(commitInput({ movementState: malformed }))).toThrow();
  });
});
