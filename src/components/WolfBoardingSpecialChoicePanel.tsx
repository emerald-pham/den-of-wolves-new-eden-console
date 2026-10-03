import type { ReactNode } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import {
  commitWolfBoardingSpecialChoice,
  getWolfBoardingSpecialChoice,
} from '@/lib/sessionService';
import {
  WolfBoardingCommanderChoicePanelView,
  WolfBoardingCommanderRulingPanelView,
  WolfBoardingMilitiaChoicePanelView,
  WolfBoardingRerollChoicePanelView,
  WolfBoardingSupportChoicePanelView,
} from './WolfBoardingChoicePanels';
import type { WolfAttackMemberView, WolfBoardingSpecialChoiceReadResult } from '@/types/game';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
import './WolfBoardingDefencePanel.css';

export default function WolfBoardingSpecialChoicePanel({
  facilitator = false,
  sessionId: suppliedSessionId,
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{
  facilitator?: boolean;
  sessionId?: string;
  subscribe?: typeof subscribeWolfAttackMemberView;
}> = {}) {
  const actor = facilitator ? 'facilitator' : 'ship-crew';
  const authority = useWolfAttackChoiceAuthority(actor, suppliedSessionId);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority,
    actor,
    expectedStep: isWolfBoardingStep,
    read: getWolfBoardingSpecialChoice,
    readMatches: boardingSpecialReadMatches,
    subscribe,
    readFailureMessage: 'Could not refresh the current boarding decision.',
    mutationFailureMessage: 'The boarding choice could not be committed. Refresh before retrying.',
  });
  if (!authority.sessionId || !authority.actorReady) return null;
  if (!authority.ready) {
    return <section className="wolf-boarding-defence cic-frame" aria-label="Boarding decision">
      <p className="wolf-boarding-defence__notice" role="status">Waiting for the live session before showing boarding choices.</p>
    </section>;
  }
  if (!memberView || memberView.currentStep !== 'boarding') return null;
  if (!view) {
    return <section className="wolf-boarding-defence cic-frame" aria-label="Boarding decision">
      <p className="wolf-boarding-defence__notice" role="status">{error ?? 'Checking the current boarding decision…'}</p>
      <button type="button" className="cic-action-button" disabled={busy} onClick={refresh}>
        Refresh boarding decision
      </button>
    </section>;
  }
  if (view.type === 'wolf-boarding-special-choice-unavailable') {
    if (view.reason === 'automatic-progress-pending') {
      return <section className="wolf-boarding-defence cic-frame" aria-label="Boarding decision">
        <p className="wolf-boarding-defence__notice" role="status">The server is locking the committed defence dice. Refresh shortly for the next choice.</p>
      </section>;
    }
    return null;
  }

  const revisionKey = `${view.sessionId}:${view.turn}:${view.revision}:${view.choice.kind}`;
  const displayMessage = error ?? message;
  const choose = (choice: Parameters<typeof commitWolfBoardingSpecialChoice>[2], success: string) =>
    runMutation(() => commitWolfBoardingSpecialChoice(view.turn, view.revision, choice), success);
  const statusProps = displayMessage ? { message: displayMessage } : {};
  let content: ReactNode;
  switch (view.choice.kind) {
    case 'commander': {
      const choice = view.choice;
      content = <WolfBoardingCommanderChoicePanelView key={revisionKey}
        view={{ type: 'wolf-boarding-commander-choice-view', status: 'pending', targets: choice.targets }}
        onChoose={(targetShipId) => choose({ kind: 'commander', targetShipId },
          'Commander choice recorded. Boarding defence now continues in order.')}
        busy={busy} />;
      break;
    }
    case 'relocation': {
      const choice = view.choice;
      content = <WolfBoardingSupportChoicePanelView key={revisionKey}
        view={{ type: 'wolf-boarding-support-choice-view', status: 'pending', craftId: choice.craftId,
          currentHostId: choice.currentHostId, fuelled: choice.fuelled, legalHostIds: choice.legalHostIds }}
        onChoose={(targetShipId) => choose({ kind: 'relocation', craftId: choice.craftId,
          targetShipId, expectedControlRevision: choice.controlRevision },
        `${choice.craftId === 'pallas' ? 'Pallas' : 'Chepu'} relocation recorded.`)}
        busy={busy} />;
      break;
    }
    case 'militia': {
      const choice = view.choice;
      content = <WolfBoardingMilitiaChoicePanelView key={revisionKey}
        view={{ type: 'wolf-boarding-militia-choice-view', status: 'pending',
          targetShipId: choice.targetShipId, boardingParties: choice.boardingParties,
          availableSecurityTeams: choice.availableSecurityTeams, selectedSecurityTeams: choice.selectedSecurityTeams,
          maxFrontLineDice: choice.maxFrontLineDice, doubleDiceAvailable: choice.doubleDiceAvailable }}
        onChoose={(militiaChoice) => choose({ kind: 'militia', targetShipId: choice.targetShipId, ...militiaChoice },
          'Militia risk recorded. The server will use this choice with the locked defence dice.')}
        busy={busy} />;
      break;
    }
    case 'reroll': {
      const choice = view.choice;
      content = <WolfBoardingRerollChoicePanelView key={revisionKey}
        view={{ type: 'wolf-boarding-reroll-choice-view', source: choice.source, status: 'pending',
          dice: choice.dice, alreadyRerolled: choice.alreadyRerolled, maxRerolls: choice.maxRerolls }}
        onChoose={(dice) => choose({ kind: 'reroll', source: choice.source, targetShipId: choice.targetShipId,
          dieIndexes: dice.map(({ dieIndex }) => dieIndex) },
        `${choice.source === 'aegis' ? 'AEGIS' : 'Pallas'} reroll choice recorded.`)}
        busy={busy} />;
      break;
    }
    case 'commander-ruling': {
      const choice = view.choice;
      content = <WolfBoardingCommanderRulingPanelView key={revisionKey}
        view={{ type: 'wolf-boarding-commander-ruling-view', status: 'pending',
          targetShipId: choice.targetShipId, condition: choice.condition }}
        onChoose={(rulingText) => choose({ kind: 'commander-ruling', targetShipId: choice.targetShipId, rulingText },
          'Facilitator ruling recorded.')}
        busy={busy} />;
      break;
    }
  }

  return <section className="wolf-boarding-defence cic-frame" aria-label="Current boarding special choice">
    <p className="eyebrow">Cycle {view.turn} // boarding</p>
    {content}
    {statusProps.message && <p className="wolf-boarding-defence__message" role="status">{statusProps.message}</p>}
  </section>;
}

function isWolfBoardingStep(member: WolfAttackMemberView): boolean {
  return member.currentStep === 'boarding';
}

function boardingSpecialReadMatches(value: WolfBoardingSpecialChoiceReadResult, member: WolfAttackMemberView): boolean {
  if (value.type === 'wolf-boarding-special-choice-unavailable') return value.sessionId === member.sessionId;
  return value.sessionId === member.sessionId && value.turn === member.turn &&
    value.revision === member.revision && member.currentStep === 'boarding';
}
