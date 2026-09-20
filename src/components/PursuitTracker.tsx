import {
  MAX_PURSUIT,
  authoritativePursuitValue,
  pursuitDistanceForCoordinate,
  pursuitStatusForScore,
} from '@/data/pursuit';
import LiveChangeRegion from './LiveChangeRegion';

interface PursuitTrackerProps {
  readonly currentTurn: number;
  readonly shipId: string;
  readonly shipName: string;
  readonly shipCoordinate: string;
  readonly pursuitDistance?: number;
  readonly pursuitValue?: number;
  readonly redAlertActive?: boolean;
}

const TRACK_SEGMENTS = Array.from({ length: MAX_PURSUIT }, (_, index) => index);

type PursuitThreatLevel = 'tracked' | 'closing' | 'critical' | 'terminal';

function pursuitThreatLevelForScore(score: number): PursuitThreatLevel {
  if (score >= MAX_PURSUIT) return 'terminal';
  if (score >= 8) return 'critical';
  if (score >= 7) return 'closing';
  return 'tracked';
}

export default function PursuitTracker({
  currentTurn,
  shipId,
  shipName,
  shipCoordinate,
  pursuitDistance = 0,
  pursuitValue,
  redAlertActive = false,
}: PursuitTrackerProps) {
  const coordinate = shipCoordinate || '0000';
  const entitledDistance = pursuitDistanceForCoordinate(coordinate, pursuitDistance);
  const authoritativeValue = authoritativePursuitValue(pursuitValue);
  const hasAuthoritativeValue = authoritativeValue !== undefined;
  const pursuitScore = authoritativeValue ?? 0;
  const status = pursuitStatusForScore(pursuitScore);
  const threatLevel = hasAuthoritativeValue ? pursuitThreatLevelForScore(pursuitScore) : 'tracked';
  const failureCountdown = MAX_PURSUIT - pursuitScore;
  const failureCountdownLabel = `${failureCountdown} cycle${failureCountdown === 1 ? '' : 's'}`;
  const mapDepth = entitledDistance === 0 ? 'Start system' : `-${entitledDistance} pursuit distance`;
  const statusLabel = !hasAuthoritativeValue
    ? currentTurn < 1 ? 'STANDBY // CYCLE 0' : 'AWAITING SERVER PURSUIT'
    : status === 'surrounded'
    ? 'SURROUNDED // GAME OVER'
    : status === 'critical'
      ? 'CRITICAL // WOLF FORCES CLOSING'
      : currentTurn < 1
        ? 'STANDBY // CYCLE 0'
        : `TRACKED // ${pursuitScore} OF ${MAX_PURSUIT}`;

  return (
    <section
      className="pursuit-tracker cic-frame"
      aria-label="Pursuit tracker"
      data-ship-id={shipId}
      data-status={status}
      data-threat-level={threatLevel}
      data-red-alert={redAlertActive}
    >
      <header className="pursuit-tracker__header">
        <p className="pursuit-tracker__eyebrow">
          PURSUIT // GROUP-LOCAL{redAlertActive ? ' // RED ALERT ACTIVE' : ''}
        </p>
        <h2>Pursuit</h2>
      </header>

      <p className="pursuit-tracker__countdown" aria-live="polite">
        <span>WOLF PURSUIT TRACK // </span>
        <strong data-pending={!hasAuthoritativeValue}>
          {hasAuthoritativeValue
            ? <>{failureCountdown} <small>{failureCountdown === 1 ? 'cycle' : 'cycles'}</small></>
            : 'Awaiting server telemetry'}
        </strong>
      </p>

      <div className="pursuit-tracker__readout">
        <p className="pursuit-tracker__metric">
          <span>Current track // </span>
          <strong>{hasAuthoritativeValue ? pursuitScore : '—'} / {MAX_PURSUIT}</strong>
        </p>
        <p className="pursuit-tracker__metric pursuit-tracker__metric--map">
          <span>Distance from Home Systems // </span>
          <strong>{mapDepth}</strong>
        </p>
      </div>

      <ol
        className="pursuit-tracker__scale"
        aria-label={`${shipName} pursuit countdown`}
        aria-valuemin={0}
        aria-valuemax={MAX_PURSUIT}
        aria-valuenow={pursuitScore}
        aria-valuetext={hasAuthoritativeValue
          ? `${pursuitScore} of ${MAX_PURSUIT}; ${failureCountdownLabel} to failure`
          : 'Awaiting authoritative pursuit value'}
        role="progressbar"
      >
        {TRACK_SEGMENTS.map((segment) => (
          <li key={segment} data-active={segment < pursuitScore} aria-hidden="true" />
        ))}
      </ol>

      <LiveChangeRegion
        as="p"
        className={`pursuit-tracker__status pursuit-tracker__status--${status}`}
        changeKey={`${shipId}:${statusLabel}:${coordinate}:${entitledDistance}:${hasAuthoritativeValue ? pursuitScore : 'pending'}:${threatLevel}`}
        message={statusLabel}
        role={null}
      />
    </section>
  );
}
