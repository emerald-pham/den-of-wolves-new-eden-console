import { phaseForSession } from './turnPhase';
import type { GameSession } from '@/types/game';

const MAINTENANCE_OVERDUE_MS = 5 * 60_000;
const MINUTE_MS = 60_000;

type GmClockSession = Pick<GameSession, 'currentTurn' | 'turnPhase' | 'maintenanceCycles'>;

function earlier(left: number | undefined, right: number): number {
  return left === undefined ? right : Math.min(left, right);
}

/**
 * Returns the next instant that can visibly change the GM turn or maintenance
 * instruments. Keeping this event-driven prevents a second-by-second redraw
 * of the complete GM workspace while preserving exact deadline behavior.
 */
export function nextGmClockUpdate(
  session: GmClockSession | null | undefined,
  now = Date.now(),
): number | undefined {
  let next: number | undefined;
  const phaseEndsAt = Date.parse(phaseForSession(session)?.openAirspaceEndsAt ?? '');
  if (Number.isFinite(phaseEndsAt) && phaseEndsAt > now) {
    next = phaseEndsAt;
  }

  for (const cycle of Object.values(session?.maintenanceCycles ?? {})) {
    if (cycle.step === 0 || !cycle.startedAt) continue;
    const startedAt = Date.parse(cycle.startedAt);
    if (!Number.isFinite(startedAt)) continue;
    const overdueAt = startedAt + MAINTENANCE_OVERDUE_MS;
    const nextMaintenanceMinute = now < overdueAt
      ? overdueAt
      : startedAt + (Math.floor((now - startedAt) / MINUTE_MS) + 1) * MINUTE_MS;
    next = earlier(next, nextMaintenanceMinute);
  }

  return next;
}
