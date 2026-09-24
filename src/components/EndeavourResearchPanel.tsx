import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import {
  advanceEndeavourResearchTrack,
  readEndeavourResearchWorkspace,
  type EndeavourResearchFunding,
  type EndeavourResearchWorkspace,
} from '@/lib/endeavourResearchService';
import type { ShuttleControlEntry } from '@/types/game';
import EndeavourFieldUpgradePanel from './EndeavourFieldUpgradePanel';
import './EndeavourResearchPanel.css';

function isCurrentScientistHolder(expectedSessionId: string, expectedUid: string): boolean {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  return session?.id === expectedSessionId && session.phase === 'active' &&
    me?.uid === expectedUid && me.role === 'player' && me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') === true &&
    control?.ownerRoleId === 'shepherd-scientist' && control.holderUid === expectedUid;
}

function hasLiveTeamPhase(session: ReturnType<typeof useSessionStore.getState>['session'], workspace: EndeavourResearchWorkspace): boolean {
  if (!session || session.phase !== 'active' || session.currentTurn !== workspace.cycle) return false;
  const phase = session.turnPhase;
  const deadline = Date.parse(phase?.teamPhaseEndsAt ?? '');
  return Boolean(
    phase && phase.turn === workspace.cycle && phase.airspace.state === 'restricted' &&
    phase.timerPause === undefined && Number.isFinite(deadline) && Date.now() < deadline,
  );
}

function errorMessage(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause &&
      typeof cause.message === 'string' && cause.message.length > 0) return cause.message;
  return 'The research choice could not be confirmed. Refresh and try again.';
}

