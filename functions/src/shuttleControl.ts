import type { RoleOwnedCraft } from './craftOwnership';

export interface ShuttleControlEntry {
  readonly shuttleId: string;
  readonly ownerRoleId: string;
  readonly ownerUid: string;
  readonly holderUid: string;
  readonly revision: number;
}

export type ShuttleControlState = Readonly<Record<string, ShuttleControlEntry>>;

interface RoleHolder {
  readonly uid: string;
  readonly roleId: string;
}

export function initialShuttleControl(
  craft: readonly RoleOwnedCraft[],
  roleHolders: readonly RoleHolder[],
): ShuttleControlState {
  const holderByRole = new Map<string, string>();
  for (const holder of roleHolders) {
    if (holderByRole.has(holder.roleId)) {
      throw new Error('Role ' + holder.roleId + ' must have exactly one holder.');
    }
    holderByRole.set(holder.roleId, holder.uid);
  }
  return Object.fromEntries(craft.flatMap((entry) => {
    if (entry.kind !== 'shuttle') return [];
    const ownerUid = holderByRole.get(entry.ownerRoleId);
    if (!ownerUid) return [];
    return [[entry.id, {
      shuttleId: entry.id,
      ownerRoleId: entry.ownerRoleId,
      ownerUid,
      holderUid: ownerUid,
      revision: 0,
    } satisfies ShuttleControlEntry]];
  }));
}

export function parseShuttleControl(value: unknown): ShuttleControlState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const parsed: Record<string, ShuttleControlEntry> = {};
  for (const [shuttleId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some((key) =>
      !['shuttleId', 'ownerRoleId', 'ownerUid', 'holderUid', 'revision'].includes(key)) ||
        entry.shuttleId !== shuttleId ||
        typeof entry.ownerRoleId !== 'string' || entry.ownerRoleId.length === 0 ||
        typeof entry.ownerUid !== 'string' || entry.ownerUid.length === 0 ||
        typeof entry.holderUid !== 'string' || entry.holderUid.length === 0 ||
        !Number.isSafeInteger(entry.revision) || (entry.revision as number) < 0) return null;
    parsed[shuttleId] = {
      shuttleId,
      ownerRoleId: entry.ownerRoleId,
      ownerUid: entry.ownerUid,
      holderUid: entry.holderUid,
      revision: entry.revision as number,
    };
  }
  return parsed;
}

export function transferShuttleControl(
  state: ShuttleControlState,
  command: Readonly<{
    shuttleId: string;
    action: 'handoff' | 'reclaim';
    actorUid: string;
    actorIsFacilitator: boolean;
    targetUid?: string;
    expectedRevision: number;
  }>,
): ShuttleControlEntry {
  const current = state[command.shuttleId];
  if (!current) throw new Error('Shuttle control is unavailable.');
  if (current.revision !== command.expectedRevision) throw new Error('Shuttle control is stale.');
  if (!command.actorIsFacilitator && command.actorUid !== current.ownerUid) {
    throw new Error('Only the printed owner or facilitator may transfer shuttle control.');
  }
  const holderUid = command.action === 'reclaim' ? current.ownerUid : command.targetUid;
  if (!holderUid) throw new Error('Choose a shuttle recipient.');
  if (holderUid === current.holderUid) throw new Error('That player already holds the shuttle.');
  return { ...current, holderUid, revision: current.revision + 1 };
}
