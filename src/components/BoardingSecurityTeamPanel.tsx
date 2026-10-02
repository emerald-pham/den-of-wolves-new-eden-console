import { SHIPS } from '@/data/ships';
import { SHUTTLECRAFT } from '@/data/shuttles';
import type { BoardingSecurityTeamLocationProjection } from '@/lib/boardingSecurityTeamService';
import './BoardingSecurityTeamWorkspace.css';

export type BoardingSecurityTeamLoadState = 'unavailable' | 'loading' | 'ready' | 'error';

interface BoardingSecurityTeamPanelProps {
  readonly eligible: boolean;
  readonly loadState: BoardingSecurityTeamLoadState;
  readonly projection: BoardingSecurityTeamLocationProjection | null;
  readonly error: string | null;
  readonly onRefresh: () => void;
}

function shipName(shipId: string): string {
  return SHIPS.find((ship) => ship.id === shipId)?.name ?? shipId;
}

function shuttleName(shuttleId: string): string {
  return SHUTTLECRAFT.find((shuttle) => shuttle.id === shuttleId)?.name ?? shuttleId;
}

export default function BoardingSecurityTeamPanel({
  eligible,
  loadState,
  projection,
  error,
  onRefresh,
}: BoardingSecurityTeamPanelProps) {
  return (
    <section className="boarding-security-workspace gm-console__module cic-frame" aria-label="Security team locations">
      <header className="boarding-security-workspace__header">
        <div>
          <p className="cic-overline">Facilitator location check</p>
          <h2 className="gm-console__section-title">Security team locations</h2>
          <p className="boarding-security-workspace__intro">
            Read the current ship and shuttle ledgers, with boarding eligibility grouped by each shuttle&apos;s dock.
          </p>
        </div>
        <button
          className="cic-action-button boarding-security-workspace__refresh"
          type="button"
          disabled={!eligible || loadState === 'loading'}
          onClick={onRefresh}
        >
          {loadState === 'loading' ? 'Refreshing locations…' : 'Refresh locations'}
        </button>
      </header>

      <p className="boarding-security-workspace__boundary" role="note">
        READ ONLY // Facilitator-only location projection. This view does not change ledgers or resolve a boarding action.
      </p>

      {!eligible && (
        <p className="boarding-security-workspace__message" role="status">
          Waiting for a live, server-backed active GM session before showing locations.
        </p>
      )}
      {loadState === 'loading' && (
        <p className="boarding-security-workspace__message" role="status">Loading current server location snapshot…</p>
      )}
      {loadState === 'error' && (
        <div className="boarding-security-workspace__error" role="alert">
          <p>Location snapshot unavailable // {error}</p>
          <p>Restore the live session, then refresh to read the current authority again.</p>
        </div>
      )}

      {projection && loadState === 'ready' && (
        <div className="boarding-security-workspace__body">
          <p className="boarding-security-workspace__cycle">
            Server snapshot // Cycle {projection.cycle} // session {projection.sessionId}
          </p>
          <dl className="boarding-security-workspace__totals" aria-label="Security-team location totals">
            <div>
              <dt>Stored on ships</dt>
              <dd>{projection.totals.shipStoredSecurityTeams}</dd>
            </div>
            <div>
              <dt>Aboard docked shuttles</dt>
              <dd>{projection.totals.aboardDockedShuttleSecurityTeams}</dd>
            </div>
            <div>
              <dt>Boarding eligible total</dt>
              <dd>{projection.totals.boardingEligibleTotal}</dd>
            </div>
            <div>
              <dt>Enabled shuttles</dt>
              <dd>{projection.totals.shuttleCount}</dd>
            </div>
          </dl>

          <section className="boarding-security-workspace__section" aria-label="Ship team locations">
            <h3>Ship ledgers and current eligibility</h3>
            <ul className="boarding-security-workspace__grid">
              {projection.ships.map((ship) => (
                <li className="boarding-security-workspace__card" key={ship.shipId}>
                  <h4>{shipName(ship.shipId)}</h4>
                  <p><span>Stored security teams</span><strong>{ship.shipSecurityTeams}</strong></p>
                  <p><span>Boarding eligible here</span><strong>{ship.boardingEligibleTeams}</strong></p>
                </li>
              ))}
            </ul>
          </section>

          <section className="boarding-security-workspace__section" aria-label="Shuttle team locations">
            <h3>Shuttle ledgers and current dock</h3>
            {projection.shuttles.length === 0
              ? <p className="boarding-security-workspace__empty">No shuttles are enabled in the current role roster.</p>
              : (
                <ul className="boarding-security-workspace__grid">
                  {projection.shuttles.map((shuttle) => (
                    <li className="boarding-security-workspace__card" key={shuttle.shuttleId}>
                      <h4>{shuttleName(shuttle.shuttleId)}</h4>
                      <p><span>Stored security teams</span><strong>{shuttle.securityTeams}</strong></p>
                      <p>
                        <span>Current location</span>
                        <strong>{shuttle.currentHostShipId
                          ? `Docked at ${shipName(shuttle.currentHostShipId)}`
                          : 'Undocked'}</strong>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>
      )}
    </section>
  );
}
