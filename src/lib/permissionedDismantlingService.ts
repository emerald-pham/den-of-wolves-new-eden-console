import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db } from './firestore';
import { functions } from './firebase';
import { hasFreshSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';

export type PermissionedDismantlingStatus = 'pending' | 'consented' | 'declined' | 'revoked' | 'applied';

export interface PermissionedDismantlingInbox {
  readonly type: 'permissioned-dismantling-inbox';
  readonly sessionId: string;
  readonly targetShipId: string;
  readonly proposalId: string;
  readonly proposerUid: string;
  readonly craftId: 'philia' | 'blacksmith' | 'chacau' | 'ally';
  readonly targetConsoleId: string;
  readonly targetRevision: number;
  readonly materialGain: 3;
  readonly status: PermissionedDismantlingStatus;
  readonly consentId: string | null;
  readonly materialsAfter: number | null;
  readonly updatedAt: unknown;
}

export interface DismantlingProposalCommand {
  readonly proposalId: string;
  readonly craftId: PermissionedDismantlingInbox['craftId'];
  readonly targetShipId: string;
  readonly targetConsoleId: string;
}

export interface DismantlingProposalReply {
  readonly status: 'proposed' | 'replayed';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly craftId: string;
  readonly targetShipId: string;
  readonly targetConsoleId: string;
  readonly targetRevision: number;
  readonly controlRevision: number;
  readonly materialGain: 3;
}

export interface DismantlingStaleProposalReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly expectedTargetRevision: number;
  readonly currentTargetRevision: number;
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
}

export type DismantlingProposalResult = DismantlingProposalReply | DismantlingStaleProposalReply;

export interface DismantlingConsentReply {
  readonly status: 'consented' | 'replayed';
  readonly consentStatus: 'granted' | 'revoked' | 'consumed';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly targetRevision: number;
}

export interface DismantlingRevokeReply {
  readonly status: 'revoked' | 'replayed';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly consentId: string;
}

export interface DismantlingDeclineReply {
  readonly status: 'declined' | 'replayed';
  readonly sessionId: string;
  readonly proposalId: string;
}

export interface DismantlingApplyReply {
  readonly status: 'applied' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly proposalId: string;
  readonly consentId: string;
  readonly targetShipId: string;
  readonly targetConsoleId: string;
  readonly targetRevision: number;
  readonly materialGain: 3;
  readonly materialsAfter: number;
}

const INBOX_KEYS = [
  'type', 'sessionId', 'targetShipId', 'proposalId', 'proposerUid', 'craftId',
  'targetConsoleId', 'targetRevision', 'materialGain', 'status', 'consentId',
  'materialsAfter', 'updatedAt',
] as const;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CRAFT_IDS = ['philia', 'blacksmith', 'chacau', 'ally'] as const;

