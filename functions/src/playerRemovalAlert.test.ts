import { expect, it } from 'vitest';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { writePlayerRemovalAlert } from './playerRemovalAlert';

it('retains distinct original removal epochs for the same victim and catastrophe source', () => {
  const records = new Map<string, unknown>();
  const tx = { set: (ref: { path: string }, value: unknown) => records.set(ref.path, value) } as unknown as Transaction;
  const db = { doc: (path: string) => ({ path }) } as Firestore;
  const fields = { role: 'player', assignedRoleId: 'icebreaker-miner', displayName: 'Current player' };
  const player = { exists: true, id: 'original-player', get: (key: string) => fields[key as keyof typeof fields] } as DocumentSnapshot;
  const input = { sessionId: 's1', sourceId: 'damage-destroyed-icebreaker', player,
    cause: 'ship-destroyed' as const, shipId: 'icebreaker', cycle: 1,
    recordedAt: '2026-10-15T06:53:19.000Z', createdAt: 'server-time' };
  writePlayerRemovalAlert(tx, db, { ...input, incidentKey: 'escape-revision-10' });
  writePlayerRemovalAlert(tx, db, { ...input, cycle: 2, incidentKey: 'escape-revision-20' });
  expect(records.size).toBe(2);
  const original = [...records];
  writePlayerRemovalAlert(tx, db, { ...input, incidentKey: 'escape-revision-10' });
  expect([...records]).toEqual(original);
});
