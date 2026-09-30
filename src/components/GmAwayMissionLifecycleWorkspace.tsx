import { useMemo, useRef } from 'react';
import AwayMissionLifecyclePanel from './AwayMissionLifecyclePanel';
import { createCurrentAwayMissionLifecycleActions, type AwayMissionPublicState } from '@/lib/awayMissionLifecycleService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { AWAY_MISSION_LIFECYCLE_WORKSPACE_STYLES } from './AwayMissionLifecycleWorkspace';
import { missionOverrunForCurrentPhase } from '@/lib/awayMissionPresentation';
import type { GameSession, AwayMissionHandPointer } from '@/types/game';

function currentMissions(pointers: readonly AwayMissionHandPointer[], session: GameSession | null): readonly AwayMissionPublicState[] {
  const grouped = new Map<string, AwayMissionHandPointer[]>();
  for (const pointer of pointers) grouped.set(pointer.missionId, [...(grouped.get(pointer.missionId) ?? []), pointer]);
  return [...grouped.values()].flatMap((group) => {
    const first = group[0]?.lifecyclePublicState;
    if (!first || group.length !== first.participantCount ||
        new Set(group.map(({ participantUid }) => participantUid)).size !== group.length ||
        group.some((pointer) => pointer.sourceCycle !== group[0]?.sourceCycle || !pointer.lifecyclePublicState || pointer.revision !== first.revision ||
          pointer.phase !== first.phase || pointer.lifecyclePublicState.revision !== first.revision ||
          pointer.lifecyclePublicState.missionId !== first.missionId || pointer.lifecyclePublicState.phase !== first.phase)) return [];
    return [missionOverrunForCurrentPhase(first, group[0]?.sourceCycle, session)];
  });
}
function FacilitatorMission({ state, sessionId, actorUid }: Readonly<{
  state: AwayMissionPublicState; sessionId: string; actorUid: string;
}>) {
  const current = useRef(state);
  current.current = state;
  const actions = useMemo(() => createCurrentAwayMissionLifecycleActions(() => current.current, sessionId, actorUid),
    [sessionId, actorUid]);
  return <AwayMissionLifecyclePanel actorUid={actorUid} isGm isMissionLeader={false}
    publicState={state} privateState={null} actions={actions} />;
}
export default function GmAwayMissionLifecycleWorkspace() {
  const isGm = useSessionStore(selectIsGm);
  const session = useSessionStore((s) => s.session);
  const me = useSessionStore((s) => s.me);
  const connection = useSessionStore((s) => s.connection);
  const freshness = useSessionStore((s) => s.sessionSnapshotFreshness);
  const pointers = useSessionStore((s) => s.gmAwayMissionHandPointers);
  const missions = useMemo(() => currentMissions(pointers, session), [pointers, session]);
  if (!isGm || !session || !me || session.phase !== 'active' || me.sessionId !== session.id ||
      connection !== 'live' || freshness !== 'server' || missions.length === 0) return null;
  return <section className="away-mission-lifecycle-workspace" aria-label="Facilitator away mission workspace">
    <style>{AWAY_MISSION_LIFECYCLE_WORKSPACE_STYLES}</style>
    {missions.map((state) => <FacilitatorMission key={state.missionId} state={state} sessionId={session.id} actorUid={me.uid} />)}
  </section>;
}
