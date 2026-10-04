import { useCallback, useEffect, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitWolfRangeSupportActionChoice, getWolfRangeSupportActionChoice } from '@/lib/sessionService';
import type {
  WolfAttackMemberView,
  WolfRangeSupportActionChoiceView,
  WolfRangeSupportSourceId,
} from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
import './WolfRangeSupportActionPanel.css';

type SupportRange = 'long-range' | 'medium-range' | 'short-range';

function sourceLabel(sourceId: WolfRangeSupportSourceId): string {
  if (sourceId === 'highwall') return 'Highwall Cannon';
  if (sourceId === 'gorgoneion-missile-array') return 'Gorgoneion Missile Array';
  return 'Boa Scrap Strike';
}

function sourceActor(sourceId: WolfRangeSupportSourceId): 'ship-crew' | 'gorgoneion-captain' {
  return sourceId === 'gorgoneion-missile-array' ? 'gorgoneion-captain' : 'ship-crew';
}

function currentSourceActor(
  sourceId: WolfRangeSupportSourceId,
  session: ReturnType<typeof useSessionStore.getState>['session'],
  me: ReturnType<typeof useSessionStore.getState>['me'],
): boolean {
  if (!session || !me || session.phase !== 'active' || me.role !== 'player' ||
      me.sessionId !== session.id || me.replacementStatus != null) return false;
  if (sourceId === 'gorgoneion-missile-array') {
    const ship = session.smallShipStates?.gorgoneion;
    return me.replacementRoleId === 'gorgoneion-captain' &&
      session.activeRoleIds?.includes('gorgoneion-captain') === true &&
      session.activeVesselIds?.includes('gorgoneion') === true &&
      typeof ship?.hostShipId === 'string' &&
      session.playerDiscovery?.fleetGroupVesselIds?.includes(ship.hostShipId) === true;
  }
  const shuttleId = sourceId;
  const roleId = sourceId === 'highwall' ? 'icebreaker-miner' : 'capybara-recycler';
  const control = session.shuttleControl?.[shuttleId];
  const dockings = session.shuttleDockings?.filter(({ shuttleId: id }) => id === shuttleId) ?? [];
  const hostShipId = dockings.length === 1 ? dockings[0]?.shipId : undefined;
  return me.activeConsoleRoleId === roleId && control?.shuttleId === shuttleId &&
    control.ownerRoleId === roleId && control.holderUid === me.uid &&
    session.activeRoleIds?.includes(roleId) === true &&
    session.activeVesselIds?.includes(sourceId === 'highwall' ? 'icebreaker' : 'capybara') === true &&
    typeof hostShipId === 'string' && session.activeVesselIds.includes(hostShipId) &&
    session.playerDiscovery?.fleetGroupVesselIds?.includes(hostShipId) === true &&
    (sourceId !== 'boa' || (session.activeRoleIds.includes('capybara-captain') && session.capybaraEnabled !== false));
}

function expectedMemberStep(member: WolfAttackMemberView, range: SupportRange): boolean {
  return member.currentStep === range;
}

function readMatches(
  view: WolfRangeSupportActionChoiceView,
  member: WolfAttackMemberView,
  range: SupportRange,
  sourceId: WolfRangeSupportSourceId,
): boolean {
  return view.sessionId === member.sessionId && view.turn === member.turn && view.revision === member.revision &&
    view.range === range && view.sourceId === sourceId;
}

function rangeText(range: SupportRange): string {
  return range === 'long-range' ? 'Long Range' : range === 'medium-range' ? 'Medium Range' : 'Short Range';
}

