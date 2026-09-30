import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  createJumpShipAttempt,
  isJumpShipOutcomeUncertain,
  jumpShip,
  type JumpShipAttempt,
  type JumpShipReply,
} from '@/lib/sessionService';
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
  readonly integrityLockedUntil?: string | undefined;
  readonly emergencyJumpUsed?: boolean | undefined;
  readonly lastFailureRequestId?: string | undefined;
  readonly pursuitValue?: number | undefined;
  readonly pursuitEmergencyWindowStatus?: 'awaiting-gm-decision' | 'offered' | undefined;
  readonly presentationOnly?: boolean | undefined;
}

const DIGITS = [0, 1, 2, 3] as const;

function replyNotice(reply: JumpShipReply, blind: boolean): string {
  if (reply.status === 'jumped') {
    return `${blind ? 'BLIND JUMP COMPLETE' : 'JUMP COMPLETE'} // ${reply.origin} → ${reply.destination} // ${reply.length?.toUpperCase() ?? 'FTL'} // ${reply.fuelCost ?? 0} FUEL BURNED${reply.ramScoopOreGain ? ` // RAM SCOOP +${reply.ramScoopOreGain} ORE` : ''}`;
  }
  if (reply.status === 'integrity-lockout') {
    return 'COORDINATE REJECTED // DRIVE INTEGRITY LOCKED FOR ONE HOUR';
  }
  if (reply.status === 'integrity-locked') {
    return 'JUMP DRIVE INTEGRITY LOCKED // WAIT FOR REESTABLISHMENT';
  }
  if (reply.status === 'fuel-shortage') {
    return `JUMP FAILED // STATIONARY // ${reply.availableFuel ?? 0} FUEL AVAILABLE; ${reply.requiredFuel ?? 0} REQUIRED`;
  }
  if (reply.status === 'not-charged') {
    return 'JUMP DENIED // CHARGE THE JUMP DRIVE DURING THIS CYCLE';
  }
  if (reply.status === 'drive-failure') {
    return 'JUMP FAILED // SHIP REMAINS IN PLACE // FACILITATOR ADJUDICATION AVAILABLE';
  }
  if (reply.status === 'stale') {
    return 'JUMP NOT COMMITTED // LIVE SHIP STATE CHANGED; RECONNECT BEFORE A NEW ATTEMPT';
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
  integrityLockedUntil,
  emergencyJumpUsed = false,
  lastFailureRequestId,
  pursuitValue,
  pursuitEmergencyWindowStatus,
  presentationOnly = false,
}: Props) {
  const access = useConsoleAccess();
  const [destination, setDestination] = useState(() => coordinateDigits(currentCoordinate).join(''));
  const [blindMode, setBlindMode] = useState(false);
  const [scrambledDigits, setScrambledDigits] = useState('0000');
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [locked, setLocked] = useState(false);
  const [power, setPower] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [localLockoutUntil, setLocalLockoutUntil] = useState<string | undefined>();
  const [attempt, setAttempt] = useState<JumpShipAttempt | null>(null);
  const attemptRef = useRef<JumpShipAttempt | null>(null);
  const [clock, setClock] = useState(Date.now);

  function updateAttempt(value: JumpShipAttempt | null): void {
    attemptRef.current = value;
    setAttempt(value);
  }

  const effectiveLockout = integrityLockedUntil ?? localLockoutUntil;
  const lockoutActive = Boolean(
    effectiveLockout && Date.parse(effectiveLockout) > clock,
  );
  const lockoutReadout = useMemo(
    () => effectiveLockout ? formatJumpLockout(effectiveLockout, clock) : '',
    [clock, effectiveLockout],
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (attemptRef.current?.shipId === shipId) return;
    attemptRef.current = null;
    setDestination(coordinateDigits(currentCoordinate).join(''));
    setBlindMode(false);
    setLocked(false);
    setPower(0);
    setAttempt(null);
  }, [currentCoordinate, shipId]);

  useEffect(() => {
    setLocalLockoutUntil(undefined);
  }, [integrityLockedUntil]);

  useEffect(() => {
    if (!lockoutActive || !effectiveLockout) return;
    const timer = window.setTimeout(() => setClock(Date.now()), 1_000);
    return () => window.clearTimeout(timer);
  }, [effectiveLockout, lockoutActive, clock]);

  const scrambleActive = pending && blindMode && attempt?.blind === true && !reducedMotion;
  useEffect(() => {
    if (!scrambleActive) return;
    let cancelled = false;
    const timers: number[] = [];
    const scheduleBeat = () => {
      for (const index of DIGITS) {
        // These random delays and numerals are display-only; the callable owns
        // the destination draw and receives no value from this animation.
        const staggerMs = index * 75 + Math.floor(Math.random() * 50);
        timers.push(window.setTimeout(() => {
          if (cancelled) return;
          const digit = Math.floor(Math.random() * 10).toString();
          setScrambledDigits((current) => `${current.slice(0, index)}${digit}${current.slice(index + 1)}`);
        }, staggerMs));
      }
      timers.push(window.setTimeout(scheduleBeat, 500));
    };
    scheduleBeat();
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [attempt?.blind, attempt?.requestId, blindMode, pending, reducedMotion, scrambleActive]);

  const blocked = !presentationOnly && (!access.writable || consoleLocked);
  const exactEmergencyRetry = attempt?.emergency === true;
  const emergencyAvailable = !blindMode && (exactEmergencyRetry || (!emergencyJumpUsed &&
    ((pursuitValue !== undefined && pursuitValue >= 10 && pursuitEmergencyWindowStatus === 'offered') ||
      Boolean(lastFailureRequestId))));
  const disabled = blocked || pending || (lockoutActive && !attempt);
  const editingDisabled = presentationOnly ? pending : blocked || pending || attempt !== null ||
    (lockoutActive && !emergencyAvailable);
  const powerDisabled = presentationOnly || disabled || attempt !== null || !locked || !charged;
  const [printedShort = 0, printedMedium = 0, printedLong = 0] = jumpCosts;
  const upgradeReduction = upgraded ? 1 : 0;
  const short = Math.max(0, printedShort - upgradeReduction);
  const medium = Math.max(0, printedMedium - upgradeReduction);
  const long = Math.max(0, printedLong - upgradeReduction);

  function adjustDigit(index: number, delta: -1 | 1): void {
    if (editingDisabled || locked) return;
    setDestination((value) => adjustCoordinateDigit(value, index, delta));
    setNotice('');
  }

  async function submitJump(emergency = false): Promise<void> {
    if (presentationOnly || blocked || pending || !locked ||
        (emergency ? !emergencyAvailable || blindMode : disabled || (!attempt && (power < 100 || !charged)))) return;
    let request = attempt;
    if (!request) {
      try {
        request = createJumpShipAttempt(shipId, blindMode && !emergency ? undefined : destination, emergency
          ? { emergency: true, ...(lastFailureRequestId ? { failureRequestId: lastFailureRequestId } : {}) }
          : blindMode ? { blind: true } : {});
        updateAttempt(request);
      } catch {
        setNotice('JUMP REQUEST REJECTED // RECONNECT TO THE LIVE SHIP STATE');
        return;
      }
    }
    setPending(true);
    setNotice('JUMP DRIVE // COMMITTING DESTINATION LOCK');
    try {
      const reply = await jumpShip(request);
      updateAttempt(null);
      setNotice(replyNotice(reply, request.blind === true));
      if (request.blind === true) {
        setPower(0);
        if (typeof reply.destination === 'string') {
          setDestination(reply.destination);
          setBlindMode(false);
          setLocked(true);
        } else {
          setLocked(false);
        }
      }
      if (reply.status === 'integrity-lockout' || reply.status === 'integrity-locked') {
        setLocalLockoutUntil(reply.integrityLockedUntil);
        setPower(0);
      }
      if (reply.status === 'jumped') setPower(0);
    } catch (cause) {
      if (isJumpShipOutcomeUncertain(cause)) {
        setNotice('JUMP STATUS UNCONFIRMED // RETRY TO CHECK THE SAME REQUEST');
      } else {
        updateAttempt(null);
        if (request.blind === true) {
          setPower(0);
          setLocked(false);
        }
        setNotice('JUMP REQUEST REJECTED // AUTHORITY OR DRIVE CONDITIONS CHANGED');
      }
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
        <strong className="jump-drive__mode">{pending ? blindMode ? 'BLIND JUMP' : 'JUMPING' : lockoutActive && !emergencyAvailable ? 'INTEGRITY LOCK' : locked ? blindMode ? 'BLIND LOCKED' : 'DESTINATION LOCKED' : blindMode ? 'BLIND MODE' : 'STANDBY'}</strong>
      </header>

      {presentationOnly && (
        <p className="jump-drive__notice" role="status">
          PRESENTATION PREVIEW // LOCAL CONTROLS ONLY // JUMP COMMANDS ARE DISABLED
        </p>
      )}

      {pursuitEmergencyWindowStatus === 'awaiting-gm-decision' && !exactEmergencyRetry && (
        <p className="jump-drive__notice" role="status" aria-label="Pursuit emergency decision">
          Pursuit emergency // waiting for the facilitator to offer an emergency jump.
        </p>
      )}

      <div className="jump-drive__coordinates">
        <div className="jump-drive__readout">
          <span className="jump-drive__label">{blindMode ? 'Blind-jump display' : 'Destination coordinates'}</span>
          <span
            className="jump-drive__value"
            aria-label={blindMode
              ? pending ? 'Blind destination pending server selection' : 'Blind destination hidden until server resolution'
              : 'Locked destination coordinates'}
          >{blindMode ? (
            <>
              <span className="jump-drive__sr-only">BLIND // DESTINATION HIDDEN</span>
              {scrambleActive
                ? <span className="jump-drive__blind-digits" data-blind-digit-readout aria-hidden="true">{scrambledDigits}</span>
                : <span className="jump-drive__blind-digits" aria-hidden="true">BLIND</span>}
            </>
          ) : destination}</span>
        </div>
        {!blindMode && <div className="jump-drive__digit-bank" aria-label="Coordinate digit controls">
          {DIGITS.map((index) => (
            <div className="jump-drive__digit" key={index}>
              <button
                type="button"
                aria-label={`Increase coordinate digit ${index + 1}`}
                disabled={editingDisabled || locked}
                onClick={() => adjustDigit(index, 1)}
              >+</button>
              <span aria-label={`Coordinate digit ${index + 1} value`}>{destination[index]}</span>
              <button
                type="button"
                aria-label={`Decrease coordinate digit ${index + 1}`}
                disabled={editingDisabled || locked}
                onClick={() => adjustDigit(index, -1)}
              >−</button>
            </div>
          ))}
        </div>}
      </div>

      <button
        className="cic-action-button jump-drive__blind-toggle"
        type="button"
        aria-pressed={blindMode}
        disabled={editingDisabled || attempt !== null}
        onClick={() => {
          const enable = !blindMode;
          setBlindMode(enable);
          setLocked(false);
          setPower(0);
          setNotice('');
          if (!enable) setDestination(coordinateDigits(currentCoordinate).join(''));
        }}
      >{blindMode ? 'Disable blind jump' : 'Enable blind jump'}</button>

      {blindMode && <p className="jump-drive__blind-help">
        The server selects one connected system. Its coordinates stay hidden until the result is confirmed.
      </p>}

      <button
        className="cic-action-button jump-drive__lock"
        type="button"
        disabled={editingDisabled || attempt !== null || (!blindMode && !locked && !destination.match(/^\d{4}$/))}
        onClick={() => {
          setLocked((value) => !value);
          setPower(0);
          setNotice('');
        }}
      >{locked ? blindMode ? 'Disarm blind jump' : 'Unlock destination coordinates' : blindMode ? 'Arm blind jump' : 'Lock destination coordinates'}</button>

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

      {lockoutActive && !emergencyAvailable && (
        <p className="jump-drive__lockout" role="status" aria-label="Jump Drive integrity locked">
          JUMP DRIVE INTEGRITY LOCKED // {lockoutReadout}
        </p>
      )}
      {notice && (!lockoutActive || emergencyAvailable) && <p className="jump-drive__notice" role="status">{notice}</p>}

      <button
        className="cic-action-button jump-drive__launch"
        type="button"
        disabled={presentationOnly || disabled || !locked || attempt?.emergency === true ||
          (!attempt && (power < 100 || !charged))}
        onClick={() => void submitJump()}
      >{pending ? blindMode ? 'Blind jumping…' : 'Jumping…' : attempt?.emergency ? 'Emergency jump pending' : attempt ? attempt.blind ? 'Retry blind-jump confirmation' : 'Retry jump confirmation' : blindMode ? 'Blind jump' : `Jump to ${destination}`}</button>
      {emergencyAvailable && !blindMode && <button
        className="cic-action-button jump-drive__launch jump-drive__emergency"
        type="button"
        disabled={presentationOnly || blocked || pending || !locked || (attempt !== null && !attempt.emergency)}
        onClick={() => void submitJump(true)}
      >{attempt?.emergency ? 'Retry emergency jump confirmation' : `Emergency jump to ${destination}`}</button>}
    </section>
  );
}
