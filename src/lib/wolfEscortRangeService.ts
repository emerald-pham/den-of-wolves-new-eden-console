import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import type { WolfFighterRangeActionView, WolfFighterMediumAction } from '@/components/WolfFighterRangeActionPanel';
import type { DioneMaliadesRangeActionView, DioneMaliadesMediumChoiceView } from '@/components/DioneMaliadesRangeActions';

export type WolfEscortSourceId = 'pdf-escort-fighter-wing' | 'maliades';
export type WolfEscortRange = 'medium-range' | 'short-range';
export type WolfEscortChoiceView = WolfFighterRangeActionView | DioneMaliadesRangeActionView;
type Choice = WolfFighterMediumAction | DioneMaliadesMediumChoiceView;
interface WolfEscortChoiceResult {
  readonly type: 'wolf-escort-range-action-choice'; readonly status: 'committed' | 'replayed';
  readonly sessionId: string; readonly requestId: string; readonly attackId: string;
  readonly turn: number; readonly revision: number; readonly range: WolfEscortRange;
  readonly sourceId: WolfEscortSourceId; readonly choiceStatus: 'pending-resolution'; readonly actionCount: number;
}
type Fields = Record<string, unknown>;
const record = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);
const exact = (v: Fields, keys: string[]) => JSON.stringify(Object.keys(v).sort()) === JSON.stringify(keys.sort());
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1;
const contact = (v: unknown): v is string => typeof v === 'string' && /^contact-[1-9]\d*$/.test(v);

function escortAuthority(sourceId: WolfEscortSourceId): { sessionId: string; turn: number; key: string } {
  requireFreshSessionAuthority();
  const { session, me, identityHydrationRevision } = useSessionStore.getState();
  const roleId = sourceId === 'maliades' ? 'dione-engineer' : 'refinery-124-pdf-colonel';
  const control = session?.shuttleControl?.maliades;
  if (!session || !me || session.phase !== 'active' || me.sessionId !== session.id || me.role !== 'player' ||
      me.connected === false || me.replacementStatus != null || !me.fleetGroupId || me.activeConsoleRoleId !== roleId ||
      (me.assignedRoleId !== roleId && me.seatId !== roleId) || !positive(session.currentTurn) ||
      (sourceId === 'maliades' && (!control || control.holderUid !== me.uid || control.ownerRoleId !== roleId))) {
    throw new Error('The current escort owner and custody are required.');
  }
  return { sessionId: session.id, turn: session.currentTurn,
    key: JSON.stringify([sourceId, session.id, session.currentTurn, me.uid, me.connectionGeneration,
      me.assignedRoleId, me.seatId, me.activeConsoleRoleId, me.fleetGroupId, identityHydrationRevision,
      session.playerDiscovery?.shipId, session.playerDiscovery?.revision,
      ...(sourceId === 'maliades' ? [control?.holderUid, control?.revision] : [])]) };
}

function parseView(value: unknown, sourceId: WolfEscortSourceId): WolfEscortChoiceView | null {
  if (!record(value) || !exact(value, ['type', 'sessionId', 'attackId', 'turn', 'revision', 'range',
      'choiceStatus', 'targets', 'launched', ...(sourceId === 'maliades' ? ['damage', 'destroyed'] : ['wingId', 'wingLabel', 'fighters'])]) ||
      !id(value.sessionId) || !id(value.attackId) || !positive(value.turn) || !positive(value.revision) ||
      (value.range !== 'medium-range' && value.range !== 'short-range') ||
      (value.choiceStatus !== 'pending' && value.choiceStatus !== 'committed') || typeof value.launched !== 'boolean' ||
      !Array.isArray(value.targets) || value.targets.length > 32 || value.targets.some((target) =>
        !record(target) || !exact(target, ['instanceId', 'label', 'targetNumber']) || !contact(target.instanceId) ||
        typeof target.label !== 'string' || !/^Wolf contact [1-9]\d*$/.test(target.label) ||
        !positive(target.targetNumber) || target.targetNumber > 7) ||
      new Set(value.targets.map((target) => target.instanceId)).size !== value.targets.length) return null;
  if (sourceId === 'maliades') {
    if (value.type !== 'dione-maliades-range-action-view' || !Number.isSafeInteger(value.damage) ||
        (value.damage as number) < 0 || (value.damage as number) > 3 || value.destroyed !== (value.damage === 3)) return null;
  } else if (value.type !== 'wolf-fighter-range-action-view' || value.wingId !== sourceId ||
      value.wingLabel !== 'P.D.F. Escort Fighter Wing' || !Array.isArray(value.fighters) || value.fighters.length > 4 ||
      value.fighters.some((fighter, index) => !record(fighter) || !exact(fighter, ['fighterIndex']) || fighter.fighterIndex !== index) ||
      (!value.launched && value.fighters.length > 0)) return null;
  return value as unknown as WolfEscortChoiceView;
}

