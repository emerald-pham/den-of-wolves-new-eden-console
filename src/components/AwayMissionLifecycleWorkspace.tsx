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
  mission,
}: Readonly<{
  sessionId: string;
  actorUid: string;
  mission: AwayMissionLifecycleMission;
}>) {
  const currentMission = useRef(mission.publicState);
  currentMission.current = mission.publicState;
  const actions = useMemo(() => createAwayMissionLifecycleActions(() =>
    createCurrentAwayMissionLifecycleContext(currentMission.current, sessionId, actorUid),
  ), [sessionId, actorUid]);

  return (
    <AwayMissionLifecyclePanel
      actorUid={actorUid}
      isGm={false}
      isMissionLeader={mission.publicState.missionLeaderUid === actorUid}
      canUseReclamator={mission.privateState.canUseReclamator === true}
      publicState={mission.publicState}
      privateState={mission.privateState}
      actions={actions}
    />
  );
}

export default function AwayMissionLifecycleWorkspace({
  sessionId,
  actorUid,
}: AwayMissionLifecycleWorkspaceProps) {
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

  const ownedMissions = feed.missions.filter((mission) => hasOwnCurrentHand(mission, actorUid));
  const rejectedProjectionCount = feed.missions.length - ownedMissions.length;

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
          key={mission.publicState.missionId}
          sessionId={sessionId}
          actorUid={actorUid}
          mission={mission}
        />
      ))}
    </section>
  );
}
