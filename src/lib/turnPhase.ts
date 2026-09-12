import type { GameSession, TurnPhase, TurnState } from '@/types/game';

export type TurnPhaseReadout = {
  readonly kind: 'team' | 'open' | 'complete';
  readonly remainingMs: number;
};

/** Safely read the complete server-owned turn entity when present. */
export function turnStateState(value: unknown): TurnState | undefined {
  if (!record(value)) return undefined;
  const { currentTurn, maxTurn, phase, phaseRevision, startedAt, endsAt } = value;
  if (
    typeof currentTurn !== 'number' || !Number.isSafeInteger(currentTurn) || currentTurn < 1 ||
    (maxTurn !== 6 && maxTurn !== 7 && maxTurn !== 8) || currentTurn > maxTurn ||
    (phase !== 'team' && phase !== 'coordination') ||
    typeof phaseRevision !== 'number' || !Number.isSafeInteger(phaseRevision) || phaseRevision < 1 ||
    !instant(startedAt) || !instant(endsAt) || Date.parse(endsAt) < Date.parse(startedAt)
  ) return undefined;
  return {
    currentTurn,
    maxTurn,
    phase,
    phaseRevision,
    startedAt,
    endsAt,
  };
}

/** Accept a turn entity only when it matches the authoritative phase context. */
export function turnStateForPhaseContext(
  value: unknown,
  phase: TurnPhase | undefined,
  currentTurn: unknown,
  maxTurn: unknown,
): TurnState | undefined {
  const turnState = turnStateState(value);
  if (
    !turnState || !phase ||
    typeof currentTurn !== 'number' || !Number.isSafeInteger(currentTurn) || currentTurn < 1 ||
    (maxTurn !== 6 && maxTurn !== 7 && maxTurn !== 8) ||
    phase.turn !== currentTurn ||
    turnState.currentTurn !== currentTurn ||
    turnState.maxTurn !== maxTurn ||
    turnState.phase !== (phase.airspace.state === 'lifted' ? 'coordination' : 'team') ||
    turnState.endsAt !== (phase.airspace.state === 'lifted'
      ? phase.openAirspaceEndsAt
      : phase.teamPhaseEndsAt) ||
    (turnState.phase === 'coordination' && turnState.startedAt !== phase.teamPhaseEndsAt)
  ) return undefined;
  return turnState;
}

export function turnLimitForSession(
  session: Pick<GameSession, 'turnLimit' | 'setup'>,
): 6 | 7 | 8 | undefined {
  if (session.turnLimit === 6 || session.turnLimit === 7 || session.turnLimit === 8) {
    return session.turnLimit;
  }
  const nested = session.setup?.turnLimit;
  return nested === 6 || nested === 7 || nested === 8 ? nested : undefined;
}

/** Replace the optional projection without retaining a stale prior entity. */
export function replaceTurnStateOnPhase(
  session: GameSession,
  phase: TurnPhase,
  turnState: TurnState | undefined,
): GameSession {
  const nextSession = { ...session, turnPhase: phase };
  if (turnState === undefined) delete nextSession.turnState;
  else nextSession.turnState = turnState;
  return nextSession;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function instant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function timerPauseState(value: unknown): NonNullable<TurnPhase['timerPause']> | undefined {
  if (!record(value)) return undefined;
  const window = value.window;
  const remainingMs = value.remainingMs;
  const pausedAt = value.pausedAt;
  if (
    (window !== 'restricted' && window !== 'open') ||
    typeof remainingMs !== 'number' || !Number.isSafeInteger(remainingMs) || remainingMs < 0 ||
    !instant(pausedAt)
  ) return undefined;
  return { window, remainingMs, pausedAt };
}

/** Safely read a server-owned phase clock from a live snapshot or callable reply. */
export function turnPhaseState(value: unknown): TurnPhase | undefined {
  if (!record(value) || !record(value.airspace)) return undefined;
  const turn = value.turn;
  const teamPhaseEndsAt = value.teamPhaseEndsAt;
  const openAirspaceEndsAt = value.openAirspaceEndsAt;
  const airspace = value.airspace;
  const hasTimerPause = value.timerPause !== undefined;
  const timerPause = hasTimerPause ? timerPauseState(value.timerPause) : undefined;
  if (
    typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 1 ||
    !instant(teamPhaseEndsAt) || !instant(openAirspaceEndsAt) ||
    Date.parse(openAirspaceEndsAt) < Date.parse(teamPhaseEndsAt) ||
    (airspace.state !== 'restricted' && airspace.state !== 'lifted') ||
    typeof airspace.tickerActive !== 'boolean' || typeof airspace.pressAccess !== 'boolean' ||
    (hasTimerPause && !timerPause)
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
    ...(timerPause ? { timerPause } : {}),
  };
}

/** Ignore stale phase data as soon as the server has moved the shared turn on. */
export function phaseForSession(
  session: Pick<GameSession, 'currentTurn' | 'turnPhase'> | null | undefined,
): TurnPhase | undefined {
  const phase = turnPhaseState(session?.turnPhase);
  const currentTurn = session?.currentTurn ?? 1;
  return phase?.turn === currentTurn ? phase : undefined;
}

export function turnPhaseReadout(
  phase: TurnPhase | undefined,
  now = Date.now(),
): TurnPhaseReadout | undefined {
  if (!phase) return undefined;
  if (phase.timerPause) {
    return {
      kind: phase.timerPause.window === 'restricted' ? 'team' : 'open',
      remainingMs: phase.timerPause.remainingMs,
    };
  }
  const teamEndsAt = Date.parse(phase.teamPhaseEndsAt);
  const openEndsAt = Date.parse(phase.openAirspaceEndsAt);
  if (now < teamEndsAt) return { kind: 'team', remainingMs: teamEndsAt - now };
  if (now < openEndsAt) return { kind: 'open', remainingMs: openEndsAt - now };
  return { kind: 'complete', remainingMs: 0 };
}

export function hasActiveTurnTimer(
  phase: TurnPhase | undefined,
  now = Date.now(),
): boolean {
  const readout = turnPhaseReadout(phase, now);
  return readout !== undefined && readout.kind !== 'complete';
}

export function formatTurnPhaseCountdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
