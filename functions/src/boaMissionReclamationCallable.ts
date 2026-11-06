import { HttpsError } from 'firebase-functions/v2/https';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { missionCardForCode } from './missionCards';
import { laterCycleMissionOpportunityIds, missionOpportunityDocumentPath, missionStartDocumentPaths,
  parseStoredMissionOpportunity, type MissionOpportunityEligibility } from './missionEligibility';
import { requireCandidateVesselsAvailable } from './candidateAvailability';
import type {
  BoaMissionReclamationChoiceReply,
  BoaMissionReclamationLapsedChoice,
  BoaMissionReclamationLapseReason,
  BoaMissionReclamationTaskOpportunity,
  BoaMissionReclamationWorkspaceReply,
} from './boaMissionReclamationContract';

export type {
  BoaMissionReclamationChoiceReply,
  BoaMissionReclamationLapsedChoice,
  BoaMissionReclamationLapseReason,
  BoaMissionReclamationTaskOpportunity,
  BoaMissionReclamationWorkspaceOpportunity,
  BoaMissionReclamationWorkspaceReply,
} from './boaMissionReclamationContract';

type Data = Record<string, unknown>;

export interface BoaMissionReclamationCallableSnapshot {
  readonly exists: boolean;
  readonly id: string;
  get(field: string): unknown;
  data(): unknown;
}

export interface BoaMissionReclamationCallableDatabase {
  doc(path: string): unknown;
  collection(path: string): unknown;
  runTransaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T>;
}

export interface BoaMissionReclamationCommandMarkerAdapter {
  readonly read: (transaction: unknown, sessionId: string, requestId: string) => Promise<BoaMissionReclamationCallableSnapshot>;
  readonly create: (transaction: unknown, fingerprint: CommandFingerprint,
    result: BoaMissionReclamationChoiceReply) => void;
}

export interface BoaMissionReclamationCallableDependencies {
  readonly db: BoaMissionReclamationCallableDatabase;
  readonly commandMarkers: BoaMissionReclamationCommandMarkerAdapter;
  readonly isActivePlayer: (player: BoaMissionReclamationCallableSnapshot) => boolean;
  readonly serverTimestamp: () => unknown;
}


interface Transaction {
  get(reference: unknown): Promise<unknown>;
  set(reference: unknown, value: Data): void;
  create(reference: unknown, value: Data): void;
  update(reference: unknown, value: Data): void;
}

interface QuerySnapshot { readonly docs: readonly BoaMissionReclamationCallableSnapshot[] }

interface ActorContext {
  readonly session: BoaMissionReclamationCallableSnapshot;
  readonly actor: BoaMissionReclamationCallableSnapshot;
  readonly group: BoaMissionReclamationCallableSnapshot;
  readonly groupId: string;
  readonly hostShipId: string;
  readonly controlRevision: number;
  readonly cycle: number;
  readonly groupVesselIds: readonly string[];
}

interface ChoiceCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly missionOpportunityId: string;
  readonly taskOpportunityId: string;
  readonly expectedControlRevision: number;
  readonly expectedChoiceRevision: number;
  readonly expectedCycle: number;
}

const ROLE_ID = 'capybara-recycler';
const ACTION = 'boa-mission-reclamation-choice';
const ID = /^[\w-]{1,128}$/;
const SESSION_ID = /^[\w-]{1,128}$/;
const GROUP_ID = /^fleet-[1-9][0-9]*$/;
const LAPSE_REASONS: readonly BoaMissionReclamationLapseReason[] = [
  'boa-control-changed', 'recycler-unavailable', 'recycler-not-on-mission',
];

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function fail(code: 'failed-precondition' | 'invalid-argument' | 'permission-denied' | 'not-found', message: string): never {
  throw new HttpsError(code, message);
}

function requireActorUid(auth: BoaMissionReclamationCallableRequest['auth']): string {
  if (!auth || typeof auth.uid !== 'string' || auth.uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Sign in before using the Boa mission procedure.');
  }
  return auth.uid;
}

function parseWorkspaceRequest(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).length !== 1 ||
      typeof value.sessionId !== 'string' || !SESSION_ID.test(value.sessionId)) {
    throw new HttpsError('invalid-argument', 'Refresh the Boa mission workspace.');
  }
  return value.sessionId;
}

