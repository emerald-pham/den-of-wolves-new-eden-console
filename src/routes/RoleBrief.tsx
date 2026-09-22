import { Link, Navigate } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { AEGIS_ROLE_CONSOLES } from '@/data/aegisConsoles';
import { PDF_ESCORT_FIGHTER_WING } from '@/data/pdfConsoles';
import { SHUTTLECRAFT } from '@/data/shuttles';
import WolfCommanderTargetingPanel from '@/components/WolfCommanderTargetingPanel';
import VulcanAdditionalLabourPanel from '@/components/VulcanAdditionalLabourPanel';
import DecisionAttribution from '@/components/DecisionAttribution';
import ExtraShipCaptainWorkspace from '@/components/ExtraShipCaptainWorkspace';

const CRAFT_NAMES = new Map([
  ...SHUTTLECRAFT.map((craft) => [craft.id, craft.name] as const),
  ...AEGIS_ROLE_CONSOLES['wing-commander'].craft.map((craft) => [craft.id, craft.name] as const),
  [PDF_ESCORT_FIGHTER_WING.id, PDF_ESCORT_FIGHTER_WING.name],
]);

/** The authenticated player's role brief and common rules projection. */
export default function RoleBrief() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const brief = useSessionStore((state) => state.roleBrief);
  const privateLoyalty = useSessionStore((state) => state.privateLoyalty);
  const arbourVision = useSessionStore((state) => state.arbourVision);
  const facilitatorRuleCall = useSessionStore((state) => state.facilitatorRuleCall);

  if (
    !session || !me || !brief ||
    brief.assignmentUid !== me.uid ||
    me.replacementRoleId !== brief.roleId && me.assignedRoleId !== brief.roleId
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

        {brief.voyage33Motivation && (
          <section className="role-brief__rules" aria-labelledby="voyage-33-motivation-title">
            <p className="eyebrow">Private arrival priority</p>
            <h2 id="voyage-33-motivation-title">Voyage 33-0 support</h2>
            <p>{brief.voyage33Motivation}</p>
          </section>
        )}

        {privateLoyalty?.kind === 'universal-arbour' && arbourVision && (
          <section className="role-brief__rules role-brief__rules--arbour-vision" aria-labelledby="arbour-vision-title">
            <p className="eyebrow">{arbourVision.label}</p>
            <h2 id="arbour-vision-title">Universal Arbour vision // {arbourVision.kind}</h2>
            <p>{arbourVision.text}</p>
          </section>
        )}

        {facilitatorRuleCall && (
          <section className="role-brief__rules role-brief__rules--facilitator-call" aria-labelledby="facilitator-rule-call-title">
            <p className="eyebrow">{facilitatorRuleCall.label}</p>
            <h2 id="facilitator-rule-call-title">Facilitator rule call</h2>
            <dl>
              <div><dt>Question</dt><dd>{facilitatorRuleCall.ambiguity}</dd></div>
              <div><dt>Source</dt><dd>{facilitatorRuleCall.source}</dd></div>
              <div><dt>Decision</dt><dd>{facilitatorRuleCall.decision}</dd></div>
            </dl>
            <DecisionAttribution
              source={facilitatorRuleCall.source}
              actorVisibility="withheld"
              recordedAt={facilitatorRuleCall.createdAt}
            />
          </section>
        )}

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

        {me.replacementRoleId === 'wolf-commander' && <WolfCommanderTargetingPanel />}

        <ExtraShipCaptainWorkspace roleId={brief.roleId} />

        {me.replacementRoleId === 'vulcan-captain' && <VulcanAdditionalLabourPanel />}

        <Link className="cic-action-button role-brief__return" to="/roles">
          Return to role selection
        </Link>
      </article>
    </main>
  );
}
