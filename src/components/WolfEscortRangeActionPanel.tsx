import { useCallback } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
import { commitWolfEscortRangeActionChoice, getWolfEscortRangeActionChoice,
  type WolfEscortRange, type WolfEscortSourceId, type WolfEscortChoiceView } from '@/lib/wolfEscortRangeService';
import { WolfFighterRangeActionPanelView } from './WolfFighterRangeActionPanel';
import { DioneMaliadesRangeActionPanelView } from './DioneMaliadesRangeActions';

export default function WolfEscortRangeActionPanel({ sourceId, range }: Readonly<{
  sourceId: WolfEscortSourceId; range: WolfEscortRange;
}>) {
  const me = useSessionStore((state) => state.me);
  const control = useSessionStore((state) => state.session?.shuttleControl?.maliades);
  const roleId = sourceId === 'maliades' ? 'dione-engineer' : 'refinery-124-pdf-colonel';
  const ownsRole = me?.role === 'player' && me.activeConsoleRoleId === roleId &&
    (me.assignedRoleId === roleId || me.seatId === roleId) &&
    (sourceId !== 'maliades' || control?.holderUid === me.uid);
  const authority = useWolfAttackChoiceAuthority('ship-crew', undefined, ownsRole);
  const read = useCallback(() => getWolfEscortRangeActionChoice(range, sourceId), [range, sourceId]);
  const expectedStep = useCallback((member: WolfAttackMemberView) => member.currentStep === range, [range]);
  const readMatches = useCallback((value: WolfEscortChoiceView, member: WolfAttackMemberView) =>
    value.sessionId === member.sessionId && value.attackId === member.attackId && value.turn === member.turn &&
    value.revision === member.revision && value.range === range &&
    (sourceId === 'maliades' ? value.type === 'dione-maliades-range-action-view' : 'wingId' in value && value.wingId === sourceId), [range, sourceId]);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority, actor: 'ship-crew', read,
    expectedStep, readMatches,
    readFailureMessage: 'Could not refresh the current escort range choice.',
    mutationFailureMessage: 'The escort choice could not be committed. Refresh before retrying.',
  });
  if (!ownsRole || !authority.sessionId || !authority.actorReady) return null;
  const label = sourceId === 'maliades' ? 'Maliades' : 'P.D.F. Escort Fighter Wing';
  if (!authority.ready) return <section className="cic-frame" aria-label={`${label} range actions`}>
    <p role="status">Waiting for a live owner session before showing {label} actions.</p>
  </section>;
  if (!memberView || memberView.currentStep !== range) return null;
  if (!view) return <section className="cic-frame" aria-label={`${label} range actions`}>
    <p role="status">{error ?? `Checking the current ${label} range…`}</p>
    <button type="button" className="cic-action-button" disabled={busy} onClick={refresh}>Refresh escort choice</button>
  </section>;
  const displayMessage = error ?? message;
  if ('damage' in view) return <DioneMaliadesRangeActionPanelView view={view} writable={authority.ready} busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onResolveMedium={(choices) => runMutation(() => commitWolfEscortRangeActionChoice(view, sourceId, choices), 'Maliades Medium choices committed.')}
    onResolveShort={(targets) => runMutation(() => commitWolfEscortRangeActionChoice(view, sourceId, targets), 'Maliades Short choices committed.')} />;
  return <WolfFighterRangeActionPanelView view={view} busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onResolveMedium={(choices) => runMutation(() => commitWolfEscortRangeActionChoice(view, sourceId, choices), 'PDF Medium choices committed.')}
    onResolveShort={(indexes) => runMutation(() => commitWolfEscortRangeActionChoice(view, sourceId, indexes), 'PDF Short choices committed.')} />;
}
