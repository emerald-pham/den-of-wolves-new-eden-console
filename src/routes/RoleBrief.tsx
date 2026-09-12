import { Link, Navigate } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { AEGIS_ROLE_CONSOLES } from '@/data/aegisConsoles';
import { SHUTTLECRAFT } from '@/data/shuttles';

const CRAFT_NAMES = new Map([
  ...SHUTTLECRAFT.map((craft) => [craft.id, craft.name] as const),
  ...AEGIS_ROLE_CONSOLES['wing-commander'].craft.map((craft) => [craft.id, craft.name] as const),
  ['pdf-escort-fighter-wing', 'PDF Escort Fighter Wing'],
]);

/** The authenticated player's role brief and common rules projection. */
export default function RoleBrief() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const brief = useSessionStore((state) => state.roleBrief);

  if (
    !session || !me || !brief ||
    brief.assignmentUid !== me.uid ||
    me.assignedRoleId !== brief.roleId
  ) {
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

        {(brief.ownedCraftIds?.length ?? 0) > 0 && (
          <section className="role-brief__rules" aria-labelledby="role-brief-craft-title">
            <h2 id="role-brief-craft-title">Role-owned craft</h2>
            <ul>
              {brief.ownedCraftIds?.map((craftId) => (
                <li key={craftId}>{CRAFT_NAMES.get(craftId) ?? craftId}</li>
              ))}
            </ul>
          </section>
        )}

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
