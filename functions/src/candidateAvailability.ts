import { HttpsError } from 'firebase-functions/v2/https';

type SessionAuthority = { get(field: string): unknown };
type Fields = Record<string, unknown>;
export interface CandidateCraftReservation {
  readonly code: 'N'; readonly groupId: string; readonly coordinate: string;
  readonly sourceId: string; readonly cycle: number;
}
export type CandidateCraftReservations = Readonly<Record<string, CandidateCraftReservation>>;
import { CANDIDATE_ENGINEERING_SHUTTLES } from './craftOwnership';
export { CANDIDATE_ENGINEERING_SHUTTLES } from './craftOwnership';
const record = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const fail = (message: string): never => { throw new HttpsError('failed-precondition', message); };

function settledVessels(session: SessionAuthority): ReadonlySet<string> {
  const raw = session.get('candidateVesselOutcomes');
  if (raw === undefined) return new Set();
  if (!record(raw)) return fail('Candidate vessel availability is malformed.');
  for (const [shipId, value] of Object.entries(raw)) {
    if (!id(shipId) || !record(value) || Object.keys(value).length !== 6 ||
        Object.keys(value).some(key => !['code', 'groupId', 'shipId', 'sourceId', 'cycle', 'outcome'].includes(key)) ||
        !['N', 'O', 'P'].includes(String(value.code)) || value.shipId !== shipId ||
        typeof value.groupId !== 'string' || !/^fleet-[1-9]\d*$/.test(value.groupId) || !id(value.sourceId) ||
        !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
        !['crossed', 'reached', 'lost', 'left-behind', 'cannibalised', 'settled'].includes(String(value.outcome))) {
      return fail('Candidate vessel availability is malformed.');
    }
  }
  return new Set(Object.keys(raw));
}

/** Use only at fresh-action acceptance, after entitled exact receipt recovery. */
export function requireCandidateVesselsAvailable(session: SessionAuthority, vesselIds: readonly string[]): void {
  const settled = settledVessels(session);
  if (vesselIds.some(shipId => settled.has(shipId))) {
    fail('This vessel has a committed candidate disposition and is unavailable for new actions. Original results remain available.');
  }
}

/** Source rosters retain unsettled vessels when another fleet group has finished. */
export function candidateAvailableVesselIds(session: SessionAuthority, vesselIds: readonly string[]): readonly string[] {
  const settled = settledVessels(session);
  return vesselIds.filter(shipId => !settled.has(shipId));
}

export function parseCandidateCraftReservations(raw: unknown): CandidateCraftReservations {
  if (raw === undefined) return {};
  if (!record(raw)) return fail('Candidate craft availability is malformed.');
  const parsed: Record<string, CandidateCraftReservation> = {};
  for (const [craftId, value] of Object.entries(raw)) {
    if (!(CANDIDATE_ENGINEERING_SHUTTLES as readonly string[]).includes(craftId) || !record(value) ||
        Object.keys(value).length !== 5 ||
        Object.keys(value).some(key => !['code', 'groupId', 'coordinate', 'sourceId', 'cycle'].includes(key)) ||
        value.code !== 'N' || typeof value.groupId !== 'string' || !/^fleet-[1-9]\d*$/.test(value.groupId) ||
        typeof value.coordinate !== 'string' || !/^\d{4}$/.test(value.coordinate) || !id(value.sourceId) ||
        !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1) return fail('Candidate craft availability is malformed.');
    parsed[craftId] = { code: 'N', groupId: value.groupId, coordinate: value.coordinate,
      sourceId: value.sourceId, cycle: value.cycle as number };
  }
  return parsed;
}

export function requireCandidateCraftAvailable(session: SessionAuthority, craftIds: readonly string[]): void {
  const consumed = parseCandidateCraftReservations(session.get('candidateCraftReservations'));
  if (craftIds.some(craftId => Object.hasOwn(consumed, craftId))) {
    fail('This Engineering Shuttle was permanently consumed repairing the Ring and cannot operate again. Original results remain available.');
  }
}

/** Only the bound candidate contribution transaction creates this permanent private binding. */
export function reserveCandidateEngineeringCraft(raw: unknown, craftId: string,
  reservation: CandidateCraftReservation): CandidateCraftReservations {
  const existing = parseCandidateCraftReservations(raw);
  if (Object.hasOwn(existing, craftId)) return fail('This Engineering Shuttle is already consumed by Ring repair.');
  return parseCandidateCraftReservations({ ...existing, [craftId]: reservation });
}


/** Reject a fresh craft action when either the craft or its actual current host has settled. */
export function requireCandidateCraftActionAvailable(session: SessionAuthority, craftIds: readonly string[],
  extraVesselIds: readonly string[] = []): void {
  requireCandidateCraftAvailable(session, craftIds);
  const dockings = session.get('shuttleDockings');
  const smallStates = session.get('smallShipStates');
  const voyage = session.get('voyage33Maintenance');
  const hosts = [
    ...(Array.isArray(dockings) ? dockings.flatMap(entry => record(entry) &&
      craftIds.includes(String(entry.shuttleId)) && typeof entry.shipId === 'string' ? [entry.shipId] : []) : []),
    ...(record(smallStates) ? craftIds.flatMap(craftId => {
      const state = smallStates[craftId];
      return record(state) && typeof state.hostShipId === 'string' ? [state.hostShipId] : [];
    }) : []),
    ...(craftIds.includes('voyage-33-0') && record(voyage) && typeof voyage.hostShipId === 'string' ? [voyage.hostShipId] : []),
  ];
  requireCandidateVesselsAvailable(session, [...extraVesselIds, ...craftIds, ...hosts]);
}
