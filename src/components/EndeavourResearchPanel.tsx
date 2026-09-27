import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import {
  advanceEndeavourResearchTrack,
  createEndeavourResearchAttempt,
  readEndeavourResearchWorkspace,
  retryEndeavourResearchAttempt,
  type EndeavourResearchAttempt,
  type EndeavourResearchFunding,
  type EndeavourResearchStaleReply,
  type EndeavourResearchWorkspace,
} from '@/lib/endeavourResearchService';
import type { ShuttleControlEntry } from '@/types/game';
import EndeavourResearchChoices from './EndeavourResearchChoices';
import './EndeavourResearchPanel.css';
import EndeavourEcmDevicePanel from './EndeavourEcmDevicePanel';

const EndeavourFieldUpgradePanel = lazy(() => import('./EndeavourFieldUpgradePanel'));

function isCurrentScientistHolder(
  expectedSessionId: string,
  expectedUid: string,
  expectedControlRevision?: number,
  expectedCycle?: number,
): boolean {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  return session?.id === expectedSessionId && session.phase === 'active' &&
    me?.uid === expectedUid && me.role === 'player' && me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') === true &&
    control?.ownerRoleId === 'shepherd-scientist' && control.holderUid === expectedUid &&
    (expectedControlRevision === undefined || control.revision === expectedControlRevision) &&
    (expectedCycle === undefined || session.currentTurn === expectedCycle);
}

function staleReplyMatchesCurrentSession(reply: EndeavourResearchStaleReply): boolean {
  const state = useSessionStore.getState();
  return state.connection === 'live' && state.sessionSnapshotFreshness === 'server' &&
    window.navigator.onLine && state.session?.id === reply.sessionId &&
    state.session.currentTurn === reply.current.cycle &&
    state.session.shuttleControl?.endeavour?.revision === reply.current.controlRevision;
}

