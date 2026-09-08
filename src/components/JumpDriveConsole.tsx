import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { jumpShip, type JumpShipReply } from '@/lib/sessionService';
import {
  adjustCoordinateDigit,
  coordinateDigits,
  formatJumpLockout,
} from '@/lib/jumpDrive';
import { useConsoleAccess } from '@/lib/consoleAccess';

interface Props {
  readonly shipId: string;
  readonly shipName: string;
  readonly currentCoordinate: string;
  readonly fuel: number;
  readonly jumpCosts: readonly number[];
  readonly charged: boolean;
  readonly damaged: boolean;
  readonly upgraded: boolean;
  readonly consoleLocked?: boolean | undefined;
  readonly turnZeroLocked?: boolean | undefined;
  readonly integrityLockedUntil?: string | undefined;
}

const DIGITS = [0, 1, 2, 3] as const;

function replyNotice(reply: JumpShipReply): string {
  if (reply.status === 'jumped') {
    return `JUMP COMPLETE // ${reply.origin} → ${reply.destination} // ${reply.length?.toUpperCase() ?? 'FTL'} // ${reply.fuelCost ?? 0} FUEL BURNED`;
  }
  if (reply.status === 'integrity-lockout') {
    return 'COORDINATE REJECTED // DRIVE INTEGRITY LOCKED FOR ONE HOUR';
  }
  if (reply.status === 'integrity-locked') {
    return 'JUMP DRIVE INTEGRITY LOCKED // WAIT FOR REESTABLISHMENT';
  }
  return 'JUMP ABORTED // DRIVE INTEGRITY FAILURE';
}

