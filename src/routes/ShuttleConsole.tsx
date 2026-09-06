import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import ShuttleConsoleTemplate from '@/components/ShuttleConsoleTemplate';
import { DEFAULT_ACTIVE_ROLE_IDS, findConsoleRole } from '@/data/roles';
import { SHUTTLECRAFT, dockingForShuttle } from '@/data/shuttles';
import { consoleRoleRoute } from '@/lib/consoleRole';
import { selectConsoleRole } from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';

export default function ShuttleConsole({ shuttleId }: { shuttleId: string }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);
  const shuttle = SHUTTLECRAFT.find((item) => item.id === shuttleId);
  const activeRoles = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const captainRole = findConsoleRole(shuttle?.captainRoleId);
  const docking = dockingForShuttle(session ?? {}, shuttleId);

  useEffect(() => {
    if (!shuttle) return;
    void selectConsoleRole(shuttle.captainRoleId).catch(() => undefined);
  }, [shuttle]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (!isGm && me.activeConsoleRoleId && me.activeConsoleRoleId !== shuttle?.captainRoleId) {
    return <Navigate to={consoleRoleRoute(me.activeConsoleRoleId)} replace />;
  }
  if (
    !shuttle || (mode !== 'console' && mode !== 'press') ||
    (!activeRoles.includes(shuttle.captainRoleId) &&
      me.activeConsoleRoleId !== shuttle.captainRoleId)
  ) {
    return <Navigate to="/console" replace />;
  }

  return <ShuttleConsoleTemplate shuttle={shuttle} captainName={captainRole?.name ?? 'Captain'}
    canLeave={isGm} docking={docking} />;
}
