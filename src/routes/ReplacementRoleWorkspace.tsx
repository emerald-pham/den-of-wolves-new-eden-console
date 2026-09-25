import { lazy, Suspense } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import RoleAssignment from '@/components/RoleAssignment';
import RoleConsoleTemplate from '@/components/RoleConsoleTemplate';
import { replacementRoleFor } from '@/data/replacementRoles';
import { useSessionStore } from '@/store/useSessionStore';

const ScoutRequestControls = lazy(() => import('@/components/ScoutRequestControls'));

export default function ReplacementRoleWorkspace() {
  const { roleId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const role = roleId ? replacementRoleFor(roleId) : undefined;
  const authorized = Boolean(
    session && me && mode === 'console' && me.role === 'player' &&
    role?.kind === 'role' && me.replacementRoleId === role.id &&
    me.activeConsoleRoleId === null,
  );

  if (!session || !me) return <Navigate to="/" replace />;
  if (!authorized || !role) return <Navigate to="/console" replace />;

  return (
    <main className="session-mode replacement-role-workspace">
      <section className="session-mode__panel">
        <Link className="session-mode__back cic-text-button" to="/console">
          Back to fleet
        </Link>
        <RoleAssignment value={role.name} />
        <RoleConsoleTemplate
          label={`${role.name} replacement workspace`}
          eyebrow={`${session.name} // reassigned station`}
          title={role.name}
          telemetry={<>
            <div><dt>Assignment</dt><dd>Authorized</dd></div>
            <div><dt>Station</dt><dd>{role.vesselName}</dd></div>
            <div><dt>Operator</dt><dd>{me.displayName}</dd></div>
            <div><dt>Console state</dt><dd>Ready</dd></div>
          </>}
        >
          <div className="console-workspace__status" role="status">
            <p>Facilitator reassignment confirmed // private role identity active</p>
            <p>Operational controls appear only when an authoritative procedure is available.</p>
          </div>
          {role.id === 'comms-officer' && (
            <Suspense fallback={<p className="console-workspace__status">Loading scouting request controls…</p>}>
              <ScoutRequestControls key={role.id} entitlementId="comms-officer" />
            </Suspense>
          )}
          <section className="console-workspace__section" aria-labelledby="replacement-workspace-boundary">
            <h3 id="replacement-workspace-boundary">Station boundary</h3>
            <p>This workspace shows the role and station recorded for your current assignment.</p>
          </section>
        </RoleConsoleTemplate>
      </section>
    </main>
  );
}
