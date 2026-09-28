/** The full-ship command role whose replacement can end a printed mutiny. */
const CAPTAIN_ROLE_BY_SHIP: Readonly<Record<string, string>> = {
  aegis: 'admiral',
  dione: 'dione-captain',
  icebreaker: 'icebreaker-captain',
  shepherd: 'shepherd-captain',
  quellon: 'quellon-captain',
  'refinery-124': 'refinery-124-captain',
  capybara: 'capybara-captain',
};

export function captainRoleForShip(shipId: string): string | undefined {
  return CAPTAIN_ROLE_BY_SHIP[shipId];
}

export interface ShipMutiny {
  readonly status: 'active' | 'resolved';
  readonly revision: number;
  readonly triggerUnrest: number;
  readonly triggeredAt: string;
  readonly reduction?: number;
  readonly recoveryRequestId?: string;
  readonly recoveredAt?: string;
}

export function parseShipMutiny(value: unknown): ShipMutiny | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if ((raw.status !== 'active' && raw.status !== 'resolved') ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !Number.isSafeInteger(raw.triggerUnrest) || (raw.triggerUnrest as number) < 8 ||
      (raw.triggerUnrest as number) > 10 || typeof raw.triggeredAt !== 'string') return undefined;
  if (raw.status === 'resolved' && (
    typeof raw.recoveryRequestId !== 'string' || typeof raw.recoveredAt !== 'string' ||
    !Number.isSafeInteger(raw.reduction) || (raw.reduction as number) < 1 ||
    (raw.reduction as number) > 3
  )) return undefined;
  return raw as unknown as ShipMutiny;
}

/** Legacy sessions at 8+ fail closed even without an explicit record. */
export function isShipInMutiny(record: ShipMutiny | undefined, unrest: number): boolean {
  return record?.status === 'active' || (unrest >= 8 && record?.status !== 'resolved');
}

/** Any renewed gain at 8+ retriggers mutiny after a prior captain recovery. */
export function mutinyAfterUnrestChange(
  record: ShipMutiny | undefined,
  before: number,
  after: number,
  at: string,
): ShipMutiny | undefined {
  if (!record && before >= 8) {
    return { status: 'active', revision: 1, triggerUnrest: before, triggeredAt: at };
  }
  if (after <= before || after < 8 || record?.status === 'active') return record;
  return {
    status: 'active', revision: (record?.revision ?? 0) + 1,
    triggerUnrest: after, triggeredAt: at,
  };
}

/** Only a GM-validated new captain and selected printed reduction may call this. */
export function resolveShipMutiny(
  record: ShipMutiny | undefined,
  unrest: number,
  reduction: number,
  oldCaptainUid: string | null,
  newCaptainUid: string,
  requestId: string,
  at: string,
): { readonly mutiny: ShipMutiny; readonly unrest: number } {
  if (!isShipInMutiny(record, unrest)) throw new Error('The ship is not in mutiny.');
  if (!Number.isSafeInteger(reduction) || reduction < 1 || reduction > 3) {
    throw new Error('Choose a printed unrest reduction from 1 to 3.');
  }
  if (!newCaptainUid || oldCaptainUid === newCaptainUid) {
    throw new Error('Install a different captain.');
  }
  return {
    unrest: Math.max(0, unrest - reduction),
    mutiny: {
      status: 'resolved', revision: (record?.revision ?? 0) + 1,
      triggerUnrest: record?.triggerUnrest ?? unrest,
      triggeredAt: record?.triggeredAt ?? at,
      reduction, recoveryRequestId: requestId, recoveredAt: at,
    },
  };
}

/** Resolve a crew-commanded vessel after the GM confirms an in-world replacement. */
export function resolveAttestedShipMutiny(
  record: ShipMutiny | undefined,
  unrest: number,
  reduction: number,
  requestId: string,
  at: string,
): { readonly mutiny: ShipMutiny; readonly unrest: number } {
  if (!isShipInMutiny(record, unrest)) throw new Error('The ship is not in mutiny.');
  if (!Number.isSafeInteger(reduction) || reduction < 1 || reduction > 3) {
    throw new Error('Choose a printed unrest reduction from 1 to 3.');
  }
  return {
    unrest: Math.max(0, unrest - reduction),
    mutiny: {
      status: 'resolved', revision: (record?.revision ?? 0) + 1,
      triggerUnrest: record?.triggerUnrest ?? unrest,
      triggeredAt: record?.triggeredAt ?? at,
      reduction, recoveryRequestId: requestId, recoveredAt: at,
    },
  };
}
