import { httpsCallable } from 'firebase/functions';
import {
  loyaltyAssignmentDecision,
  optionalLoyaltyAssignmentDecision,
  type LoyaltyKind,
} from '../../functions/src/gameSetup';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { captureSessionAuthority, isCurrentSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { auth, functions } from './firebase';

export interface ExplicitGmLoyaltyAssignmentRequest {
  readonly sessionId: string;
  readonly instanceId: string;
  readonly requestId: string;
  readonly targetUid: string;
  readonly kind: LoyaltyKind;
  readonly suspicion: number | null;
  readonly partnerUid?: string;
}

export interface ExplicitGmLoyaltyAssignmentReceipt {
  readonly setupRevision: number;
}

function requireCurrentGmRequest(request: ExplicitGmLoyaltyAssignmentRequest): {
  readonly uid: string;
  readonly checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>>;
} {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || !store.gmInstance || !selectIsGm(store) || store.me.role !== 'gm') {
    throw new Error('A live GM instance is required to configure private loyalty.');
  }
  if (store.session.id !== request.sessionId || store.gmInstance.id !== request.instanceId ||
      store.gmInstance.uid !== store.me.uid || store.gmInstance.sessionId !== store.session.id ||
      store.me.sessionId !== store.session.id) {
    throw new Error('The GM session changed. Refresh before assigning private loyalty.');
  }
  requireFreshSessionAuthority('Reconnect until live GM session authority returns before assigning private loyalty.');
  if (store.session.setupConfirmed !== true) {
    throw new Error('Confirm the printed setup before entering private loyalty records.');
  }
  if (store.session.configurationLocked === true ||
      (store.session.phase !== 'lobby' && store.session.phase !== 'casting')) {
    throw new Error('Private loyalty can only be assigned during unlocked lobby or casting.');
  }
  const universalArbourEnabled = store.session.setup?.universalArbourEnabled ?? store.session.universalArbourEnabled === true;
  const wolfCultEnabled = store.session.setup?.wolfCultEnabled ?? store.session.wolfCultEnabled === true;
  if (universalArbourEnabled === wolfCultEnabled) {
    throw new Error('Ordinary Wolf designation remains automatic; enable one explicit printed loyalty scenario before assigning records.');
  }
  const kindDecision = loyaltyAssignmentDecision(request.kind, request.suspicion);
  if (!kindDecision.allowed) throw new Error('Choose a source-approved loyalty kind and suspicion value.');
  const optionalDecision = optionalLoyaltyAssignmentDecision(request.kind, {
    playerCount: store.session.setup?.playerCount ?? store.session.playerCount ?? 18,
    universalArbourEnabled,
    wolfCultEnabled,
  });
  if (!optionalDecision.allowed) throw new Error('That loyalty kind is not enabled by the confirmed printed setup.');
  if (request.kind === 'friend') {
    if (!request.partnerUid || request.partnerUid === request.targetUid) {
      throw new Error('Choose another current holder to receive the reciprocal Friend record.');
    }
  } else if (request.partnerUid !== undefined) {
    throw new Error('Only Friend loyalty can name a reciprocal partner.');
  }
  const checkpoint = captureSessionAuthority(store.session.id, store.me.uid);
  if (!checkpoint) throw new Error('Live GM session authority is required.');
  return { uid: store.me.uid, checkpoint };
}

function parseSafeReceipt(value: unknown, request: ExplicitGmLoyaltyAssignmentRequest): ExplicitGmLoyaltyAssignmentReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The loyalty assignment returned no usable server receipt. Retry the exact request.');
  }
  const raw = value as Record<string, unknown>;
  const allowedKeys = new Set(['sessionId', 'setupRevision', 'assignedUids']);
  const assignedUids = request.partnerUid
    ? [request.targetUid, request.partnerUid]
    : [request.targetUid];
  if (Object.keys(raw).some((key) => !allowedKeys.has(key)) ||
      raw.sessionId !== request.sessionId || !Number.isSafeInteger(raw.setupRevision) ||
      (raw.setupRevision as number) < 0 || !Array.isArray(raw.assignedUids) ||
      raw.assignedUids.length !== assignedUids.length ||
      raw.assignedUids.some((uid, index) => uid !== assignedUids[index])) {
    throw new Error('The loyalty assignment receipt did not match this request. Retry the exact request.');
  }
  // The callable returns assigned UIDs for its own replay validator. Keep that
  // private mapping inside this function and return only the aggregate revision.
  return { setupRevision: raw.setupRevision as number };
}

/** Use the official callable; never write a loyalty card or public mapping from the browser. */
export async function submitExplicitGmLoyaltyAssignment(
  request: ExplicitGmLoyaltyAssignmentRequest,
): Promise<ExplicitGmLoyaltyAssignmentReceipt> {
  const { uid, checkpoint } = requireCurrentGmRequest(request);
  const currentAuth = auth();
  await currentAuth.authStateReady();
  if (currentAuth.currentUser?.uid !== uid) {
    throw new Error('Reconnect the original authenticated GM identity before assigning private loyalty.');
  }
  const call = httpsCallable<ExplicitGmLoyaltyAssignmentRequest, unknown>(functions(), 'assignLoyalty');
  const reply = await call(request);
  if (currentAuth.currentUser?.uid !== uid) {
    throw new Error('The authenticated GM identity changed while the loyalty assignment was pending.');
  }
  const receipt = parseSafeReceipt(reply.data, request);
  const latest = useSessionStore.getState();
  if (!isCurrentSessionAuthority(checkpoint) || latest.session?.id !== request.sessionId ||
      latest.me?.uid !== uid || latest.me.role !== 'gm' || !selectIsGm(latest) ||
      latest.gmInstance?.id !== request.instanceId || latest.gmInstance.uid !== uid) {
    throw new Error('The GM session authority changed while the assignment was pending. Refresh before continuing.');
  }
  return receipt;
}
