import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import {
  getBoardingSecurityTeamLocations,
  type BoardingSecurityTeamLocationProjection,
} from '@/lib/boardingSecurityTeamService';
import BoardingSecurityTeamPanel, { type BoardingSecurityTeamLoadState } from './BoardingSecurityTeamPanel';

export default function BoardingSecurityTeamWorkspace() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const connection = useSessionStore((state) => state.connection);
  const snapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [online, setOnline] = useState(() =>
    typeof window !== 'undefined' && window.navigator.onLine,
  );
  const [projection, setProjection] = useState<BoardingSecurityTeamLocationProjection | null>(null);
  const [loadState, setLoadState] = useState<BoardingSecurityTeamLoadState>('unavailable');
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const updateOnline = () => setOnline(window.navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const contextKey = JSON.stringify([
    session?.id,
    session?.phase,
    session?.currentTurn,
    session?.activeRoleIds,
    session?.activeVesselIds,
    session?.setup,
    session?.shipDamage,
    session?.shipResources,
    session?.shuttleCargo,
    session?.shuttleDockings,
    session?.shuttleControl,
    session?.retainedShuttles,
    session?.shuttleVisitLog,
    me?.uid,
    me?.sessionId,
    me?.role,
    gmInstance?.id,
    gmInstance?.uid,
    gmInstance?.sessionId,
    connection,
    snapshotFreshness,
    online,
  ]);
  const eligible = !!session && session.phase === 'active' && !!me && me.role === 'gm' &&
    me.sessionId === session.id && !!gmInstance && gmInstance.sessionId === session.id &&
    gmInstance.uid === me.uid && connection === 'live' && snapshotFreshness === 'server' && online;

  const refresh = useCallback(async () => {
    if (!eligible) {
      setProjection(null);
      setLoadState('unavailable');
      setError(null);
      return;
    }
    const requestId = ++requestSequence.current;
    setProjection(null);
    setError(null);
    setLoadState('loading');
    try {
      const next = await getBoardingSecurityTeamLocations();
      if (requestSequence.current !== requestId) return;
      setProjection(next);
      setLoadState('ready');
    } catch (cause) {
      if (requestSequence.current !== requestId) return;
      setProjection(null);
      setError(cause instanceof Error
        ? cause.message
        : 'The current server location snapshot could not be loaded.');
      setLoadState('error');
    }
  }, [eligible]);

  useEffect(() => {
    if (!eligible) {
      requestSequence.current += 1;
      setProjection(null);
      setError(null);
      setLoadState('unavailable');
      return;
    }
    void refresh();
    return () => { requestSequence.current += 1; };
  }, [eligible, contextKey, refresh]);

  return (
    <BoardingSecurityTeamPanel
      eligible={eligible}
      loadState={loadState}
      projection={projection}
      error={error}
      onRefresh={() => { void refresh(); }}
    />
  );
}
