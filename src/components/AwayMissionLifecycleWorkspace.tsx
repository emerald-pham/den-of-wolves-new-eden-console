import { useSessionStore } from '@/store/useSessionStore';
import { missionOverrunForCurrentPhase } from '@/lib/awayMissionPresentation';
import { useEffect, useMemo, useRef, useState } from 'react';
import AwayMissionLifecyclePanel from './AwayMissionLifecyclePanel';
import {
  createAwayMissionLifecycleActions,
  createCurrentAwayMissionLifecycleContext,
  subscribeToOwnAwayMissionLifecycles,
  type AwayMissionLifecycleFeedState,
  type AwayMissionLifecycleMission,
} from '@/lib/awayMissionLifecycleService';

interface AwayMissionLifecycleWorkspaceProps {
  readonly sessionId: string;
  readonly actorUid: string;
  readonly actorRoleId: string;
}

type AssignmentPlacements = Readonly<Record<string, string>>;

interface DetachedAssignmentDraft {
  readonly actorRoleId: string;
  readonly revision: number;
  readonly phase: string;
  readonly placements: AssignmentPlacements;
}

// Only card-to-opportunity choices live here; private card contents and action
// receipts stay in the current server projection/service respectively.
const detachedAssignmentDrafts = new Map<string, DetachedAssignmentDraft>();

function assignmentDraftKey(sessionId: string, actorUid: string, missionId: string): string {
  return JSON.stringify([sessionId, actorUid, missionId]);
}

function isAssignmentPhase(mission: AwayMissionLifecycleMission): boolean {
  return mission.privateState.assignmentCommitted !== true &&
    (mission.publicState.phase === 'assignment-ready' || mission.publicState.phase === 'assigning');
}

function hasCurrentRoleAssignment(
  state: ReturnType<typeof useSessionStore.getState>,
  sessionId: string,
  actorUid: string,
  actorRoleId: string,
): boolean {
  const me = state.me;
  if (state.session?.id !== sessionId || me?.sessionId !== sessionId || me.uid !== actorUid ||
      me.role !== 'player' || me.replacementStatus != null) return false;

  return (me.assignedRoleId === actorRoleId && me.replacementRoleId == null) ||
    me.replacementRoleId === actorRoleId;
}

function hasFreshRoleStationAuthority(
  state: ReturnType<typeof useSessionStore.getState>,
  sessionId: string,
  actorUid: string,
  actorRoleId: string,
): boolean {
  if (!window.navigator.onLine || state.connection !== 'live' || state.sessionSnapshotFreshness !== 'server' ||
      !hasCurrentRoleAssignment(state, sessionId, actorUid, actorRoleId)) return false;

  const me = state.me!;
  return (me.assignedRoleId === actorRoleId && me.replacementRoleId == null && me.activeConsoleRoleId === actorRoleId) ||
    (me.replacementRoleId === actorRoleId && me.activeConsoleRoleId == null);
}

function validAssignmentPlacements(
  placements: AssignmentPlacements,
  mission: AwayMissionLifecycleMission,
): Record<string, string> {
  const remainingCardIds = new Set(mission.privateState.cards
    .filter(card => card.status === 'remaining')
    .map(card => card.id));
  const opportunityIds = new Set(mission.publicState.opportunities.map(opportunity => opportunity.id));
  const result: Record<string, string> = {};
  const usedOpportunityIds = new Set<string>();

  for (const [cardId, opportunityId] of Object.entries(placements)) {
    if (!remainingCardIds.has(cardId) || !opportunityIds.has(opportunityId) || usedOpportunityIds.has(opportunityId)) continue;
    result[cardId] = opportunityId;
    usedOpportunityIds.add(opportunityId);
  }
  return result;
}

function readAssignmentDraft(
  sessionId: string,
  actorUid: string,
  actorRoleId: string,
  mission: AwayMissionLifecycleMission,
): Record<string, string> {
  const key = assignmentDraftKey(sessionId, actorUid, mission.publicState.missionId);
  const draft = detachedAssignmentDrafts.get(key);
  if (!draft) return {};

  if (!isAssignmentPhase(mission) || draft.actorRoleId !== actorRoleId ||
      draft.revision !== mission.publicState.revision || draft.phase !== mission.publicState.phase) {
    detachedAssignmentDrafts.delete(key);
    return {};
  }

  const placements = validAssignmentPlacements(draft.placements, mission);
  if (Object.keys(placements).length === 0) detachedAssignmentDrafts.delete(key);
  else detachedAssignmentDrafts.set(key, { ...draft, placements });
  return placements;
}

function saveAssignmentDraft(
  sessionId: string,
  actorUid: string,
  actorRoleId: string,
  mission: AwayMissionLifecycleMission,
  placements: AssignmentPlacements,
): void {
  if (!isAssignmentPhase(mission)) return;
  const validPlacements = validAssignmentPlacements(placements, mission);
  const key = assignmentDraftKey(sessionId, actorUid, mission.publicState.missionId);
  if (Object.keys(validPlacements).length === 0) {
    detachedAssignmentDrafts.delete(key);
    return;
  }
  detachedAssignmentDrafts.set(key, {
    actorRoleId,
    revision: mission.publicState.revision,
    phase: mission.publicState.phase,
    placements: validPlacements,
  });
}

