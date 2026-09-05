import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { claimGmInstance, setGmControlsLocked } from '@/lib/sessionService';
import { selectIsGm, useSessionStore, type ConsoleMode } from '@/store/useSessionStore';
import { consoleRoleRoute } from '@/lib/consoleRole';

const MODES: readonly {
  mode: ConsoleMode;
  label: string;
  description: string;
  gmOnly: boolean;
}[] = [
  { mode: 'gm', label: 'GM Console', description: 'Manage active GM instances.', gmOnly: true },
  {
    mode: 'console',
    label: 'Select a role',
    description: 'Choose an independent or shipboard station.',
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
  if (!isGm && me.activeConsoleRoleId) {
    return <Navigate to={consoleRoleRoute(me.activeConsoleRoleId)} replace />;
  }

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

  const claimLabel = isGm ? 'GM joined' : pendingClaim ? 'GM join queued' : 'Join as GM';
  const registrationLocked = controlsLocked && activeGmCount !== 0;
  const hasInstanceName = (isGm ? gmInstance?.name ?? instanceName : instanceName).trim().length > 0;

  return (
    <main className="role-select">
      <div className="role-select__intro">
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">Connect this device</h1>
        <p className="role-select__lede">Choose how this screen will be used.</p>
      </div>

      <div className="role-select__grid role-select__grid--four">
        <form className="role-card role-claim cic-frame" onSubmit={(event) => void claim(event)}>
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
          <label className="role-card__name" htmlFor="gm-instance-name">
            {hasInstanceName ? 'Name inputted' : 'Input GM Name'}
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
