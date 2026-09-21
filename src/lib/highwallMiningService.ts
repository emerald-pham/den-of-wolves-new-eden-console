import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export interface HighwallMiningReply {
  readonly status: 'committed' | 'replayed';
  readonly cycle: number;
  readonly revision: number;
  readonly operation: {
    readonly requestId: string;
    readonly resource: 'materials' | 'ore';
    readonly rolls: readonly number[];
    readonly amount: number;
  };
  readonly cargo: { readonly ore: number; readonly materials: number };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function parseReply(value: unknown): HighwallMiningReply {
  const raw = record(value);
  const operation = record(raw?.operation);
  const cargo = record(raw?.cargo);
  const resource = operation?.resource;
  const rolls = operation?.rolls;
  if (!raw || (raw.status !== 'committed' && raw.status !== 'replayed') ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !operation || typeof operation.requestId !== 'string' ||
      (resource !== 'materials' && resource !== 'ore') || !Array.isArray(rolls) ||
      rolls.length !== (resource === 'materials' ? 1 : 3) ||
      rolls.some((roll) => !Number.isSafeInteger(roll) || (roll as number) < 1 || (roll as number) > 6) ||
      !Number.isSafeInteger(operation.amount) ||
      operation.amount !== rolls.reduce((sum, roll) => sum + (roll as number), 0) ||
      !cargo || !Number.isSafeInteger(cargo.ore) || (cargo.ore as number) < 0 ||
      !Number.isSafeInteger(cargo.materials) || (cargo.materials as number) < 0) {
    throw new Error('Highwall mining returned an invalid result. Refresh before operating again.');
  }
  return value as HighwallMiningReply;
}

export async function runHighwallMining(
  resource: 'materials' | 'ore',
  expectedRevision: number,
  expectedControlRevision: number,
  expectedCycle: number,
): Promise<HighwallMiningReply> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before operating Highwall mining.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id, requestId: window.crypto.randomUUID(), resource,
    expectedRevision, expectedControlRevision, expectedCycle,
  };
  const reply = await httpsCallable<typeof payload, unknown>(functions(), 'runHighwallMining')(payload);
  return parseReply(reply.data);
}
