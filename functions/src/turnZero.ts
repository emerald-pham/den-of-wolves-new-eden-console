/** Turn 0 is setup time: only an active GM may issue gameplay commands. */
export function isPlayerGameplayLockedAtTurnZero(currentTurn: unknown, role: unknown): boolean {
  return currentTurn === 0 && role !== 'gm';
}

export const TURN_ONE_TEAM_PHASE_DURATION_MS = 10 * 60_000;
export const TURN_ONE_COORDINATION_PHASE_DURATION_MS = 20 * 60_000;
export const SUBSEQUENT_TEAM_PHASE_DURATION_MS = 5 * 60_000;
export const SUBSEQUENT_COORDINATION_PHASE_DURATION_MS = 15 * 60_000;
export const AIRSPACE_EXTENSION_MS = 5 * 60_000;

export type AirspaceWindow = 'restricted' | 'open';

export type TurnPhase = {
  readonly turn: number;
  readonly teamPhaseEndsAt: string;
  readonly openAirspaceEndsAt: string;
  readonly airspace: {
    readonly state: 'restricted' | 'lifted';
    readonly tickerActive: boolean;
    readonly pressAccess: boolean;
  };
};

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function instant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** Read a stored phase only when every server-owned detail is structurally safe. */
export function turnPhaseState(value: unknown): TurnPhase | undefined {
  if (!record(value) || !record(value.airspace)) return undefined;
  const { turn, teamPhaseEndsAt, openAirspaceEndsAt } = value;
  const airspace = value.airspace;
  if (
    typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 1 ||
    !instant(teamPhaseEndsAt) || !instant(openAirspaceEndsAt) ||
    Date.parse(openAirspaceEndsAt) < Date.parse(teamPhaseEndsAt) ||
    (airspace.state !== 'restricted' && airspace.state !== 'lifted') ||
    typeof airspace.tickerActive !== 'boolean' || typeof airspace.pressAccess !== 'boolean'
  ) return undefined;
  return {
    turn,
    teamPhaseEndsAt,
    openAirspaceEndsAt,
    airspace: {
      state: airspace.state,
      tickerActive: airspace.tickerActive,
      pressAccess: airspace.pressAccess,
    },
  };
}

/** Return the real-time schedule appropriate to this numbered turn. */
export function phaseDurationsForTurn(turn: number): {
  readonly teamPhaseMs: number;
  readonly coordinationPhaseMs: number;
} {
  return turn === 1
    ? {
        teamPhaseMs: TURN_ONE_TEAM_PHASE_DURATION_MS,
        coordinationPhaseMs: TURN_ONE_COORDINATION_PHASE_DURATION_MS,
      }
    : {
        teamPhaseMs: SUBSEQUENT_TEAM_PHASE_DURATION_MS,
        coordinationPhaseMs: SUBSEQUENT_COORDINATION_PHASE_DURATION_MS,
      };
}

/** Build the server-owned team-then-coordination schedule for one turn. */
export function startTurnPhase(turn: number, now = Date.now()): TurnPhase {
  const { teamPhaseMs, coordinationPhaseMs } = phaseDurationsForTurn(turn);
  return {
    turn,
    teamPhaseEndsAt: new Date(now + teamPhaseMs).toISOString(),
    openAirspaceEndsAt: new Date(
      now + teamPhaseMs + coordinationPhaseMs,
    ).toISOString(),
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
}

/** Extend only the currently live airspace window by one five-minute increment. */
export function extendActiveTurnPhase(
  phase: TurnPhase,
  window: AirspaceWindow,
  now = Date.now(),
): TurnPhase | undefined {
  const teamPhaseEndsAt = Date.parse(phase.teamPhaseEndsAt);
  const openAirspaceEndsAt = Date.parse(phase.openAirspaceEndsAt);
  if (now >= openAirspaceEndsAt) return undefined;

  if (window === 'restricted') {
    if (phase.airspace.state !== 'restricted' || now >= teamPhaseEndsAt) return undefined;
    return {
      ...phase,
      teamPhaseEndsAt: new Date(teamPhaseEndsAt + AIRSPACE_EXTENSION_MS).toISOString(),
      openAirspaceEndsAt: new Date(openAirspaceEndsAt + AIRSPACE_EXTENSION_MS).toISOString(),
    };
  }

  if (phase.airspace.state !== 'lifted' || now < teamPhaseEndsAt) return undefined;
  return {
    ...phase,
    openAirspaceEndsAt: new Date(openAirspaceEndsAt + AIRSPACE_EXTENSION_MS).toISOString(),
  };
}

export function isTurnPhaseTimerActive(phase: TurnPhase | undefined, now = Date.now()): boolean {
  return phase !== undefined && now < Date.parse(phase.openAirspaceEndsAt);
}
