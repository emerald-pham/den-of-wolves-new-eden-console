import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export type CandidateCode = 'N' | 'O' | 'P';
export type CandidateActionName = 'contribute-materials' | 'contribute-research' | 'commit-engineering-shuttle' |
  'ring-passage' | 'sabotage-ring' | 'nebula-jump' | 'contribute-reactor';
export interface CandidateAttempt {
  sessionId: string; requestId: string; expectedRevision: number; expectedGroupId: string;
  code: CandidateCode; coordinate: string; action: CandidateActionName; instanceId?: string;
  shipId?: string; amount?: number; trackIds?: string[]; shuttleId?: string;
}
export interface CandidateResult {
  type: 'candidate-action-result'; status: 'committed' | 'replayed'; sessionId: string;
  requestId: string; revision: number; code: CandidateCode; action: CandidateActionName; summary: string;
  outcome?: 'crossed' | 'reached' | 'lost' | 'activated'; fuelSpent?: number; remainingFuel?: number;
}
export interface CandidatePathView {
  code: CandidateCode; coordinate: string; title: string; blockers: string[]; nextActor: string;
  materials: number; materialsRequired: number; researchCount: number; researchRequired: number;
  shuttleCommitted: boolean; repaired: boolean; liberated: boolean; chargeCapacity: number; requiredCapacity: number;
  reactorShipIds: string[]; activated: boolean; sabotaged: boolean; completed: boolean; canSabotage: boolean;
  researchChoices: { id: string; name: string }[]; engineeringShuttles: { id: string; available: boolean }[];
  ships: { shipId: string; result: string; summary?: string; fuelCost: number; fuelSpent?: number;
    reactorCapacity: number; canAct: boolean; blocker: string }[];
}
export interface CandidateWorkspace {
  type: 'candidate-workspace'; sessionId: string; groupId: string; cycle: number; revision: number;
  paths: CandidatePathView[];
  privateCalculations?: { requestId: string; code: CandidateCode; calculation: Record<string, unknown>; result: string }[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function context(expectedGroupId: string) {
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || !me || me.sessionId !== session.id || (me.role !== 'player' && me.role !== 'gm')) {
    throw new Error('Join the session to use candidate operations.');
  }
  if (me.role === 'player' && me.fleetGroupId !== expectedGroupId) throw new Error('Candidate authority changed. Return to Roles and reselect.');
  if (me.role === 'gm' && (!gmInstance || gmInstance.uid !== me.uid || gmInstance.sessionId !== session.id)) {
    throw new Error('A current GM connection is required.');
  }
  return { sessionId: session.id, uid: me.uid, ...(me.role === 'gm' ? { instanceId: gmInstance!.id } : {}) };
}
function pendingKey(sessionId: string, uid: string) { return `dow:candidate-request:${sessionId}:${uid}`; }
function attemptIdentity(value: CandidateAttempt): string {
  return JSON.stringify({ sessionId: value.sessionId, requestId: value.requestId, expectedRevision: value.expectedRevision,
    expectedGroupId: value.expectedGroupId, code: value.code, coordinate: value.coordinate, action: value.action,
    instanceId: value.instanceId ?? null, shipId: value.shipId ?? null, amount: value.amount ?? null,
    trackIds: value.trackIds ?? [], shuttleId: value.shuttleId ?? null });
}
export function recoverCandidateAttempt(expectedGroupId: string): CandidateAttempt | undefined {
  const c = context(expectedGroupId);
  try {
    const text = localStorage.getItem(pendingKey(c.sessionId, c.uid));
    const value: unknown = text ? JSON.parse(text) : undefined;
    if (record(value) && value.sessionId === c.sessionId && value.expectedGroupId === expectedGroupId &&
        typeof value.requestId === 'string' && typeof value.action === 'string' &&
        (value.instanceId === undefined || value.instanceId === c.instanceId)) return value as unknown as CandidateAttempt;
  } catch { /* Unreadable local recovery never creates an action. */ }
  return undefined;
}
export function createCandidateAttempt(choice: Omit<CandidateAttempt, 'sessionId' | 'requestId' | 'instanceId'>): CandidateAttempt {
  requireFreshSessionAuthority('Reconnect before choosing a candidate action.');
  const c = context(choice.expectedGroupId);
  if (recoverCandidateAttempt(choice.expectedGroupId)) throw new Error('Recover the original candidate request before making a new choice.');
  return { ...choice, sessionId: c.sessionId, requestId: crypto.randomUUID(), ...(c.instanceId ? { instanceId: c.instanceId } : {}) };
}
export async function readCandidateWorkspace(expectedGroupId: string): Promise<CandidateWorkspace> {
  requireFreshSessionAuthority('Reconnect to receive the current candidate operations.');
  const c = context(expectedGroupId);
  const payload = { sessionId: c.sessionId, expectedGroupId, ...(c.instanceId ? { instanceId: c.instanceId } : {}) };
  const reply = (await httpsCallable<typeof payload, unknown>(functions(), 'readCandidateWorkspace')(payload)).data;
  if (!record(reply) || reply.type !== 'candidate-workspace' || reply.sessionId !== c.sessionId ||
      reply.groupId !== expectedGroupId || !Number.isSafeInteger(reply.revision) || !Array.isArray(reply.paths) ||
      reply.paths.some(path => !record(path) || !['N', 'O', 'P'].includes(String(path.code)) ||
        typeof path.coordinate !== 'string' || !Array.isArray(path.ships) || !Array.isArray(path.blockers))) {
    throw new Error('The candidate operation report could not be verified. Refresh the live session.');
  }
  const current = useSessionStore.getState();
  if (current.session?.id !== c.sessionId || current.me?.uid !== c.uid ||
      (current.me.role === 'player' && current.me.fleetGroupId !== expectedGroupId)) throw new Error('Candidate audience changed. Return to Roles and reselect.');
  return reply as unknown as CandidateWorkspace;
}
export async function executeCandidateAttempt(attempt: CandidateAttempt): Promise<CandidateResult> {
  requireFreshSessionAuthority('Reconnect to retry the original candidate request.');
  const c = context(attempt.expectedGroupId);
  if (c.sessionId !== attempt.sessionId || (attempt.instanceId && attempt.instanceId !== c.instanceId)) {
    throw new Error('This candidate request belongs to the original session and GM connection.');
  }
  const key = pendingKey(c.sessionId, c.uid);
  const saved = recoverCandidateAttempt(attempt.expectedGroupId);
  if (saved && attemptIdentity(saved) !== attemptIdentity(attempt)) throw new Error('The original candidate request has different choices. Recover it before making another choice.');
  localStorage.setItem(key, JSON.stringify(attempt));
  const reply = (await httpsCallable<CandidateAttempt, unknown>(functions(), 'executeCandidateAction')(attempt)).data;
  const fields = ['type', 'status', 'sessionId', 'requestId', 'revision', 'code', 'action', 'summary', 'outcome', 'fuelSpent', 'remainingFuel'];
  if (!record(reply) || Object.keys(reply).some(field => !fields.includes(field)) ||
      reply.type !== 'candidate-action-result' || !['committed', 'replayed'].includes(String(reply.status)) ||
      reply.sessionId !== attempt.sessionId || reply.code !== attempt.code || reply.action !== attempt.action ||
      (reply.status === 'committed' && reply.requestId !== attempt.requestId) ||
      typeof reply.requestId !== 'string' || !Number.isSafeInteger(reply.revision) || typeof reply.summary !== 'string') {
    throw new Error('The original candidate result needs recovery. Retry this same request.');
  }
  const current = useSessionStore.getState();
  if (current.session?.id !== c.sessionId || current.me?.uid !== c.uid ||
      (current.me?.role === 'player' && current.me.fleetGroupId !== attempt.expectedGroupId) ||
      (current.me?.role === 'gm' && current.gmInstance?.id !== c.instanceId)) {
    throw new Error('The candidate audience or session identity changed before the receipt returned.');
  }
  localStorage.removeItem(key);
  return reply as unknown as CandidateResult;
}