function parseChoiceCommand(value: unknown): ChoiceCommand {
  if (!isRecord(value) || Object.keys(value).length !== 7 ||
      Object.keys(value).some((key) => ![
        'sessionId', 'requestId', 'missionOpportunityId', 'taskOpportunityId',
        'expectedControlRevision', 'expectedChoiceRevision', 'expectedCycle',
      ].includes(key)) ||
      typeof value.sessionId !== 'string' || !SESSION_ID.test(value.sessionId) ||
      typeof value.requestId !== 'string' || !ID.test(value.requestId) ||
      typeof value.missionOpportunityId !== 'string' || !ID.test(value.missionOpportunityId) ||
      typeof value.taskOpportunityId !== 'string' || !ID.test(value.taskOpportunityId) ||
      !Number.isSafeInteger(value.expectedControlRevision) || (value.expectedControlRevision as number) < 0 ||
      !Number.isSafeInteger(value.expectedChoiceRevision) || (value.expectedChoiceRevision as number) < 0 ||
      !Number.isSafeInteger(value.expectedCycle) || (value.expectedCycle as number) < 1) {
    throw new HttpsError('invalid-argument', 'Choose one current mission-card opportunity and refresh the Boa workspace.');
  }
  return value as unknown as ChoiceCommand;
}

function requireDocument(value: unknown, label: string): BoaMissionReclamationCallableSnapshot {
  if (!isRecord(value) || typeof value.exists !== 'boolean' || typeof value.get !== 'function' ||
      typeof value.data !== 'function' || typeof value.id !== 'string') {
    throw new HttpsError('failed-precondition', `${label} is unavailable.`);
  }
  return value as unknown as BoaMissionReclamationCallableSnapshot;
}

function requireQuery(value: unknown): QuerySnapshot {
  if (!isRecord(value) || !Array.isArray(value.docs)) {
    throw new HttpsError('failed-precondition', 'The mission opportunity workspace is unavailable.');
  }
  return value as unknown as QuerySnapshot;
}

function fingerprint(actorUid: string, command: ChoiceCommand): CommandFingerprint {
  return {
    action: ACTION,
    sessionId: command.sessionId,
    requestId: command.requestId,
    actorUid,
    instanceId: null,
    expectedRevision: command.expectedChoiceRevision,
    payload: {
      missionOpportunityId: command.missionOpportunityId,
      taskOpportunityId: command.taskOpportunityId,
      expectedControlRevision: command.expectedControlRevision,
      expectedCycle: command.expectedCycle,
    },
  };
}

function replayResult(
  marker: BoaMissionReclamationCallableSnapshot,
  expected: CommandFingerprint,
  sessionId: string,
): BoaMissionReclamationChoiceReply | undefined {
  if (!marker.exists) return undefined;
  const disposition = commandReceiptDisposition(marker.get('fingerprint'), expected);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This Boa choice request belongs to another player.');
  }
  if (disposition.kind === 'collision') {
    fail('failed-precondition', 'This Boa choice request id is bound to different inputs.');
  }
  const result = marker.get('result');
  if (!isChoiceReply(result, sessionId)) {
    fail('failed-precondition', 'This Boa choice receipt cannot be recovered. Refresh the Boa workspace.');
  }
  return { ...result, status: 'replayed' };
}

function isChoiceReply(value: unknown, sessionId: string): value is BoaMissionReclamationChoiceReply {
  return isRecord(value) && Object.keys(value).length === 6 &&
    Object.keys(value).every((key) => ['status', 'sessionId', 'requestId',
      'missionOpportunityId', 'taskOpportunityId', 'choiceRevision'].includes(key)) &&
    (value.status === 'committed' || value.status === 'replayed') && value.sessionId === sessionId &&
    nonEmptyId(value.requestId) && nonEmptyId(value.missionOpportunityId) &&
    nonEmptyId(value.taskOpportunityId) && Number.isSafeInteger(value.choiceRevision) &&
    (value.choiceRevision as number) > 0;
}

