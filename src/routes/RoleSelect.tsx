import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  claimGmInstance,
  releaseSeat,
} from '@/lib/sessionService';
import {
  selectGmAccessAuthenticated,
  selectIsGm,
  useSessionStore,
  type ConsoleMode,
} from '@/store/useSessionStore';
import { useDialogFocus } from '@/hooks/useDialogFocus';

const MODES: readonly {
  mode: ConsoleMode;
  description: string;
}[] = [
  {
    mode: 'console',
    description: 'Choose, enter, or view a station.',
  },
];

export default function RoleSelect() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const seats = useSessionStore((state) => state.seats);
  const gmAccessAuthenticated = useSessionStore(selectGmAccessAuthenticated);
  const isGm = useSessionStore(selectIsGm);
  const gmJoinIntent = (location.state as { intent?: unknown } | null)?.intent === 'gm-join';
  const pendingClaim = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'claimGmInstance'));
  const setMode = useSessionStore((state) => state.setMode);
  const [instanceName, setInstanceName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [pendingSeatId, setPendingSeatId] = useState<string | null>(null);
  const [seatStatus, setSeatStatus] = useState<string | null>(null);
  const [interventionSeatId, setInterventionSeatId] = useState<string | null>(null);
  const [interventionReason, setInterventionReason] = useState('');
  const interventionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const interventionDialogRef = useRef<HTMLDivElement | null>(null);
  const interventionReasonRef = useRef<HTMLTextAreaElement | null>(null);

  useDialogFocus({
    open: interventionSeatId !== null,
    dialogRef: interventionDialogRef,
    restoreRef: interventionTriggerRef,
    initialFocusRef: interventionReasonRef,
    onEscape: () => {
      setInterventionSeatId(null);
      setInterventionReason('');
    },
  });

  if (!session || !me) return <Navigate to="/" replace />;
  if (!isGm && (!gmAccessAuthenticated || !gmJoinIntent)) return <Navigate to="/console" replace />;
  function connectAs(mode: ConsoleMode): void {
    setMode(mode);
    navigate(`/${mode}`);
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
  const gmOccupiedSeats = isGm ? seats
    .filter((seat) => {
      const roleId = seat.roleId ?? seat.id;
      return roleId !== 'press-officer' &&
        (activeCoreRoleIds.size === 0 || activeCoreRoleIds.has(roleId)) &&
        seat.status === 'claimed' && seat.holderUid !== me.uid;
    })
    .sort((left, right) => left.label.localeCompare(right.label)) : [];

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

  const claimLabel = isGm ? 'GM joined' : pendingClaim ? 'GM join queued' : 'Join as GM';
  const hasEnteredInstanceName = isGm && (gmInstance?.name ?? '').trim().length > 0;

  return (
    <main className="role-select">
      <div className="role-select__intro">
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">Role Select</h1>
        <p className="role-select__lede">GM join // Connect this authenticated device to the session.</p>
      </div>

      {gmOccupiedSeats.length > 0 && (
        <section className="role-seat-board cic-frame" aria-label="Occupied core station review">
          <header className="role-seat-board__header">
            <div>
              <p className="eyebrow">GM-only roster review</p>
              <h2>Occupied core stations</h2>
            </div>
            <span className="role-seat-board__count">{gmOccupiedSeats.length} occupied</span>
          </header>
          <ul className="role-seat-board__list">
            {gmOccupiedSeats.map((seat) => (
              <li className="role-seat" key={seat.id}>
                <div className="role-seat__identity">
                  <strong>{seat.label}</strong>
                  <span className="role-seat__state" data-state="held">OCCUPIED // GM REVIEW</span>
                </div>
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
              </li>
            ))}
          </ul>
          <p className="role-seat-board__note" role="status" aria-live="polite" aria-label="Seat review status">
            {seatStatus ?? 'STALE HOLDER CLEARANCE REQUIRES A REASON AND SERVER COMMIT.'}
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

      <div className="role-select__grid role-select__grid--two">
        <form className="role-card role-claim cic-frame" onSubmit={(event) => void claim(event)}>
          <button
            className="role-claim__button"
            type="submit"
            disabled={
              isGm || pendingClaim || claiming ||
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
            disabled={isGm || pendingClaim || claiming}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => setInstanceName(event.target.value)}
          />
          {!isGm && !gmAccessAuthenticated && (
            <span className="role-card__description">
              🔐 Authorize GM access through Settings.
            </span>
          )}
        </form>
        {MODES.map(({ mode, description }) => (
          <button
            className="role-card cic-frame"
            type="button"
            key={mode}
            onClick={() => connectAs(mode)}
          >
            <span className="role-card__name">Open station catalog</span>
            <span className="role-card__description">{description}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
