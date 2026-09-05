import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { claimGmInstance } from '@/lib/sessionService';
import { selectIsGm, useSessionStore, type ConsoleMode } from '@/store/useSessionStore';

const MODES: readonly {
  mode: ConsoleMode;
  label: string;
  description: string;
  gmOnly: boolean;
}[] = [
  { mode: 'gm', label: 'GM Console', description: 'Manage active GM instances.', gmOnly: true },
  { mode: 'setup', label: 'Setup', description: 'Configure this operation.', gmOnly: true },
  { mode: 'console', label: 'Roles', description: 'Display and manage table roles.', gmOnly: false },
];

export default function RoleSelect() {
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const isGm = useSessionStore(selectIsGm);
  const pendingClaim = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'claimGmInstance'));
  const setMode = useSessionStore((state) => state.setMode);
  const [instanceName, setInstanceName] = useState('');
  const [claiming, setClaiming] = useState(false);

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

  const claimLabel = isGm ? 'GM claimed' : pendingClaim ? 'GM claim queued' : 'Claim GM';

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
            disabled={isGm || pendingClaim || claiming}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => setInstanceName(event.target.value)}
          />
          <button
            className="role-claim__button"
            type="submit"
            disabled={isGm || pendingClaim || claiming || instanceName.trim().length === 0}
          >
            {claimLabel}
          </button>
        </form>
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
