import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { listPendingScoutRequests, resolvePendingScoutRequest, listGmScoutResolutionLog } from '@/lib/scoutResultService';
import { GmScoutRevealPanel, GmScoutResolutionLog, type GmScoutResolutionLogView, type PendingScoutRequestView } from './ScoutResultPanels';

/** Live GM adapter; the reveal panel remains usable with synthetic review fixtures. */
export default function GmScoutRevealController() {
  const sessionId = useSessionStore((state) => state.session?.id);
  const uid = useSessionStore((state) => state.me?.uid);
  const role = useSessionStore((state) => state.me?.role);
  const instanceId = useSessionStore((state) => state.gmInstance?.id);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [log, setLog] = useState<readonly GmScoutResolutionLogView[]>([]);
  const [requests, setRequests] = useState<readonly PendingScoutRequestView[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [revealingRequestId, setRevealingRequestId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setRequests([]);
    setLog([]);
    setFeedback('');
    if (!sessionId || !uid || role !== 'gm' || !instanceId ||
        connection !== 'live' || freshness !== 'server') return;
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
  }, [sessionId, uid, role, instanceId, connection, freshness, refreshCount]);

  if (!sessionId || !uid || role !== 'gm' || !instanceId) return null;
  if (connection !== 'live' || freshness !== 'server') {
    return <p role="status">Reconnect to receive the current scouting result log.</p>;
  }

  async function reveal(requestId: string): Promise<void> {
    if (revealingRequestId) return;
    setRevealingRequestId(requestId);
    setFeedback('');
    try {
      const result = await resolvePendingScoutRequest(requestId);
      setFeedback(`System ${result.targetCoordinate} // ${result.systemFact.title} revealed to its requester.`);
      const [pending, results] = await Promise.all([listPendingScoutRequests(), listGmScoutResolutionLog()]);
      setRequests(pending); setLog(results);
    } catch {
      setFeedback('Reveal not confirmed. Refresh the queue and retry this request.');
    } finally {
      setRevealingRequestId(null);
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
