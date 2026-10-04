import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  PdfFighterAceCombatResult,
  PdfFighterAceCombatView,
  PdfFighterAcePermissionResult,
  PdfFighterAcePermissionView,
  PdfFighterAceRange,
  PdfFighterAceSourceId,
} from '@/types/game';
import { functions } from './firebase';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';

type RecordValue = Record<string, unknown>;
type PdfFighterAceCommitInput = Readonly<{
  attackId: string;
  expectedRevision: number;
  range: PdfFighterAceRange;
  sourceId: PdfFighterAceSourceId;
  fighterIndex: number;
  permissionRequestId: string;
  permissionRevision: number;
  targetId: string;
  targetShift?: -1 | 1;
  extraTargetId?: string;
}>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}

function sourceRole(sourceId: PdfFighterAceSourceId): 'wing-commander' | 'refinery-124-pdf-colonel' {
  return sourceId === 'pdf-escort-fighter-wing' ? 'refinery-124-pdf-colonel' : 'wing-commander';
}

function sourceRoleLabel(sourceId: PdfFighterAceSourceId): string {
  return sourceId === 'pdf-escort-fighter-wing' ? 'P.D.F. Colonel' : 'AEGIS Wing Commander';
}

function currentActor(kind: 'source', sourceId: PdfFighterAceSourceId): Readonly<{
  sessionId: string; uid: string; cycle: number;
  checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>>;
}>;
function currentActor(kind: 'ace'): Readonly<{
  sessionId: string; uid: string; cycle: number;
  checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>>;
}>;
function currentActor(kind: 'source' | 'ace', sourceId?: PdfFighterAceSourceId) {
  const store = useSessionStore.getState();
  const { session, me } = store;
  const roleId = kind === 'source' && sourceId ? sourceRole(sourceId) : undefined;
  const currentTurn = session?.currentTurn;
  if (!session || session.phase !== 'active' || !me?.uid || me.role !== 'player' ||
      me.sessionId !== session.id || store.connection !== 'live' ||
      !Number.isSafeInteger(currentTurn) || (currentTurn as number) < 1) {
    throw new Error('Reconnect to the active fleet before using Fighter Ace controls.');
  }
  if (kind === 'source') {
    if (!roleId || !session.activeRoleIds?.includes(roleId) || me.assignedRoleId !== roleId ||
        me.activeConsoleRoleId !== roleId || me.replacementStatus != null) {
      throw new Error(`Only the active ${sourceId ? sourceRoleLabel(sourceId) : 'source commander'} can use Fighter Ace controls.`);
    }
  } else if (me.replacementRoleId !== 'pdf-fighter-ace' || me.replacementStatus != null ||
      me.activeConsoleRoleId !== null) {
    throw new Error('Reconnect as the current P.D.F. Fighter Ace.');
  }
  requireFreshSessionAuthority('Reconnect before using Fighter Ace controls.');
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before using Fighter Ace controls.');
  return { sessionId: session.id, uid: me.uid, cycle: currentTurn as number, checkpoint };
}

function actorStillCurrent(
  checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>>,
  sessionId: string,
  uid: string,
  kind: 'source' | 'ace',
  sourceId?: PdfFighterAceSourceId,
): boolean {
  if (!isCurrentSessionAuthority(checkpoint)) return false;
  const current = useSessionStore.getState();
  if (current.session?.id !== sessionId || current.me?.uid !== uid || current.me.sessionId !== sessionId ||
      current.session.phase !== 'active' || current.connection !== 'live') return false;
  if (kind === 'ace') {
    return current.me.role === 'player' && current.me.replacementRoleId === 'pdf-fighter-ace' &&
      current.me.replacementStatus == null && current.me.activeConsoleRoleId === null;
  }
  const roleId = sourceId ? sourceRole(sourceId) : undefined;
  return Boolean(roleId && current.me.role === 'player' && current.me.assignedRoleId === roleId &&
    current.me.activeConsoleRoleId === roleId && current.me.replacementStatus == null &&
    current.session.activeRoleIds?.includes(roleId));
}

function isRange(value: unknown): value is PdfFighterAceRange {
  return value === 'long' || value === 'medium' || value === 'short';
}

