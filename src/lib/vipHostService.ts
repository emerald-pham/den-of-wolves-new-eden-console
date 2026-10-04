import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { SHIPS } from '@/data/ships';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { db } from './firestore';
import { captureSessionAuthority, isCurrentSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';

type RecordValue = Record<string, unknown>;

export interface VipHostVisitView {
  readonly shipId: string;
  readonly cycle: number;
}

export interface VipHostMaintenanceBenefitView {
  readonly shipId: string;
  readonly cycle: number;
  readonly status: 'available' | 'consumed';
  readonly revision: number;
  readonly requestId: string;
}

export interface VipHostVisitResult {
  readonly status: 'committed' | 'replayed';
  readonly type: 'vip-host-visit-attestation';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shipId: string;
  readonly cycle: number;
  readonly revision: 1;
  readonly benefitStatus: 'available';
}

export interface VipHostMaintenanceRerollResult {
  readonly status: 'committed' | 'replayed';
  readonly type: 'vip-host-maintenance-reroll';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shipId: string;
  readonly cycle: number;
  readonly grantRevision: number;
  readonly maintenanceRevision: number;
  readonly unrest: number;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}

function activeShip(shipId: string): boolean {
  return SHIPS.some((ship) => ship.id === shipId && ship.id !== 'dione');
}

function parseVisitResult(
  value: unknown,
  expected: Readonly<{ sessionId: string; requestId: string; shipId: string; cycle: number }>,
): VipHostVisitResult | null {
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'status', 'type', 'sessionId', 'requestId', 'shipId', 'cycle', 'revision', 'benefitStatus',
  ].includes(key)) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.type !== 'vip-host-visit-attestation' || value.sessionId !== expected.sessionId ||
      value.requestId !== expected.requestId || value.shipId !== expected.shipId || value.cycle !== expected.cycle ||
      value.revision !== 1 || value.benefitStatus !== 'available') return null;
  return value as unknown as VipHostVisitResult;
}

function parseRerollResult(
  value: unknown,
  expected: Readonly<{ sessionId: string; requestId: string; shipId: string; cycle: number;
    grantRevision: number; maintenanceRevision: number }>,
): VipHostMaintenanceRerollResult | null {
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'status', 'type', 'sessionId', 'requestId', 'shipId', 'cycle', 'grantRevision', 'maintenanceRevision', 'unrest',
  ].includes(key)) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.type !== 'vip-host-maintenance-reroll' || value.sessionId !== expected.sessionId ||
      value.requestId !== expected.requestId || value.shipId !== expected.shipId || value.cycle !== expected.cycle ||
      value.grantRevision !== expected.grantRevision + 1 || value.maintenanceRevision !== expected.maintenanceRevision + 1 ||
      !Number.isSafeInteger(value.unrest) || (value.unrest as number) < 0 || (value.unrest as number) > 10) return null;
  return value as unknown as VipHostMaintenanceRerollResult;
}

function parseVisitSnapshot(value: unknown, sessionId: string, cycle: number): VipHostVisitView | null {
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'type', 'sessionId', 'cycle', 'hostUid', 'hostRoleId', 'hostShipId', 'shipId',
    'attestedByUid', 'instanceId', 'requestId', 'createdAt',
  ].includes(key)) || value.type !== 'vip-host-physical-visit' || value.sessionId !== sessionId ||
      value.cycle !== cycle || !activeShip(String(value.shipId)) || !canonical(value.requestId)) return null;
  return { shipId: value.shipId as string, cycle };
}

function parseBenefitSnapshot(value: unknown, sessionId: string, shipId: string, cycle: number): VipHostMaintenanceBenefitView | null {
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'type', 'sessionId', 'shipId', 'cycle', 'status', 'revision', 'requestId', 'consumedAt', 'updatedAt',
  ].includes(key)) || value.type !== 'vip-host-maintenance-benefit' || value.sessionId !== sessionId ||
      value.shipId !== shipId || value.cycle !== cycle ||
      (value.status !== 'available' && value.status !== 'consumed') ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || !canonical(value.requestId)) return null;
  return { shipId, cycle, status: value.status, revision: value.revision as number, requestId: value.requestId };
}

