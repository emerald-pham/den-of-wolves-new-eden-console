import type { ScoutEntitlementId } from '@/lib/scoutRequestAuthority';
import './ScoutResultPanels.css';

export interface ScoutReportView {
  readonly requestId: string;
  readonly cycle: number;
  readonly entitlementId: ScoutEntitlementId;
  readonly targetCoordinate: string;
  readonly status: 'pending' | 'resolved';
  readonly noteId: string | null;
}

export interface PrivateScoutResultView {
  readonly type: 'private-scout-result';
  readonly sessionId: string;
  readonly requestId: string;
  readonly requesterUid: string;
  readonly sourceId: ScoutEntitlementId;
  readonly cycle: number;
  readonly targetCoordinate: string;
  readonly systemFact: Readonly<{ coordinate: string; code: string; title: string }>;
}

export interface ScoutDiscoveryNoteView {
  readonly type: 'player-discovery-note';
  readonly id: string;
  readonly cycle: number;
  readonly targetCoordinate: string;
  readonly systemFact: PrivateScoutResultView['systemFact'];
  readonly recordedAt: string;
}

export interface PendingScoutRequestView {
  readonly requestId: string;
  readonly cycle: number;
  readonly entitlementId: ScoutEntitlementId;
  readonly anchorShipId: string;
  readonly targetCoordinate: string;
}

const LABELS: Readonly<Record<ScoutEntitlementId, string>> = {
  starlight: 'Starlight', hummingbird: 'Hummingbird',
  endeavour: 'Endeavour', 'comms-officer': 'Comms Officer',
};

/** A pure report view for both the live Scientist station and the solo UI review scene. */
export function ScoutResultPanel({ report, result = null, note = null, loading = false }: {
  readonly report: ScoutReportView;
  readonly result?: PrivateScoutResultView | null;
  readonly note?: ScoutDiscoveryNoteView | null;
  readonly loading?: boolean;
}) {
  const matchingResult = report.status === 'resolved' &&
    result?.requestId === report.requestId && result.sourceId === report.entitlementId &&
    result.cycle === report.cycle && result.targetCoordinate === report.targetCoordinate &&
    result.systemFact.coordinate === report.targetCoordinate ? result : null;
  const matchingNote = matchingResult && note?.id === report.noteId &&
    note.cycle === report.cycle && note.targetCoordinate === report.targetCoordinate &&
    note.systemFact.code === matchingResult.systemFact.code &&
    note.systemFact.title === matchingResult.systemFact.title ? note : null;
  const label = LABELS[report.entitlementId];

  return (
    <section className="scout-result-panel cic-frame" aria-label={`${label} scout report`}>
      <div className="scout-result-panel__heading">
        <h3>{label} scout report</h3>
        <span>Cycle {report.cycle}</span>
      </div>
      <p>System {report.targetCoordinate}</p>
      {report.status === 'pending' && <p role="status">Awaiting facilitator reveal.</p>}
      {report.status === 'resolved' && loading && <p role="status">Loading private scout result…</p>}
      {report.status === 'resolved' && !loading && !matchingResult &&
        <p role="status">Report unavailable. Refresh your session to retry.</p>}
      {matchingResult && <div className="scout-result-panel__fact">
        <p className="scout-result-panel__code">Site {matchingResult.systemFact.code}</p>
        <p className="scout-result-panel__title">{matchingResult.systemFact.title}</p>
        {matchingNote
          ? <p className="scout-result-panel__note">Discovery note saved for this station.</p>
          : <p className="scout-result-panel__note">Checking the saved discovery note…</p>}
        {matchingResult.systemFact.code === 'O' && <p className="scout-result-panel__hint">
          Deep Nebula scouting recorded. The facilitator keeps the jump benefit private.
        </p>}
      </div>}
    </section>
  );
}

/** A pure GM queue view; it never receives the selected chart or site catalog. */
export function GmScoutRevealPanel({ requests, revealingRequestId = null, onReveal, feedback = '' }: {
  readonly requests: readonly PendingScoutRequestView[];
  readonly revealingRequestId?: string | null;
  readonly onReveal: (requestId: string) => void;
  readonly feedback?: string;
}) {
  return (
    <section className="gm-console__module scout-reveal-panel cic-frame" aria-label="GM scout reveals">
      <h2>Scout requests</h2>
      <p>Reveal one requested system from the locked organiser chart.</p>
      {requests.length === 0 && <p role="status">No scout requests are awaiting a reveal.</p>}
      {requests.length > 0 && <ul className="scout-reveal-panel__list">
        {requests.map((request) => <li key={request.requestId}>
          <div>
            <strong>{LABELS[request.entitlementId]} // {request.targetCoordinate}</strong>
            <span>Cycle {request.cycle} · {request.anchorShipId}</span>
          </div>
          <button className="cic-action-button" type="button"
            disabled={revealingRequestId !== null}
            onClick={() => onReveal(request.requestId)}
            aria-label={`Reveal ${LABELS[request.entitlementId]} scout at ${request.targetCoordinate}`}>
            {revealingRequestId === request.requestId ? 'Revealing…' : 'Reveal report'}
          </button>
        </li>)}
      </ul>}
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
