import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { claimGmInstance, setGmControlsLocked } from '@/lib/sessionService';
import { selectIsGm, useSessionStore, type ConsoleMode } from '@/store/useSessionStore';

const MODES: readonly {
  mode: ConsoleMode;
  label: string;
  description: string;
  gmOnly: boolean;
}[] = [
  { mode: 'gm', label: 'GM Console', description: 'Manage active GM instances.', gmOnly: true },
  { mode: 'console', label: 'Roles', description: 'Display and manage table roles.', gmOnly: false },
  {
    mode: 'press',
    label: 'Press Officer',
    description: 'SNN // Unaffiliated Independent Press Shuttle.',
    gmOnly: false,
  },
];

export default function RoleSelect() {
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const isGm = useSessionStore(selectIsGm);
  const pendingClaim = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'claimGmInstance'));
  const pendingLock = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'setGmControlsLocked'));
  const setMode = useSessionStore((state) => state.setMode);
  const [instanceName, setInstanceName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [changingLock, setChangingLock] = useState(false);
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

  if (!session || !me) return <Navigate to="/" replace />;

  function connectAs(mode: ConsoleMode): void {
    setMode(mode);
    navigate(`/${mode}`);
  }

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

  const claimLabel = isGm ? 'GM claimed' : pendingClaim ? 'GM claim queued' : 'Claim GM';
  const registrationLocked = controlsLocked && activeGmCount !== 0;

  return (
    <main className="role-select">
      <div className="role-select__intro">
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">Connect this device</h1>
        <p className="role-select__lede">Choose how this screen will be used.</p>
      </div>

      <div className="role-select__grid role-select__grid--four">
        <form className="role-card role-claim cic-frame" onSubmit={(event) => void claim(event)}>
          <label className="role-card__name" htmlFor="gm-instance-name">GM instance name</label>
          <input
            id="gm-instance-name"
            className="role-claim__input"
            value={isGm ? gmInstance?.name ?? instanceName : instanceName}
            disabled={isGm || pendingClaim || claiming || registrationLocked}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => setInstanceName(event.target.value)}
          />
          <button
            className="role-claim__button"
            type="submit"
            disabled={
              isGm || pendingClaim || claiming || registrationLocked ||
              instanceName.trim().length === 0
            }
          >
            {claimLabel}
          </button>
          {registrationLocked && <span className="role-card__description">GM registration locked.</span>}
          {controlsLocked && activeGmCount === 0 && !isGm && (
            <span className="role-card__description">Failsafe active // no active GM.</span>
          )}
        </form>
        <button
          className="role-card role-controls-lock cic-frame"
          type="button"
          aria-label={`${controlsLocked ? 'Unlock' : 'Lock'} GM registration and Setup`}
          aria-pressed={controlsLocked}
          disabled={!isGm || changingLock || pendingLock}
          onClick={() => void toggleLock()}
        >
          <span className="role-controls-lock__icon" aria-hidden="true">
            {controlsLocked ? '🔒' : '🔓'}
          </span>
          <span className="role-card__name">GM registration + Setup</span>
          <span className="role-card__description">
            {pendingLock ? 'Change queued' : controlsLocked ? 'Locked' : 'Unlocked'}
          </span>
        </button>
        {MODES.map(({ mode, label, description, gmOnly }) => (
          <button
            className="role-card cic-frame"
            type="button"
            key={mode}
            disabled={gmOnly && !isGm}
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
