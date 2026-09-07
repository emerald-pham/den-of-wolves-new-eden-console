import {
  MAX_PURSUIT,
  pursuitDistanceForCoordinate,
  pursuitScoreForPosition,
  pursuitStatusForScore,
} from '@/data/pursuit';

interface PursuitTrackerProps {
  readonly currentTurn: number;
  readonly shipId: string;
  readonly shipName: string;
  readonly shipCoordinate: string;
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
}: PursuitTrackerProps) {
  const coordinate = shipCoordinate || '0000';
  const pursuitDistance = pursuitDistanceForCoordinate(coordinate);
  const pursuitScore = pursuitScoreForPosition(currentTurn, coordinate);
  const status = pursuitStatusForScore(pursuitScore);
  const threatLevel = pursuitThreatLevelForScore(pursuitScore);
  const failureCountdown = MAX_PURSUIT - pursuitScore;
  const failureCountdownLabel = `${failureCountdown} track${failureCountdown === 1 ? '' : 's'}`;
  const turnLoad = Math.max(0, Math.floor(currentTurn)) * 2;
  const mapDepth = pursuitDistance === 0 ? 'Start system' : `-${pursuitDistance} pursuit distance`;
  const statusLabel = status === 'surrounded'
    ? 'SURROUNDED // GAME OVER'
    : status === 'critical'
      ? 'CRITICAL // WOLF FORCES CLOSING'
      : currentTurn < 1
        ? 'STANDBY // TURN 0'
        : `TRACKED // ${pursuitScore} OF ${MAX_PURSUIT}`;

  return (
    <section
      className="pursuit-tracker cic-frame"
      aria-label="Pursuit tracker"
      data-ship-id={shipId}
      data-status={status}
      data-threat-level={threatLevel}
    >
      <header className="pursuit-tracker__header">
        <p className="pursuit-tracker__eyebrow">PURSUIT // SHIP-LOCAL</p>
        <h2>Pursuit</h2>
      </header>

      <p className="pursuit-tracker__countdown" aria-live="polite">
        <span>Countdown to failure // </span>
        <strong>
          {failureCountdown} <small>{failureCountdown === 1 ? 'track' : 'tracks'}</small>
        </strong>
      </p>

      <div className="pursuit-tracker__readout">
        <p className="pursuit-tracker__metric">
          <span>Current track // </span>
          <strong>{pursuitScore} / {MAX_PURSUIT}</strong>
        </p>
        <p className="pursuit-tracker__metric">
          <span>Turn load // </span>
          <strong>+{turnLoad}</strong>
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
        aria-valuetext={`${pursuitScore} of ${MAX_PURSUIT}; ${failureCountdownLabel} to failure`}
        role="progressbar"
      >
        {TRACK_SEGMENTS.map((segment) => (
          <li key={segment} data-active={segment < pursuitScore} aria-hidden="true" />
        ))}
      </ol>

      <p className={`pursuit-tracker__status pursuit-tracker__status--${status}`}>
        {statusLabel}
      </p>
    </section>
  );
}
