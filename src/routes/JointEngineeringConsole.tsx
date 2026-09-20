import JointEngineeringWorkspace from '@/components/JointEngineeringWorkspace';
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { DEFAULT_ACTIVE_ROLE_IDS, findConsoleRole } from '@/data/roles';
import { isJointEngineeringRoleAvailable } from '@/data/rolePresets';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import { selectConsoleRole } from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';

export default function JointEngineeringConsole() {
  const { roleId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);
  const seats = useSessionStore((state) => state.seats);
  const role = findConsoleRole(roleId);
  const activeRoleIds = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const roleEnabled = Boolean(role && isJointEngineeringRoleAvailable(activeRoleIds, role.id));
  const gameplayFrozen = ['success', 'failure', 'debrief', 'closed'].includes(session?.phase ?? '');
  const canClaimRole = Boolean(
    session && me && mode === 'console' && role && role.shipId === 'joint-engineering-union' &&
    roleEnabled && !gameplayFrozen && (isGm || !me.activeConsoleRoleId || me.activeConsoleRoleId === role.id),
  );

  useEffect(() => {
    if (!role || !canClaimRole) return;
    if (
      session?.setupRevision !== undefined &&
      !seats.some((seat) => (seat.roleId ?? seat.id) === role.id)
    ) return;
    void selectConsoleRole(role.id).catch(() => undefined);
  }, [canClaimRole, role, seats, session?.setupRevision]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (
    !role || mode !== 'console' || role.shipId !== 'joint-engineering-union' ||
    (!roleEnabled &&
      me.activeConsoleRoleId !== role.id)
  ) return <Navigate to="/console" replace />;

  return (
    <ConsoleAccessContext.Provider value={{
      writable: roleEnabled && me.activeConsoleRoleId === role.id && !gameplayFrozen,
      roleId: role.id,
    }}>
      <main className="session-mode">
        <section className="session-mode__panel cic-frame">
          <Link className="session-mode__back cic-text-button" to="/console">
            Back to role selection
          </Link>
          <p className="eyebrow">{session.name} // Joint station</p>
          <h1 className="role-select__title">Joint Engineering Union</h1>
          <p className="role-select__lede">{role.name}</p>
          {!isGm && me.activeConsoleRoleId !== role.id && (
            <p className="gm-console__status" role="status">
              Console access // Read only while another station is held.
            </p>
          )}
          {gameplayFrozen && <p className="gm-console__status" role="status">
            Endgame evaluation // engineering controls are frozen.
          </p>}
          <JointEngineeringWorkspace roleId={role.id} />
        </section>
      </main>
    </ConsoleAccessContext.Provider>
  );
}