function isSource(value: unknown): value is PdfFighterAceSourceId {
  return value === 'fighter-wing-alpha' || value === 'fighter-wing-bravo' || value === 'pdf-escort-fighter-wing';
}

function validTargets(value: unknown): value is PdfFighterAceCombatView['targets'] {
  return Array.isArray(value) && value.every((target) => isRecord(target) &&
    Object.keys(target).length === 3 && canonical(target.targetId) && /^contact-[1-9]\d*$/.test(target.targetId) &&
    typeof target.label === 'string' && /^Wolf contact [1-9]\d*$/.test(target.label) &&
    typeof target.available === 'boolean');
}

function validSources(value: unknown): value is PdfFighterAceCombatView['fighterSources'] {
  return Array.isArray(value) && value.every((source) => isRecord(source) &&
    Object.keys(source).length === 6 && isSource(source.id) &&
    source.label === sourceLabel(source.id) && Number.isSafeInteger(source.fighters) && (source.fighters as number) > 0 &&
    Number.isSafeInteger(source.fighterIndex) && (source.fighterIndex as number) >= 0 &&
    (source.fighterIndex as number) < (source.fighters as number) && canonical(source.permissionRequestId) &&
    Number.isSafeInteger(source.permissionRevision) && (source.permissionRevision as number) > 0);
}

function sourceLabel(sourceId: PdfFighterAceSourceId): string {
  return sourceId === 'fighter-wing-alpha' ? 'AEGIS Fighter Wing Alpha'
    : sourceId === 'fighter-wing-bravo' ? 'AEGIS Fighter Wing Bravo' : 'PDF Escort Fighter Wing';
}

function parseCombatView(value: unknown, sessionId: string): PdfFighterAceCombatView | null {
  if (!isRecord(value) || Object.keys(value).length !== 10 || Object.keys(value).some((key) => ![
    'status', 'type', 'sessionId', 'attackId', 'turn', 'revision', 'range', 'actionUsed', 'targets', 'fighterSources',
  ].includes(key)) || (value.status !== 'ready' && value.status !== 'waiting') ||
      value.type !== 'pdf-fighter-ace-combat-view' || value.sessionId !== sessionId ||
      !(value.attackId === null || canonical(value.attackId)) || !Number.isSafeInteger(value.turn) ||
      (value.turn as number) < 0 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !(value.range === null || isRange(value.range)) || typeof value.actionUsed !== 'boolean' ||
      !validTargets(value.targets) || !validSources(value.fighterSources)) return null;
  return value as unknown as PdfFighterAceCombatView;
}

function parsePermissionView(value: unknown, sessionId: string, sourceId: PdfFighterAceSourceId): PdfFighterAcePermissionView | null {
  if (!isRecord(value) || Object.keys(value).length !== 12 || Object.keys(value).some((key) => ![
    'type', 'sessionId', 'attackId', 'turn', 'revision', 'range', 'sourceId', 'sourceLabel',
    'status', 'reason', 'fighters', 'availableFighterIndexes',
  ].includes(key)) || value.type !== 'pdf-fighter-ace-permission-view' || value.sessionId !== sessionId ||
      !(value.attackId === null || canonical(value.attackId)) || !Number.isSafeInteger(value.turn) ||
      (value.turn as number) < 0 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !(value.range === null || isRange(value.range)) || value.sourceId !== sourceId ||
      value.sourceLabel !== sourceLabel(sourceId) || !['ready', 'waiting', 'granted', 'closed'].includes(String(value.status)) ||
      !(value.reason === null || typeof value.reason === 'string') || !Number.isSafeInteger(value.fighters) ||
      (value.fighters as number) < 0 || !Array.isArray(value.availableFighterIndexes) ||
      value.availableFighterIndexes.some((index) => !Number.isSafeInteger(index) || (index as number) < 0 ||
        (index as number) >= (value.fighters as number))) return null;
  return value as unknown as PdfFighterAcePermissionView;
}

