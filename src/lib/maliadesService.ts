import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { captureSessionAuthority, isCurrentSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { parseMaliadesState } from './maliadesLedger';
import type { MaliadesStateRecord } from '@/types/game';

export type MaliadesMediumChoice =
  | Readonly<{ kind: 'target-shift'; targetId: string; shift: -1 | 1; wolfRosterIndex?: number }>
  | Readonly<{ kind: 'attack'; targetId: string }>;

export interface MaliadesActionReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly craftId: 'maliades';
  readonly cycle: number;
  readonly revision: number;
  readonly state: MaliadesStateRecord;
  readonly resolution: MaliadesStateRecord['medium'] | MaliadesStateRecord['short'];
}

export interface MaliadesRepairReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly craftId: 'maliades';
  readonly cycle: number;
  readonly revision: number;
  readonly hostShipId: string;
  readonly damageRepaired: number;
  readonly materialsRemaining: number;
  readonly state: MaliadesStateRecord;
}

function commandId(): string {
  return window.crypto.randomUUID();
}

function safeId(value: string): boolean {
  return /^[\w-]{1,128}$/.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function parseBaseReply(value: unknown, sessionId: string, requestId: string, expectedCycle: number, expectedRevision: number): Record<string, unknown> {
  const raw = record(value);
  if (!raw || (raw.status !== 'committed' && raw.status !== 'replayed') ||
      raw.sessionId !== sessionId || raw.requestId !== requestId || raw.craftId !== 'maliades' ||
      raw.cycle !== expectedCycle || raw.revision !== expectedRevision + 1) {
    throw new Error('The Maliades response was malformed. Refresh before acting again.');
  }
  const state = parseMaliadesState(raw.state);
  if (!state || !state.launched || state.revision !== expectedRevision + 1) {
    throw new Error('The Maliades response contained invalid authoritative state.');
  }
  return { ...raw, state };
}

function parseActionReply(value: unknown, sessionId: string, requestId: string, expectedCycle: number, expectedRevision: number): MaliadesActionReply {
  const raw = parseBaseReply(value, sessionId, requestId, expectedCycle, expectedRevision);
  if (!raw.resolution || !record(raw.resolution)) throw new Error('The Maliades response omitted its resolution.');
  return raw as unknown as MaliadesActionReply;
}

export async function resolveMaliadesMedium(
  expectedCycle: number,
  expectedRevision: number,
  choices: readonly MaliadesMediumChoice[],
): Promise<MaliadesActionReply> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before operating Maliades.');
  requireFreshSessionAuthority();
  if (!Number.isSafeInteger(expectedCycle) || expectedCycle < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      choices.length < 1 || choices.length > 2 ||
      choices.some(choice => !safeId(choice.targetId)) ||
      new Set(choices.map(choice => choice.targetId)).size !== choices.length ||
      choices.some(choice => choice.kind === 'target-shift' && choice.shift !== -1 && choice.shift !== 1)) {
    throw new Error('The Maliades Medium selection is invalid. Refresh the console and try again.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  const payload = { sessionId: session.id, requestId: commandId(), expectedCycle, expectedRevision, choices: [...choices] };
  const reply = parseActionReply(
    (await httpsCallable<typeof payload, unknown>(functions(), 'resolveMaliadesMedium')(payload)).data,
    session.id, payload.requestId, expectedCycle, expectedRevision,
  );
  if (!isCurrentSessionAuthority(checkpoint)) return reply;
  return reply;
}

export async function resolveMaliadesShort(
  expectedCycle: number,
  expectedRevision: number,
  targetIds: readonly string[],
): Promise<MaliadesActionReply> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before operating Maliades.');
  requireFreshSessionAuthority();
  if (!Number.isSafeInteger(expectedCycle) || expectedCycle < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      targetIds.length < 1 || targetIds.length > 2 || targetIds.some(id => !safeId(id)) ||
      new Set(targetIds).size !== targetIds.length) {
    throw new Error('The Maliades Short selection is invalid. Refresh the console and try again.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  const payload = { sessionId: session.id, requestId: commandId(), expectedCycle, expectedRevision, targetIds: [...targetIds] };
  const reply = parseActionReply(
    (await httpsCallable<typeof payload, unknown>(functions(), 'resolveMaliadesShort')(payload)).data,
    session.id, payload.requestId, expectedCycle, expectedRevision,
  );
  if (!isCurrentSessionAuthority(checkpoint)) return reply;
  return reply;
}

export async function repairMaliades(
  expectedCycle: number,
  expectedRevision: number,
  expectedHostShipId: string,
  damageToRepair: number,
): Promise<MaliadesRepairReply> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before repairing Maliades.');
  requireFreshSessionAuthority();
  if (!Number.isSafeInteger(expectedCycle) || expectedCycle < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      !safeId(expectedHostShipId) || !Number.isSafeInteger(damageToRepair) ||
      damageToRepair < 1 || damageToRepair > 3) {
    throw new Error('The Maliades repair selection is invalid. Refresh the console and try again.');
  }
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  const payload = { sessionId: session.id, requestId: commandId(), expectedCycle, expectedRevision, expectedHostShipId, damageToRepair };
  const raw = parseBaseReply(
    (await httpsCallable<typeof payload, unknown>(functions(), 'repairMaliades')(payload)).data,
    session.id, payload.requestId, expectedCycle, expectedRevision,
  );
  if (typeof raw.hostShipId !== 'string' || raw.hostShipId !== expectedHostShipId ||
      raw.damageRepaired !== damageToRepair || !Number.isSafeInteger(raw.materialsRemaining) ||
      (raw.materialsRemaining as number) < 0) {
    throw new Error('The Maliades repair response was malformed.');
  }
  const reply = raw as unknown as MaliadesRepairReply;
  if (!isCurrentSessionAuthority(checkpoint)) return reply;
  return reply;
}
