import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { DEFAULT_ACTIVE_ROLE_IDS, findConsoleRole } from '@/data/roles';
import { consoleRoleRoute } from '@/lib/consoleRole';
import { selectConsoleRole } from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';

export default function JointEngineeringConsole() {
  const { roleId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);
  const role = findConsoleRole(roleId);

  useEffect(() => {
    if (!role) return;
    void selectConsoleRole(role.id).catch(() => undefined);
  }, [role]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (!isGm && me.activeConsoleRoleId && me.activeConsoleRoleId !== roleId) {
    return <Navigate to={consoleRoleRoute(me.activeConsoleRoleId)} replace />;
  }
  if (
    mode !== 'console' || role?.shipId !== 'joint-engineering-union' ||
    (!(session.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS).includes(role.id) &&
      me.activeConsoleRoleId !== role.id)
  ) return <Navigate to="/console" replace />;

  return (
    <main className="session-mode">
      <section className="session-mode__panel cic-frame">
        {isGm && (
          <Link className="session-mode__back cic-text-button" to="/console">
            Back to role selection
          </Link>
        )}
        <p className="eyebrow">{session.name} // Joint station</p>
        <h1 className="role-select__title">Joint Engineering Union</h1>
        <p className="role-select__lede">{role.name}</p>
      </section>
    </main>
  );
}
