import { jumpDistanceBetween } from './starChartGraph';

export const JUMP_INTEGRITY_LOCKOUT_MS = 60 * 60 * 1000;

export type JumpLength = 'short' | 'medium' | 'long';

export interface JumpDriveState {
  readonly lastJumpTurn?: number;
  readonly integrityLockedUntil?: string;
}

export interface JumpTransition {
  readonly id: string;
  readonly shipId: string;
  readonly origin: string;
  readonly destination: string;
  readonly occurredAt: string;
}

export interface JumpAttemptInput {
  readonly shipId: string;
  readonly origin: string;
  readonly destination: string;
  readonly currentTurn: number;
  readonly fuel: number;
  readonly charged: boolean;
  readonly damaged: boolean;
  readonly upgraded: boolean;
  readonly now: Date;
  readonly transitionId: string;
  readonly state?: JumpDriveState;
  /** Injected by the callable so damaged-drive outcomes remain testable. */
  readonly integrityRoll?: number;
}

export type JumpAttemptResult =
  | {
    readonly status: 'integrity-locked';
    readonly origin: string;
    readonly destination: string;
    readonly integrityLockedUntil: string;
    readonly state: JumpDriveState;
  }
  | {
    readonly status: 'integrity-lockout';
    readonly origin: string;
    readonly destination: string;
    readonly integrityLockedUntil: string;
    readonly state: JumpDriveState;
  }
  | {
    readonly status: 'drive-failure';
    readonly origin: string;
    readonly destination: string;
    readonly state: JumpDriveState;
  }
  | {
    readonly status: 'jumped';
    readonly origin: string;
    readonly destination: string;
    readonly length: JumpLength;
    readonly fuelCost: number;
    readonly remainingFuel: number;
    readonly state: JumpDriveState;
    readonly transition: JumpTransition;
  };

const JUMP_COSTS: Readonly<Record<string, readonly [number, number, number]>> = {
  aegis: [2, 3, 6],
  dione: [2, 4, 8],
  icebreaker: [3, 6, 12],
  capybara: [3, 6, 12],
  shepherd: [3, 6, 12],
  quellon: [2, 4, 8],
  'refinery-124': [2, 4, 8],
};

export function jumpLengthBetween(origin: string, destination: string): JumpLength | null {
  const distance = jumpDistanceBetween(origin, destination);
  if (distance === null || distance === 0) return null;
  // CORE_RULES defines edge-based lengths but leaves the numeric bands unresolved;
  // retain the existing product policy until the printed boundary is decided.
  return distance === 1 ? 'short' : distance === 2 ? 'medium' : 'long';
}

export function jumpFuelCost(shipId: string, length: JumpLength, upgraded: boolean): number {
  const costs = JUMP_COSTS[shipId];
  if (!costs) throw new Error('This ship has no jump-drive profile.');
  const index = length === 'short' ? 0 : length === 'medium' ? 1 : 2;
  return Math.max(0, (costs[index] ?? 0) - (upgraded ? 1 : 0));
}

function activeLockout(state: JumpDriveState | undefined, now: Date): string | undefined {
  const until = state?.integrityLockedUntil;
  if (!until) return undefined;
  const expiry = Date.parse(until);
  return Number.isFinite(expiry) && expiry > now.getTime() ? until : undefined;
}

function integrityLockout(input: JumpAttemptInput): JumpAttemptResult {
  const integrityLockedUntil = new Date(
    input.now.getTime() + JUMP_INTEGRITY_LOCKOUT_MS,
  ).toISOString();
  return {
    status: 'integrity-lockout',
    origin: input.origin,
    destination: input.destination,
    integrityLockedUntil,
    state: { ...input.state, integrityLockedUntil },
  };
}

export function resolveJumpAttempt(input: JumpAttemptInput): JumpAttemptResult {
  const lockedUntil = activeLockout(input.state, input.now);
  if (lockedUntil) {
    return {
      status: 'integrity-locked',
      origin: input.origin,
      destination: input.destination,
      integrityLockedUntil: lockedUntil,
      state: input.state ?? {},
    };
  }
  if (!input.charged) throw new Error('The Jump Drive must be charged before departure.');

  const length = jumpLengthBetween(input.origin, input.destination);
  if (!length) return integrityLockout(input);

  const fuelCost = jumpFuelCost(input.shipId, length, input.upgraded);
  if (input.fuel < fuelCost) throw new Error('Insufficient strytium fuel for this jump.');
  if (input.state?.lastJumpTurn === input.currentTurn) {
    throw new Error('This ship has already jumped this cycle.');
  }

  const failureRollLimit = input.upgraded ? 1 : 3;
  if (input.damaged && (input.integrityRoll ?? 6) <= failureRollLimit) {
    return {
      status: 'drive-failure',
      origin: input.origin,
      destination: input.destination,
      state: input.state ?? {},
    };
  }

  const occurredAt = input.now.toISOString();
  return {
    status: 'jumped',
    origin: input.origin,
    destination: input.destination,
    length,
    fuelCost,
    remainingFuel: input.fuel - fuelCost,
    state: { lastJumpTurn: input.currentTurn },
    transition: {
      id: input.transitionId,
      shipId: input.shipId,
      origin: input.origin,
      destination: input.destination,
      occurredAt,
    },
  };
}
