import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  claimGmInstance,
  claimSeat,
  releaseSeat,
  setGmControlsLocked,
  type CommandDisposition,
} from '@/lib/sessionService';
import {
  selectGmAccessAuthenticated,
  selectIsGm,
  useSessionStore,
  type ConsoleMode,
} from '@/store/useSessionStore';
import { consoleRoleRoute } from '@/lib/consoleRole';

const MODES: readonly {
  mode: ConsoleMode;
  label: string;
  description: string;
}[] = [
  {
    mode: 'console',
    label: 'Select a role',
    description: 'Choose an independent or shipboard station.',
  },
];

export default function RoleSelect() {
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const seats = useSessionStore((state) => state.seats);
  const gmAccessAuthenticated = useSessionStore(selectGmAccessAuthenticated);
  const isGm = useSessionStore(selectIsGm);
  const pendingClaim = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'claimGmInstance'));
  const pendingLock = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'setGmControlsLocked'));
  const setMode = useSessionStore((state) => state.setMode);
  const [instanceName, setInstanceName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [changingLock, setChangingLock] = useState(false);
  const [pendingSeatId, setPendingSeatId] = useState<string | null>(null);
  const [seatStatus, setSeatStatus] = useState<string | null>(null);
  const [interventionSeatId, setInterventionSeatId] = useState<string | null>(null);
  const [interventionReason, setInterventionReason] = useState('');
  const interventionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const interventionDialogRef = useRef<HTMLDivElement | null>(null);
  const interventionReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeGmCount, setActiveGmCount] = useState<number | null>(null);
  const controlsLocked = session?.gmControlsLocked === true;

  useEffect(() => {
    if (!session?.id || !controlsLocked || isGm) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeGmInstances }) => {
      if (!active) return;
      unsubscribe = subscribeGmInstances(
        session.id,
        (instances) => setActiveGmCount(instances.length),
        () => setActiveGmCount(null),
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [controlsLocked, isGm, session?.id]);

  useEffect(() => {
    if (!interventionSeatId) {
      interventionTriggerRef.current?.focus();
      return;
    }
    const dialog = interventionDialogRef.current;
    if (!dialog) return;
    interventionReasonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setInterventionSeatId(null);
        setInterventionReason('');
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href]',
      )];
      if (focusable.length === 0) return;
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [interventionSeatId]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (!isGm && me.activeConsoleRoleId) {
    return <Navigate to={consoleRoleRoute(me.activeConsoleRoleId)} replace />;
  }

  function connectAs(mode: ConsoleMode): void {
    setMode(mode);
    navigate(`/${mode}`);
  }

  async function changeSeat(seatId: string, action: 'claim' | 'release'): Promise<void> {
    setPendingSeatId(seatId);
    setSeatStatus(null);
    try {
      const disposition: CommandDisposition = action === 'claim'
        ? await claimSeat(seatId)
        : await releaseSeat(seatId);
      setSeatStatus(disposition === 'queued'
        ? 'STATION CHANGE PENDING // AWAITING RECONNECTION'
        : disposition === 'stale'
          ? 'STATION CHANGE STALE // REFRESH THE LIVE SEAT MAP AND RETRY'
          : `STATION ${action === 'claim' ? 'CLAIMED' : 'RELEASED'} // SERVER ${disposition.toUpperCase()}`);
    } catch {
      setSeatStatus('STATION CHANGE REJECTED // REVIEW THE LIVE SEAT MAP');
    } finally {
      setPendingSeatId(null);
    }
  }

  async function clearStaleSeat(): Promise<void> {
    const reason = interventionReason.trim();
    if (!interventionSeatId || !reason) return;
    setPendingSeatId(interventionSeatId);
    setSeatStatus(null);
    try {
      const disposition = await releaseSeat(interventionSeatId, reason);
      if (disposition === 'stale') {
        setSeatStatus('STALE STATION CLEAR STALE // REFRESH THE LIVE SEAT MAP AND RETRY');
      } else {
        setSeatStatus(disposition === 'queued'
          ? 'STALE STATION CLEAR PENDING // AWAITING RECONNECTION'
          : `STALE STATION CLEARED // SERVER ${disposition.toUpperCase()}`);
        setInterventionSeatId(null);
        setInterventionReason('');
      }
    } catch {
      setSeatStatus('STALE STATION CLEAR REJECTED // REVIEW THE LIVE SEAT MAP');
    } finally {
      setPendingSeatId(null);
    }
  }

  const activeCoreRoleIds = new Set(
    (session.activeRoleIds ?? []).filter((roleId) => roleId !== 'press-officer'),
  );
  const coreSeats = seats
    .filter((seat) => {
      const roleId = seat.roleId ?? seat.id;
      return roleId !== 'press-officer' &&
        (activeCoreRoleIds.size === 0 || activeCoreRoleIds.has(roleId));
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  async function claim(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setClaiming(true);
    try {
      await claimGmInstance(instanceName);
    } catch {
      // The shared interception notice carries the actionable server error.
    } finally {
      setClaiming(false);
    }
  }

  async function toggleLock(): Promise<void> {
    setChangingLock(true);
    try {
      await setGmControlsLocked(session?.gmControlsLocked !== true);
    } catch {
      // The shared interception notice carries the actionable server error.
    } finally {
      setChangingLock(false);
    }
  }

  const claimLabel = isGm ? 'GM joined' : pendingClaim ? 'GM join queued' : 'Join as GM';
  const registrationLocked = controlsLocked && activeGmCount !== 0;
  const hasEnteredInstanceName = isGm && (gmInstance?.name ?? '').trim().length > 0;

  return (
    <main className="role-select">
      <div className="role-select__intro">
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">Connect this device</h1>
        <p className="role-select__lede">Choose how this screen will be used.</p>
      </div>

      {coreSeats.length > 0 && (
        <section className="role-seat-board cic-frame" aria-label="Core station seats">
          <header className="role-seat-board__header">
            <div>
              <p className="eyebrow">Confirmed core roster</p>
              <h2>Choose your station</h2>
            </div>
            <span className="role-seat-board__count">{coreSeats.length} core seats</span>
          </header>
          <ul className="role-seat-board__list">
            {coreSeats.map((seat) => {
              const heldByYou = seat.holderUid === me.uid;
              const occupied = seat.status === 'claimed' && !heldByYou;
              const action = heldByYou ? 'release' : 'claim';
              return (
                <li className="role-seat" key={seat.id}>
                  <div className="role-seat__identity">
                    <strong>{seat.label}</strong>
                    <span className="role-seat__state" data-state={heldByYou ? 'you' : occupied ? 'held' : seat.status}>
                      {heldByYou ? 'HELD BY YOU' : occupied ? 'OCCUPIED' : seat.status.toUpperCase()}
                    </span>
                  </div>
                  {!occupied && (
                    <button
                      className="cic-action-button role-seat__action"
                      type="button"
                      disabled={pendingSeatId !== null}
                      aria-label={`${action === 'claim' ? 'CLAIM' : 'RELEASE'} STATION // ${seat.label}`}
                      onClick={() => void changeSeat(seat.id, action)}
                    >
                      {pendingSeatId === seat.id
                        ? `${action === 'claim' ? 'CLAIMING' : 'RELEASING'}…`
                        : `${action === 'claim' ? 'CLAIM' : 'RELEASE'} STATION`}
                    </button>
                  )}
                  {occupied && isGm && (
                    <button
                      className="cic-danger-button role-seat__action"
                      type="button"
                      disabled={pendingSeatId !== null}
                      aria-label={`CLEAR STALE HOLDER // ${seat.label}`}
                      onClick={(event) => {
                        interventionTriggerRef.current = event.currentTarget;
                        setInterventionSeatId(seat.id);
                        setInterventionReason('');
                      }}
                    >
                      CLEAR STALE HOLDER
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="role-seat-board__note" role="status" aria-live="polite" aria-label="Seat status">
            {seatStatus ?? 'Seat changes commit through the authoritative session service.'}
          </p>
          {interventionSeatId && (
            <div
              className="role-seat-intervention-backdrop"
              role="presentation"
              onClick={() => {
                setInterventionSeatId(null);
                setInterventionReason('');
              }}
            >
              <div
                ref={interventionDialogRef}
                className="role-seat-intervention cic-frame"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="role-seat-intervention-title"
                aria-describedby="role-seat-intervention-copy"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="role-seat-intervention-title">Clear stale station holder?</h3>
                <p id="role-seat-intervention-copy">
                  This GM-only intervention releases the occupied station and writes an audit reason.
                </p>
                <label htmlFor="role-seat-intervention-reason">Reason for clearing stale seat</label>
                <textarea
                  ref={interventionReasonRef}
                  id="role-seat-intervention-reason"
                  value={interventionReason}
                  maxLength={240}
                  rows={3}
                  onChange={(event) => setInterventionReason(event.target.value)}
                />
                <div className="role-seat-intervention__actions">
                  <button
                    className="cic-danger-button"
                    type="button"
                    disabled={pendingSeatId !== null || interventionReason.trim().length === 0}
                    onClick={() => void clearStaleSeat()}
                  >
                    CONFIRM CLEAR STALE SEAT
                  </button>
                  <button
                    className="cic-text-button"
                    type="button"
                    disabled={pendingSeatId !== null}
                    onClick={() => {
                      setInterventionSeatId(null);
                      setInterventionReason('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="role-select__grid role-select__grid--four">
        <form className="role-card role-claim cic-frame" onSubmit={(event) => void claim(event)}>
          <button
            className="role-claim__button"
            type="submit"
            disabled={
              isGm || pendingClaim || claiming || registrationLocked ||
              instanceName.trim().length === 0 || !gmAccessAuthenticated
            }
          >
            {claimLabel}
          </button>
          <label className="role-card__name" htmlFor="gm-instance-name">
            {hasEnteredInstanceName ? 'Name entered' : 'Input GM Name'}
          </label>
          <input
            id="gm-instance-name"
            className="role-claim__input"
            value={isGm ? gmInstance?.name ?? instanceName : instanceName}
            disabled={isGm || pendingClaim || claiming || registrationLocked}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => setInstanceName(event.target.value)}
          />
          {!isGm && !gmAccessAuthenticated && (
            <span className="role-card__description">
              🔐 Log in through Settings to unlock GM access.
            </span>
          )}
          {registrationLocked && <span className="role-card__description">GM registration locked.</span>}
          {controlsLocked && activeGmCount === 0 && !isGm && (
            <span className="role-card__description">Failsafe active // no active GM.</span>
          )}
        </form>
        <button
          className="role-card role-controls-lock cic-frame"
          type="button"
          aria-label={`${controlsLocked ? 'Unlock' : 'Lock'} lock out more GMs being added`}
          aria-pressed={controlsLocked}
          disabled={!isGm || changingLock || pendingLock}
          onClick={() => void toggleLock()}
        >
          <span className="role-controls-lock__icon" aria-hidden="true">
            {controlsLocked ? '🔒' : '🔓'}
          </span>
          <span className="role-card__name">Lock out more GMs being added</span>
          <span className="role-card__description">
            {pendingLock ? 'Change queued' : controlsLocked ? 'Locked' : 'Unlocked'}
          </span>
        </button>
        {MODES.map(({ mode, label, description }) => (
          <button
            className="role-card cic-frame"
            type="button"
            key={mode}
            onClick={() => connectAs(mode)}
          >
            <span className="role-card__name">{label}</span>
            <span className="role-card__description">{description}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
