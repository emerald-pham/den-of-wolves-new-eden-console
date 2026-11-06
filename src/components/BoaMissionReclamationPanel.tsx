import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import {
  captureSessionAuthority,
  hasFreshSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import {
  chooseBoaMissionReclamationOpportunity,
  readBoaMissionReclamationWorkspace,
  type BoaMissionReclamationChoiceCommand,
} from '@/lib/boaMissionReclamationService';
import type { BoaMissionReclamationWorkspaceOpportunity } from '../../functions/src/boaMissionReclamationCallable';
import { halvedBoaReclamationDifficulty } from '../../functions/src/boaMissionReclamation';
import type { ShuttleControlEntry, ShuttleDocking } from '@/types/game';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
}

interface PendingChoice {
  readonly command: BoaMissionReclamationChoiceCommand;
  readonly identity: string;
}

function isCurrentBoaStation(
  session: NonNullable<ReturnType<typeof useSessionStore.getState>['session']>,
  me: NonNullable<ReturnType<typeof useSessionStore.getState>['me']>,
  control: ShuttleControlEntry,
  docking?: ShuttleDocking,
): boolean {
  const currentControl = session.shuttleControl?.boa;
  const currentDockings = session.shuttleDockings?.filter(({ shuttleId }) => shuttleId === 'boa') ?? [];
  return me.role === 'player' && me.assignedRoleId === 'capybara-recycler' &&
    me.sessionId === session.id && typeof me.fleetGroupId === 'string' && /^fleet-[1-9]\d*$/.test(me.fleetGroupId) &&
    session.phase === 'active' && session.expansion === 'capybara' && session.capybaraEnabled === true &&
    session.activeRoleIds?.includes('capybara-captain') === true &&
    session.activeRoleIds.includes('capybara-recycler') && session.activeVesselIds?.includes('capybara') === true &&
    currentControl?.shuttleId === 'boa' && currentControl.ownerRoleId === 'capybara-recycler' &&
    currentControl.holderUid === me.uid && currentControl.revision === control.revision &&
    control.shuttleId === 'boa' && control.ownerRoleId === 'capybara-recycler' && control.holderUid === me.uid &&
    Number.isSafeInteger(control.revision) && control.revision >= 0 &&
    currentDockings.length === 1 && currentDockings[0]?.shipId === docking?.shipId &&
    typeof docking?.shipId === 'string' && session.activeVesselIds.includes(docking.shipId);
}

function labelFor(opportunity: BoaMissionReclamationWorkspaceOpportunity): string {
  return `Review ${opportunity.siteName} mission tasks`;
}