export const AWAY_MISSION_LIFECYCLE_WORKSPACE_STYLES = `
  .away-mission-lifecycle-workspace .away-mission-lifecycle,
  .away-mission-lifecycle-workspace .away-mission-lifecycle * {
    box-sizing: border-box;
    min-width: 0;
    max-width: 100%;
  }
  .away-mission-lifecycle-workspace .away-mission-lifecycle h2,
  .away-mission-lifecycle-workspace .away-mission-lifecycle h3,
  .away-mission-lifecycle-workspace .away-mission-lifecycle h4,
  .away-mission-lifecycle-workspace .away-mission-lifecycle p,
  .away-mission-lifecycle-workspace .away-mission-lifecycle li,
  .away-mission-lifecycle-workspace .away-mission-lifecycle label,
  .away-mission-lifecycle-workspace .away-mission-lifecycle strong,
  .away-mission-lifecycle-workspace .away-mission-lifecycle span {
    overflow-wrap: anywhere;
  }
  .away-mission-lifecycle-workspace .away-mission-lifecycle select,
  .away-mission-lifecycle-workspace .away-mission-lifecycle input {
    width: 100%;
  }
  .away-mission-lifecycle-workspace .away-mission-lifecycle button {
    white-space: normal;
  }
`;

function hasOwnCurrentHand(mission: AwayMissionLifecycleMission, actorUid: string): boolean {
  return mission.privateState.participantUid === actorUid &&
    mission.privateState.missionId === mission.publicState.missionId &&
    mission.privateState.revision === mission.publicState.revision &&
    mission.privateState.phase === mission.publicState.phase;
}

function MissionPanel({
  sessionId,
  actorUid,
  actorRoleId,
  mission,
  hasFreshStationAuthority,
}: Readonly<{
  sessionId: string;
  actorUid: string;
  actorRoleId: string;
  mission: AwayMissionLifecycleMission;
  hasFreshStationAuthority: boolean;
}>) {
  const presentationSession = useSessionStore(state => state.connection === 'live' && state.sessionSnapshotFreshness === 'server' ? state.session : null);
  const presented = missionOverrunForCurrentPhase(mission.publicState, mission.sourceCycle, presentationSession);
  const currentMission = useRef(mission.publicState);
  currentMission.current = mission.publicState;
  const actions = useMemo(() => createAwayMissionLifecycleActions(() =>
    createCurrentAwayMissionLifecycleContext(currentMission.current, sessionId, actorUid),
  ), [sessionId, actorUid]);
  const [initialAssignmentPlacements] = useState(() => hasFreshStationAuthority
    ? readAssignmentDraft(sessionId, actorUid, actorRoleId, mission)
    : {});
  const assignmentPhase = isAssignmentPhase(mission);

  return (
    <AwayMissionLifecyclePanel
      actorUid={actorUid}
      isGm={false}
      isMissionLeader={mission.publicState.missionLeaderUid === actorUid}
      canUseReclamator={mission.privateState.canUseReclamator === true}
      publicState={presented}
      privateState={mission.privateState}
      actions={actions}
      initialAssignmentPlacements={initialAssignmentPlacements}
      {...(hasFreshStationAuthority && assignmentPhase ? {
        onAssignmentPlacementsChange: (placements: AssignmentPlacements) =>
          saveAssignmentDraft(sessionId, actorUid, actorRoleId, mission, placements),
      } : {})}
    />
  );
}

export default function AwayMissionLifecycleWorkspace({
  sessionId,
  actorUid,
  actorRoleId,
}: AwayMissionLifecycleWorkspaceProps) {
  const currentActorEntitled = useSessionStore(state => hasCurrentRoleAssignment(state, sessionId, actorUid, actorRoleId));
  const canRestoreAssignmentDraft = useSessionStore(state =>
    hasFreshRoleStationAuthority(state, sessionId, actorUid, actorRoleId));
  const [feed, setFeed] = useState<AwayMissionLifecycleFeedState>({
    status: 'loading',
    missions: [],
    projectionMissing: false,
  });

  useEffect(() => {
    setFeed({ status: 'loading', missions: [], projectionMissing: false });
    return subscribeToOwnAwayMissionLifecycles(sessionId, actorUid, setFeed);
  }, [sessionId, actorUid]);

  if (feed.status === 'loading' && feed.missions.length === 0) return null;
  if (feed.status === 'ready' && feed.missions.length === 0 && !feed.projectionMissing) return null;

  const ownedMissions = currentActorEntitled
    ? feed.missions.filter((mission) => hasOwnCurrentHand(mission, actorUid))
    : [];
  const rejectedProjectionCount = currentActorEntitled ? feed.missions.length - ownedMissions.length : 0;

  return (
    <section className="role-brief__rules away-mission-lifecycle-workspace" aria-label="Away mission workspace">
      <style>{AWAY_MISSION_LIFECYCLE_WORKSPACE_STYLES}</style>
      <h2>Away mission workspace</h2>
      {feed.status === 'stale' && (
        <p role="status">Reconnect to refresh the current mission state before continuing.</p>
      )}
      {feed.status === 'projection-missing' && (
        <p role="status">Current mission details are not available from the server yet.</p>
      )}
      {feed.status === 'error' && (
        <p role="alert">Away mission state could not be loaded for this player.</p>
      )}
      {rejectedProjectionCount > 0 && ownedMissions.length === 0 && (
        <p role="status">Your private mission choices are still syncing. Reconnect to refresh them.</p>
      )}
      {feed.status === 'ready' && feed.projectionMissing && ownedMissions.length > 0 && (
        <p role="status">Some mission details are still waiting for a server projection.</p>
      )}
      {feed.status === 'ready' && ownedMissions.map((mission) => (
        <MissionPanel
          key={JSON.stringify([
            sessionId,
            actorUid,
            actorRoleId,
            mission.publicState.missionId,
            mission.publicState.revision,
            mission.publicState.phase,
            canRestoreAssignmentDraft,
          ])}
          sessionId={sessionId}
          actorUid={actorUid}
          actorRoleId={actorRoleId}
          hasFreshStationAuthority={canRestoreAssignmentDraft}
          mission={mission}
        />
      ))}
    </section>
  );
}
