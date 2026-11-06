import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { hasFreshSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  BoaMissionReclamationChoiceReply,
  BoaMissionReclamationLapseReason,
  BoaMissionReclamationWorkspaceReply,
} from '../../functions/src/boaMissionReclamationContract';

export interface BoaMissionReclamationChoiceCommand {
  readonly requestId: string;
  readonly missionOpportunityId: string;
  readonly taskOpportunityId: string;
  readonly expectedControlRevision: number;
  readonly expectedChoiceRevision: number;
  readonly expectedCycle: number;
}

const ID = /^[\w-]{1,128}$/;
const LAPSE_REASONS: readonly BoaMissionReclamationLapseReason[] = [
  'boa-control-changed', 'recycler-unavailable', 'recycler-not-on-mission',
];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function currentBoaHolder(sessionId: string, uid: string): Readonly<{ controlRevision: number; cycle: number }> {
  const current = useSessionStore.getState();
  const session = current.session;
  const me = current.me;
  const control = session?.shuttleControl?.boa;
  const dockings = session?.shuttleDockings?.filter((entry) => entry.shuttleId === 'boa') ?? [];
  if (!hasFreshSessionAuthority() || !session || !me || session.id !== sessionId || me.sessionId !== sessionId ||
      me.uid !== uid || me.role !== 'player' || me.assignedRoleId !== 'capybara-recycler' ||
      typeof me.fleetGroupId !== 'string' || !/^fleet-[1-9]\d*$/.test(me.fleetGroupId) ||
      session.phase !== 'active' || session.expansion !== 'capybara' || session.capybaraEnabled !== true ||
      !session.activeRoleIds?.includes('capybara-captain') || !session.activeRoleIds.includes('capybara-recycler') ||
      !session.activeVesselIds?.includes('capybara') || control?.shuttleId !== 'boa' ||
      control.ownerRoleId !== 'capybara-recycler' || control.holderUid !== uid || !isCount(control.revision) ||
      !Number.isSafeInteger(session.currentTurn) || (session.currentTurn as number) < 1 ||
      dockings.length !== 1 || !session.activeVesselIds.includes(dockings[0]!.shipId)) {
    throw new Error('The current Boa Recycler station is unavailable. Return to the Boa console and refresh.');
  }
  return { controlRevision: control.revision, cycle: session.currentTurn as number };
}

function parseWorkspace(value: unknown, expected: Readonly<{
  sessionId: string; actorUid: string; groupId: string; hostShipId: string; controlRevision: number; cycle: number;
}>): BoaMissionReclamationWorkspaceReply {
  if (!isRecord(value) || value.status !== 'available' || value.sessionId !== expected.sessionId ||
      value.actorUid !== expected.actorUid || value.groupId !== expected.groupId ||
      value.hostShipId !== expected.hostShipId || value.controlRevision !== expected.controlRevision ||
      value.cycle !== expected.cycle || !Array.isArray(value.opportunities)) {
    throw new Error('The Boa mission workspace changed. Refresh before making a choice.');
  }
  const opportunities = value.opportunities.map((raw) => {
    if (!isRecord(raw) || !ID.test(String(raw.missionOpportunityId)) || raw.groupId !== expected.groupId ||
        !['A', 'B', 'C'].includes(String(raw.chart)) || !/^\d{4}$/.test(String(raw.coordinate)) ||
        !/^[A-M]$/.test(String(raw.siteCode)) || typeof raw.siteName !== 'string' || raw.siteName.length === 0 ||
        !Number.isSafeInteger(raw.sourceCycle) || (raw.sourceCycle as number) < 1 ||
        !isCount(raw.choiceRevision) || !Array.isArray(raw.taskOpportunities)) {
      throw new Error('The Boa mission workspace contains invalid task information. Refresh before choosing.');
    }
    const tasks = raw.taskOpportunities.map((task) => {
      if (!isRecord(task) || !/^[A-M]-\d+$/.test(String(task.id)) || typeof task.description !== 'string' ||
          task.description.length === 0 ||
          task.difficulty !== null && !Number.isSafeInteger(task.difficulty) ||
          task.criticalThreshold !== null && !Number.isSafeInteger(task.criticalThreshold)) {
        throw new Error('The printed mission task list is malformed. Refresh Boa before choosing.');
      }
      return { id: task.id as string, description: task.description,
        difficulty: task.difficulty as number | null,
        criticalThreshold: task.criticalThreshold as number | null };
    });
    const selectedTaskOpportunityId = raw.selectedTaskOpportunityId;
    if (selectedTaskOpportunityId !== undefined &&
        (typeof selectedTaskOpportunityId !== 'string' || !tasks.some(({ id }) => id === selectedTaskOpportunityId))) {
      throw new Error('The saved Boa mission choice is unavailable. Refresh before choosing.');
    }
    return {
      missionOpportunityId: raw.missionOpportunityId as string,
      groupId: raw.groupId,
      chart: raw.chart as string,
      coordinate: raw.coordinate as string,
      siteCode: raw.siteCode as string,
      siteName: raw.siteName,
      sourceCycle: raw.sourceCycle as number,
      taskOpportunities: tasks,
      choiceRevision: raw.choiceRevision as number,
      ...(selectedTaskOpportunityId === undefined ? {} : { selectedTaskOpportunityId }),
    };
  });
  if (new Set(opportunities.map(({ missionOpportunityId }) => missionOpportunityId)).size !== opportunities.length) {
    throw new Error('The Boa mission workspace repeats an opportunity. Refresh before choosing.');
  }
  if (!Array.isArray(value.lapsedChoices)) {
    throw new Error('The Boa mission workspace changed. Refresh before making a choice.');
  }
  const lapsedChoices = value.lapsedChoices.map((raw) => {
    if (!isRecord(raw) || !ID.test(String(raw.missionOpportunityId)) || typeof raw.siteName !== 'string' ||
        raw.siteName.length === 0 || !/^\d{4}$/.test(String(raw.coordinate)) ||
        !/^[A-M]-\d+$/.test(String(raw.taskOpportunityId)) || !LAPSE_REASONS.includes(raw.reason as never)) {
      throw new Error('A lapsed Boa mission choice is malformed. Refresh the Boa workspace.');
    }
    return {
      missionOpportunityId: raw.missionOpportunityId as string, siteName: raw.siteName,
      coordinate: raw.coordinate as string, taskOpportunityId: raw.taskOpportunityId as string,
      reason: raw.reason as BoaMissionReclamationLapseReason,
    };
  });
  return { status: 'available', sessionId: expected.sessionId, actorUid: expected.actorUid,
    groupId: expected.groupId, hostShipId: expected.hostShipId, controlRevision: expected.controlRevision,
    cycle: expected.cycle, opportunities, lapsedChoices };
}

