import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { captureSessionAuthority, isCurrentSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export type CandidateCode = 'N' | 'O' | 'P';
export type CandidateEdition = 'home' | 'deluxe';
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
export interface CandidateEditionResult {
  type: 'candidate-edition-result'; status: 'committed' | 'replayed'; sessionId: string;
  requestId: string; revision: number; edition: CandidateEdition; summary: string;
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
  edition: CandidateEdition; editionLocked: boolean; paths: CandidatePathView[];
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
  return { sessionId: session.id, uid: me.uid, role: me.role, fleetGroupId: me.fleetGroupId,
    assignedRoleId: me.assignedRoleId, activeConsoleRoleId: me.activeConsoleRoleId,
    ...(me.role === 'gm' ? { instanceId: gmInstance!.id, instanceClaimedAt: gmInstance!.claimedAt } : {}) };
}
function requireCurrentContext(original: ReturnType<typeof context>, expectedGroupId: string, bindConsole = true): void {
  requireFreshSessionAuthority('Reconnect until live candidate authority returns.');
  let current: ReturnType<typeof context>;
  try { current = context(expectedGroupId); }
  catch { throw new Error('Candidate audience or authority changed. Return to Roles and reselect.'); }
  if (current.sessionId !== original.sessionId || current.uid !== original.uid || current.role !== original.role ||
      current.fleetGroupId !== original.fleetGroupId ||
      (bindConsole && (current.assignedRoleId !== original.assignedRoleId || current.activeConsoleRoleId !== original.activeConsoleRoleId)) ||
      current.instanceId !== original.instanceId ||
      current.instanceClaimedAt !== original.instanceClaimedAt) {
    throw new Error('Candidate audience or authority changed before the reply returned.');
  }
}
function pendingKey(sessionId: string, uid: string) { return `dow:candidate-request:${sessionId}:${uid}`; }
function attemptIdentity(value: CandidateAttempt): string {
  return JSON.stringify({ sessionId: value.sessionId, requestId: value.requestId, expectedRevision: value.expectedRevision,
    expectedGroupId: value.expectedGroupId, code: value.code, coordinate: value.coordinate, action: value.action,
    instanceId: value.instanceId ?? null, shipId: value.shipId ?? null, amount: value.amount ?? null,
    trackIds: value.trackIds ?? [], shuttleId: value.shuttleId ?? null });
}
function savedCandidateAttempt(c: { sessionId: string; uid: string }): CandidateAttempt | undefined {
  try {
    const text = localStorage.getItem(pendingKey(c.sessionId, c.uid));
    const value: unknown = text ? JSON.parse(text) : undefined;
    if (record(value) && value.sessionId === c.sessionId && typeof value.expectedGroupId === 'string' &&
        typeof value.requestId === 'string' && typeof value.action === 'string') return value as unknown as CandidateAttempt;
  } catch { /* Unreadable local recovery never creates an action. */ }
  return undefined;
}
export function recoverCandidateAttempt(expectedGroupId: string): CandidateAttempt | undefined {
  const c = context(expectedGroupId); const saved = savedCandidateAttempt(c);
  return saved?.expectedGroupId === expectedGroupId &&
    (saved.instanceId === undefined || saved.instanceId === c.instanceId) ? saved : undefined;
}
export function createCandidateAttempt(choice: Omit<CandidateAttempt, 'sessionId' | 'requestId' | 'instanceId'>): CandidateAttempt {
  requireFreshSessionAuthority('Reconnect before choosing a candidate action.');
  const c = context(choice.expectedGroupId);
  if (savedCandidateAttempt(c)) throw new Error('Recover the original candidate request in its fleet group and GM connection before making a new choice.');
  return { ...choice, sessionId: c.sessionId, requestId: crypto.randomUUID(), ...(c.instanceId ? { instanceId: c.instanceId } : {}) };
}
const counter = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const code = (value: unknown): value is CandidateCode => value === 'N' || value === 'O' || value === 'P';
const edition = (value: unknown): value is CandidateEdition => value === 'home' || value === 'deluxe';
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
function fields(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
function operationalPath(value: unknown, gm: boolean): CandidatePathView | undefined {
  const textFields = ['coordinate', 'title', 'nextActor'];
  const counters = ['materials', 'materialsRequired', 'researchCount', 'researchRequired', 'chargeCapacity', 'requiredCapacity'];
  const booleans = ['shuttleCommitted', 'repaired', 'liberated', 'activated', 'sabotaged', 'completed', 'canSabotage'];
  if (!record(value) || !code(value.code) || textFields.some(key => typeof value[key] !== 'string') ||
      counters.some(key => !counter(value[key])) || booleans.some(key => typeof value[key] !== 'boolean') ||
      !texts(value.blockers) || !texts(value.reactorShipIds) || !Array.isArray(value.researchChoices) ||
      !Array.isArray(value.engineeringShuttles) || !Array.isArray(value.ships)) return undefined;
  const researchChoices = value.researchChoices.map(choice => record(choice) &&
    typeof choice.id === 'string' && typeof choice.name === 'string' ? { id: choice.id, name: choice.name } : undefined);
  const engineeringShuttles = value.engineeringShuttles.map(craft => record(craft) &&
    typeof craft.id === 'string' && typeof craft.available === 'boolean' ? { id: craft.id, available: craft.available } : undefined);
  const ships = value.ships.map(ship => {
    if (!record(ship) || ['shipId', 'result', 'blocker'].some(key => typeof ship[key] !== 'string') ||
        !counter(ship.fuelCost) || !counter(ship.reactorCapacity) || typeof ship.canAct !== 'boolean' ||
        (ship.summary !== undefined && typeof ship.summary !== 'string') ||
        (ship.fuelSpent !== undefined && !counter(ship.fuelSpent))) return undefined;
    return fields(ship, ['shipId', 'result', 'blocker', 'fuelCost', 'reactorCapacity', 'canAct', 'summary', 'fuelSpent']);
  });
  if (researchChoices.some(choice => !choice) || engineeringShuttles.some(craft => !craft) || ships.some(ship => !ship)) return undefined;
  return { ...fields(value, ['code', ...textFields, ...counters, ...booleans]),
    blockers: [...value.blockers], reactorShipIds: [...value.reactorShipIds], researchChoices, engineeringShuttles, ships,
    canSabotage: gm && value.canSabotage } as CandidatePathView;
}
function workspaceProjection(value: unknown, c: ReturnType<typeof context>, expectedGroupId: string): CandidateWorkspace {
  const invalid = () => new Error('The candidate operation report could not be verified. Refresh the live session.');
  if (!record(value) || value.type !== 'candidate-workspace' || value.sessionId !== c.sessionId ||
      value.groupId !== expectedGroupId || !counter(value.cycle) || !counter(value.revision) ||
      !edition(value.edition) || typeof value.editionLocked !== 'boolean' || !Array.isArray(value.paths)) throw invalid();
  const paths = value.paths.map(path => operationalPath(path, c.role === 'gm'));
  if (paths.some(path => !path)) throw invalid();
  const projected: CandidateWorkspace = { type: 'candidate-workspace', sessionId: c.sessionId, groupId: expectedGroupId,
    cycle: value.cycle, revision: value.revision, edition: value.edition, editionLocked: value.editionLocked,
    paths: paths as CandidatePathView[] };
  if (c.role === 'gm' && value.privateCalculations !== undefined) {
    if (!Array.isArray(value.privateCalculations)) throw invalid();
    projected.privateCalculations = value.privateCalculations.map(audit => {
      if (!record(audit) || typeof audit.requestId !== 'string' || !code(audit.code) ||
          typeof audit.result !== 'string' || !record(audit.calculation)) throw invalid();
      return { requestId: audit.requestId, code: audit.code, result: audit.result,
        calculation: structuredClone(audit.calculation) };
    });
  }
  return projected;
}
export async function readCandidateWorkspace(expectedGroupId: string): Promise<CandidateWorkspace> {
  requireFreshSessionAuthority('Reconnect to receive the current candidate operations.');
  const c = context(expectedGroupId);
  const authority = captureSessionAuthority(c.sessionId, c.uid);
  const payload = { sessionId: c.sessionId, expectedGroupId, ...(c.instanceId ? { instanceId: c.instanceId } : {}) };
  const reply = (await httpsCallable<typeof payload, unknown>(functions(), 'readCandidateWorkspace')(payload)).data;
  requireCurrentContext(c, expectedGroupId);
  if (!isCurrentSessionAuthority(authority)) throw new Error('Candidate session authority changed. Refresh the live report.');
  return workspaceProjection(reply, c, expectedGroupId);
}
export async function selectCandidateEdition(expectedGroupId: string, requestedEdition: CandidateEdition,
  expectedRevision: number): Promise<CandidateEditionResult> {
  requireFreshSessionAuthority('Reconnect before selecting an N/O rules edition.');
  const c = context(expectedGroupId);
  if (c.role !== 'gm' || !c.instanceId) throw new Error('Only the current GM can select the N/O rules edition.');
  if (!edition(requestedEdition) || !counter(expectedRevision) || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Refresh the current N/O rules edition before choosing.');
  }
  const authority = captureSessionAuthority(c.sessionId, c.uid);
  const payload = { sessionId: c.sessionId, requestId: crypto.randomUUID(), expectedRevision,
    expectedGroupId, instanceId: c.instanceId, edition: requestedEdition };
  const reply = (await httpsCallable<typeof payload, unknown>(functions(), 'selectCandidateEdition')(payload)).data;
  requireCurrentContext(c, expectedGroupId);
  if (!isCurrentSessionAuthority(authority)) throw new Error('Candidate session authority changed. Refresh the live report.');
  const fields = ['type', 'status', 'sessionId', 'requestId', 'revision', 'edition', 'summary'];
  if (!record(reply) || Object.keys(reply).some(field => !fields.includes(field)) ||
      reply.type !== 'candidate-edition-result' || !['committed', 'replayed'].includes(String(reply.status)) ||
      reply.sessionId !== c.sessionId || reply.requestId !== payload.requestId || !counter(reply.revision) ||
      reply.edition !== requestedEdition || typeof reply.summary !== 'string') {
    throw new Error('The N/O rules edition result could not be verified. Refresh the live report.');
  }
  return reply as unknown as CandidateEditionResult;
}
export async function executeCandidateAttempt(attempt: CandidateAttempt): Promise<CandidateResult> {
  requireFreshSessionAuthority('Reconnect to retry the original candidate request.');
  const c = context(attempt.expectedGroupId);
  if (c.sessionId !== attempt.sessionId || (attempt.instanceId && attempt.instanceId !== c.instanceId)) {
    throw new Error('This candidate request belongs to the original session and GM connection.');
  }
  const key = pendingKey(c.sessionId, c.uid);
  const saved = savedCandidateAttempt(c);
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
  // A committed vessel disposition may release its console while this original
  // receipt is in flight. Actor, role, group and GM claim remain mandatory.
  requireCurrentContext(c, attempt.expectedGroupId, false);
  localStorage.removeItem(key);
  return reply as unknown as CandidateResult;
}
