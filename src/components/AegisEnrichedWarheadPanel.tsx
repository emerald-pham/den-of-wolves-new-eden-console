import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitAegisEnrichedWarheadChoice, getAegisEnrichedWarheadChoice } from '@/lib/sessionService';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
import type { AegisEnrichedWarheadView } from '@/types/game';

export function AegisEnrichedWarheadPanelView({ view, onChoose, onRefresh, busy = false, message }: Readonly<{
  view: AegisEnrichedWarheadView;
  onChoose: (choice: 'enrich' | 'pass') => void;
  onRefresh?: () => void;
  busy?: boolean;
  message?: string;
}>) {
  const status = view.choiceStatus === 'enriched' ? 'Five ore paid once // enriched for this whole attack.'
    : view.choiceStatus === 'passed' ? 'Enriched warheads passed // no ore spent.'
      : view.choiceStatus === 'unavailable' ? 'Unavailable // choose at attack start with five ore and charged, undamaged missile launchers.'
        : 'Choose enriched warheads or pass before Long Range begins.';
  return <section className="aegis-cnc-panel cic-frame" aria-labelledby="aegis-enriched-warheads-title">
    <header className="aegis-cnc-panel__header"><div><p>Wolf attack // AEGIS defense</p>
      <h3 id="aegis-enriched-warheads-title">Enriched warheads</h3></div><span>Cycle {view.turn} // Rev {view.revision}</span></header>
    <p className="aegis-cnc-panel__guidance">Spend five ore once at attack start: Long Range missiles deal one extra damage; Medium Range missiles hit on 4+ for this whole attack.</p>
    <div className="aegis-cnc-panel__actions">
      {view.eligible && <><button className="cic-action-button cic-action-button--confirm" type="button" disabled={busy}
        onClick={() => onChoose('enrich')}>Enrich warheads // 5 ore</button>
      <button className="cic-action-button" type="button" disabled={busy} onClick={() => onChoose('pass')}>Pass enriched warheads</button></>}
      {onRefresh && <button className="cic-text-button" type="button" disabled={busy} onClick={onRefresh}>Refresh enriched warheads</button>}
    </div><p className="aegis-cnc-panel__status" role="status">{message ?? status}</p>
  </section>;
}

export default function AegisEnrichedWarheadPanel({ consoleLocked = false }: Readonly<{ consoleLocked?: boolean }> = {}) {
  const authority = useWolfAttackChoiceAuthority('executive-officer', undefined, !consoleLocked);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority, actor: 'executive-officer', expectedStep: member => member.currentStep === 'targeting',
    read: getAegisEnrichedWarheadChoice,
    readMatches: (value, member) => value.sessionId === member.sessionId && value.attackId === member.attackId &&
      value.turn === member.turn && value.revision === member.revision && member.currentStep === 'targeting',
    subscribe: subscribeWolfAttackMemberView, readFailureMessage: 'Could not refresh enriched warheads.',
    mutationFailureMessage: 'The warhead choice could not be committed. Refresh before retrying.',
  });
  if (!authority.sessionId || !authority.actorReady) return null;
  if (!authority.ready || consoleLocked) return <section className="aegis-cnc-panel cic-frame" aria-label="Enriched warheads">
    <p role="status">Reconnect to current Executive Officer authority before choosing enriched warheads.</p></section>;
  if (!memberView || memberView.currentStep !== 'targeting') return null;
  if (!view) return <section className="aegis-cnc-panel cic-frame" aria-label="Enriched warheads">
    <p role="status">{error ?? message ?? 'Checking the current enriched warhead choice…'}</p>
    <button className="cic-action-button" type="button" disabled={busy} onClick={refresh}>Refresh enriched warheads</button></section>;
  return <AegisEnrichedWarheadPanelView view={view} busy={busy} onRefresh={refresh}
    {...((error ?? message) ? { message: error ?? message } : {})}
    onChoose={choice => runMutation(() => commitAegisEnrichedWarheadChoice(view.turn, view.revision, choice),
      choice === 'enrich' ? 'Five ore paid once // enriched for this whole attack.' : 'Enriched warheads passed // no ore spent.')} />;
}
