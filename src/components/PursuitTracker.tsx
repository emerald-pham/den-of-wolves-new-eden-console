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
    >
      <header className="pursuit-tracker__header">
        <p className="pursuit-tracker__eyebrow">PURSUIT // SHIP-LOCAL</p>
        <h2>Pursuit</h2>
      </header>

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
        aria-label={`${shipName} pursuit scale`}
        aria-valuemin={0}
        aria-valuemax={MAX_PURSUIT}
        aria-valuenow={pursuitScore}
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
