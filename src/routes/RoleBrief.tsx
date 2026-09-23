import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import { AEGIS_ROLE_CONSOLES } from '@/data/aegisConsoles';
import { PDF_ESCORT_FIGHTER_WING } from '@/data/pdfConsoles';
import { SHUTTLECRAFT } from '@/data/shuttles';
import { craftHelpFor, type CraftHelp } from '@/data/craftHelp';
import WolfCommanderTargetingPanel from '@/components/WolfCommanderTargetingPanel';
import VulcanAdditionalLabourPanel from '@/components/VulcanAdditionalLabourPanel';
import DecisionAttribution from '@/components/DecisionAttribution';
import ExtraShipCaptainWorkspace from '@/components/ExtraShipCaptainWorkspace';
import FocusDialog from '@/components/FocusDialog';

const CRAFT_NAMES = new Map([
  ...SHUTTLECRAFT.map((craft) => [craft.id, craft.name] as const),
  ...AEGIS_ROLE_CONSOLES['wing-commander'].craft.map((craft) => [craft.id, craft.name] as const),
  [PDF_ESCORT_FIGHTER_WING.id, PDF_ESCORT_FIGHTER_WING.name],
]);

function CraftHelpPanel({ help }: { readonly help: CraftHelp }) {
  const idPrefix = `craft-help-${help.id}`;
  return (
    <article className="role-brief__craft-help" aria-labelledby={`${idPrefix}-title`}>
      <h3 id={`${idPrefix}-title`}>{help.name}</h3>
      <dl>
        <div>
          <dt>Printed owner</dt>
          <dd>{help.owner}</dd>
        </div>
        {help.fuelRules && (
          <div>
            <dt>Fuel rules</dt>
            <dd>
              <ul>
                {help.fuelRules.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
            </dd>
          </div>
        )}
        {help.cargoRule && (
          <div>
            <dt>Cargo</dt>
            <dd>{help.cargoRule}</dd>
          </div>
        )}
      </dl>

      <section aria-labelledby={`${idPrefix}-phases`}>
        <h4 id={`${idPrefix}-phases`}>Phase rules</h4>
        <ul>
          {help.phaseRules.map((phase) => <li key={phase}>{phase}</li>)}
        </ul>
      </section>

      {help.combatRules && (
        <section aria-labelledby={`${idPrefix}-combat`}>
          <h4 id={`${idPrefix}-combat`}>Combat rules</h4>
          <ul>
            {help.combatRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </section>
      )}

      {help.missionRules && (
        <section aria-labelledby={`${idPrefix}-mission`}>
          <h4 id={`${idPrefix}-mission`}>Mission rules</h4>
          <ul>
            {help.missionRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${idPrefix}-actions`}>
        <h4 id={`${idPrefix}-actions`}>Action rules</h4>
        <ul>
          {help.actionRules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </section>
    </article>
  );
}

/** The authenticated player's role brief and common rules projection. */
export default function RoleBrief() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const brief = useSessionStore((state) => state.roleBrief);
  const privateLoyalty = useSessionStore((state) => state.privateLoyalty);
  const arbourVision = useSessionStore((state) => state.arbourVision);
  const facilitatorRuleCall = useSessionStore((state) => state.facilitatorRuleCall);
  const [dismissedCallKey, setDismissedCallKey] = useState<string | null>(null);
  const callReviewRef = useRef<HTMLButtonElement | null>(null);

  const entitledArbourVision = session && me?.role === 'player' &&
    privateLoyalty?.kind === 'universal-arbour' && arbourVision?.sessionId === session.id &&
    arbourVision.recipientUid === me.uid ? arbourVision : null;
  const entitledRuleCall = session && me?.role === 'player' && facilitatorRuleCall?.sessionId === session.id &&
    facilitatorRuleCall.audience === 'selected-player' && facilitatorRuleCall.recipientUid === me.uid
    ? facilitatorRuleCall : null;
  const callKey = entitledArbourVision || entitledRuleCall
    ? `${session?.id}:${me?.uid}:` + [
      entitledArbourVision ? `arbour:${entitledArbourVision.revision}` : '',
      entitledRuleCall ? `rule:${entitledRuleCall.callId}:${entitledRuleCall.revision}` : '',
    ].join('|')
    : null;
  const endgameEvaluation = session && ['success', 'failure', 'debrief', 'closed'].includes(session.phase);
  const callReviewAvailable = callKey !== null && !endgameEvaluation;
  const callOpen = callReviewAvailable && dismissedCallKey !== callKey;

  if (
    !session || !me || !brief ||
    me.role !== 'player' ||
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

        {callReviewAvailable && (
          <button
            ref={callReviewRef}
            className="cic-text-button role-brief__review-call"
            type="button"
            onClick={() => setDismissedCallKey(null)}
          >
            Review facilitator call
          </button>
        )}

        {brief.voyage33Motivation && (
          <section className="role-brief__rules" aria-labelledby="voyage-33-motivation-title">
            <p className="eyebrow">Private arrival priority</p>
            <h2 id="voyage-33-motivation-title">Voyage 33-0 support</h2>
            <p>{brief.voyage33Motivation}</p>
          </section>
        )}

        {entitledArbourVision && (
          <section className="role-brief__rules role-brief__rules--arbour-vision" aria-labelledby="arbour-vision-title">
            <p className="eyebrow">{entitledArbourVision.label}</p>
            <h2 id="arbour-vision-title">Universal Arbour vision // {entitledArbourVision.kind}</h2>
            <p>{entitledArbourVision.text}</p>
          </section>
        )}

        {entitledRuleCall && (
          <section className="role-brief__rules role-brief__rules--facilitator-call" aria-labelledby="facilitator-rule-call-title">
            <p className="eyebrow">{entitledRuleCall.label}</p>
            <h2 id="facilitator-rule-call-title">Facilitator rule call</h2>
            <dl>
              <div><dt>Question</dt><dd>{entitledRuleCall.ambiguity}</dd></div>
              <div><dt>Source</dt><dd>{entitledRuleCall.source}</dd></div>
              <div><dt>Decision</dt><dd>{entitledRuleCall.decision}</dd></div>
            </dl>
            <DecisionAttribution
              source={entitledRuleCall.source}
              actorVisibility="withheld"
              recordedAt={entitledRuleCall.createdAt}
            />
          </section>
        )}

        {(brief.ownedCraftIds?.length ?? 0) > 0 && (
          <section className="role-brief__rules" aria-labelledby="role-brief-craft-title">
            <h2 id="role-brief-craft-title">Role-owned craft</h2>
            <ul>
              {brief.ownedCraftIds?.map((craftId) => {
                const help = craftHelpFor(craftId);
                return (
                  <li key={craftId}>
                    {help ? <CraftHelpPanel help={help} /> : CRAFT_NAMES.get(craftId) ?? craftId}
                  </li>
                );
              })}
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
      <FocusDialog
        open={callOpen}
        title="Facilitator call"
        description="New guidance for the role assignment on this current player identity."
        dialogKey={callKey}
        restoreRef={callReviewRef}
        onClose={() => setDismissedCallKey(callKey)}
      >
        {entitledArbourVision && (
          <section>
            <h3>{entitledArbourVision.label} // Arbour guidance</h3>
            <p>{entitledArbourVision.text}</p>
          </section>
        )}
        {entitledRuleCall && (
          <section>
            <h3>{entitledRuleCall.label}</h3>
            <p>Question // {entitledRuleCall.ambiguity}</p>
            <p>Source // {entitledRuleCall.source}</p>
            <p>Decision // {entitledRuleCall.decision}</p>
            <DecisionAttribution
              source={entitledRuleCall.source}
              actorVisibility="withheld"
              recordedAt={entitledRuleCall.createdAt}
            />
          </section>
        )}
      </FocusDialog>
    </main>
  );
}
