import { turnPhaseState, turnStateState } from './turnPhase';
import type { TurnPhase } from '@/types/game';

export interface WolfAttackTimerIntervention {
  readonly expectedAttackRevision: number;
  readonly reason: string;
  readonly dangerConfirmed: true;
}
interface ExpectedIntervention extends WolfAttackTimerIntervention {
  readonly sessionId: string;
  readonly requestId: string;
  readonly turn: number;
  readonly paused: boolean;
}
const STEPS = ['targeting', 'long-range', 'medium-range', 'short-range', 'boarding'];
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}
function instant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function safePause(value: unknown): boolean {
  if (value === null) return true;
  const pause = record(value);
  return Boolean(pause && only(pause, ['window', 'remainingMs', 'pausedAt', 'reason']) &&
    (pause.window === 'restricted' || pause.window === 'open') &&
    Number.isSafeInteger(pause.remainingMs) && (pause.remainingMs as number) >= 0 &&
    instant(pause.pausedAt) &&
    (pause.reason === undefined || pause.reason === 'empty-session' || pause.reason === 'turn-interstitial'));
}
function samePause(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  const first=record(a),second=record(b);
  return Boolean(first && second && ['window','remainingMs','pausedAt','reason'].every(key=>first[key]===second[key]));
}
function safeSide(value: Record<string, unknown>): boolean {
  return only(value, ['attackRevision','currentStep','teamPhaseEndsAt','openAirspaceEndsAt','timerPause']) &&
    Object.keys(value).length === 5 && Number.isSafeInteger(value.attackRevision) &&
    (value.attackRevision as number) >= 1 && STEPS.includes(String(value.currentStep)) &&
    instant(value.teamPhaseEndsAt) && instant(value.openAirspaceEndsAt) && safePause(value.timerPause);
}

/** Admit only the scoped, request-bound GM timer receipt before hydrating a clock. */
export function attackTimerInterventionPhase(value: unknown, expected: ExpectedIntervention): TurnPhase | null {
  const reply=record(value),delta=record(reply?.delta),from=record(delta?.from),to=record(delta?.to);
  const rollback=record(reply?.rollback),rawPhase=record(reply?.turnPhase),airspace=record(rawPhase?.airspace);
  const phase=turnPhaseState(reply?.turnPhase);
  if (!reply || !only(reply,['status','type','sessionId','requestId','turn','revision','action','reason',
    'dangerConfirmed','delta','rollback','turnPhase','turnState']) ||
    reply.status!=='committed' || reply.type!=='wolf-attack-timer-intervention' ||
    reply.sessionId!==expected.sessionId || reply.requestId!==expected.requestId || reply.turn!==expected.turn ||
    reply.revision!==expected.expectedAttackRevision+1 || reply.action!==(expected.paused?'paused':'resumed') ||
    reply.reason!==expected.reason || reply.dangerConfirmed!==true ||
    !delta || !only(delta,['from','to']) || !from || !to || !safeSide(from) || !safeSide(to) ||
    from.attackRevision!==expected.expectedAttackRevision || to.attackRevision!==reply.revision ||
    from.currentStep!==to.currentStep ||
    (expected.paused ? from.timerPause!==null || to.timerPause===null : from.timerPause===null || to.timerPause!==null) ||
    !rollback || !only(rollback,['allowed']) || rollback.allowed!==false ||
    !phase || !rawPhase || !only(rawPhase,['turn','teamPhaseEndsAt','openAirspaceEndsAt','airspace','timerPause']) ||
    !airspace || !only(airspace,['state','tickerActive','pressAccess']) ||
    phase.turn!==expected.turn || phase.airspace.state!=='restricted' ||
    to.teamPhaseEndsAt!==phase.teamPhaseEndsAt || to.openAirspaceEndsAt!==phase.openAirspaceEndsAt ||
    !safePause(rawPhase.timerPause??null) || !samePause(to.timerPause,rawPhase.timerPause??null) ||
    (reply.turnState!==undefined && !turnStateState(reply.turnState))) return null;
  return phase;
}