function parseOpportunity(snapshot: BoaMissionReclamationCallableSnapshot,
  sessionId: string): MissionOpportunityEligibility {
  const raw = snapshot.data();
  if (!isRecord(raw) || !nonEmptyId(snapshot.id) ||
      !['A', 'B', 'C'].includes(String(raw.chart)) ||
      typeof raw.siteCode !== 'string' || !missionCardForCode(raw.siteCode)) {
    fail('failed-precondition', 'A stored mission opportunity is malformed. Refresh the map.');
  }
  try {
    return parseStoredMissionOpportunity(raw, sessionId, {
      type: 'mission-opportunity', status: 'available', id: snapshot.id,
      groupId: String(raw.groupId), chart: raw.chart as MissionOpportunityEligibility['chart'],
      coordinate: String(raw.coordinate),
      siteCode: raw.siteCode as MissionOpportunityEligibility['siteCode'], sourceShipId: String(raw.sourceShipId),
      sourceTransitionId: String(raw.sourceTransitionId), sourceCycle: raw.sourceCycle as number,
    });
  } catch {
    return fail('failed-precondition', 'A stored mission opportunity is malformed. Refresh the map.');
  }
}

function requireBoaActor(
  session: BoaMissionReclamationCallableSnapshot,
  actor: BoaMissionReclamationCallableSnapshot,
  group: BoaMissionReclamationCallableSnapshot,
  actorUid: string,
  isActivePlayer: (player: BoaMissionReclamationCallableSnapshot) => boolean,
): ActorContext {
  const groupId = actor.get('fleetGroupId');
  const activeRoleIds = session.get('activeRoleIds');
  const activeVesselIds = session.get('activeVesselIds');
  const controlMap = session.get('shuttleControl');
  const rawControl = isRecord(controlMap) ? controlMap.boa : undefined;
  const control = isRecord(rawControl) ? rawControl : undefined;
  const dockings = session.get('shuttleDockings');
  const boaDockings = Array.isArray(dockings) ? dockings.filter((entry) =>
    isRecord(entry) && entry.shuttleId === 'boa') : [];
  const hostShipId = boaDockings.length === 1 && isRecord(boaDockings[0])
    ? boaDockings[0].shipId : undefined;
  const currentCycle = session.get('currentTurn');
  const phaseState = session.get('turnPhase');
  const turn = isRecord(phaseState) ? phaseState.turn : undefined;
  const groupVesselIds = group.get('vesselIds');
  const groupMembers = group.get('memberUids');

  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
  if (!actor.exists || !isActivePlayer(actor) || actor.get('role') !== 'player' ||
      actor.get('assignedRoleId') !== ROLE_ID || actor.get('replacementStatus') != null ||
      actor.get('replacementRoleId') != null || actor.get('escapeState') != null ||
      !Array.isArray(activeRoleIds) || !activeRoleIds.includes('capybara-captain') ||
      !activeRoleIds.includes(ROLE_ID) || !Array.isArray(activeVesselIds) ||
      !activeVesselIds.includes('capybara') || session.get('expansion') !== 'capybara' ||
      session.get('capybaraEnabled') !== true ||
      session.get('phase') !== 'active' ||
      typeof groupId !== 'string' || !GROUP_ID.test(groupId) || group.id !== groupId ||
      !Array.isArray(groupMembers) || !groupMembers.includes(actorUid) ||
      !Array.isArray(groupVesselIds) || groupVesselIds.some((id) => typeof id !== 'string') ||
      typeof hostShipId !== 'string' || !activeVesselIds.includes(hostShipId) ||
      !groupVesselIds.includes(hostShipId) || !control || control.shuttleId !== 'boa' ||
      control.ownerRoleId !== ROLE_ID || control.holderUid !== actorUid ||
      !Number.isSafeInteger(control.revision) || (control.revision as number) < 0 ||
      !Number.isSafeInteger(currentCycle) || (currentCycle as number) < 1 ||
      turn !== currentCycle) {
    throw new HttpsError('permission-denied', 'Only the current active Boa Recycler may select a mission task for their fleet group.');
  }
  if (actor.get('candidateDisposition') != null) {
    throw new HttpsError(
      'failed-precondition',
      'This vessel has reached its candidate disposition. Original results remain available.',
    );
  }
  requireCandidateVesselsAvailable(session, ['capybara', hostShipId]);
  return {
    session, actor, group, groupId, hostShipId,
    controlRevision: control.revision as number,
    cycle: currentCycle as number,
    groupVesselIds: groupVesselIds as string[],
  };
}

function taskOpportunities(siteCode: string): readonly BoaMissionReclamationTaskOpportunity[] {
  const definition = missionCardForCode(siteCode);
  if (!definition || !Array.isArray(definition.opportunities)) {
    fail('failed-precondition', 'The printed mission card is unavailable.');
  }
  return definition.opportunities.map((entry) => ({
    id: entry.id,
    description: entry.description,
    difficulty: Number.isSafeInteger(entry.difficulty) ? entry.difficulty! : null,
    criticalThreshold: Number.isSafeInteger(entry.criticalThreshold) ? entry.criticalThreshold! : null,
  }));
}

