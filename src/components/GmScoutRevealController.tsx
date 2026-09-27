import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { listPendingScoutRequests, resolvePendingScoutRequest } from '@/lib/scoutResultService';
import { GmScoutRevealPanel, type PendingScoutRequestView } from './ScoutResultPanels';

/** Live GM adapter; the reveal panel remains usable with synthetic review fixtures. */
export default function GmScoutRevealController() {
  const sessionId = useSessionStore((state) => state.session?.id);
  const uid = useSessionStore((state) => state.me?.uid);
  const role = useSessionStore((state) => state.me?.role);
  const instanceId = useSessionStore((state) => state.gmInstance?.id);
  const [requests, setRequests] = useState<readonly PendingScoutRequestView[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [revealingRequestId, setRevealingRequestId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let disposed = false;
    if (!sessionId || !uid || role !== 'gm' || !instanceId) return;
    setRequests([]);
    void listPendingScoutRequests().then((pending) => {
      if (!disposed) setRequests(pending);
    }).catch(() => {
      if (!disposed) setFeedback('Scout queue unavailable. Reconnect and refresh.');
    });
    return () => { disposed = true; };
  }, [sessionId, uid, role, instanceId, refreshCount]);

  if (!sessionId || !uid || role !== 'gm' || !instanceId) return null;

  async function reveal(requestId: string): Promise<void> {
    if (revealingRequestId) return;
    setRevealingRequestId(requestId);
    setFeedback('');
    try {
      const result = await resolvePendingScoutRequest(requestId);
      setFeedback(`System ${result.targetCoordinate} // ${result.systemFact.title} revealed to its requester.`);
      setRequests(await listPendingScoutRequests());
    } catch {
      setFeedback('Reveal not confirmed. Refresh the queue and retry this request.');
    } finally {
      setRevealingRequestId(null);
    }
  }

  return <div>
    <GmScoutRevealPanel requests={requests} revealingRequestId={revealingRequestId}
      onReveal={(requestId) => void reveal(requestId)} feedback={feedback} />
    <button className="cic-action-button" type="button"
      onClick={() => setRefreshCount((count) => count + 1)}>Refresh scout queue</button>
  </div>;
}
