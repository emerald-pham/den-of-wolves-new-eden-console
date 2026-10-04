import { useEffect, useState } from 'react';
import { subscribeCrisisReport } from '@/lib/firestore';
import { useSessionStore } from '@/store/useSessionStore';
import type { CrisisReport } from '@/types/crisis';
import CivilUnrestGrievancePanel from './CivilUnrestGrievancePanel';

export function CrisisReportContent({ report }: { report: CrisisReport }) {
  const [expanded, setExpanded] = useState(true);
  if (report.state === 'closed') return null;
  return (
    <section className="crisis-report cic-frame" aria-label="Fleet crisis report">
      <h2>{report.title}</h2>
      <p className="crisis-report__status" role="status">Crisis report // {report.state}</p>
      <button type="button" className="cic-action-button" aria-expanded={expanded}
        aria-controls="fleet-crisis-report-body" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide report' : 'Read report'}
      </button>
      {expanded && <p id="fleet-crisis-report-body" className="crisis-report__body">{report.body}</p>}
      {report.approachingVesselResponse && <section aria-label="Committed Approaching Vessel response">
        <h3>Fleet response</h3>
        <p>{report.approachingVesselResponse.responseInstructions}</p>
        <h4>Response timing and posture</h4>
        <ul>{report.approachingVesselResponse.responseChoices.map((choice) => <li key={choice}>{choice.replaceAll('-', ' ')}</li>)}</ul>
        {report.approachingVesselResponse.coordinationActions.length > 0 && <>
          <h4>Coordination</h4>
          <ul>{report.approachingVesselResponse.coordinationActions.map((action) => <li key={action}>{action.replaceAll('-', ' ')}</li>)}</ul>
        </>}
        {report.approachingVesselResponse.quarantineInstructions && <p>
          Quarantine staffing and enforcement: {report.approachingVesselResponse.quarantineInstructions}
        </p>}
        {report.approachingVesselResponse.contingencyObjectives && <p>
          Contingency objectives: {report.approachingVesselResponse.contingencyObjectives}
        </p>}
      </section>}
      {report.crisisKind === 'civil-unrest' && (
        <CivilUnrestGrievancePanel crisisId={report.crisisId} crisisRevision={report.revision} crisisState={report.state} />
      )}
    </section>
  );
}

export default function CrisisReportPanel() {
  const sessionId = useSessionStore((state) => state.session?.id);
  const uid = useSessionStore((state) => state.me?.uid);
  const identity = JSON.stringify([sessionId, uid]);
  const [projection, setProjection] = useState<{ identity: string; report: CrisisReport | null } | null>(null);
  useEffect(() => {
    if (!sessionId || !uid) return;
    let current = true;
    const unsubscribe = subscribeCrisisReport(sessionId, (report) => {
      if (current) setProjection({ identity, report });
    });
    return () => { current = false; unsubscribe(); };
  }, [sessionId, uid, identity]);
  const report = projection?.identity === identity ? projection.report : null;
  return report ? <CrisisReportContent key={`${identity}:${report.crisisId}`} report={report} /> : null;
}