function requireSameEscortAuthority(sourceId: WolfEscortSourceId, key: string): void {
  try { if (escortAuthority(sourceId).key === key) return; } catch { /* Identity may have changed entirely. */ }
  throw new Error('Escort authority changed while the request was pending.');
}

export async function getWolfEscortRangeActionChoice(range: WolfEscortRange, sourceId: WolfEscortSourceId): Promise<WolfEscortChoiceView> {
  const authority = escortAuthority(sourceId);
  const payload = { sessionId: authority.sessionId, range, sourceId };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'getWolfEscortRangeActionChoice');
  const reply = parseView((await call(payload)).data, sourceId);
  if (!reply || reply.sessionId !== authority.sessionId || reply.turn !== authority.turn || reply.range !== range) {
    throw new Error('The server returned an invalid escort range view.');
  }
  requireSameEscortAuthority(sourceId, authority.key);
  return reply;
}

export async function commitWolfEscortRangeActionChoice(view: WolfEscortChoiceView, sourceId: WolfEscortSourceId,
  choices: readonly number[] | readonly string[] | readonly Choice[]): Promise<WolfEscortChoiceResult> {
  const authority = escortAuthority(sourceId);
  if (view.sessionId !== authority.sessionId || view.turn !== authority.turn || view.choiceStatus !== 'pending' || view.launched === false ||
      !positive(view.revision) || !id(view.attackId)) throw new Error('The current escort choice changed. Refresh before acting.');
  const legal = new Set(view.targets.map(({ instanceId }) => instanceId));
  let selection: Fields;
  if (view.range === 'medium-range') {
    const actions = choices as readonly Choice[];
    if (actions.some((action) => !action || !contact(action.targetInstanceId) || !legal.has(action.targetInstanceId) ||
      (action.kind !== 'attack' && action.kind !== 'target-shift') || (action.kind === 'target-shift' && action.shift !== -1 && action.shift !== 1)))
      throw new Error('Choose valid current escort contacts.');
    selection = { actions: actions.map((action) => ({ kind: action.kind, targetContactId: action.targetInstanceId,
      ...(sourceId === 'maliades' ? {} : { fighterIndex: 'fighterIndex' in action ? action.fighterIndex : -1 }),
      ...(action.kind === 'target-shift' ? { shift: action.shift } : {}) })) };
  } else if (sourceId === 'maliades') {
    const targets = choices as readonly string[];
    if (targets.length > 2 || new Set(targets).size !== targets.length || targets.some((target) => !contact(target) || !legal.has(target)))
      throw new Error('Choose up to two distinct current Maliades targets.');
    selection = { targetContactIds: targets };
  } else {
    const indexes = choices as readonly number[];
    const available = 'fighters' in view ? new Set(view.fighters.map(({ fighterIndex }) => fighterIndex)) : new Set<number>();
    if (new Set(indexes).size !== indexes.length || indexes.some((index) => !Number.isSafeInteger(index) || !available.has(index)))
      throw new Error('Choose available PDF fighters at most once.');
    selection = { fighterIndexes: [...indexes].sort((a, b) => a - b) };
  }
  const requestId = window.crypto.randomUUID();
  const payload = { sessionId: authority.sessionId, requestId, sourceId, range: view.range,
    expectedTurn: view.turn, expectedRevision: view.revision, ...selection };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'commitWolfEscortRangeActionChoice');
  const raw = (await call(payload)).data;
  if (!record(raw) || !exact(raw, ['type', 'status', 'sessionId', 'requestId', 'attackId', 'turn', 'revision', 'range', 'sourceId', 'choiceStatus', 'actionCount']) ||
      raw.type !== 'wolf-escort-range-action-choice' || (raw.status !== 'committed' && raw.status !== 'replayed') ||
      raw.sessionId !== authority.sessionId || raw.requestId !== requestId || raw.attackId !== view.attackId ||
      raw.turn !== view.turn || raw.revision !== view.revision + 1 || raw.range !== view.range || raw.sourceId !== sourceId ||
      raw.choiceStatus !== 'pending-resolution' || raw.actionCount !== choices.length) throw new Error('The server returned an invalid escort choice receipt.');
  requireSameEscortAuthority(sourceId, authority.key);
  return raw as unknown as WolfEscortChoiceResult;
}
