import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import GorgoneionMissionSupportPanel from './GorgoneionMissionSupportPanel';
import {
  applyGorgoneionMissionSupport,
  getGorgoneionMissionSupportProjection,
  hasCurrentGorgoneionMissionSupportAuthority,
  subscribeGorgoneionMissionSupportProjection,
  type GorgoneionMissionSupportProjection,
} from '@/lib/gorgoneionMissionSupportService';

function sameProjection(
  left: GorgoneionMissionSupportProjection,
  right: GorgoneionMissionSupportProjection,
): boolean {
  return left.sessionId === right.sessionId && left.actorUid === right.actorUid &&
    left.hostShipId === right.hostShipId && left.dockingRevision === right.dockingRevision &&
    left.dealtCount === right.dealtCount &&
    left.cardIds.length === right.cardIds.length &&
    left.cardIds.every((cardId, index) => cardId === right.cardIds[index]);
}

export default function GorgoneionMissionSupportWorkspace() {
  const sessionId = useSessionStore((state) => state.session?.id ?? null);
  const phase = useSessionStore((state) => state.session?.phase ?? null);
  const hostShipId = useSessionStore((state) => state.session?.smallShipStates?.gorgoneion?.hostShipId ?? null);
  const dockingRevision = useSessionStore((state) => state.session?.smallShipStates?.gorgoneion?.dockingRevision ?? null);
  const hostIsActive = useSessionStore((state) => Boolean(
    state.session?.smallShipStates?.gorgoneion?.hostShipId &&
    state.session.activeVesselIds?.includes(state.session.smallShipStates.gorgoneion.hostShipId),
  ));
  const uid = useSessionStore((state) => state.me?.uid ?? null);
  const meSessionId = useSessionStore((state) => state.me?.sessionId ?? null);
  const role = useSessionStore((state) => state.me?.role ?? null);
  const replacementRoleId = useSessionStore((state) => state.me?.replacementRoleId ?? null);
  const replacementStatus = useSessionStore((state) => state.me?.replacementStatus ?? null);
  const activeConsoleRoleId = useSessionStore((state) => state.me?.activeConsoleRoleId ?? null);
  const seatId = useSessionStore((state) => state.me?.seatId ?? null);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [online, setOnline] = useState(() => window.navigator.onLine);
  const [projection, setProjection] = useState<GorgoneionMissionSupportProjection | null>(null);
  const [topCardIds, setTopCardIds] = useState<readonly string[]>([]);
  const [bottomCardIds, setBottomCardIds] = useState<readonly string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const updateOnline = () => setOnline(window.navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const authorityReady = Boolean(
    online && connection === 'live' && freshness === 'server' &&
    sessionId && meSessionId === sessionId && uid && role === 'player' &&
    replacementRoleId === 'gorgoneion-captain' && replacementStatus == null &&
    activeConsoleRoleId == null && seatId == null && phase === 'active' &&
    hostShipId && hostIsActive && Number.isSafeInteger(dockingRevision) &&
    (dockingRevision as number) >= 1 && hasCurrentGorgoneionMissionSupportAuthority(),
  );

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    let confirmedProjection: GorgoneionMissionSupportProjection | null = null;
    setProjection(null);
    setTopCardIds([]);
    setBottomCardIds([]);
    setSubmitting(false);
    setStatusMessage(null);

    if (!authorityReady || !sessionId || !uid || !hostShipId ||
        !Number.isSafeInteger(dockingRevision)) return () => { active = false; };

    const expectedSessionId = sessionId;
    const expectedUid = uid;
    const expectedHost = hostShipId;
    const expectedRevision = dockingRevision as number;
    const stillAuthorized = () => {
      const state = useSessionStore.getState();
      const currentSession = state.session;
      const currentMe = state.me;
      return active && hasCurrentGorgoneionMissionSupportAuthority() &&
        currentSession?.id === expectedSessionId && currentMe?.uid === expectedUid &&
        currentMe.sessionId === expectedSessionId &&
        currentSession.phase === 'active' &&
        currentSession.smallShipStates?.gorgoneion?.hostShipId === expectedHost &&
        currentSession.smallShipStates?.gorgoneion?.dockingRevision === expectedRevision &&
        currentSession.activeVesselIds?.includes(expectedHost) === true;
    };

    setStatusMessage('Loading the current private top-five projection…');
    void getGorgoneionMissionSupportProjection().then((loaded) => {
      if (!stillAuthorized() || loaded.sessionId !== expectedSessionId ||
          loaded.actorUid !== expectedUid || loaded.hostShipId !== expectedHost ||
          loaded.dockingRevision !== expectedRevision) return;

      setProjection(loaded);
      setTopCardIds(loaded.cardIds);
      setBottomCardIds([]);
      setStatusMessage(null);
      confirmedProjection = loaded;
      unsubscribe = subscribeGorgoneionMissionSupportProjection(
        expectedSessionId,
        expectedUid,
        (next) => {
          if (!stillAuthorized()) {
            confirmedProjection = null;
            unsubscribe();
            unsubscribe = () => {};
            setProjection(null);
            setTopCardIds([]);
            setBottomCardIds([]);
            setStatusMessage('The current Captain or docking authority changed. The inspected cards were cleared.');
            return;
          }
          if (!next || next.hostShipId !== expectedHost || next.dockingRevision !== expectedRevision ||
              !confirmedProjection || !sameProjection(confirmedProjection, next)) {
            confirmedProjection = null;
            unsubscribe();
            unsubscribe = () => {};
            setProjection(null);
            setTopCardIds([]);
            setBottomCardIds([]);
            setStatusMessage('The server cleared this one-use pre-deal projection. It cannot be repeated.');
            return;
          }
          setProjection(next);
          setStatusMessage(null);
        },
      );
    }).catch((error: unknown) => {
      if (!active) return;
      setProjection(null);
      setTopCardIds([]);
      setBottomCardIds([]);
      const alreadyUsed = error instanceof Error && 'code' in error &&
        error.code === 'functions/failed-precondition' &&
        error.message === 'Gorgoneion mission support has already been used.';
      setStatusMessage(alreadyUsed
        ? 'Mission support has already been used. It cannot be repeated.'
        : 'Mission support is unavailable. Confirm the current docking and reconnect before trying again.');
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authorityReady, sessionId, uid, hostShipId, dockingRevision]);

  const visibleProjection = authorityReady && projection?.sessionId === sessionId &&
    projection.actorUid === uid && projection.hostShipId === hostShipId &&
    projection.dockingRevision === dockingRevision ? projection : null;

  const handlePartitionChange = useCallback((nextTop: readonly string[], nextBottom: readonly string[]) => {
    setTopCardIds(nextTop);
    setBottomCardIds(nextBottom);
  }, []);

  const handleSubmit = useCallback(async (nextTop: readonly string[], nextBottom: readonly string[]) => {
    if (!visibleProjection || submitting || !hasCurrentGorgoneionMissionSupportAuthority()) return;
    setSubmitting(true);
    setStatusMessage('Applying the one-use pre-deal deck support…');
    try {
      await applyGorgoneionMissionSupport({
        projection: visibleProjection,
        topCardIds: nextTop,
        bottomCardIds: nextBottom,
      });
      setProjection(null);
      setTopCardIds([]);
      setBottomCardIds([]);
      setStatusMessage('This one-use pre-deal support is committed and cannot be repeated.');
    } catch (error) {
      if (!hasCurrentGorgoneionMissionSupportAuthority() ||
          (typeof error === 'object' && error !== null && 'code' in error &&
            (error as { code?: unknown }).code === 'permission-denied')) {
        setProjection(null);
        setTopCardIds([]);
        setBottomCardIds([]);
        setStatusMessage('The server no longer authorizes this projection. The inspected cards were cleared.');
      } else {
        setStatusMessage('No confirmation was received. Retry the unchanged inspected partition to reuse its request receipt.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [visibleProjection, submitting]);

  return (
    <GorgoneionMissionSupportPanel
      projection={visibleProjection}
      topCardIds={visibleProjection ? topCardIds : []}
      bottomCardIds={visibleProjection ? bottomCardIds : []}
      onPartitionChange={handlePartitionChange}
      onSubmit={handleSubmit}
      submitting={submitting}
      statusMessage={!authorityReady
        ? 'Deck support unavailable // a fresh active Captain session and current docking are required.'
        : statusMessage}
    />
  );
}
