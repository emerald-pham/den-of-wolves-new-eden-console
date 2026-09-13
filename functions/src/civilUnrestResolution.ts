export const CIVIL_UNREST_RESOLUTION_MAX_TEXT = 1000;
export const CIVIL_UNREST_RESOLUTION_MAX_RATIONALE = 2000;

export const CIVIL_UNREST_RESOLUTION_SHIP_IDS = [
  'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124',
] as const;
export type CivilUnrestResolutionShipId = (typeof CIVIL_UNREST_RESOLUTION_SHIP_IDS)[number];

export interface CivilUnrestResolutionInput {
  readonly presidentResponse: string;
  readonly consequence: string;
  readonly rationale: string;
}

export function parseCivilUnrestResolutionInput(value: {
  readonly presidentResponse?: unknown;
  readonly consequence?: unknown;
  readonly rationale?: unknown;
}): CivilUnrestResolutionInput {
  const required = (raw: unknown, field: string): string => {
    if (typeof raw !== 'string' || raw.trim().length === 0) throw new Error(`${field} must be non-empty text.`);
    const text = raw.trim();
    if (text.length > CIVIL_UNREST_RESOLUTION_MAX_TEXT) throw new Error(`${field} is too long.`);
    return text;
  };
  if (typeof value.rationale !== 'string') throw new Error('rationale must be text.');
  const rationale = value.rationale.trim();
  if (rationale.length > CIVIL_UNREST_RESOLUTION_MAX_RATIONALE) throw new Error('rationale is too long.');
  return {
    presidentResponse: required(value.presidentResponse, 'presidentResponse'),
    consequence: required(value.consequence, 'consequence'),
    rationale,
  };
}

export interface StoredCivilUnrestResolution extends CivilUnrestResolutionInput {
  readonly type: 'civil-unrest-resolution';
  readonly sessionId: string;
  readonly crisisId: string;
  readonly crisisRevision: number;
  readonly state: 'debated';
  readonly revision: number;
  readonly grievanceRevisions: readonly { readonly shipId: CivilUnrestResolutionShipId; readonly revision: number | null }[];
  readonly recordedBy: 'facilitator';
  readonly actorUid: string;
  readonly instanceId: string;
}

export function parseStoredCivilUnrestResolution(value: unknown): StoredCivilUnrestResolution | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  let input: CivilUnrestResolutionInput;
  try {
    input = parseCivilUnrestResolutionInput(raw);
  } catch {
    return null;
  }
  if (
    raw.type !== 'civil-unrest-resolution' || typeof raw.sessionId !== 'string' ||
    typeof raw.crisisId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.crisisId) ||
    raw.state !== 'debated' || !Number.isSafeInteger(raw.crisisRevision) || (raw.crisisRevision as number) < 1 ||
    !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
    raw.recordedBy !== 'facilitator' || typeof raw.actorUid !== 'string' || raw.actorUid.length === 0 ||
    typeof raw.instanceId !== 'string' || raw.instanceId.length === 0 || !Array.isArray(raw.grievanceRevisions) ||
    raw.grievanceRevisions.length !== CIVIL_UNREST_RESOLUTION_SHIP_IDS.length
  ) return null;
  const grievanceRevisions = raw.grievanceRevisions.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    const shipId = CIVIL_UNREST_RESOLUTION_SHIP_IDS[index];
    if (item.shipId !== shipId || (item.revision !== null &&
        (!Number.isSafeInteger(item.revision) || (item.revision as number) < 1))) return null;
    return { shipId, revision: item.revision as number | null };
  });
  if (grievanceRevisions.some((value) => value === null)) return null;
  return {
    type: 'civil-unrest-resolution', sessionId: raw.sessionId, crisisId: raw.crisisId,
    crisisRevision: raw.crisisRevision as number, state: 'debated', revision: raw.revision as number,
    ...input, grievanceRevisions: grievanceRevisions as StoredCivilUnrestResolution['grievanceRevisions'],
    recordedBy: 'facilitator', actorUid: raw.actorUid, instanceId: raw.instanceId,
  };
}
