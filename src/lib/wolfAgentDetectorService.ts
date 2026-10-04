import { httpsCallable } from 'firebase/functions';
import type { WolfAgentDetectorReport } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import { functions } from './firebase';
import { parseWolfAgentDetectorReport } from './firestore';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';

interface WolfAgentDetectorAttempt {
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedCycle: number;
  readonly expectedRevision: number;
  readonly targetUid: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentScientist(): Readonly<{
  sessionId: string; uid: string; cycle: number; checkpoint: NonNullable<ReturnType<typeof captureSessionAuthority>>;
}> {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  const cycle = session?.currentTurn;
  if (!session || !me?.uid || me.sessionId !== session.id || me.role !== 'player' ||
      me.assignedRoleId !== 'shepherd-scientist' || me.activeConsoleRoleId !== 'shepherd-scientist' ||
      !session.activeRoleIds?.includes('shepherd-scientist') || session.phase !== 'active' ||
      control?.ownerRoleId !== 'shepherd-scientist' || control.holderUid !== me.uid ||
      typeof cycle !== 'number' || !Number.isSafeInteger(cycle) || cycle < 1) {
    throw new Error('Reconnect as the current Shepherd Scientist holding Endeavour.');
  }
  requireFreshSessionAuthority('Reconnect before testing the Wolf Agent Detector.');
  const checkpoint = captureSessionAuthority(session.id, me.uid);
  if (!checkpoint) throw new Error('Reconnect before testing the Wolf Agent Detector.');
  return { sessionId: session.id, uid: me.uid, cycle, checkpoint };
}

function validateAttempt(value: unknown, attempt: WolfAgentDetectorAttempt, uid: string): WolfAgentDetectorReport {
  const report = parseWolfAgentDetectorReport(value, attempt.sessionId, uid);
  if (!report || report.requestId !== attempt.requestId || report.cycle !== attempt.expectedCycle ||
      report.revision !== attempt.expectedRevision + 1 || report.targetUid !== attempt.targetUid) {
    throw new Error('The server returned an invalid Wolf Agent Detector report.');
  }
  return report;
}

/** Run a single server-randomized test from the Scientist's current authority snapshot. */
export async function runWolfAgentDetectorTest(
  targetUid: string,
  expectedRevision: number,
): Promise<WolfAgentDetectorReport> {
  const authority = currentScientist();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) || targetUid === authority.uid ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('Choose another current player and refresh the detector allowance.');
  }
  const attempt: WolfAgentDetectorAttempt = {
    sessionId: authority.sessionId,
    requestId: window.crypto.randomUUID(),
    expectedCycle: authority.cycle,
    expectedRevision,
    targetUid,
  };
  const call = httpsCallable<WolfAgentDetectorAttempt, unknown>(functions(), 'runWolfAgentDetectorTest');
  const response = await call(attempt);
  requireFreshSessionAuthority('Reconnect before accepting the detector result.');
  if (!isCurrentSessionAuthority(authority.checkpoint)) {
    throw new Error('The Scientist authority changed before the detector result arrived.');
  }
  const current = currentScientist();
  if (current.sessionId !== authority.sessionId || current.uid !== authority.uid ||
      current.cycle !== attempt.expectedCycle || !isRecord(response) || !Object.hasOwn(response, 'data')) {
    throw new Error('The session changed before the detector result arrived.');
  }
  return validateAttempt(response.data, attempt, authority.uid);
}
