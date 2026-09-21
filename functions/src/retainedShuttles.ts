import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import type { ShuttleControlState } from './shuttleControl';

export interface RetainedShuttleEntry {
  readonly status: 'retained';
  readonly shuttleId: string;
  readonly ownerRoleId: string;
  readonly holderUid: string;
  readonly destroyedHostShipId: string;
  readonly controlRevision: number;
  readonly retainedAt: string;
}

export type RetainedShuttleState = Readonly<Record<string, RetainedShuttleEntry>>;

export function parseRetainedShuttles(value: unknown): RetainedShuttleState | null {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const parsed: Record<string, RetainedShuttleEntry> = {};
  for (const [shuttleId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some((key) => ![
      'status', 'shuttleId', 'ownerRoleId', 'holderUid', 'destroyedHostShipId',
      'controlRevision', 'retainedAt',
    ].includes(key)) || entry.status !== 'retained' || entry.shuttleId !== shuttleId ||
        typeof entry.ownerRoleId !== 'string' || entry.ownerRoleId.length === 0 ||
        typeof entry.holderUid !== 'string' || entry.holderUid.length === 0 ||
        typeof entry.destroyedHostShipId !== 'string' || entry.destroyedHostShipId.length === 0 ||
        !Number.isSafeInteger(entry.controlRevision) || (entry.controlRevision as number) < 0 ||
        typeof entry.retainedAt !== 'string' || !Number.isFinite(Date.parse(entry.retainedAt))) {
      return null;
    }
    parsed[shuttleId] = entry as unknown as RetainedShuttleEntry;
  }
  return parsed;
}

/**
 * Release every shuttle parked at a newly destroyed host into holder custody.
 *
 * The source rule preserves the craft but does not choose a replacement host.
 * A retained craft is therefore deliberately undocked until its holder has a
 * legal living-ship location. Cargo, fuel, control, and visit history are
 * outside this transition and remain unchanged.
 */
export function retainShuttlesFromDestroyedHost(input: Readonly<{
  destroyedHostShipId: string;
  dockings: readonly AuthoritativeShuttleDocking[];
  control: ShuttleControlState;
  retained: RetainedShuttleState;
  retainedAt: string;
}>): Readonly<{
  dockings: readonly AuthoritativeShuttleDocking[];
  retained: RetainedShuttleState;
  retainedShuttleIds: readonly string[];
}> {
  if (!input.destroyedHostShipId || !Number.isFinite(Date.parse(input.retainedAt))) {
    throw new Error('Destroyed-host shuttle retention requires a valid host and server time.');
  }
  const affected = input.dockings.filter((docking) =>
    docking.shipId === input.destroyedHostShipId);
  const retainedShuttleIds = affected.map((docking) => docking.shuttleId);
  if (new Set(retainedShuttleIds).size !== retainedShuttleIds.length) {
    throw new Error('Destroyed-host shuttle docking state contains a duplicate craft.');
  }
  const nextRetained = { ...input.retained };
  for (const docking of affected) {
    const control = input.control[docking.shuttleId];
    if (!control || control.shuttleId !== docking.shuttleId) {
      throw new Error('A retained shuttle has no authoritative holder custody.');
    }
    nextRetained[docking.shuttleId] = {
      status: 'retained',
      shuttleId: docking.shuttleId,
      ownerRoleId: control.ownerRoleId,
      holderUid: control.holderUid,
      destroyedHostShipId: input.destroyedHostShipId,
      controlRevision: control.revision,
      retainedAt: input.retainedAt,
    };
  }
  return {
    dockings: input.dockings.filter((docking) =>
      docking.shipId !== input.destroyedHostShipId),
    retained: nextRetained,
    retainedShuttleIds,
  };
}
