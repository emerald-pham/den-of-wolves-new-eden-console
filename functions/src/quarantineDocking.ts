export interface QuarantineDockingAcceptance {
  readonly shipId: string;
  readonly shuttleId: string;
  readonly cycle: number;
  readonly requestId: string;
  readonly acceptedAt: string;
}

export interface QuarantineDockingState {
  readonly type: 'quarantine-docking';
  readonly status: 'active' | 'released';
  readonly crisisId: string;
  readonly crisisRevision: number;
  readonly revision: number;
  readonly affectedShipIds: readonly string[];
  readonly acceptedByShip: Readonly<Record<string, QuarantineDockingAcceptance>>;
  readonly communications: 'allowed';
}

function safeId(value: unknown, maximum = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

export function parseQuarantineDockingState(value: unknown): QuarantineDockingState | null {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => ![
    'type', 'status', 'crisisId', 'crisisRevision', 'revision', 'affectedShipIds',
    'acceptedByShip', 'communications',
  ].includes(key)) || raw.type !== 'quarantine-docking' ||
      raw.status !== 'active' && raw.status !== 'released' ||
      !safeId(raw.crisisId, 80) || !Number.isSafeInteger(raw.crisisRevision) ||
      (raw.crisisRevision as number) < 1 || !Number.isSafeInteger(raw.revision) ||
      (raw.revision as number) < 1 || !Array.isArray(raw.affectedShipIds) ||
      raw.affectedShipIds.length === 0 || raw.affectedShipIds.length > 20 ||
      raw.affectedShipIds.some((shipId) =>
        typeof shipId !== 'string' || !isResourceShipId(shipId)) ||
      new Set(raw.affectedShipIds).size !== raw.affectedShipIds.length ||
      typeof raw.acceptedByShip !== 'object' || raw.acceptedByShip === null ||
      Array.isArray(raw.acceptedByShip) || raw.communications !== 'allowed') return null;
  const acceptedByShip: Record<string, QuarantineDockingAcceptance> = {};
  for (const [shipId, value] of Object.entries(raw.acceptedByShip as Record<string, unknown>)) {
    if (!isResourceShipId(shipId) || !raw.affectedShipIds.includes(shipId) ||
        typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const acceptance = value as Record<string, unknown>;
    if (Object.keys(acceptance).some((key) => ![
      'shipId', 'shuttleId', 'cycle', 'requestId', 'acceptedAt',
    ].includes(key)) || acceptance.shipId !== shipId || !safeId(acceptance.shuttleId, 80) ||
        !Number.isSafeInteger(acceptance.cycle) || (acceptance.cycle as number) < 0 ||
        !safeId(acceptance.requestId) || typeof acceptance.acceptedAt !== 'string' ||
        !Number.isFinite(Date.parse(acceptance.acceptedAt))) return null;
    acceptedByShip[shipId] = acceptance as unknown as QuarantineDockingAcceptance;
  }
  return {
    type: 'quarantine-docking', status: raw.status, crisisId: raw.crisisId,
    crisisRevision: raw.crisisRevision as number, revision: raw.revision as number,
    affectedShipIds: [...raw.affectedShipIds], acceptedByShip,
    communications: 'allowed',
  };
}

export function setQuarantineDockingPolicy(input: Readonly<{
  existing: QuarantineDockingState | null;
  action: 'activate' | 'release';
  crisisId: string;
  crisisRevision: number;
  affectedShipIds: readonly string[];
}>): QuarantineDockingState {
  if (!safeId(input.crisisId, 80) || !Number.isSafeInteger(input.crisisRevision) ||
      input.crisisRevision < 1 || input.affectedShipIds.length === 0 ||
      input.affectedShipIds.some((shipId) => !isResourceShipId(shipId)) ||
      new Set(input.affectedShipIds).size !== input.affectedShipIds.length) {
    throw new Error('The quarantine docking policy is malformed.');
  }
  const sameCrisis = input.existing?.crisisId === input.crisisId;
  return {
    type: 'quarantine-docking',
    status: input.action === 'activate' ? 'active' : 'released',
    crisisId: input.crisisId,
    crisisRevision: input.crisisRevision,
    revision: (input.existing?.revision ?? 0) + 1,
    affectedShipIds: [...input.affectedShipIds],
    acceptedByShip: sameCrisis ? input.existing!.acceptedByShip : {},
    communications: 'allowed',
  };
}

/** Reserve one inbound docking slot without changing any communication authority. */
export function acceptQuarantineDocking(input: Readonly<{
  state: QuarantineDockingState | null;
  previousHostShipId: string;
  hostShipId: string;
  shuttleId: string;
  cycle: number;
  requestId: string;
  acceptedAt: string;
}>): QuarantineDockingState | null {
  const { state } = input;
  if (!state || state.status !== 'active' || input.previousHostShipId === input.hostShipId ||
      !state.affectedShipIds.includes(input.hostShipId)) return state;
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 0 || !safeId(input.shuttleId, 80) ||
      !safeId(input.requestId) || !Number.isFinite(Date.parse(input.acceptedAt))) {
    throw new Error('The quarantine docking acceptance is malformed.');
  }
  const current = state.acceptedByShip[input.hostShipId];
  if (current?.cycle === input.cycle) {
    throw new Error('That quarantined ship has already accepted one shuttle this cycle.');
  }
  return {
    ...state,
    revision: state.revision + 1,
    acceptedByShip: {
      ...state.acceptedByShip,
      [input.hostShipId]: {
        shipId: input.hostShipId, shuttleId: input.shuttleId, cycle: input.cycle,
        requestId: input.requestId, acceptedAt: input.acceptedAt,
      },
    },
  };
}
import { isResourceShipId } from './resources';
