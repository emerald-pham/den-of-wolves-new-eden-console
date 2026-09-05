import { Link, Navigate, useParams } from 'react-router-dom';
import { findConsoleRole } from '@/data/roles';
import { useSessionStore } from '@/store/useSessionStore';

export default function JointEngineeringConsole() {
  const { roleId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const role = findConsoleRole(roleId);
  if (!session || !me) return <Navigate to="/" replace />;
  if (
    mode !== 'console' || role?.shipId !== 'joint-engineering-union' ||
    !session.activeRoleIds?.includes(role.id)
  ) return <Navigate to="/console" replace />;

  return (
    <main className="session-mode">
      <section className="session-mode__panel cic-frame">
        <Link className="session-mode__back cic-text-button" to="/console">
          Back to role selection
        </Link>
        <p className="eyebrow">{session.name} // Joint station</p>
        <h1 className="role-select__title">Joint Engineering Union</h1>
        <p className="role-select__lede">{role.name}</p>
      </section>
    </main>
  );
}
