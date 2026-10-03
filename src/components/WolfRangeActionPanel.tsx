import { useEffect, useMemo, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import {
  assignWolfRangeTargets,
  commitWolfRangeActionChoice,
  getWolfRangeActionChoice,
} from '@/lib/sessionService';
import type {
  WolfAttackMemberView,
  WolfRangeActionChoiceReadResult,
  WolfRangeActionChoiceView,
} from '@/types/game';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
import './WolfRangeActionPanel.css';

type RangeAssignment = Readonly<{ actionId: string; contactIds: readonly string[] }>;

function actionLabel(sourceId: string): string {
  if (sourceId === 'aegis-missile-launchers') return 'Missile launchers';
  if (sourceId === 'aegis-point-defence-lasers') return 'Point-defence lasers';
  if (sourceId === 'aegis-alpha-wing') return 'Alpha Fighter Wing';
  if (sourceId === 'aegis-bravo-wing') return 'Bravo Fighter Wing';
  return sourceId.replaceAll('-', ' ');
}

function shipLabel(shipId: string): string {
  return shipId.replaceAll('-', ' ').toUpperCase();
}

export function WolfRangeActionPanelView({
  view,
  onUseActions,
  onPass,
  onAssignTargets,
  busy = false,
  message,
}: Readonly<{
  view: WolfRangeActionChoiceView;
  onUseActions: (actionIds: readonly string[]) => void;
  onPass: () => void;
  onAssignTargets: (assignments: readonly RangeAssignment[]) => void;
  busy?: boolean;
  message?: string;
}>) {
  const [selectedActions, setSelectedActions] = useState<readonly string[]>([]);
  const [assignmentsByAction, setAssignmentsByAction] = useState<Readonly<Record<string, readonly string[]>>>({});
  const draftKey = JSON.stringify([
    view.sessionId, view.turn, view.revision, view.currentStep, view.range, view.choiceStatus,
    view.eligibleActions.map(({ actionId, sourceId, range }) => [actionId, sourceId, range]),
    view.hitSlots.map(({ actionId, count }) => [actionId, count]),
    view.contacts.map(({ contactId, targetShipId, available }) => [contactId, targetShipId, available]),
  ]);
  useEffect(() => {
    setSelectedActions([]);
    setAssignmentsByAction({});
  }, [draftKey]);
  const availableContacts = useMemo(() => view.contacts.filter(({ available }) => available), [view.contacts]);
  const locked = view.choiceStatus !== 'pending';
  const needsTargets = view.choiceStatus === 'targets-required';
  const assignmentState = useMemo(() => {
    const assignments: RangeAssignment[] = view.hitSlots.map(({ actionId, count }) => {
      const contactIds = assignmentsByAction[actionId] ?? [];
      const targetable = Math.min(count, availableContacts.length);
      return { actionId, contactIds: contactIds.slice(0, targetable) };
    });
    const complete = assignments.every(({ actionId, contactIds }) => {
      const slot = view.hitSlots.find(({ actionId: slotId }) => slotId === actionId);
      return !!slot && contactIds.length === Math.min(slot.count, availableContacts.length) &&
        new Set(contactIds).size === contactIds.length;
    });
    const unused = view.hitSlots.reduce((total, { count }) => total + Math.max(0, count - availableContacts.length), 0);
    return { assignments, complete, unused };
  }, [assignmentsByAction, availableContacts.length, view.hitSlots]);

  if (view.choiceStatus === 'committed') {
    return (
      <section className="wolf-range-action cic-frame" aria-label="AEGIS range weapons">
        <header className="wolf-range-action__header">
          <div><p className="eyebrow">Cycle {view.turn} // weapon control</p><h2>{view.range.replace('-range', ' range')}</h2></div>
          <span className="wolf-range-action__status">Committed</span>
        </header>
        <p className="wolf-range-action__notice" role="status">This range decision is committed. The next attack step is server controlled.</p>
        {message && <p className="wolf-range-action__message" role="status">{message}</p>}
      </section>
    );
  }

  return (
    <section className="wolf-range-action cic-frame" aria-label="AEGIS range weapons">
      <header className="wolf-range-action__header">
        <div><p className="eyebrow">Cycle {view.turn} // weapon control</p><h2>{view.range.replace('-range', ' range')}</h2></div>
        <span className="wolf-range-action__status">{needsTargets ? 'Target assignment' : 'Choice required'}</span>
      </header>
      <p className="wolf-range-action__deadline">
        Attack deadline <time dateTime={view.deadlineAt}>{view.deadlineAt}</time>
      </p>
      {!locked ? (
        <>
          {view.eligibleActions.length > 0 ? (
            <fieldset className="wolf-range-action__choices" disabled={busy}>
              <legend>Charged AEGIS actions</legend>
              {view.eligibleActions.map((action) => (
                <label key={action.actionId} className="wolf-range-action__choice">
                  <input
                    type="checkbox"
                    checked={selectedActions.includes(action.actionId)}
                    onChange={(event) => setSelectedActions((previous) => event.target.checked
                      ? [...previous, action.actionId]
                      : previous.filter((id) => id !== action.actionId))}
                  />
                  <span>{actionLabel(action.sourceId)}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="wolf-range-action__notice">No charged, undamaged PC07 weapon action is available in this range.</p>
          )}
          <p className="wolf-range-action__notice">No automatic pass is applied at the deadline. Reconnect to make the current choice.</p>
          <div className="wolf-range-action__buttons">
            <button type="button" className="cic-action-button" disabled={busy || selectedActions.length === 0}
              onClick={() => onUseActions(selectedActions)}>
              Use selected actions
            </button>
            <button type="button" className="cic-action-button" disabled={busy} onClick={onPass}>
              Pass this range
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="wolf-range-action__notice">Dice are already locked by the server. Targets never cause another roll.</p>
          <div className="wolf-range-action__target-list">
            {view.hitSlots.map((slot) => {
              const action = view.eligibleActions.find(({ actionId }) => actionId === slot.actionId);
              const targetable = Math.min(slot.count, availableContacts.length);
              const selected = assignmentsByAction[slot.actionId] ?? [];
              const shortfall = Math.max(0, slot.count - targetable);
              return (
                <fieldset key={slot.actionId} className="wolf-range-action__target-group" disabled={busy}>
                  <legend>{action ? actionLabel(action.sourceId) : 'AEGIS action'} // {slot.count} hits</legend>
                  {Array.from({ length: targetable }, (_, index) => (
                    <label key={`${slot.actionId}-${index}`} className="wolf-range-action__target-choice">
                      <span>{action ? actionLabel(action.sourceId) : 'AEGIS action'} hit {index + 1}</span>
                      <select
                        aria-label={`${action ? actionLabel(action.sourceId) : 'AEGIS action'} hit ${index + 1}`}
                        value={selected[index] ?? ''}
                        onChange={(event) => setAssignmentsByAction((previous) => {
                          const next = [...(previous[slot.actionId] ?? [])];
                          next[index] = event.target.value;
                          return { ...previous, [slot.actionId]: next };
                        })}
                      >
                        <option value="">Choose a live contact</option>
                        {availableContacts.map((contact) => (
                          <option key={contact.contactId} value={contact.contactId}>
                            {contact.contactId} — {shipLabel(contact.targetShipId)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {slot.count === 0 && <p className="wolf-range-action__notice">No hits were generated by this action.</p>}
                  {shortfall > 0 && (
                    <p className="wolf-range-action__unused" role="status">
                      {shortfall} {shortfall === 1 ? 'hit has' : 'hits have'} no additional distinct live legal contact and will be recorded unused.
                    </p>
                  )}
                </fieldset>
              );
            })}
          </div>
          {availableContacts.length === 0 && view.hitSlots.some(({ count }) => count > 0) && (
            <p className="wolf-range-action__unused" role="status">
              No live legal contacts remain; successful hits will be recorded unused. No target or damage is fabricated.
            </p>
          )}
          <button type="button" className="cic-action-button" disabled={busy || !assignmentState.complete}
            onClick={() => onAssignTargets(assignmentState.assignments)}>
            Commit target assignments
          </button>
          <p className="wolf-range-action__hint">{assignmentState.unused > 0 ? `${assignmentState.unused} hit(s) will be recorded unused.` : 'Choose different contacts for each hit from the same action.'}</p>
        </>
      )}
      {message && <p className="wolf-range-action__message" role="status">{message}</p>}
    </section>
  );
}

export default function WolfRangeActionPanel({
  sessionId: suppliedSessionId,
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{
  sessionId?: string;
  subscribe?: typeof subscribeWolfAttackMemberView;
}> = {}) {
  const authority = useWolfAttackChoiceAuthority('executive-officer', suppliedSessionId);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority,
    actor: 'executive-officer',
    expectedStep: isWolfRangeMemberStep,
    read: getWolfRangeActionChoice,
    readMatches: rangeReadMatches,
    subscribe,
    readFailureMessage: 'Could not refresh this AEGIS range decision.',
    mutationFailureMessage: 'The choice could not be committed. Refresh before retrying.',
  });
  const sessionId = authority.sessionId;

  if (!sessionId || !authority.actorReady) return null;
  if (!authority.ready) {
    return <section className="wolf-range-action cic-frame" aria-label="AEGIS range weapons">
      <p className="wolf-range-action__notice" role="status">Waiting for the live server session before showing AEGIS choices.</p>
    </section>;
  }
  if (!memberView || !isWolfRangeMemberStep(memberView)) return null;
  if (!view) {
    return <section className="wolf-range-action cic-frame" aria-label="AEGIS range weapons">
      <p className="wolf-range-action__notice" role="status">{error ?? 'Checking the current server attack step…'}</p>
      <button type="button" className="cic-action-button" disabled={busy} onClick={refresh}>Refresh attack choice</button>
    </section>;
  }
  if (view.type === 'wolf-range-action-choice-unavailable') {
    return view.reason === 'waiting' ? null : <section className="wolf-range-action cic-frame" aria-label="AEGIS range weapons">
      <p className="wolf-range-action__notice" role="status">{error ?? 'No weapon choice is open. The next step follows the server attack record.'}</p>
      <button type="button" className="cic-action-button" disabled={busy} onClick={refresh}>Refresh attack choice</button>
    </section>;
  }

  const displayMessage = error ?? message;
  return <WolfRangeActionPanelView
    view={view}
    busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onUseActions={(actionIds) => runMutation(
      () => commitWolfRangeActionChoice(view.turn, view.revision, view.range, actionIds),
      'Choice committed to the server. Reconnecting will restore the current step.',
    )}
    onPass={() => runMutation(
      () => commitWolfRangeActionChoice(view.turn, view.revision, view.range, []),
      'Choice committed to the server. Reconnecting will restore the current step.',
    )}
    onAssignTargets={(assignments) => runMutation(
      () => assignWolfRangeTargets(view.turn, view.revision, view.range, assignments),
      'Choice committed to the server. Reconnecting will restore the current step.',
    )}
  />;
}

function isWolfRangeMemberStep(member: WolfAttackMemberView): boolean {
  return member.currentStep === 'long-range' || member.currentStep === 'medium-range' ||
    member.currentStep === 'short-range';
}

function rangeReadMatches(value: WolfRangeActionChoiceReadResult, member: WolfAttackMemberView): boolean {
  if (value.type === 'wolf-range-action-choice-unavailable') return value.sessionId === member.sessionId;
  return value.sessionId === member.sessionId && value.turn === member.turn &&
    value.revision === member.revision && value.currentStep === member.currentStep &&
    value.range === member.currentStep && isWolfRangeMemberStep(member);
}