/** The private visit is a one-cycle GM-only attestation, reduced to ship and cycle for this view. */
export function subscribeGmVipHostVisit(
  sessionId: string,
  cycle: number,
  onVisit: (visit: VipHostVisitView | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const reference = doc(db(), `sessions/${sessionId}/vipHostVisits/${cycle}`);
  return onSnapshot(reference, (snapshot) => {
    if (!snapshot.exists()) { onVisit(null); return; }
    const parsed = parseVisitSnapshot(snapshot.data(), sessionId, cycle);
    if (!parsed) { onError(new Error('The facilitator VIP Host visit record is malformed.')); return; }
    onVisit(parsed);
  }, (cause) => onError(cause instanceof Error ? cause : new Error('The facilitator visit status is unavailable.')));
}

/** Read only the privacy-safe per-ship maintenance benefit projection. */
export function subscribeVipHostMaintenanceBenefit(
  sessionId: string,
  shipId: string,
  cycle: number,
  onBenefit: (benefit: VipHostMaintenanceBenefitView | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const reference = doc(db(), `sessions/${sessionId}/vipHostMaintenanceBenefits/${shipId}/cycles/${cycle}`);
  return onSnapshot(reference, (snapshot) => {
    if (!snapshot.exists()) { onBenefit(null); return; }
    const parsed = parseBenefitSnapshot(snapshot.data(), sessionId, shipId, cycle);
    if (!parsed) { onError(new Error('The member-safe VIP Host benefit record is malformed.')); return; }
    onBenefit(parsed);
  }, (cause) => onError(cause instanceof Error ? cause : new Error('The hosted maintenance benefit is unavailable.')));
}

function currentGm(): Readonly<{ sessionId: string; uid: string; instanceId: string; cycle: number;
  checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>> }> {
  const { session, me, gmInstance, connection } = useSessionStore.getState();
  if (!session || session.phase !== 'active' || !Number.isSafeInteger(session.currentTurn) ||
      (session.currentTurn ?? 0) < 1 || !me?.uid || me.role !== 'gm' || me.sessionId !== session.id ||
      connection !== 'live' || !gmInstance || gmInstance.sessionId !== session.id || gmInstance.uid !== me.uid) {
    throw new Error('A connected current GM instance is required to attest the VIP Host visit.');
  }
  requireFreshSessionAuthority('Reconnect before attesting a VIP Host visit.');
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before attesting a VIP Host visit.');
  return { sessionId: session.id, uid: me.uid, instanceId: gmInstance.id,
    cycle: session.currentTurn as number, checkpoint };
}

/** Record the GM's physical-visit attestation; browsing or a docking record is never sent as proof. */
export async function attestVipHostVisit(shipId: string): Promise<VipHostVisitResult> {
  const actor = currentGm();
  if (!activeShip(shipId)) throw new Error('Choose an active ship other than Dione for the visit.');
  const requestId = window.crypto.randomUUID();
  const payload = { sessionId: actor.sessionId, instanceId: actor.instanceId, requestId,
    expectedCycle: actor.cycle, shipId };
  const reply = parseVisitResult((await httpsCallable<typeof payload, unknown>(functions(), 'attestVipHostVisit')(payload)).data,
    { sessionId: actor.sessionId, requestId, shipId, cycle: actor.cycle });
  requireFreshSessionAuthority('Reconnect before accepting the VIP Host visit result.');
  if (!isCurrentSessionAuthority(actor.checkpoint) || useSessionStore.getState().me?.uid !== actor.uid) {
    throw new Error('The current GM authority changed before the visit was recorded.');
  }
  if (!reply) throw new Error('The server returned an invalid VIP Host visit receipt.');
  return reply;
}

/** Consume the current ship's member-safe benefit during the open maintenance unrest reroll window. */
export async function rerollHostedShipMaintenance(input: Readonly<{
  shipId: string;
  expectedCycle: number;
  expectedGrantRevision: number;
  expectedMaintenanceRevision: number;
  dieIndex: 0 | 1;
  consoleRoleId?: string;
}>): Promise<VipHostMaintenanceRerollResult> {
  const store = useSessionStore.getState();
  const { session, me, gmInstance, connection } = store;
  if (!session || session.phase !== 'active' || !me?.uid || me.sessionId !== session.id || connection !== 'live' ||
      session.currentTurn !== input.expectedCycle || !activeShip(input.shipId) ||
      !Number.isSafeInteger(input.expectedGrantRevision) || input.expectedGrantRevision < 1 ||
      !Number.isSafeInteger(input.expectedMaintenanceRevision) || input.expectedMaintenanceRevision < 0 ||
      (input.dieIndex !== 0 && input.dieIndex !== 1)) {
    throw new Error('Refresh this ship’s current maintenance grant before rerolling.');
  }
  const cycle = session.maintenanceCycles?.[input.shipId];
  if (!cycle || cycle.turn !== input.expectedCycle || cycle.revision !== input.expectedMaintenanceRevision ||
      cycle.step !== 4 || !cycle.unrestRolls || cycle.results['4'] !== undefined) {
    throw new Error('The hosted reroll is available only during the open unrest step.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before consuming the hosted maintenance grant.');
  requireFreshSessionAuthority('Reconnect before consuming the hosted maintenance grant.');
  if (me.role !== 'gm' && (me.role !== 'player' || !input.consoleRoleId ||
      me.activeConsoleRoleId !== input.consoleRoleId || me.replacementStatus != null)) {
    throw new Error('Use the active officer console aboard the visited ship to reroll maintenance.');
  }
  const requestId = window.crypto.randomUUID();
  const payload = {
    sessionId: session.id, shipId: input.shipId, requestId, expectedCycle: input.expectedCycle,
    expectedGrantRevision: input.expectedGrantRevision,
    expectedMaintenanceRevision: input.expectedMaintenanceRevision, dieIndex: input.dieIndex,
    ...(gmInstance && me.role === 'gm' ? { instanceId: gmInstance.id } : {}),
    ...(input.consoleRoleId ? { consoleRoleId: input.consoleRoleId } : {}),
  };
  const reply = parseRerollResult((await httpsCallable<typeof payload, unknown>(functions(), 'rerollHostedShipMaintenance')(payload)).data,
    { sessionId: session.id, requestId, shipId: input.shipId, cycle: input.expectedCycle,
      grantRevision: input.expectedGrantRevision, maintenanceRevision: input.expectedMaintenanceRevision });
  requireFreshSessionAuthority('Reconnect before accepting the hosted maintenance result.');
  if (!isCurrentSessionAuthority(checkpoint) || useSessionStore.getState().me?.uid !== me.uid) {
    throw new Error('Your console authority changed before the maintenance reroll was recorded.');
  }
  if (!reply) throw new Error('The server returned an invalid hosted maintenance receipt.');
  return reply;
}
