import { Link, Navigate } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';

/** The authenticated player's role brief and common rules projection. */
export default function RoleBrief() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const brief = useSessionStore((state) => state.roleBrief);

  if (!session || !me || !brief || me.assignedRoleId !== brief.roleId) {
    return <Navigate to="/roles" replace />;
  }

  return (
    <main className="role-brief-screen">
      <article className="role-brief cic-frame" aria-labelledby="role-brief-title">
        <Link className="session-mode__back cic-text-button" to="/roles">
          Back to roles
        </Link>
        <p className="eyebrow">{session.name} // private briefing</p>
        <p className="role-brief__eyebrow">Assigned role // {brief.vesselName}</p>
        <h1 id="role-brief-title">{brief.roleName}</h1>
        <p className="role-brief__copy">{brief.text}</p>

        <section className="role-brief__rules" aria-labelledby="role-brief-rules-title">
          <h2 id="role-brief-rules-title">Common rules</h2>
          <p>{brief.commonRules}</p>
        </section>

        <Link className="cic-action-button role-brief__return" to="/roles">
          Return to role selection
        </Link>
      </article>
    </main>
  );
}
