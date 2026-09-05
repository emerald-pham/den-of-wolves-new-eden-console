import { Navigate } from 'react-router-dom';
import { selectIsGm, useSessionStore, type ConsoleMode } from '@/store/useSessionStore';

const MODE_LABELS: Record<ConsoleMode, string> = {
  gm: 'GM',
  setup: 'Setup',
  console: 'Roles',
};

export default function SessionMode({ mode }: { mode: ConsoleMode }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const selectedMode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);

  if (!session || !me) return <Navigate to="/" replace />;
  if ((mode === 'gm' || mode === 'setup') && !isGm) return <Navigate to="/roles" replace />;
  if (selectedMode !== mode) return <Navigate to="/roles" replace />;

  return (
    <main className="session-mode">
      <div className="session-mode__panel cic-frame">
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">{MODE_LABELS[mode]} connected</h1>
        <p className="role-select__lede">
          Session {session.joinCode} is ready on this device.
        </p>
      </div>
    </main>
  );
}