function parsePermissionResult(
  value: unknown,
  expected: Readonly<{ sessionId: string; requestId: string; attackId: string; cycle: number;
    expectedRevision: number; sourceId: PdfFighterAceSourceId; fighterIndex: number }>,
): PdfFighterAcePermissionResult | null {
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'status', 'type', 'sessionId', 'requestId', 'attackId', 'turn', 'revision', 'sourceId',
    'fighterIndex', 'permissionRevision', 'actorRoleId',
  ].includes(key)) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.type !== 'pdf-fighter-ace-permission' || value.sessionId !== expected.sessionId ||
      value.requestId !== expected.requestId || value.attackId !== expected.attackId || value.turn !== expected.cycle ||
      value.revision !== expected.expectedRevision + 1 || value.sourceId !== expected.sourceId ||
      value.fighterIndex !== expected.fighterIndex || value.permissionRevision !== 1 ||
      value.actorRoleId !== sourceRole(expected.sourceId)) return null;
  return value as unknown as PdfFighterAcePermissionResult;
}

function parseCombatResult(
  value: unknown,
  expected: Readonly<{ sessionId: string; requestId: string; attackId: string; cycle: number;
    expectedRevision: number; range: PdfFighterAceRange; sourceId: PdfFighterAceSourceId;
    fighterIndex: number; targetId: string }>,
): PdfFighterAceCombatResult | null {
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'status', 'type', 'sessionId', 'requestId', 'attackId', 'turn', 'revision', 'range', 'sourceId',
    'fighterIndex', 'targetId', 'damage', 'targetDestroyed', 'results', 'fighterDestroyed', 'aceDied',
    'escaped', 'targetShift',
  ].includes(key)) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.type !== 'pdf-fighter-ace-combat' || value.sessionId !== expected.sessionId ||
      value.requestId !== expected.requestId || value.attackId !== expected.attackId || value.turn !== expected.cycle ||
      value.revision !== expected.expectedRevision + 1 || value.range !== expected.range ||
      value.sourceId !== expected.sourceId || value.fighterIndex !== expected.fighterIndex ||
      value.targetId !== expected.targetId || !Number.isSafeInteger(value.damage) || (value.damage as number) < 0 ||
      typeof value.targetDestroyed !== 'boolean' || !Array.isArray(value.results) || value.results.length < 1 ||
      value.results.some((entry) => !isRecord(entry) || Object.keys(entry).length !== 3 ||
        typeof entry.targetId !== 'string' || !/^contact-[1-9]\d*$/.test(entry.targetId) ||
        !Number.isSafeInteger(entry.damage) || (entry.damage as number) < 0 || typeof entry.destroyed !== 'boolean') ||
      typeof value.fighterDestroyed !== 'boolean' || typeof value.aceDied !== 'boolean' || typeof value.escaped !== 'boolean' ||
      (value.targetShift !== undefined && (!isRecord(value.targetShift) || Object.keys(value.targetShift).length !== 3 ||
        !Number.isSafeInteger(value.targetShift.from) || !Number.isSafeInteger(value.targetShift.to) ||
        (value.targetShift.shift !== -1 && value.targetShift.shift !== 1)))) return null;
  const result = value as unknown as PdfFighterAceCombatResult;
  if (result.results.reduce((sum, entry) => sum + entry.damage, 0) !== result.damage ||
      (result.range === 'long' && result.aceDied !== result.fighterDestroyed) ||
      (result.escaped && !result.fighterDestroyed)) return null;
  return result;
}

function requestId(): string {
  return window.crypto.randomUUID();
}

/** Read the active source officer's current attack-scoped permission choices. */
export async function getPdfFighterAcePermissionView(sourceId: PdfFighterAceSourceId): Promise<PdfFighterAcePermissionView> {
  const actor = currentActor('source', sourceId);
  const call = httpsCallable<{ sessionId: string; sourceId: PdfFighterAceSourceId }, unknown>(
    functions(), 'getPdfFighterAcePermissionView',
  );
  const reply = parsePermissionView((await call({ sessionId: actor.sessionId, sourceId })).data, actor.sessionId, sourceId);
  requireFreshSessionAuthority('Reconnect before accepting Fighter Ace permission authority.');
  if (!actorStillCurrent(actor.checkpoint, actor.sessionId, actor.uid, 'source', sourceId)) {
    throw new Error('The source commander authority changed before permission choices arrived.');
  }
  if (!reply) throw new Error('The server returned an invalid Fighter Ace permission view.');
  return reply;
}

