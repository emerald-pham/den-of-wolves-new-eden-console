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

const PRINTED_SYSTEMS = new Set([
  '0000', '5143', '1413', '9997', '6837', '0488', '6931', '4454',
  '4753', '1096', '6964', '2580', '3068', '0853', '6943', '6798',
  '8378', '1964', '1380', '1836', '0408', '4888',
]);

const STAR_CHART_CONNECTIONS: readonly (readonly [string, string])[] = [
  ['0000', '5143'], ['0000', '1413'],
  ['5143', '9997'], ['5143', '6837'],
  ['1413', '6837'], ['1413', '0488'],
  ['9997', '6931'], ['6837', '0488'], ['6837', '6931'], ['6837', '4454'],
  ['0488', '4454'], ['6931', '4454'], ['6931', '4753'], ['6931', '1096'],
  ['4454', '1096'], ['4454', '6964'], ['4753', '1096'], ['4753', '3068'],
  ['4753', '2580'], ['1096', '3068'], ['1096', '0853'], ['1096', '6964'],
  ['6964', '0853'], ['6964', '6943'], ['2580', '6798'], ['3068', '6798'],
  ['3068', '8378'], ['3068', '0853'], ['0853', '8378'], ['0853', '1964'],
  ['6943', '1964'], ['6798', '1380'], ['6798', '1836'], ['8378', '1836'],
  ['8378', '0408'], ['8378', '1964'], ['1964', '0408'], ['1964', '4888'],
  ['1380', '1836'], ['0408', '4888'],
];

const NEIGHBORS = new Map<string, string[]>();
for (const [from, to] of STAR_CHART_CONNECTIONS) {
  NEIGHBORS.set(from, [...(NEIGHBORS.get(from) ?? []), to]);
  NEIGHBORS.set(to, [...(NEIGHBORS.get(to) ?? []), from]);
}

const JUMP_COSTS: Readonly<Record<string, readonly [number, number, number]>> = {
  aegis: [2, 3, 6],
  dione: [2, 4, 8],
  icebreaker: [3, 6, 12],
  capybara: [3, 6, 12],
  shepherd: [3, 6, 12],
  quellon: [2, 4, 8],
  'refinery-124': [2, 4, 8],
};

function distanceBetween(origin: string, destination: string): number | null {
  if (!PRINTED_SYSTEMS.has(origin) || !PRINTED_SYSTEMS.has(destination)) return null;
  if (origin === destination) return 0;
  const queue: Array<readonly [string, number]> = [[origin, 0]];
  const visited = new Set([origin]);
  while (queue.length > 0) {
    const [coordinate, distance] = queue.shift()!;
    for (const neighbor of NEIGHBORS.get(coordinate) ?? []) {
      if (neighbor === destination) return distance + 1;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, distance + 1]);
      }
    }
  }
  return null;
}

export function jumpLengthBetween(origin: string, destination: string): JumpLength | null {
  const distance = distanceBetween(origin, destination);
  if (distance === null || distance === 0) return null;
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
    throw new Error('This ship has already jumped this turn.');
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