export default function JumpDriveConsole({
  shipId,
  shipName,
  currentCoordinate,
  fuel,
  jumpCosts,
  charged,
  damaged,
  upgraded,
  consoleLocked = false,
  turnZeroLocked = false,
  integrityLockedUntil,
}: Props) {
  const access = useConsoleAccess();
  const [destination, setDestination] = useState(() => coordinateDigits(currentCoordinate).join(''));
  const [locked, setLocked] = useState(false);
  const [power, setPower] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [localLockoutUntil, setLocalLockoutUntil] = useState<string | undefined>();
  const [clock, setClock] = useState(Date.now);

  const effectiveLockout = localLockoutUntil ?? integrityLockedUntil;
  const lockoutActive = Boolean(
    effectiveLockout && Date.parse(effectiveLockout) > clock,
  );
  const lockoutReadout = useMemo(
    () => effectiveLockout ? formatJumpLockout(effectiveLockout, clock) : '',
    [clock, effectiveLockout],
  );

  useEffect(() => {
    setDestination(coordinateDigits(currentCoordinate).join(''));
    setLocked(false);
    setPower(0);
    setNotice('');
  }, [currentCoordinate]);

  useEffect(() => {
    if (!lockoutActive || !effectiveLockout) return;
    const timer = window.setTimeout(() => setClock(Date.now()), 1_000);
    return () => window.clearTimeout(timer);
  }, [effectiveLockout, lockoutActive, clock]);

  const disabled = !access.writable || consoleLocked || turnZeroLocked || pending || lockoutActive;
  const powerDisabled = disabled || !locked || !charged;
  const [short = 0, medium = 0, long = 0] = jumpCosts;

  function adjustDigit(index: number, delta: -1 | 1): void {
    if (disabled || locked) return;
    setDestination((value) => adjustCoordinateDigit(value, index, delta));
    setNotice('');
  }

  async function submitJump(): Promise<void> {
    if (disabled || !locked || power < 100 || !charged) return;
    setPending(true);
    setNotice('JUMP DRIVE // COMMITTING DESTINATION LOCK');
    try {
      const reply = await jumpShip(shipId, destination);
      setNotice(replyNotice(reply));
      if (reply.status === 'integrity-lockout' || reply.status === 'integrity-locked') {
        setLocalLockoutUntil(reply.integrityLockedUntil);
        setPower(0);
      }
      if (reply.status === 'jumped') setPower(0);
    } catch {
      setNotice('JUMP REQUEST REJECTED // AUTHORITY OR DRIVE CONDITIONS CHANGED');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="jump-drive" aria-label={`${shipName} Jump Drive control`} data-power={power}>
      <header className="jump-drive__header">
        <div>
          <p className="jump-drive__eyebrow">FTL navigation // coordinate lock</p>
          <h4>Jump Drive control</h4>
        </div>
        <strong className="jump-drive__mode">{lockoutActive ? 'INTEGRITY LOCK' : pending ? 'JUMPING' : locked ? 'DESTINATION LOCKED' : 'STANDBY'}</strong>
      </header>

      <div className="jump-drive__coordinates">
        <div className="jump-drive__readout">
          <span className="jump-drive__label">Destination coordinates</span>
          <span
            className="jump-drive__value"
            aria-label="Locked destination coordinates"
          >{destination}</span>
        </div>
        <div className="jump-drive__digit-bank" aria-label="Coordinate digit controls">
          {DIGITS.map((index) => (
            <div className="jump-drive__digit" key={index}>
              <button
                type="button"
                aria-label={`Increase coordinate digit ${index + 1}`}
                disabled={disabled || locked}
                onClick={() => adjustDigit(index, 1)}
              >+</button>
              <span aria-label={`Coordinate digit ${index + 1} value`}>{destination[index]}</span>
              <button
                type="button"
                aria-label={`Decrease coordinate digit ${index + 1}`}
                disabled={disabled || locked}
                onClick={() => adjustDigit(index, -1)}
              >−</button>
            </div>
          ))}
        </div>
      </div>

      <button
        className="cic-action-button jump-drive__lock"
        type="button"
        disabled={disabled || (!locked && !destination.match(/^\d{4}$/))}
        onClick={() => {
          setLocked((value) => !value);
          setPower(0);
          setNotice('');
        }}
      >{locked ? 'Unlock destination coordinates' : 'Lock destination coordinates'}</button>

      <div className="jump-drive__power-module" data-active={String(locked && power > 0)}>
        <div className="jump-drive__speed-bank" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => (
            <span key={index} style={{ '--speed-index': index } as CSSProperties} />
          ))}
        </div>
        <label className="jump-drive__power-label" htmlFor={`${shipId}-jump-power`}>
          <span>Power the jump drive</span>
          <strong>{power}%</strong>
        </label>
        <input
          id={`${shipId}-jump-power`}
          className="jump-drive__power-rail"
          type="range"
          min="0"
          max="100"
          step="1"
          value={power}
          disabled={powerDisabled}
          aria-label="Jump drive power"
          onChange={(event) => setPower(Number(event.target.value))}
        />
        <div className="jump-drive__power-scale" aria-hidden="true"><span>CHARGE</span><span>IGNITION</span><span>JUMP</span></div>
      </div>

      <div className="jump-drive__telemetry" aria-label="Jump drive telemetry">
        <span>Drive charge // {charged ? 'READY' : 'NOT CHARGED'}</span>
        <span>Fuel // {fuel}</span>
        <span>Cost bands // S {short} // M {medium} // L {long}</span>
        <span>Condition // {damaged ? 'DAMAGED' : 'NOMINAL'}{upgraded ? ' // UPGRADED' : ''}</span>
      </div>

      {lockoutActive && (
        <p className="jump-drive__lockout" role="status" aria-label="Jump Drive integrity locked">
          JUMP DRIVE INTEGRITY LOCKED // {lockoutReadout}
        </p>
      )}
      {notice && !lockoutActive && <p className="jump-drive__notice" role="status">{notice}</p>}

      <button
        className="cic-action-button jump-drive__launch"
        type="button"
        disabled={disabled || !locked || power < 100 || !charged}
        onClick={() => void submitJump()}
      >{pending ? 'Jumping…' : `Jump to ${destination}`}</button>
    </section>
  );
}
