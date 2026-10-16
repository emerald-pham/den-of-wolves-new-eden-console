import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { listPendingScoutRequests, resolvePendingScoutRequest, listGmScoutResolutionLog } from '@/lib/scoutResultService';
import { GmScoutRevealPanel, GmScoutResolutionLog, type GmScoutResolutionLogView, type PendingScoutRequestView } from './ScoutResultPanels';

/** Live GM adapter; the reveal panel remains usable with synthetic review fixtures. */
export default function GmScoutRevealController() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const instance = useSessionStore((state) => state.gmInstance);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  if (!session || !me?.uid || me.role !== 'gm' || !instance?.id) return null;
  if (me.sessionId !== session.id || instance.sessionId !== session.id || instance.uid !== me.uid ||
      connection !== 'live' || freshness !== 'server') {
    return <p role="status">Reconnect to receive the current scouting result log.</p>;
  }
  if (session.phase !== 'active') {
    const awaitingStart = session.phase === 'lobby' || session.phase === 'casting' || session.phase === 'briefing';
    return <p role="status">{awaitingStart
      ? 'Awaiting GM start // scouting results open during active gameplay.'
      : 'Game ended // live scout recovery is unavailable.'}</p>;
  }
  const audience = JSON.stringify([session.id, me.sessionId, me.uid, instance.id, instance.sessionId, instance.uid, instance.claimedAt]);
  return <GmScoutRevealWorkspace key={audience} />;
}

function GmScoutRevealWorkspace() {
  const [log, setLog] = useState<readonly GmScoutResolutionLogView[]>([]);
  const [requests, setRequests] = useState<readonly PendingScoutRequestView[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [revealingRequestId, setRevealingRequestId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setRequests([]);
    setLog([]);
    setFeedback('');
    const load = async () => {
      try {
        const [pending, results] = await Promise.all([listPendingScoutRequests(), listGmScoutResolutionLog()]);
        if (!disposed) { setRequests(pending); setLog(results); }
      } catch {
        if (!disposed) {
          setRequests([]); setLog([]);
          setFeedback('Scout queue unavailable. Reconnect and refresh.');
        }
      } finally {
        if (!disposed) timer = setTimeout(() => void load(), 5_000);
      }
    };
    void load();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [refreshCount]);

  async function reveal(requestId: string): Promise<void> {
    if (revealingRequestId) return;
    setRevealingRequestId(requestId);
    setFeedback('');
    try {
      const result = await resolvePendingScoutRequest(requestId);
      if (!mounted.current) return;
      setFeedback(`System ${result.targetCoordinate} // ${result.systemFact.title} revealed to its requester.`);
      const [pending, results] = await Promise.all([listPendingScoutRequests(), listGmScoutResolutionLog()]);
      if (mounted.current) { setRequests(pending); setLog(results); }
    } catch {
      if (mounted.current) setFeedback('Reveal not confirmed. Refresh the queue and retry this request.');
    } finally {
      if (mounted.current) setRevealingRequestId(null);
    }
  }

  return <div>
    <GmScoutRevealPanel requests={requests} revealingRequestId={revealingRequestId}
      onReveal={(requestId) => void reveal(requestId)} feedback={feedback} />
    <GmScoutResolutionLog entries={log} />
    <button className="cic-action-button" type="button"
      onClick={() => setRefreshCount((count) => count + 1)}>Refresh scout queue</button>
  </div>;
}