/** Record one current source officer's genuine fighter-slot permission. */
export async function grantPdfFighterAcePermission(input: Readonly<{
  attackId: string; expectedRevision: number; sourceId: PdfFighterAceSourceId; fighterIndex: number;
}>): Promise<PdfFighterAcePermissionResult> {
  const actor = currentActor('source', input.sourceId);
  if (!canonical(input.attackId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
      !Number.isSafeInteger(input.fighterIndex) || input.fighterIndex < 0) {
    throw new Error('Refresh the current Fighter Ace attack and choose an available fighter slot.');
  }
  const payload = { sessionId: actor.sessionId, requestId: requestId(), ...input };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'grantPdfFighterAcePermission');
  const reply = parsePermissionResult((await call(payload)).data, {
    sessionId: actor.sessionId, requestId: payload.requestId, attackId: input.attackId,
    cycle: actor.cycle, expectedRevision: input.expectedRevision, sourceId: input.sourceId,
    fighterIndex: input.fighterIndex,
  });
  requireFreshSessionAuthority('Reconnect before accepting Fighter Ace permission.');
  if (!actorStillCurrent(actor.checkpoint, actor.sessionId, actor.uid, 'source', input.sourceId)) {
    throw new Error('The source commander authority changed before permission was committed.');
  }
  if (!reply) throw new Error('The server returned an invalid Fighter Ace permission receipt.');
  return reply;
}

/** Read the active Ace's sanitized attack contacts and current commander grants. */
export async function getPdfFighterAceCombatView(): Promise<PdfFighterAceCombatView> {
  const actor = currentActor('ace');
  const call = httpsCallable<{ sessionId: string }, unknown>(functions(), 'getPdfFighterAceCombatView');
  const reply = parseCombatView((await call({ sessionId: actor.sessionId })).data, actor.sessionId);
  requireFreshSessionAuthority('Reconnect before accepting Fighter Ace combat authority.');
  if (!actorStillCurrent(actor.checkpoint, actor.sessionId, actor.uid, 'ace')) {
    throw new Error('The Fighter Ace authority changed before combat choices arrived.');
  }
  if (!reply) throw new Error('The server returned an invalid Fighter Ace combat view.');
  return reply;
}

/** Commit one private, attack-bound Fighter Ace action through the server. */
export async function commitPdfFighterAceCombat(input: PdfFighterAceCommitInput): Promise<PdfFighterAceCombatResult> {
  const actor = currentActor('ace');
  if (!canonical(input.attackId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
      !isRange(input.range) || !isSource(input.sourceId) || !Number.isSafeInteger(input.fighterIndex) ||
      input.fighterIndex < 0 || !canonical(input.permissionRequestId) ||
      !Number.isSafeInteger(input.permissionRevision) || input.permissionRevision < 1 ||
      !/^contact-[1-9]\d*$/.test(input.targetId) ||
      (input.range !== 'medium' && input.targetShift !== undefined) ||
      (input.targetShift !== undefined && input.targetShift !== -1 && input.targetShift !== 1) ||
      (input.extraTargetId !== undefined && (input.range !== 'short' || !/^contact-[1-9]\d*$/.test(input.extraTargetId)))) {
    throw new Error('Refresh the current attack and choose a printed Fighter Ace action.');
  }
  const payload = { sessionId: actor.sessionId, requestId: requestId(), ...input };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'commitPdfFighterAceCombat');
  const reply = parseCombatResult((await call(payload)).data, {
    sessionId: actor.sessionId, requestId: payload.requestId, attackId: input.attackId,
    cycle: actor.cycle, expectedRevision: input.expectedRevision, range: input.range,
    sourceId: input.sourceId, fighterIndex: input.fighterIndex, targetId: input.targetId,
  });
  requireFreshSessionAuthority('Reconnect before accepting the Fighter Ace result.');
  if (!actorStillCurrent(actor.checkpoint, actor.sessionId, actor.uid, 'ace')) {
    throw new Error('The Fighter Ace authority changed before combat resolved.');
  }
  if (!reply) throw new Error('The server returned an invalid Fighter Ace combat result.');
  return reply;
}
