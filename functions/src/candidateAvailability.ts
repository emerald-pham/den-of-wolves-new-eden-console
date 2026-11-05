import { HttpsError } from 'firebase-functions/v2/https';

type SessionAuthority = { get(field: string): unknown };
type Fields = Record<string, unknown>;

const record = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** Call only for fresh actions, after the entitled exact receipt has been returned. */
export function requireCandidateVesselsAvailable(
  session: SessionAuthority,
  vesselIds: readonly string[],
): void {
  const settled = settledVessels(session);
  if (vesselIds.some(shipId => settled.has(shipId))) {
    fail('This vessel has a committed candidate disposition and is unavailable for new actions. Original results remain available.');
  }
}
