/**
 * The printed admission facts for G.I.V. Voyage 33-0.
 *
 * Admission records the vessel and the commitments its printed card places
 * on a future host. It deliberately does not choose a host or spend a
 * resource: those are Team Phase and later arrival/maintenance actions.
 */
export const VOYAGE_33_ID = 'voyage-33-0' as const;
export const VOYAGE_33_POPULATION = 40_000 as const;
export const VOYAGE_33_UNREST = 0 as const;

export const VOYAGE_33_COMMITMENTS = {
  requiresHostDocking: true,
  hostProvidesResources: true,
  maintenanceSteps: [1, 2, 3, 4] as const,
  maxConsoleCharges: 1,
} as const;

export interface Voyage33Admission {
  readonly type: 'voyage-admission';
  readonly sessionId: string;
  readonly id: typeof VOYAGE_33_ID;
  readonly status: 'admitted';
  readonly crisisId: string;
  readonly crisisRevision: number;
  readonly population: typeof VOYAGE_33_POPULATION;
  readonly unrest: typeof VOYAGE_33_UNREST;
  readonly hostShipId: null;
  readonly commitments: typeof VOYAGE_33_COMMITMENTS;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Parse a stored admission, failing closed on a malformed public projection. */
export function parseVoyage33Admission(value: unknown, sessionId?: string): Voyage33Admission | undefined {
  const raw = record(value);
  const commitments = record(raw?.commitments);
  if (!raw || raw.type !== 'voyage-admission' || raw.id !== VOYAGE_33_ID || raw.status !== 'admitted' ||
      (sessionId !== undefined && raw.sessionId !== sessionId) || typeof raw.sessionId !== 'string' ||
      raw.sessionId.length === 0 || typeof raw.crisisId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(raw.crisisId) || !isSafeNonNegativeInteger(raw.crisisRevision) ||
      raw.population !== VOYAGE_33_POPULATION || raw.unrest !== VOYAGE_33_UNREST || raw.hostShipId !== null ||
      !commitments || commitments.requiresHostDocking !== true || commitments.hostProvidesResources !== true ||
      JSON.stringify(commitments.maintenanceSteps) !== JSON.stringify(VOYAGE_33_COMMITMENTS.maintenanceSteps) ||
      commitments.maxConsoleCharges !== VOYAGE_33_COMMITMENTS.maxConsoleCharges) return undefined;
  return {
    type: 'voyage-admission',
    sessionId: raw.sessionId,
    id: VOYAGE_33_ID,
    status: 'admitted',
    crisisId: raw.crisisId,
    crisisRevision: raw.crisisRevision,
    population: VOYAGE_33_POPULATION,
    unrest: VOYAGE_33_UNREST,
    hostShipId: null,
    commitments: VOYAGE_33_COMMITMENTS,
  };
}
