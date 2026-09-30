import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import ShuttleConsoleTemplate from '@/components/ShuttleConsoleTemplate';
import { activeFleetShipIds, DEFAULT_ACTIVE_ROLE_IDS, findConsoleRole } from '@/data/roles';
import { findShip } from '@/data/ships';
import { SHUTTLECRAFT, dockingForShuttle, isShuttleEnabled } from '@/data/shuttles';
import { isJointEngineeringRoleId } from '@/data/rolePresets';
import { consoleRoleRoute } from '@/lib/consoleRole';
import { releaseConsoleRole, selectConsoleRole } from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import type { DismantlingProposalCommand } from '@/lib/permissionedDismantlingService';

const PERMISSIONED_DISMANTLING_CRAFTS: readonly DismantlingProposalCommand['craftId'][] = [
  'philia', 'blacksmith', 'chacau', 'ally',
];

function dismantlingConnection(
  connection: 'idle' | 'connecting' | 'live' | 'offline',
  freshness: 'unknown' | 'cache' | 'server',
): 'live' | 'connecting' | 'offline' {
  if (connection === 'live' && freshness === 'server') return 'live';
  if (connection === 'connecting' || connection === 'live') return 'connecting';
  return 'offline';
}

export default function ShuttleConsole({ shuttleId: providedShuttleId }: { shuttleId?: string }) {
  const navigate = useNavigate();
  const { shuttleId: routeShuttleId } = useParams();
  const shuttleId = providedShuttleId ?? routeShuttleId ?? '';
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const connection = useSessionStore((state) => state.connection);
  const sessionSnapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const isGm = useSessionStore(selectIsGm);
  const [returningToStations, setReturningToStations] = useState(false);
  const shuttle = SHUTTLECRAFT.find((item) => item.id === shuttleId);
  const activeRoles = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const captainRole = findConsoleRole(shuttle?.captainRoleId);
  const docking = dockingForShuttle(session ?? {}, shuttleId);
  const isPressShuttle = shuttleId === 'snn-press-shuttle';
  const shuttleEnabled = shuttle
    ? isPressShuttle ? session?.pressEnabled !== false : isShuttleEnabled(shuttle, activeRoles)
    : false;
  const control = session?.shuttleControl?.[shuttleId];
  const permissionedDismantlingCraftId = PERMISSIONED_DISMANTLING_CRAFTS
    .find((craftId) => craftId === shuttleId);
  const permissionedDismantlingHost = docking?.shipId ? findShip(docking.shipId) : undefined;
  const permissionedDismantlingConnection = dismantlingConnection(connection, sessionSnapshotFreshness);
  const permissionedDismantlingCanAct = Boolean(
    !isGm && permissionedDismantlingCraftId && shuttleEnabled && mode === 'console' &&
    session?.phase === 'active' && me?.role === 'player' && me.sessionId === session.id &&
    me.replacementStatus == null &&
    connection === 'live' && sessionSnapshotFreshness === 'server' &&
    control?.holderUid === me.uid && docking?.shipId && permissionedDismantlingHost,
  );
  const permissionedDismantling = permissionedDismantlingCraftId && mode === 'console' &&
    !isGm && me?.role === 'player'
    ? {
        sessionId: session?.id ?? '',
        currentPlayerUid: me.uid,
        craftId: permissionedDismantlingCraftId,
        ...(docking?.shipId ? { targetShipId: docking.shipId } : {}),
        targetSystems: permissionedDismantlingHost?.systems ?? [],
        damagedSystemIds: permissionedDismantlingHost
          ? session?.shipDamage?.[permissionedDismantlingHost.id]?.damagedSystemIds ?? []
          : [],
        connection: permissionedDismantlingConnection,
        canAct: permissionedDismantlingCanAct,
      }
    : undefined;
  const hasPlayerAuthority = isGm || me?.replacementStatus == null;
  const isControlHolder = hasPlayerAuthority && control?.holderUid === me?.uid;
  const isPrintedOwner = hasPlayerAuthority && control?.ownerUid === me?.uid;
  const canClaimCaptainRole = Boolean(
    session && me && shuttle && (mode === 'console' || mode === 'press') &&
    hasPlayerAuthority &&
    shuttleEnabled &&
    (!isPressShuttle || !isGm) && !isControlHolder &&
    (isGm || !me.activeConsoleRoleId || me.activeConsoleRoleId === shuttle.captainRoleId),
  );

  useEffect(() => {
    if (!shuttle || !canClaimCaptainRole) return;
    void selectConsoleRole(shuttle.captainRoleId).catch(() => undefined);
  }, [canClaimCaptainRole, shuttle]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (!isGm && me.replacementStatus != null) return <Navigate to="/console" replace />;
  if (!isGm && me.activeConsoleRoleId && me.activeConsoleRoleId !== shuttle?.captainRoleId &&
      !isControlHolder && !isPrintedOwner) {
    return <Navigate to={consoleRoleRoute(me.activeConsoleRoleId)} replace />;
  }
  if (isPressShuttle && session.pressEnabled === false) {
    return <Navigate to="/console" replace />;
  }
  if (
    !shuttle || (mode !== 'console' && mode !== 'press') ||
    (!shuttleEnabled &&
      me.activeConsoleRoleId !== shuttle.captainRoleId)
  ) {
    return <Navigate to="/console" replace />;
  }

  async function returnPressToIndependentStations(): Promise<void> {
    if (returningToStations) return;
    setReturningToStations(true);
    try {
      await releaseConsoleRole();
      navigate('/console', { replace: true });
    } catch {
      setReturningToStations(false);
    }
  }

  const activeShips = activeFleetShipIds(activeRoles, session.activeVesselIds);
  const ownerShipAvailable = captainRole && activeShips.includes(captainRole.shipId) &&
    (captainRole.shipId !== 'dione' || session.dioneEnabled !== false) &&
    (captainRole.shipId !== 'capybara' || session.capybaraEnabled !== false);
  const holderReturn = isControlHolder && me.activeConsoleRoleId &&
    me.activeConsoleRoleId !== shuttle.captainRoleId
    ? { to: consoleRoleRoute(me.activeConsoleRoleId), label: 'Back to assigned console' }
    : undefined;
  const ownerParent = holderReturn ?? (captainRole && isJointEngineeringRoleId(captainRole.id)
    ? {
        to: consoleRoleRoute(captainRole.id),
        label: 'Back to Joint Engineering Union',
      }
    : !isGm && captainRole && !isPressShuttle && ownerShipAvailable
    ? {
        to: consoleRoleRoute(captainRole.id),
        label: `Back to ${findShip(captainRole.shipId)?.name ?? captainRole.shipId} ${captainRole.name} console`,
      }
    : !isGm && !isPressShuttle
    ? { to: '/console', label: 'Back to role selection' }
    : undefined);
  const returnTo = isPressShuttle && !isGm
    ? me.activeConsoleRoleId === shuttle.captainRoleId
      ? {
          to: '/console',
          label: returningToStations ? 'Returning to Independent Stations…' : 'Back to Independent Stations',
          onClick: () => void returnPressToIndependentStations(),
          busy: returningToStations,
        }
      : {
          to: '/console',
          label: 'Back to Independent Stations',
        }
    : ownerParent;
  return <ShuttleConsoleTemplate shuttle={shuttle} captainName={captainRole?.name ?? 'Captain'}
    canLeave={isGm} docking={docking} fuelled={session.shuttleFuelled?.[shuttle.id] === true}
    returnTo={returnTo} control={control} permissionedDismantling={permissionedDismantling} />;
}