export function WolfRangeSupportActionPanelView({
  view,
  onUse,
  onPass,
  busy = false,
  message,
}: Readonly<{
  view: WolfRangeSupportActionChoiceView;
  onUse: (targetContactId?: string) => void;
  onPass: () => void;
  busy?: boolean;
  message?: string;
}>) {
  const [targetContactId, setTargetContactId] = useState('');
  const draftKey = JSON.stringify([view.sessionId, view.attackId, view.turn, view.revision,
    view.range, view.sourceId, view.choiceStatus, view.actionAvailable,
    view.contacts.map(({ contactId, available }) => [contactId, available])]);
  useEffect(() => setTargetContactId(''), [draftKey]);

  const label = sourceLabel(view.sourceId);
  const locked = view.choiceStatus !== 'pending';
  const boaNeedsTarget = view.sourceId === 'boa' && view.actionAvailable;
  const selectedContactAvailable = view.contacts.some(({ contactId, available }) =>
    contactId === targetContactId && available);
  const useDisabled = busy || !view.eligible || !view.actionAvailable ||
    (boaNeedsTarget && !selectedContactAvailable);

  return (
    <section className="wolf-range-support cic-frame" aria-label={`${label} ${rangeText(view.range)} choice`}>
      <header className="wolf-range-support__header">
        <div><p className="eyebrow">Cycle {view.turn} // fleet support</p><h2>{label}</h2></div>
        <span className="wolf-range-support__status">{locked ? 'Choice committed' : 'Choice required'}</span>
      </header>
      <p className="wolf-range-support__range">{rangeText(view.range)}</p>
      <p className="wolf-range-support__deadline">
        Attack deadline <time dateTime={view.deadlineAt}>{view.deadlineAt}</time>
      </p>
      {view.choiceStatus === 'used' ? (
        <p className="wolf-range-support__notice" role="status">
          {label} action committed. The server will roll and assign its damage with the current range.
        </p>
      ) : view.choiceStatus === 'passed' ? (
        <p className="wolf-range-support__notice" role="status">You passed this range action. No source dice or Scrap were used.</p>
      ) : !view.eligible ? (
        <p className="wolf-range-support__notice" role="status">Only the current assigned source holder can choose this action.</p>
      ) : (
        <>
          <p className="wolf-range-support__notice">{supportRule(view.sourceId, view.range)}</p>
          {!view.actionAvailable && (
            <p className="wolf-range-support__notice" role="status">
              This source has no usable fuel, charge, or Scrap for the current range. You may pass.
            </p>
          )}
          {view.sourceId === 'boa' && view.actionAvailable && (
            <>
              <p className="wolf-range-support__notice">Boa Scrap available // {view.scrapAvailable ?? 0}</p>
              <label className="wolf-range-support__target">
                <span>Target one available contact</span>
                <select aria-label="Boa target" disabled={busy} value={targetContactId}
                  onChange={(event) => setTargetContactId(event.target.value)}>
                  <option value="">Choose a live contact</option>
                  {view.contacts.filter(({ available }) => available).map((contact) => (
                    <option key={contact.contactId} value={contact.contactId}>
                      {contact.contactId} — {contact.targetShipId.replaceAll('-', ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <p className="wolf-range-support__notice">A pass or use is explicit. Disconnects keep an assigned source choice pending.</p>
          <div className="wolf-range-support__buttons">
            <button type="button" className="cic-action-button" disabled={useDisabled}
              onClick={() => onUse(view.sourceId === 'boa' ? targetContactId : undefined)}>
              Use {label}
            </button>
            <button type="button" className="cic-action-button" disabled={busy} onClick={onPass}>
              Pass this range
            </button>
          </div>
        </>
      )}
      {message && <p className="wolf-range-support__message" role="status">{message}</p>}
    </section>
  );
}

function supportRule(sourceId: WolfRangeSupportSourceId, range: SupportRange): string {
  if (sourceId === 'highwall') {
    return range === 'long-range'
      ? 'The Highwall Cannon does not fire at Long Range.'
      : 'Fuelled Highwall fires one die at 5+; each hit deals three damage to one contact.';
  }
  if (sourceId === 'gorgoneion-missile-array') {
    const threshold = range === 'long-range' ? 6 : range === 'medium-range' ? 5 : 4;
    return `Charged Missile Array fires three dice at ${threshold}+; each hit deals 1 damage.`;
  }
  return 'Spend one Scrap for 1 damage to one live contact. A successful use spends Scrap with this choice.';
}

export default function WolfRangeSupportActionPanel({
  sourceId,
  range,
  sessionId: suppliedSessionId,
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{
  sourceId: WolfRangeSupportSourceId;
  range: SupportRange;
  sessionId?: string;
  subscribe?: typeof subscribeWolfAttackMemberView;
}>) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const locallyEntitled = currentSourceActor(sourceId, session, me);
  const actor = sourceActor(sourceId);
  const authority = useWolfAttackChoiceAuthority(actor, suppliedSessionId, locallyEntitled);
  const expectedStep = useCallback((member: WolfAttackMemberView) => expectedMemberStep(member, range), [range]);
  const read = useCallback(() => getWolfRangeSupportActionChoice(range, sourceId), [range, sourceId]);
  const matches = useCallback((view: WolfRangeSupportActionChoiceView, member: WolfAttackMemberView) =>
    readMatches(view, member, range, sourceId), [range, sourceId]);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority, actor, expectedStep, read, readMatches: matches, subscribe,
    readFailureMessage: `Could not refresh the ${sourceLabel(sourceId)} choice.`,
    mutationFailureMessage: 'The source choice could not be committed. Refresh before retrying.',
  });
  const currentSessionId = authority.sessionId;

  if (!currentSessionId || !locallyEntitled || !authority.actorReady) return null;
  if (!authority.ready) return <section className="wolf-range-support cic-frame" aria-label={`${sourceLabel(sourceId)} range choice`}>
    <p className="wolf-range-support__notice" role="status">Waiting for a fresh connected console before showing this source choice.</p>
  </section>;
  if (!memberView || memberView.currentStep !== range) return null;
  if (!view) return <section className="wolf-range-support cic-frame" aria-label={`${sourceLabel(sourceId)} range choice`}>
    <p className="wolf-range-support__notice" role="status">{error ?? 'Checking the current server source choice…'}</p>
    <button type="button" className="cic-action-button" disabled={busy} onClick={refresh}>Refresh source choice</button>
  </section>;

  const displayMessage = error ?? message;
  const choose = (use: boolean, targetContactId?: string) => runMutation(
    () => commitWolfRangeSupportActionChoice(view.turn, view.revision, range, sourceId, use, targetContactId),
    use ? `${sourceLabel(sourceId)} use committed; the server will resolve it with the range.`
      : `${sourceLabel(sourceId)} pass committed.`,
  );
  return <WolfRangeSupportActionPanelView view={view} busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onUse={(targetContactId) => choose(true, targetContactId)} onPass={() => choose(false)} />;
}