function mayRetryExactRequest(cause: unknown): boolean {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause &&
    typeof cause.code === 'string' ? cause.code : '';
  return !new Set([
    'functions/unauthenticated', 'functions/permission-denied', 'functions/invalid-argument',
    'functions/not-found', 'functions/failed-precondition', 'functions/already-exists',
  ]).has(code);
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
  const connection = useSessionStore((state) => state.connection);
  const snapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
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
  const [staleRecovery, setStaleRecovery] = useState<Readonly<{
    identityKey: string;
    attempt: EndeavourResearchAttempt;
    reply: EndeavourResearchStaleReply;
  }> | null>(null);
  const [pendingAttempt, setPendingAttempt] = useState<Readonly<{
    identityKey: string;
    attempt: EndeavourResearchAttempt;
  }> | null>(null);
  const requestGeneration = useRef(0);
  const sessionId = session?.id;
  const uid = me?.uid;
  const identityKey = sessionId && uid ? JSON.stringify([sessionId, uid]) : null;
  const workspace = loadedWorkspace?.identityKey === identityKey ? loadedWorkspace.value : null;
  const notice = feedback?.identityKey === identityKey ? feedback.notice : '';
  const error = feedback?.identityKey === identityKey ? feedback.error : '';
  const busyFunding = busyAction?.identityKey === identityKey ? busyAction.funding : null;
  const activeStaleRecovery = staleRecovery?.identityKey === identityKey &&
    session?.currentTurn === staleRecovery.reply.current.cycle &&
    session.shuttleControl?.endeavour?.revision === staleRecovery.reply.current.controlRevision
    ? staleRecovery
    : null;
  const activePendingAttempt = pendingAttempt?.identityKey === identityKey ? pendingAttempt : null;
  const entitled = Boolean(
    session?.phase === 'active' && me?.role === 'player' &&
    me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') &&
    control.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' &&
    control.holderUid === me.uid,
  );

  const reload = useCallback(async (): Promise<EndeavourResearchWorkspace | null> => {
    if (!entitled || !sessionId || !uid || !identityKey || !isCurrentScientistHolder(sessionId, uid)) return null;
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const next = await readEndeavourResearchWorkspace();
      if (generation !== requestGeneration.current || !isCurrentScientistHolder(sessionId, uid)) return null;
      setLoadedWorkspace({ identityKey, value: next });
      setFeedback((current) => ({
        identityKey,
        notice: current?.identityKey === identityKey ? current.notice : '',
        error: '',
      }));
      setSelectedTrackId((current) => {
        const choices = new Set(next.cadence.choices.map((choice) => choice.trackId));
        return next.tracks.some((track) => track.trackId === current && !track.complete && !choices.has(track.trackId))
          ? current
          : next.tracks.find((track) => !track.complete && !choices.has(track.trackId))?.trackId ?? '';
      });
      return next;
    } catch (cause) {
      if (generation !== requestGeneration.current || !isCurrentScientistHolder(sessionId, uid)) return null;
      setFeedback({ identityKey, notice: '', error: errorMessage(cause) });
      return null;
    } finally {
      if (generation === requestGeneration.current && isCurrentScientistHolder(sessionId, uid)) setLoading(false);
    }
  }, [entitled, identityKey, sessionId, uid]);

  useEffect(() => {
    if (!entitled) {
      requestGeneration.current += 1;
      setLoadedWorkspace(null);
      setFeedback(null);
      setStaleRecovery(null);
      setPendingAttempt(null);
      setBusyAction(null);
      return;
    }
    void reload();
    return () => { requestGeneration.current += 1; };
  }, [entitled, reload]);

  useEffect(() => {
    if (!staleRecovery || staleRecovery.identityKey !== identityKey || !sessionId ||
        connection !== 'live' || snapshotFreshness !== 'server' || !window.navigator.onLine) return;
    const reply = staleRecovery.reply;
    if (session?.id === reply.sessionId && session.currentTurn === reply.current.cycle &&
        session.shuttleControl?.endeavour?.revision === reply.current.controlRevision) return;
    setStaleRecovery(null);
    setFeedback({
      identityKey,
      notice: 'Research state changed again before this response arrived. Refresh the current Scientist workspace before choosing.',
      error: '',
    });
    void reload();
  }, [connection, identityKey, reload, session, sessionId, snapshotFreshness, staleRecovery]);

  if (!entitled) return null;

  const currentSession = session;
  const chosenTracks = new Set(workspace?.cadence.choices.map((choice) => choice.trackId) ?? []);
  const standardUsed = workspace?.cadence.choices.filter((choice) => choice.funding === 'standard').length ?? 0;
  const oreUsed = workspace?.cadence.choices.filter((choice) => choice.funding === 'shepherd-ore').length ?? 0;
  const selectedTrack = workspace?.tracks.find((track) => track.trackId === selectedTrackId &&
    !track.complete && !chosenTracks.has(track.trackId));
  const liveTeamPhase = Boolean(workspace && hasLiveTeamPhase(currentSession, workspace));
  const liveControl = currentSession?.shuttleControl?.endeavour;
  const staleTrack = activeStaleRecovery && workspace?.tracks.find((track) =>
    track.trackId === activeStaleRecovery.reply.trackId);
  const staleTrackAvailable = Boolean(staleTrack && !staleTrack.complete &&
    !workspace?.cadence.choices.some((choice) => choice.trackId === staleTrack.trackId));
  const staleFundingAvailable = activeStaleRecovery?.reply.funding === 'standard'
    ? standardUsed < 3
    : activeStaleRecovery?.reply.funding === 'shepherd-ore'
      ? oreUsed < 2 && (workspace?.shepherdOre ?? 0) >= 5
      : false;
  const staleRevisionObserved = Boolean(activeStaleRecovery && workspace &&
    workspace.sessionId === activeStaleRecovery.reply.sessionId &&
    workspace.cycle === activeStaleRecovery.reply.current.cycle &&
    workspace.researchRevision >= activeStaleRecovery.reply.current.researchRevision);
  const staleAuthorityCurrent = Boolean(activeStaleRecovery && connection === 'live' &&
    snapshotFreshness === 'server' && window.navigator.onLine &&
    currentSession?.currentTurn === activeStaleRecovery.reply.current.cycle &&
    liveControl?.revision === activeStaleRecovery.reply.current.controlRevision &&
    isCurrentScientistHolder(
      activeStaleRecovery.reply.sessionId,
      uid ?? '',
      activeStaleRecovery.reply.current.controlRevision,
      activeStaleRecovery.reply.current.cycle,
    ));
  const canRetryStale = Boolean(activeStaleRecovery && staleRevisionObserved && staleAuthorityCurrent &&
    liveTeamPhase && staleTrackAvailable && staleFundingAvailable &&
    selectedTrackId === activeStaleRecovery.reply.trackId && loading === false && busyFunding === null &&
    activePendingAttempt === null);
  const staleBlocksNewChoice = Boolean(activeStaleRecovery &&
    selectedTrackId === activeStaleRecovery.reply.trackId);

  async function submitAttempt(
    attempt: EndeavourResearchAttempt,
    trackName: string,
    exactRetry = false,
  ): Promise<void> {
    if (!identityKey || !sessionId || !uid || busyFunding !== null) return;
    setBusyAction({ identityKey, funding: attempt.funding });
    setFeedback({ identityKey, notice: '', error: '' });
    try {
      const result = await (exactRetry
        ? retryEndeavourResearchAttempt(attempt)
        : advanceEndeavourResearchTrack(attempt));
      if (!isCurrentScientistHolder(sessionId, uid)) return;
      if (!exactRetry && result.status !== 'stale' && !isCurrentScientistHolder(
        sessionId, uid, attempt.expectedControlRevision, attempt.expectedCycle,
      )) {
        setPendingAttempt({ identityKey, attempt });
        setFeedback({
          identityKey,
          notice: '',
          error: 'The response arrived after research authority changed. Retry the same request to confirm its outcome.',
        });
        await reload();
        return;
      }
      setPendingAttempt(null);
      if (result.status === 'stale') {
        if (!staleReplyMatchesCurrentSession(result)) {
          setStaleRecovery(null);
          setFeedback({
            identityKey,
            notice: 'Research state changed again before this response arrived. Refresh the current Scientist workspace before choosing.',
            error: '',
          });
          await reload();
          return;
        }
        setStaleRecovery({ identityKey, attempt, reply: result });
        await reload();
      } else {
        setStaleRecovery(null);
        setFeedback({
          identityKey,
          notice: result.status === 'replayed'
            ? `${trackName} research request was confirmed.`
            : `${trackName} advanced one research box.`,
          error: '',
        });
        await reload();
      }
    } catch (cause) {
      if (isCurrentScientistHolder(sessionId, uid)) {
        if (mayRetryExactRequest(cause)) setPendingAttempt({ identityKey, attempt });
        else setPendingAttempt(null);
        setFeedback({ identityKey, notice: '', error: errorMessage(cause) });
        await reload();
        if (mayRetryExactRequest(cause) && isCurrentScientistHolder(sessionId, uid)) {
          setFeedback({
            identityKey, notice: '',
            error: `${errorMessage(cause)} This request may have committed; retry the same request to confirm it.`,
          });
        }
      }
    } finally {
      setBusyAction((current) => current?.identityKey === identityKey ? null : current);
    }
  }

  async function resolveChoice(funding: EndeavourResearchFunding): Promise<void> {
    if (!workspace || !selectedTrack || !liveTeamPhase || busyFunding !== null || activePendingAttempt ||
        staleBlocksNewChoice || !identityKey) return;
    try {
      await submitAttempt(createEndeavourResearchAttempt({
        workspace, trackId: selectedTrack.trackId, funding,
      }), selectedTrack.name);
    } catch (cause) {
      setFeedback({ identityKey, notice: '', error: errorMessage(cause) });
    }
  }

  async function retrySameRequest(): Promise<void> {
    if (!activePendingAttempt) return;
    const trackName = workspace?.tracks.find((track) => track.trackId === activePendingAttempt.attempt.trackId)?.name ?? 'Research';
    await submitAttempt(activePendingAttempt.attempt, trackName, true);
  }

  async function retryWithCurrentRevision(): Promise<void> {
    if (!canRetryStale || !activeStaleRecovery || !workspace || !staleTrack) return;
    try {
      const attempt = createEndeavourResearchAttempt({
        workspace,
        trackId: activeStaleRecovery.reply.trackId,
        funding: activeStaleRecovery.reply.funding,
      });
      setStaleRecovery(null);
      await submitAttempt(attempt, staleTrack.name);
    } catch (cause) {
      if (identityKey) setFeedback({ identityKey, notice: '', error: errorMessage(cause) });
    }
  }

  return <>
    <EndeavourResearchChoices
      workspace={workspace}
      selectedTrackId={selectedTrackId}
      liveTeamPhase={liveTeamPhase}
      loading={loading}
      busyFunding={busyFunding}
      pendingAttempt={activePendingAttempt !== null}
      staleBlocksNewChoice={staleBlocksNewChoice}
      notice={notice}
      error={error}
      onSelectTrack={(trackId) => {
        setSelectedTrackId(trackId);
        setStaleRecovery(null);
        setFeedback({ identityKey: identityKey!, notice: '', error: '' });
      }}
      onAdvance={(funding) => void resolveChoice(funding)}
      onRefresh={() => void reload()}
      alerts={<>
        {activeStaleRecovery && <div className="console-workspace__status" aria-label="Stale research recovery">
        <p role="status">Research changed while this choice was being checked.</p>
        {!staleRevisionObserved && <p>Waiting for the live Scientist workspace to reach the current research revision.</p>}
        {staleRevisionObserved && !staleTrackAvailable &&
          <p>This track is no longer available. Choose another available track to make a new choice.</p>}
        {staleRevisionObserved && staleTrackAvailable && !staleFundingAvailable &&
          <p>The original research choice is no longer eligible.</p>}
        {staleRevisionObserved && staleTrackAvailable && !staleAuthorityCurrent &&
          <p>Reconnect to the current Scientist authority before retrying.</p>}
        <button type="button" className="cic-action-button" disabled={!canRetryStale}
          onClick={() => void retryWithCurrentRevision()}>
          Retry choice with current revisions
        </button>
        </div>}
        {activePendingAttempt && <div className="console-workspace__status" aria-label="Unconfirmed research request">
        <p role="status">The research response was uncertain. Retry the same request to confirm its outcome.</p>
        <button type="button" className="cic-action-button" disabled={busyFunding !== null || loading}
          onClick={() => void retrySameRequest()}>
          Retry same research request
        </button>
        </div>}
      </>}
    />
    {workspace && <EndeavourEcmDevicePanel control={control} />}
    {workspace && <Suspense fallback={<p className="console-workspace__status" role="status">
      Loading Endeavour field-upgrade controls…
    </p>}>
      <EndeavourFieldUpgradePanel
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
      />
    </Suspense>}
  </>;
}
