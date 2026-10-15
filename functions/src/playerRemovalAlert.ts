import { createHash } from 'node:crypto';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { roleBriefFor } from './roleBriefs';
import { replacementRoleFor } from './replacementRoles';
import { parsePlayerRemovalEvent, type PlayerRemovalCause } from './playerRemovalEvent';

/** Call only inside the transaction that commits the actual incident, with its
 * already-read victim. Never read after writes or use client-supplied identity. */
export function writePlayerRemovalAlert(tx: Pick<Transaction, 'set'>, db: Pick<Firestore, 'doc'>,
  input: Readonly<{ sessionId: string; sourceId: string; player: DocumentSnapshot;
    cause: PlayerRemovalCause; shipId?: string; cycle: number; createdAt: unknown; recordedAt: string;
    roleId?: string; incidentKey?: string }>): void {
  if (!input.player.exists || input.player.get('role') !== 'player' || input.player.get('kickedAt') != null) return;
  const selectedRole = input.roleId ?? input.player.get('replacementRoleId') ??
    input.player.get('assignedRoleId') ?? input.player.get('activeConsoleRoleId');
  const brief = typeof selectedRole === 'string' ? roleBriefFor(selectedRole) : undefined;
  const replacement = typeof selectedRole === 'string' ? replacementRoleFor(selectedRole) : undefined;
  const roleId = brief || replacement ? selectedRole as string : null;
  const displayName = input.player.get('displayName');
  const record = parsePlayerRemovalEvent({ type: 'player-removal', sessionId: input.sessionId,
    sourceId: input.sourceId, playerUid: input.player.id,
    playerName: typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 40) : 'Player',
    roleId, roleName: replacement?.name ?? (brief ? `${brief.vesselName} ${brief.roleName}` : 'Unassigned'),
    cause: input.cause, shipId: input.shipId ?? null, cycle: input.cycle, createdAt: input.recordedAt }, input.sessionId);
  if (!record) throw new Error('The authoritative player-removal alert is malformed.');
  const id = createHash('sha256').update(JSON.stringify([input.incidentKey ?? input.sourceId, input.player.id, input.cause])).digest('hex');
  tx.set(db.doc(`sessions/${input.sessionId}/procedureAudits/player-removal-${id}`), {
    ...record, createdAt: input.createdAt,
  });
}