export async function readBoaMissionReclamationWorkspace(sessionId: string):
Promise<BoaMissionReclamationWorkspaceReply> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me || session.id !== sessionId || typeof me.fleetGroupId !== 'string') {
    throw new Error('Reconnect to the current fleet before reading Boa mission opportunities.');
  }
  requireFreshSessionAuthority('Reconnect to read the current Boa mission opportunities.');
  const { controlRevision, cycle } = currentBoaHolder(sessionId, me.uid);
  const docking = session.shuttleDockings?.filter((entry) => entry.shuttleId === 'boa') ?? [];
  const binding = { sessionId, actorUid: me.uid, groupId: me.fleetGroupId, hostShipId: docking[0]!.shipId,
    controlRevision, cycle };
  const response = await httpsCallable<{ sessionId: string }, unknown>(
    functions(), 'readBoaMissionReclamationWorkspace',
  )({ sessionId });
  currentBoaHolder(sessionId, me.uid);
  const current = useSessionStore.getState();
  const liveSession = current.session!;
  if (current.me?.fleetGroupId !== binding.groupId || liveSession.shuttleControl?.boa?.revision !== binding.controlRevision ||
      liveSession.currentTurn !== binding.cycle ||
      liveSession.shuttleDockings?.filter((entry) => entry.shuttleId === 'boa')[0]?.shipId !== binding.hostShipId) {
    throw new Error('Boa changed stations while loading mission opportunities. Refresh the current workspace.');
  }
  return parseWorkspace(response.data, binding);
}

export async function chooseBoaMissionReclamationOpportunity(
  command: BoaMissionReclamationChoiceCommand,
): Promise<BoaMissionReclamationChoiceReply> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before choosing a Boa mission task.');
  requireFreshSessionAuthority('Reconnect before choosing a Boa mission task.');
  const { controlRevision, cycle } = currentBoaHolder(session.id, me.uid);
  if (!ID.test(command.requestId) || !ID.test(command.missionOpportunityId) ||
      !/^[A-M]-\d+$/.test(command.taskOpportunityId) ||
      !isCount(command.expectedControlRevision) || !isCount(command.expectedChoiceRevision) ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      command.expectedControlRevision !== controlRevision || command.expectedCycle !== cycle) {
    throw new Error('Boa changed stations or cycles. Refresh before choosing a mission task.');
  }
  const payload = { sessionId: session.id, ...command };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'chooseBoaMissionReclamationOpportunity',
  )(payload);
  currentBoaHolder(session.id, me.uid);
  const value = response.data;
  if (!isRecord(value) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== session.id || value.requestId !== command.requestId ||
      value.missionOpportunityId !== command.missionOpportunityId ||
      value.taskOpportunityId !== command.taskOpportunityId ||
      value.choiceRevision !== command.expectedChoiceRevision + 1) {
    throw new Error('The Boa mission choice reply did not match the current request. Refresh before retrying.');
  }
  return value as unknown as BoaMissionReclamationChoiceReply;
}
