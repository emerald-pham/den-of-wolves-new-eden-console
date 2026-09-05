import { Navigate, useNavigate } from 'react-router-dom';
import { useSessionStore, type ConsoleMode } from '@/store/useSessionStore';

const MODES: readonly {
  mode: ConsoleMode;
  label: string;
  description: string;
}[] = [
  {
    mode: 'gm',
    label: 'Game Master',
    description: 'Guide the table and run the session.',
  },
  {
    mode: 'console',
    label: 'Console',
    description: 'Display the shared table console on this device.',
  },
];

export default function RoleSelect() {
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const setMode = useSessionStore((state) => state.setMode);

  if (!session || !me) return <Navigate to="/" replace />;

  function connectAs(mode: ConsoleMode): void {
    setMode(mode);
    navigate(`/${mode}`);
  }

  return (
    <main className="role-select">
      <div className="role-select__intro">
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">Connect this device</h1>
        <p className="role-select__lede">Choose how this screen will be used.</p>
      </div>

      <div className="role-select__grid role-select__grid--two">
        {MODES.map(({ mode, label, description }) => (
          <button
            className="role-card"
            type="button"
            key={mode}
            disabled={mode === 'gm' && me.role !== 'gm'}
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