export default function EndeavourResearchPanel({ control }: { readonly control: ShuttleControlEntry }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const [loadedWorkspace, setLoadedWorkspace] = useState<Readonly<{
    identityKey: string;
    value: EndeavourResearchWorkspace;
  }> | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<Readonly<{
    identityKey: string;
    funding: EndeavourResearchFunding;
  }> | null>(null);
  const [feedback, setFeedback] = useState<Readonly<{
    identityKey: string;
    notice: string;
    error: string;
  }> | null>(null);
  const requestGeneration = useRef(0);
  const sessionId = session?.id;
  const uid = me?.uid;
  const identityKey = sessionId && uid ? JSON.stringify([sessionId, uid]) : null;
  const workspace = loadedWorkspace?.identityKey === identityKey ? loadedWorkspace.value : null;
  const notice = feedback?.identityKey === identityKey ? feedback.notice : '';
  const error = feedback?.identityKey === identityKey ? feedback.error : '';
  const busyFunding = busyAction?.identityKey === identityKey ? busyAction.funding : null;
  const entitled = Boolean(
    session?.phase === 'active' && me?.role === 'player' &&
    me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') &&
    control.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' &&
    control.holderUid === me.uid,
  );

  const reload = useCallback(async () => {
    if (!entitled || !sessionId || !uid || !identityKey || !isCurrentScientistHolder(sessionId, uid)) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setFeedback((current) => ({
      identityKey,
      notice: current?.identityKey === identityKey ? current.notice : '',
      error: '',
    }));
    try {
      const next = await readEndeavourResearchWorkspace();
      if (generation !== requestGeneration.current || !isCurrentScientistHolder(sessionId, uid)) return;
      setLoadedWorkspace({ identityKey, value: next });
      setSelectedTrackId((current) => {
        const choices = new Set(next.cadence.choices.map((choice) => choice.trackId));
        return next.tracks.some((track) => track.trackId === current && !track.complete && !choices.has(track.trackId))
          ? current
          : next.tracks.find((track) => !track.complete && !choices.has(track.trackId))?.trackId ?? '';
      });
    } catch (cause) {
      if (generation !== requestGeneration.current || !isCurrentScientistHolder(sessionId, uid)) return;
      setFeedback({ identityKey, notice: '', error: errorMessage(cause) });
    } finally {
      if (generation === requestGeneration.current && isCurrentScientistHolder(sessionId, uid)) setLoading(false);
    }
  }, [entitled, identityKey, sessionId, uid]);

  useEffect(() => {
    if (!entitled) {
      requestGeneration.current += 1;
      setLoadedWorkspace(null);
      setFeedback(null);
      return;
    }
    void reload();
    return () => { requestGeneration.current += 1; };
  }, [entitled, reload]);

  if (!entitled) return null;

  const currentSession = useSessionStore.getState().session;
  const chosenTracks = new Set(workspace?.cadence.choices.map((choice) => choice.trackId) ?? []);
  const standardUsed = workspace?.cadence.choices.filter((choice) => choice.funding === 'standard').length ?? 0;
  const oreUsed = workspace?.cadence.choices.filter((choice) => choice.funding === 'shepherd-ore').length ?? 0;
  const selectedTrack = workspace?.tracks.find((track) => track.trackId === selectedTrackId &&
    !track.complete && !chosenTracks.has(track.trackId));
  const liveTeamPhase = Boolean(workspace && hasLiveTeamPhase(currentSession, workspace));

  async function resolveChoice(funding: EndeavourResearchFunding): Promise<void> {
    if (!workspace || !selectedTrack || !liveTeamPhase || busyFunding !== null || !identityKey || !sessionId || !uid) return;
    setBusyAction({ identityKey, funding });
    setFeedback({ identityKey, notice: '', error: '' });
    try {
      await advanceEndeavourResearchTrack({ workspace, trackId: selectedTrack.trackId, funding });
      if (!isCurrentScientistHolder(sessionId, uid)) return;
      setFeedback({ identityKey, notice: `${selectedTrack.name} advanced one research box.`, error: '' });
      await reload();
    } catch (cause) {
      if (isCurrentScientistHolder(sessionId, uid)) {
        setFeedback({ identityKey, notice: '', error: errorMessage(cause) });
      }
      await reload();
    } finally {
      setBusyAction((current) => current?.identityKey === identityKey ? null : current);
    }
  }

  const standardDisabled = !liveTeamPhase || !selectedTrack || standardUsed >= 3 || loading || busyFunding !== null;
  const oreDisabled = !liveTeamPhase || !selectedTrack || oreUsed >= 2 ||
    (workspace?.shepherdOre ?? 0) < 5 || loading || busyFunding !== null;

  return <>
    <section className="console-workspace__section endeavour-research-panel"
      aria-label="Endeavour research controls" aria-busy={loading || busyFunding !== null}>
      <div className="console-workspace__status">
        <p>Private Scientist workspace // Endeavour Team research</p>
        <p>Cycle choices: {standardUsed} of 3 standard; {oreUsed} of 2 additional.</p>
        {workspace && <p>Shepherd // {workspace.shepherdOre} ore available</p>}
        {!liveTeamPhase && workspace && <p>Research choices are available during the live Team Phase.</p>}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      {loading && <p role="status">Loading private research state…</p>}
      {!loading && !workspace && !error && <p>Research state is not available.</p>}
      {workspace && <>
        <ul aria-label="Research progress">
          {workspace.tracks.map((track) => {
            const used = chosenTracks.has(track.trackId);
            const status = track.complete ? 'Research complete.'
              : used ? 'Chosen this cycle.'
                : 'Available for a research choice.';
            return <li key={track.trackId}>
              {track.name}: {track.crossedBoxes} of {track.totalBoxes} boxes crossed;{' '}
              {track.complete ? 'no further field-upgrade cost. ' : `next field-upgrade cost is ${track.currentMaterialCost} materials. `}
              {status}
            </li>;
          })}
        </ul>
        <label className="cic-field">
          <span>Research track</span>
          <select
            value={selectedTrackId}
            onChange={(event) => setSelectedTrackId(event.currentTarget.value)}
            disabled={loading || busyFunding !== null || workspace.tracks.every((track) =>
              track.complete || chosenTracks.has(track.trackId))}
          >
            {workspace.tracks.map((track) => {
              const used = chosenTracks.has(track.trackId);
              return <option
                key={track.trackId}
                value={track.trackId}
                disabled={track.complete || used}
              >
                {track.name}
              </option>;
            })}
          </select>
        </label>
        {selectedTrack && <p>
          Cross the left-most research box for {selectedTrack.name}. Its next field-upgrade cost is
          {' '}{selectedTrack.currentMaterialCost} materials.
        </p>}
        <div className="console-workspace__actions">
          <button type="button" className="cic-action-button" disabled={standardDisabled}
            onClick={() => void resolveChoice('standard')}>
            {busyFunding === 'standard' ? 'Advancing research…' : 'Advance standard research'}
          </button>
          <button type="button" className="cic-action-button" disabled={oreDisabled}
            onClick={() => void resolveChoice('shepherd-ore')}>
            {busyFunding === 'shepherd-ore' ? 'Advancing research…' : 'Advance with 5 Shepherd ore'}
          </button>
          <button type="button" className="cic-text-button" disabled={loading || busyFunding !== null}
            onClick={() => void reload()}>
            Refresh private research
          </button>
        </div>
      </>}
    </section>
    {workspace && <EndeavourFieldUpgradePanel
      control={control}
      workspace={workspace}
      purchaseState={{
        status: 'ready',
        sessionId: workspace.sessionId,
        cycle: workspace.cycle,
        researchRevision: workspace.researchRevision,
        upgradeRevision: workspace.fieldUpgradeState.upgradeRevision,
        targetsUsedThisCycle: workspace.fieldUpgradeState.targetsUsedThisCycle,
      }}
      onRefresh={reload}
    />}
  </>;
}