function missionAlreadyStarted(
  start: BoaMissionReclamationCallableSnapshot, mission: BoaMissionReclamationCallableSnapshot,
): void {
  if (start.exists || mission.exists) {
    fail('failed-precondition', 'That mission already started. Refresh the Boa workspace for another opportunity.');
  }
}

export interface BoaMissionReclamationCallableRequest {
  readonly auth?: { readonly uid?: string } | null;
  readonly data?: unknown;
}

export function createBoaMissionReclamationCallables(dependencies: BoaMissionReclamationCallableDependencies) {
  return {
    readBoaMissionReclamationWorkspace: async (
      request: BoaMissionReclamationCallableRequest,
    ): Promise<BoaMissionReclamationWorkspaceReply> => {
      const actorUid = requireActorUid(request.auth);
      const sessionId = parseWorkspaceRequest(request.data);
      return dependencies.db.runTransaction(async (rawTransaction) => {
        const transaction = rawTransaction as Transaction;
        const sessionRef = dependencies.db.doc(`sessions/${sessionId}`);
        const session = requireDocument(await transaction.get(sessionRef), 'The live session');
        const actor = requireDocument(await transaction.get(
          dependencies.db.doc(`sessions/${sessionId}/players/${actorUid}`),
        ), 'The current player');
        const groupId = actor.get('fleetGroupId');
        if (typeof groupId !== 'string' || !GROUP_ID.test(groupId)) {
          throw new HttpsError('permission-denied', 'Choose a current fleet group before using Boa.');
        }
        const group = requireDocument(await transaction.get(
          dependencies.db.doc(`sessions/${sessionId}/fleetGroups/${groupId}`),
        ), 'The current fleet group');
        const context = requireBoaActor(session, actor, group, actorUid, dependencies.isActivePlayer);
        const [navigation, opportunitiesRead, choicesRead] = await Promise.all([
          transaction.get(dependencies.db.doc(`sessions/${sessionId}/serverState/navigation`)),
          transaction.get(dependencies.db.collection(`sessions/${sessionId}/missionOpportunities`)),
          transaction.get(dependencies.db.collection(`sessions/${sessionId}/boaMissionReclamationChoices`)),
        ]);
        const navigationSnapshot = requireDocument(navigation, 'Current navigation');
        if (!navigationSnapshot.exists || !isRecord(navigationSnapshot.get('shipGalacticCoordinates'))) {
          fail('failed-precondition', 'Current navigation is unavailable. Refresh before choosing.');
        }
        const coordinates = navigationSnapshot.get('shipGalacticCoordinates') as Data;
        const opportunityDocs = requireQuery(opportunitiesRead).docs;
        const choiceDocs = requireQuery(choicesRead).docs;
        const choicesById = new Map(choiceDocs.map((choice) => [choice.id, choice]));
        const recordedIds = new Set(opportunityDocs.filter(({ exists }) => exists).map(({ id }) => id));
        const lapsedChoices: BoaMissionReclamationLapsedChoice[] = [];
        const local = opportunityDocs.flatMap((opportunitySnapshot) => {
          if (!opportunitySnapshot.exists) return [];
          const opportunity = parseOpportunity(opportunitySnapshot, sessionId);
          const definition = missionCardForCode(opportunity.siteCode);
          if (!definition || opportunity.groupId !== context.groupId ||
              coordinates[context.hostShipId] !== opportunity.coordinate ||
              !context.groupVesselIds.some((vesselId) => coordinates[vesselId] === opportunity.coordinate)) return [];
          return [{ opportunity, definition }];
        });
        const started = await Promise.all(local.map(async ({ opportunity }) =>
          (await Promise.all(missionStartDocumentPaths(sessionId, opportunity.id).map(async (path) =>
            requireDocument(await transaction.get(dependencies.db.doc(path)), 'The mission-start record'))))
            .some(({ exists }) => exists)));
        const opportunities = local.flatMap(({ opportunity, definition }, index) => {
          // Offer only what the deal would accept: unstarted and not superseded by a later visit.
          if (started[index] || laterCycleMissionOpportunityIds(opportunity, context.cycle)
            .some((id) => recordedIds.has(id))) return [];
          const currentChoice = choicesById.get(opportunity.id);
          const choice = currentChoice?.data();
          const choiceRevision = !choice ? 0 : isRecord(choice) &&
            Number.isSafeInteger(choice.revision) && (choice.revision as number) >= 0 ? choice.revision as number : -1;
          if (isRecord(choice) && choice.status === 'lapsed') {
            if (choice.actorUid === actorUid && choice.lapsedCycle === context.cycle &&
                typeof choice.opportunityTaskId === 'string' && LAPSE_REASONS.includes(choice.lapseReason as never)) {
              lapsedChoices.push({
                missionOpportunityId: opportunity.id, siteName: definition.name, coordinate: opportunity.coordinate,
                taskOpportunityId: choice.opportunityTaskId,
                reason: choice.lapseReason as BoaMissionReclamationLapseReason,
              });
            }
            return [];
          }
          if (choiceRevision < 0 || isRecord(choice) && choice.status === 'consumed') return [];
          return [{
            missionOpportunityId: opportunity.id,
            groupId: opportunity.groupId,
            chart: opportunity.chart,
            coordinate: opportunity.coordinate,
            siteCode: opportunity.siteCode,
            siteName: definition.name,
            sourceCycle: opportunity.sourceCycle,
            taskOpportunities: taskOpportunities(opportunity.siteCode),
            choiceRevision,
            ...(isRecord(choice) && choice.status === 'selected' && choice.actorUid === actorUid &&
              typeof choice.opportunityTaskId === 'string'
              ? { selectedTaskOpportunityId: choice.opportunityTaskId } : {}),
          }];
        });
        return {
          status: 'available', sessionId, actorUid, groupId: context.groupId,
          hostShipId: context.hostShipId, controlRevision: context.controlRevision,
          cycle: context.cycle, opportunities, lapsedChoices,
        };
      });
    },

    chooseBoaMissionReclamationOpportunity: async (
      request: BoaMissionReclamationCallableRequest,
    ): Promise<BoaMissionReclamationChoiceReply> => {
      const actorUid = requireActorUid(request.auth);
      const command = parseChoiceCommand(request.data);
      const expectedFingerprint = fingerprint(actorUid, command);
      return dependencies.db.runTransaction(async (rawTransaction) => {
        const transaction = rawTransaction as Transaction;
        const receipt = await dependencies.commandMarkers.read(
          rawTransaction, command.sessionId, command.requestId,
        );
        const replay = replayResult(receipt, expectedFingerprint, command.sessionId);
        if (replay) return replay;

        const sessionRef = dependencies.db.doc(`sessions/${command.sessionId}`);
        const missionOpportunityRef = dependencies.db.doc(
          missionOpportunityDocumentPath(command.sessionId, command.missionOpportunityId),
        );
        const choiceRef = dependencies.db.doc(
          `sessions/${command.sessionId}/boaMissionReclamationChoices/${command.missionOpportunityId}`,
        );
        const [startPath, missionPath] = missionStartDocumentPaths(command.sessionId, command.missionOpportunityId);
        const startRef = dependencies.db.doc(startPath);
        const missionRef = dependencies.db.doc(missionPath);
        const actorRef = dependencies.db.doc(`sessions/${command.sessionId}/players/${actorUid}`);
        const session = requireDocument(await transaction.get(sessionRef), 'The live session');
        const actor = requireDocument(await transaction.get(actorRef), 'The current player');
        const groupId = actor.get('fleetGroupId');
        if (typeof groupId !== 'string' || !GROUP_ID.test(groupId)) {
          throw new HttpsError('permission-denied', 'Choose a current fleet group before using Boa.');
        }
        const group = requireDocument(await transaction.get(
          dependencies.db.doc(`sessions/${command.sessionId}/fleetGroups/${groupId}`),
        ), 'The current fleet group');
        const [opportunityRead, choiceRead, startRead, missionRead, navigationRead] = await Promise.all([
          transaction.get(missionOpportunityRef), transaction.get(choiceRef),
          transaction.get(startRef), transaction.get(missionRef),
          transaction.get(dependencies.db.doc(`sessions/${command.sessionId}/serverState/navigation`)),
        ]);
        const context = requireBoaActor(session, actor, group, actorUid, dependencies.isActivePlayer);
        if (command.expectedControlRevision !== context.controlRevision ||
            command.expectedCycle !== context.cycle) {
          fail('failed-precondition', 'Boa control or mission cycle changed. Refresh before choosing again.');
        }
        const opportunitySnapshot = requireDocument(opportunityRead, 'The mission opportunity');
        if (!opportunitySnapshot.exists) fail('not-found', 'That mission opportunity is no longer available.');
        const opportunity = parseOpportunity(opportunitySnapshot, command.sessionId);
        if (opportunity.id !== command.missionOpportunityId || opportunity.groupId !== context.groupId ||
            opportunity.sourceCycle > context.cycle) {
          fail('failed-precondition', 'That mission opportunity is outside Boa’s current fleet group.');
        }
        missionAlreadyStarted(
          requireDocument(startRead, 'The mission-start receipt'), requireDocument(missionRead, 'The mission lifecycle'),
        );
        const later = await Promise.all(laterCycleMissionOpportunityIds(opportunity, context.cycle).map(async (id) =>
          requireDocument(await transaction.get(
            dependencies.db.doc(missionOpportunityDocumentPath(command.sessionId, id)),
          ), 'A later mission opportunity')));
        if (later.some(({ exists }) => exists)) {
          fail('failed-precondition', 'A later visit to this location supersedes that opportunity. Refresh the Boa workspace.');
        }
        const definition = missionCardForCode(opportunity.siteCode);
        const task = definition?.opportunities.find(({ id }) => id === command.taskOpportunityId);
        if (!task) fail('invalid-argument', 'Choose one printed mission-card task from this location.');
        const currentChoiceSnapshot = requireDocument(choiceRead, 'The current Boa choice');
        const currentChoice = currentChoiceSnapshot.exists ? currentChoiceSnapshot.data() : undefined;
        const currentChoiceRevision = currentChoice === undefined ? 0 : isRecord(currentChoice) &&
          currentChoice.status === 'selected' && Number.isSafeInteger(currentChoice.revision) &&
          (currentChoice.revision as number) > 0 ? currentChoice.revision as number : -1;
        if (currentChoiceRevision < 0 || currentChoice && isRecord(currentChoice) && currentChoice.status === 'consumed' ||
            currentChoiceRevision !== command.expectedChoiceRevision) {
          fail('failed-precondition', 'The current Boa selection changed or has already been used. Refresh before choosing.');
        }
        const navigationSnapshot = requireDocument(navigationRead, 'Current navigation');
        const coordinates = navigationSnapshot.get('shipGalacticCoordinates');
        if (!navigationSnapshot.exists || !isRecord(coordinates) ||
            coordinates[context.hostShipId] !== opportunity.coordinate ||
            !context.groupVesselIds.some((vesselId) => coordinates[vesselId] === opportunity.coordinate)) {
          fail('failed-precondition', 'Boa’s fleet group is no longer at that mission location.');
        }
        if (currentChoice && isRecord(currentChoice) && currentChoice.actorUid !== actorUid &&
            currentChoice.status !== 'selected') {
          fail('failed-precondition', 'Refresh the existing Boa mission selection before changing it.');
        }
        const choiceRevision = currentChoiceRevision + 1;
        if (!Number.isSafeInteger(choiceRevision) || choiceRevision >= Number.MAX_SAFE_INTEGER) {
          fail('failed-precondition', 'The Boa selection revision is exhausted.');
        }
        const reply: BoaMissionReclamationChoiceReply = {
          status: 'committed', sessionId: command.sessionId, requestId: command.requestId,
          missionOpportunityId: opportunity.id, taskOpportunityId: task.id, choiceRevision,
        };
        const timestamp = dependencies.serverTimestamp();
        const nextChoice = {
          type: 'boa-mission-reclamation-choice', schemaVersion: 1, status: 'selected',
          sessionId: command.sessionId, opportunityId: opportunity.id,
          groupId: opportunity.groupId, chart: opportunity.chart,
          coordinate: opportunity.coordinate, siteCode: opportunity.siteCode,
          sourceCycle: opportunity.sourceCycle, actorUid, actorRoleId: ROLE_ID,
          opportunityTaskId: task.id, controlRevision: context.controlRevision,
          revision: choiceRevision, requestId: command.requestId,
          updatedAt: timestamp,
        };
        transaction.set(choiceRef, nextChoice);
        dependencies.commandMarkers.create(rawTransaction, expectedFingerprint, reply);
        return reply;
      });
    },
  };
}