type RecordValue = Record<string, unknown>;
interface ActorBinding {
  readonly session: GameSession;
  readonly me: Player;
}
interface ProposalBinding extends ActorBinding {
  readonly craftId: DismantlingProposalCommand['craftId'];
  readonly targetShipId: string;
  readonly controlRevision: number;
  readonly uid: string;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function requireActor(sessionId?: string): ActorBinding {
  requireFreshSessionAuthority();
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me as Player | undefined;
  if (!hasFreshSessionAuthority() || !session || !me || me.role !== 'player' ||
      me.sessionId !== session.id || (sessionId !== undefined && session.id !== sessionId)) {
    throw new Error('Reconnect to the current live player session before using dismantling consent.');
  }
  return { session, me };
}

function currentProposalBinding(command: DismantlingProposalCommand): ProposalBinding {
  const { session, me } = requireActor();
  if (session.phase !== 'active' || me.replacementStatus != null ||
      !ID_PATTERN.test(command.proposalId) || !CRAFT_IDS.includes(command.craftId) ||
      !ID_PATTERN.test(command.targetShipId) || !ID_PATTERN.test(command.targetConsoleId)) {
    throw new Error('The dismantling request is invalid or gameplay is not active.');
  }
  const control = session.shuttleControl?.[command.craftId];
  if (!control || control.holderUid !== me.uid || !isCounter(control.revision)) {
    throw new Error('Only the current engineering-craft holder can request dismantling.');
  }
  const dockings = session.shuttleDockings;
  const matchingDockings = Array.isArray(dockings)
    ? dockings.filter((docking) => docking.shuttleId === command.craftId)
    : [];
  const docking = matchingDockings[0];
  if (matchingDockings.length !== 1 || docking?.shipId !== command.targetShipId ||
      typeof docking.dockedAt !== 'string' || !docking.dockedAt.trim() ||
      docking.inTransit === true || docking.transit === true || docking.status === 'in-transit' ||
      docking.state === 'in-transit' || docking.dockingState === 'in-transit') {
    throw new Error('The engineering craft must be docked at the exact target ship.');
  }
  return {
    session, me, craftId: command.craftId, targetShipId: command.targetShipId,
    controlRevision: control.revision, uid: me.uid,
  };
}

function requireSameProposalAuthority(binding: ProposalBinding): void {
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me as Player | undefined;
  const control = session?.shuttleControl?.[binding.craftId];
  const dockings = session?.shuttleDockings?.filter((docking) => docking.shuttleId === binding.craftId) ?? [];
  if (!hasFreshSessionAuthority() || !session || !me || session.id !== binding.session.id ||
      me.uid !== binding.uid || me.sessionId !== binding.session.id || me.role !== 'player' ||
      me.replacementStatus != null || !control || control.holderUid !== binding.uid ||
      control.revision !== binding.controlRevision || dockings.length !== 1 ||
      dockings[0]?.shipId !== binding.targetShipId || !dockings[0]?.dockedAt) {
    throw new Error('Dismantling authority or docking changed while the request was in flight. Refresh the console.');
  }
}

function requireSameActor(binding: ActorBinding & { readonly uid: string }): void {
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me as Player | undefined;
  if (!hasFreshSessionAuthority() || !session || !me || session.id !== binding.session.id ||
      me.sessionId !== binding.session.id || me.uid !== binding.uid || me.role !== 'player') {
    throw new Error('Player or session authority changed while the consent request was in flight.');
  }
}

function parseInbox(value: unknown, sessionId: string, targetShipId: string): PermissionedDismantlingInbox {
  if (!isRecord(value) || Object.keys(value).length !== INBOX_KEYS.length ||
      Object.keys(value).some((key) => !INBOX_KEYS.includes(key as typeof INBOX_KEYS[number])) ||
      value.type !== 'permissioned-dismantling-inbox' || value.sessionId !== sessionId ||
      value.targetShipId !== targetShipId || typeof value.proposalId !== 'string' ||
      !ID_PATTERN.test(value.proposalId) || typeof value.proposerUid !== 'string' ||
      !value.proposerUid || value.proposerUid.length > 128 ||
      !CRAFT_IDS.includes(value.craftId as typeof CRAFT_IDS[number]) ||
      typeof value.targetConsoleId !== 'string' || !ID_PATTERN.test(value.targetConsoleId) ||
      !isCounter(value.targetRevision) || value.materialGain !== 3 ||
      !(['pending', 'consented', 'declined', 'revoked', 'applied'] as const).includes(value.status as PermissionedDismantlingStatus) ||
      (value.consentId !== null && (typeof value.consentId !== 'string' || !ID_PATTERN.test(value.consentId))) ||
      (value.materialsAfter !== null && !isCounter(value.materialsAfter)) ||
      value.updatedAt === undefined || value.updatedAt === null) {
    throw new Error('The target-ship dismantling inbox projection is malformed.');
  }
  return value as unknown as PermissionedDismantlingInbox;
}

function callable<T>(name: string, data: RecordValue): Promise<{ readonly data: T }> {
  return httpsCallable(functions(), name)(data) as Promise<{ readonly data: T }>;
}

function requireProposalReply(value: unknown, binding: ProposalBinding, command: DismantlingProposalCommand): DismantlingProposalResult {
  if (!isRecord(value) || value.sessionId !== binding.session.id || value.proposalId !== command.proposalId) {
    throw new Error('The permissioned-dismantling proposal reply was malformed.');
  }
  if (value.status === 'stale') {
    if (!isCounter(value.expectedTargetRevision) || !isCounter(value.currentTargetRevision) ||
        !isCounter(value.expectedControlRevision) || !isCounter(value.currentControlRevision)) {
      throw new Error('The stale permissioned-dismantling reply was malformed.');
    }
    return value as unknown as DismantlingStaleProposalReply;
  }
  if ((value.status !== 'proposed' && value.status !== 'replayed') ||
      value.craftId !== command.craftId || value.targetShipId !== command.targetShipId ||
      value.targetConsoleId !== command.targetConsoleId || !isCounter(value.targetRevision) ||
      value.controlRevision !== binding.controlRevision || value.materialGain !== 3) {
    throw new Error('The permissioned-dismantling proposal reply was malformed.');
  }
  return value as unknown as DismantlingProposalReply;
}

export async function proposePermissionedDismantling(
  command: DismantlingProposalCommand,
): Promise<DismantlingProposalResult> {
  const binding = currentProposalBinding(command);
  const { data } = await callable<unknown>('proposePermissionedDismantling', {
    sessionId: binding.session.id,
    proposalId: command.proposalId,
    craftId: command.craftId,
    targetShipId: command.targetShipId,
    targetConsoleId: command.targetConsoleId,
    expectedControlRevision: binding.controlRevision,
  });
  const reply = requireProposalReply(data, binding, command);
  requireSameProposalAuthority(binding);
  return reply;
}

export async function consentToPermissionedDismantling(input: Readonly<{
  inbox: PermissionedDismantlingInbox;
  consentId: string;
}>): Promise<DismantlingConsentReply> {
  const binding = requireActor(input.inbox.sessionId);
  if (!ID_PATTERN.test(input.consentId) || input.inbox.targetShipId === '' ||
      input.inbox.status !== 'pending') {
    throw new Error('Only a current pending dismantling request can receive consent.');
  }
  const { data } = await callable<unknown>('consentToPermissionedDismantling', {
    sessionId: binding.session.id, proposalId: input.inbox.proposalId,
    consentId: input.consentId, expectedTargetRevision: input.inbox.targetRevision,
  });
  if (!isRecord(data) || (data.status !== 'consented' && data.status !== 'replayed') ||
      !['granted', 'revoked', 'consumed'].includes(String(data.consentStatus)) ||
      data.sessionId !== binding.session.id || data.proposalId !== input.inbox.proposalId ||
      data.consentId !== input.consentId || data.targetRevision !== input.inbox.targetRevision) {
    throw new Error('The permissioned-dismantling consent reply was malformed.');
  }
  requireSameActor({ ...binding, uid: binding.me.uid });
  return data as unknown as DismantlingConsentReply;
}

export async function revokePermissionedDismantlingConsent(input: Readonly<{
  inbox: PermissionedDismantlingInbox;
}>): Promise<DismantlingRevokeReply> {
  const binding = requireActor(input.inbox.sessionId);
  if (input.inbox.status !== 'consented' || !input.inbox.consentId) {
    throw new Error('Only the current target-ship consent can be revoked.');
  }
  const { data } = await callable<unknown>('revokePermissionedDismantlingConsent', {
    sessionId: binding.session.id, proposalId: input.inbox.proposalId,
    consentId: input.inbox.consentId,
  });
  if (!isRecord(data) || (data.status !== 'revoked' && data.status !== 'replayed') ||
      data.sessionId !== binding.session.id || data.proposalId !== input.inbox.proposalId ||
      data.consentId !== input.inbox.consentId) {
    throw new Error('The permissioned-dismantling revocation reply was malformed.');
  }
  requireSameActor({ ...binding, uid: binding.me.uid });
  return data as unknown as DismantlingRevokeReply;
}

export async function declinePermissionedDismantling(input: Readonly<{
  inbox: PermissionedDismantlingInbox;
}>): Promise<DismantlingDeclineReply> {
  const binding = requireActor(input.inbox.sessionId);
  if (input.inbox.status !== 'pending') {
    throw new Error('Only the current pending target-ship request can be declined.');
  }
  const { data } = await callable<unknown>('declinePermissionedDismantling', {
    sessionId: binding.session.id,
    proposalId: input.inbox.proposalId,
  });
  if (!isRecord(data) || (data.status !== 'declined' && data.status !== 'replayed') ||
      data.sessionId !== binding.session.id || data.proposalId !== input.inbox.proposalId) {
    throw new Error('The permissioned-dismantling decline reply was malformed.');
  }
  requireSameActor({ ...binding, uid: binding.me.uid });
  return data as unknown as DismantlingDeclineReply;
}

export async function applyPermissionedDismantling(input: Readonly<{
  inbox: PermissionedDismantlingInbox;
  requestId: string;
}>): Promise<DismantlingApplyReply> {
  const { session, me } = requireActor(input.inbox.sessionId);
  const proposalBinding = currentProposalBinding({
    proposalId: input.inbox.proposalId,
    craftId: input.inbox.craftId,
    targetShipId: input.inbox.targetShipId,
    targetConsoleId: input.inbox.targetConsoleId,
  });
  if (session.id !== proposalBinding.session.id || me.uid !== proposalBinding.uid ||
      input.inbox.status !== 'consented' || !input.inbox.consentId ||
      !ID_PATTERN.test(input.requestId)) {
    throw new Error('Only the original engineering-craft holder can apply an exact current consent.');
  }
  const consentId = input.inbox.consentId;
  const { data } = await callable<unknown>('applyPermissionedDismantling', {
    sessionId: session.id, requestId: input.requestId, proposalId: input.inbox.proposalId,
    consentId, expectedTargetRevision: input.inbox.targetRevision,
  });
  if (!isRecord(data) || (data.status !== 'applied' && data.status !== 'replayed') ||
      data.sessionId !== session.id || data.requestId !== input.requestId ||
      data.proposalId !== input.inbox.proposalId || data.consentId !== consentId ||
      data.targetShipId !== input.inbox.targetShipId || data.targetConsoleId !== input.inbox.targetConsoleId ||
      !isCounter(data.targetRevision) || data.materialGain !== 3 || !isCounter(data.materialsAfter)) {
    throw new Error('The permissioned-dismantling apply reply was malformed.');
  }
  requireSameProposalAuthority(proposalBinding);
  return data as unknown as DismantlingApplyReply;
}

export function subscribePermissionedDismantlingInbox(
  sessionId: string,
  targetShipId: string,
  handlers: Readonly<{
    onInbox: (inbox: PermissionedDismantlingInbox | null) => void;
    onError: (message: string) => void;
  }>,
): Unsubscribe {
  requireActor(sessionId);
  const reference = doc(db(), `sessions/${sessionId}/permissionedDismantlingInboxes/${targetShipId}`);
  return onSnapshot(reference, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) {
      handlers.onInbox(null);
      handlers.onError('Waiting for a server-verified dismantling request.');
      return;
    }
    if (!snapshot.exists()) {
      handlers.onInbox(null);
      return;
    }
    try {
      handlers.onInbox(parseInbox(snapshot.data(), sessionId, targetShipId));
    } catch (error) {
      handlers.onInbox(null);
      handlers.onError(error instanceof Error ? error.message : 'The dismantling inbox is malformed.');
    }
  }, () => {
    handlers.onInbox(null);
    handlers.onError('The current player cannot read this dismantling request.');
  });
}