export default function BoaMissionReclamationPanel({ control, docking }: Props) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const stationIsCurrent = !!session && !!me && isCurrentBoaStation(session, me, control, docking);
  const live = connection === 'live' && freshness === 'server' && hasFreshSessionAuthority();
  const identity = [session?.id, me?.uid, me?.role, me?.assignedRoleId, me?.fleetGroupId,
    control.holderUid, control.revision, docking?.shipId, session?.currentTurn, connection, freshness].join(':');
  const [loading, setLoading] = useState(false);
  const [workspace, setWorkspace] = useState<Awaited<ReturnType<typeof readBoaMissionReclamationWorkspace>> | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [draftTaskId, setDraftTaskId] = useState('');
  const [pending, setPending] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestCheckpoint = useRef<SessionAuthorityCheckpoint | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const attempt = ++sequence.current;
    setWorkspace(null);
    setSelectedOpportunityId(null);
    setDraftTaskId('');
    setPendingChoice(null);
    setPending(false);
    setError('');
    setStatus('');
    if (!session || !me || !stationIsCurrent || !live) {
      setLoading(false);
      return;
    }
    const checkpoint = captureSessionAuthority(session.id, me.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void readBoaMissionReclamationWorkspace(session.id).then((reply) => {
      if (active && attempt === sequence.current && isCurrentSessionAuthority(checkpoint)) setWorkspace(reply);
    }).catch((cause: unknown) => {
      if (active && attempt === sequence.current && isCurrentSessionAuthority(checkpoint)) {
        setError(cause instanceof Error ? cause.message : 'Boa mission opportunities could not be refreshed.');
      }
    }).finally(() => {
      if (active && attempt === sequence.current) setLoading(false);
    });
    return () => { active = false; };
  }, [identity, refreshVersion]);

  const stationReady = !!session && !!me && stationIsCurrent && live;
  const authorityReady = stationReady &&
    workspace?.sessionId === session.id && workspace.actorUid === me.uid &&
    workspace.groupId === me.fleetGroupId && workspace.hostShipId === docking?.shipId &&
    workspace.controlRevision === control.revision && workspace.cycle === session.currentTurn;
  const selectedOpportunity = workspace?.opportunities.find(({ missionOpportunityId }) =>
    missionOpportunityId === selectedOpportunityId);
  const selectedTask = selectedOpportunity?.taskOpportunities.find(({ id }) => id === draftTaskId);

  async function submitChoice(): Promise<void> {
    if (!authorityReady || !session || !me || !selectedOpportunity || !selectedTask || pending) return;
    const checkpoint = captureSessionAuthority(session.id, me.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    if (requestCheckpoint.current && isCurrentSessionAuthority(requestCheckpoint.current)) return;
    const command = pendingChoice?.identity === identity
      ? pendingChoice.command
      : {
        requestId: window.crypto.randomUUID(),
        missionOpportunityId: selectedOpportunity.missionOpportunityId,
        taskOpportunityId: selectedTask.id,
        expectedControlRevision: workspace.controlRevision,
        expectedChoiceRevision: selectedOpportunity.choiceRevision,
        expectedCycle: workspace.cycle,
      };
    if (pendingChoice && pendingChoice.identity === identity &&
        (pendingChoice.command.missionOpportunityId !== selectedOpportunity.missionOpportunityId ||
          pendingChoice.command.taskOpportunityId !== selectedTask.id)) return;
    requestCheckpoint.current = checkpoint;
    setPending(true);
    setError('');
    setStatus('');
    setPendingChoice({ command, identity });
    try {
      const result = await chooseBoaMissionReclamationOpportunity(command);
      if (!isCurrentSessionAuthority(checkpoint) || identity !== [
        useSessionStore.getState().session?.id,
        useSessionStore.getState().me?.uid,
        useSessionStore.getState().me?.role,
        useSessionStore.getState().me?.assignedRoleId,
        useSessionStore.getState().me?.fleetGroupId,
        useSessionStore.getState().session?.shuttleControl?.boa?.holderUid,
        useSessionStore.getState().session?.shuttleControl?.boa?.revision,
        useSessionStore.getState().session?.shuttleDockings?.find(({ shuttleId }) => shuttleId === 'boa')?.shipId,
        useSessionStore.getState().session?.currentTurn,
        useSessionStore.getState().connection,
        useSessionStore.getState().sessionSnapshotFreshness,
      ].join(':')) return;
      setWorkspace((current) => current ? ({ ...current, opportunities: current.opportunities.map((entry) =>
        entry.missionOpportunityId === result.missionOpportunityId
          ? { ...entry, choiceRevision: result.choiceRevision, selectedTaskOpportunityId: result.taskOpportunityId }
          : entry) }) : current);
      setStatus(result.status === 'replayed'
        ? `Boa’s ${result.taskOpportunityId} choice was already recorded before the initial deal.`
        : `Boa selected ${result.taskOpportunityId} for ${selectedOpportunity.siteName} before the initial deal.`);
      setPendingChoice(null);
    } catch (cause) {
      if (isCurrentSessionAuthority(checkpoint)) {
        setError(cause instanceof Error ? cause.message : 'The Boa mission choice was not confirmed.');
      }
    } finally {
      if (requestCheckpoint.current === checkpoint) {
        requestCheckpoint.current = null;
        setPending(false);
      }
    }
  }

  return <section className="role-brief__rules boa-mission-reclamation" aria-label="Boa mission reclamation">
    <header>
      <p className="console-workspace__eyebrow">Capybara // pre-deal procedure</p>
      <h2>Boa mission reclamation</h2>
      <p>Choose one mission-card task for this fleet location before the facilitator deals the mission. A success replaces that task’s reward with one Scrap in Boa’s cargo and grants no critical bonus.</p>
    </header>
    {!stationIsCurrent && <p role="status">Only the current Boa Recycler at this station can use this procedure. Return to the Boa console after claiming the shuttle.</p>}
    {stationIsCurrent && !live && <p role="status">Reconnect to the live session before reading or changing the Boa mission choice.</p>}
    {stationReady && loading && <p role="status">Refreshing Boa’s current fleet mission opportunities…</p>}
    {stationReady && error && <p role="alert">{error}</p>}
    {stationReady && error && <button type="button" disabled={loading}
      onClick={() => setRefreshVersion((version) => version + 1)}>Refresh Boa mission opportunities</button>}
    {authorityReady && !loading && !error && workspace?.opportunities.length === 0 &&
      <p role="status">No unstarted mission-card opportunity is waiting at Boa’s current fleet location. Return after the group reaches a new system.</p>}
    {authorityReady && !loading && !error && workspace && workspace.opportunities.length > 0 && !selectedOpportunity && (
      <section aria-label="Current fleet mission locations">
        <ul>
          {workspace.opportunities.map((opportunity) => <li key={opportunity.missionOpportunityId}>
            <p>{opportunity.siteName} // {opportunity.coordinate} // Chart {opportunity.chart}</p>
            <button type="button" onClick={() => {
              setSelectedOpportunityId(opportunity.missionOpportunityId);
              setDraftTaskId(opportunity.selectedTaskOpportunityId ?? '');
              setError(''); setStatus('');
            }}>{labelFor(opportunity)}</button>
          </li>)}
        </ul>
      </section>
    )}
    {authorityReady && selectedOpportunity && (
      <section aria-label="Mission task selection">
        <p>{selectedOpportunity.siteName} // {selectedOpportunity.coordinate} // Select the printed mission-card task to modify.</p>
        <fieldset>
          <legend>Select a mission-card task</legend>
          {selectedOpportunity.taskOpportunities.map((task) => <label key={task.id}>
            <input type="radio" name="boa-mission-task" value={task.id} checked={draftTaskId === task.id}
              disabled={pending} onChange={() => { setDraftTaskId(task.id); setPendingChoice(null); setError(''); setStatus(''); }} />
            <span>{task.id} // {task.description}</span>
            {task.difficulty !== null && <small>Printed difficulty {task.difficulty}; Boa difficulty {halvedBoaReclamationDifficulty(task.difficulty)} (odd halves round up).</small>}
            {task.criticalThreshold !== null && <small>Critical threshold {task.criticalThreshold}; Boa grants no critical bonus.</small>}
          </label>)}
        </fieldset>
        <button type="button" onClick={() => void submitChoice()} disabled={!authorityReady || !selectedTask || pending}>
          {pending ? 'Recording Boa mission choice…' : pendingChoice?.identity === identity
            ? 'Retry exact Boa mission choice' : `Apply Boa reclamation to ${draftTaskId || 'selected task'}`}
        </button>
        <button type="button" onClick={() => {
          setSelectedOpportunityId(null); setDraftTaskId(''); setError(''); setStatus('');
        }} disabled={pending}>Back to mission locations</button>
      </section>
    )}
    {status && <p role="status">{status}</p>}
  </section>;
}
