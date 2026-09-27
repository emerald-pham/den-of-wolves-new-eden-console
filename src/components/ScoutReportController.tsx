import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import {
  listMyScoutReports, readMyScoutDiscoveryNote, readPrivateScoutResult,
} from '@/lib/scoutResultService';
import { ScoutResultPanel, type PrivateScoutResultView,
  type ScoutDiscoveryNoteView, type ScoutReportView } from './ScoutResultPanels';

/** Live Endeavour adapter; the report panel itself also accepts prepared review fixtures. */
export default function ScoutReportController({ refreshKey }: { readonly refreshKey: string }) {
  const sessionId = useSessionStore((state) => state.session?.id);
  const uid = useSessionStore((state) => state.me?.uid);
  const role = useSessionStore((state) => state.me?.role);
  const [refreshCount, setRefreshCount] = useState(0);
  const [reports, setReports] = useState<readonly ScoutReportView[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [report, setReport] = useState<ScoutReportView | null>(null);
  const [result, setResult] = useState<PrivateScoutResultView | null>(null);
  const [note, setNote] = useState<ScoutDiscoveryNoteView | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let disposed = false;
    if (!sessionId || !uid || role !== 'player') return;
    setLoading(true);
    setResult(null);
    setNote(null);
    setStatus('');
    void (async () => {
      try {
        const reports = await listMyScoutReports();
        if (disposed) return;
        const ownReports = reports.filter((item) => item.entitlementId === 'endeavour');
        setReports(ownReports);
        const latest = ownReports.find((item) => item.requestId === selectedRequestId) ??
          ownReports[0] ?? null;
        setReport(latest);
        if (!latest || latest.status === 'pending') return;
        const privateResult = await readPrivateScoutResult(latest.requestId);
        if (disposed) return;
        setResult(privateResult);
        if (latest.noteId) {
          try {
            const savedNote = await readMyScoutDiscoveryNote(latest.noteId);
            if (!disposed) setNote(savedNote);
          } catch {
            if (!disposed) setStatus('The saved note is unavailable for this ship or fleet group.');
          }
        }
      } catch {
        if (!disposed) setStatus('Scout reports could not load. Reconnect and refresh this station.');
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [sessionId, uid, role, refreshKey, refreshCount, selectedRequestId]);

  if (!sessionId || !uid || role !== 'player') return null;
  return <section className="scout-report-controller" aria-label="Endeavour scouting reports">
    <div className="scout-result-panel__heading">
      <h3>Private scouting reports</h3>
      <button className="cic-action-button" type="button" disabled={loading}
        onClick={() => setRefreshCount((count) => count + 1)}>Refresh reports</button>
    </div>
    {reports.length > 1 && <label className="scout-report-controller__select">
      Saved scout request
      <select value={report?.requestId ?? ''} onChange={(event) => {
        const next = reports.find((item) => item.requestId === event.target.value) ?? null;
        setSelectedRequestId(next?.requestId ?? null);
        setReport(next);
        setResult(null);
        setNote(null);
      }}>
        {reports.map((item) => <option key={item.requestId} value={item.requestId}>
          Cycle {item.cycle} · System {item.targetCoordinate} · {item.status}
        </option>)}
      </select>
    </label>}
    {loading && !report && <p role="status">Loading scouting reports…</p>}
    {!loading && !report && !status && <p>No Endeavour scouting requests recorded yet.</p>}
    {report && <ScoutResultPanel report={report} result={result} note={note} loading={loading} />}
    {status && <p role="status">{status}</p>}
  </section>;
}
