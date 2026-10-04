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
type WolfRangeActionOption = WolfRangeActionChoiceView['eligibleActions'][number];
type WolfWingCommanderTargetAction = WolfRangeActionOption & Readonly<{
  range: 'medium-range';
  sourceId: 'aegis-alpha-wing' | 'aegis-bravo-wing';
}>;

function actionLabel(sourceId: string): string {
  if (sourceId === 'aegis-missile-launchers') return 'Missile launchers';
  if (sourceId === 'aegis-point-defence-lasers') return 'Point-defence lasers';
  if (sourceId === 'aegis-alpha-wing') return 'Alpha Fighter Wing';
  if (sourceId === 'aegis-bravo-wing') return 'Bravo Fighter Wing';
  if (sourceId === 'highwall') return 'Highwall Cannon';
  if (sourceId === 'gorgoneion-missile-array') return 'Gorgoneion Missile Array';
  if (sourceId === 'boa') return 'Boa Scrap Strike';
  if (sourceId === 'pdf-escort-wing') return 'PDF Escort Wing';
  if (sourceId === 'maliades') return 'Maliades';
  return sourceId.replaceAll('-', ' ');
}

function hasWingCommanderTarget(
  action: WolfRangeActionOption | undefined,
): action is WolfWingCommanderTargetAction {
  return action?.range === 'medium-range' &&
    (action.sourceId === 'aegis-alpha-wing' || action.sourceId === 'aegis-bravo-wing');
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
    view.hitSlots.map(({ actionId, count, damagePerHit }) => [actionId, count, damagePerHit]),
    view.contacts.map(({ contactId, targetShipId, available, requiredCoverageDamage }) =>
      [contactId, targetShipId, available, requiredCoverageDamage]),
  ]);
  useEffect(() => {
    setSelectedActions([]);
    setAssignmentsByAction({});
  }, [draftKey]);
  const availableContacts = useMemo(() => view.contacts.filter(({ available }) => available), [view.contacts]);
  const wingCommanderTargetIds = useMemo(() => new Set(view.eligibleActions
    .filter(hasWingCommanderTarget).map(({ actionId }) => actionId)), [view.eligibleActions]);
  const locked = view.choiceStatus !== 'pending';
  const needsTargets = view.choiceStatus === 'targets-required';
  const assignmentState = useMemo(() => {
    const assignableSlots = view.hitSlots.filter(({ actionId }) => !wingCommanderTargetIds.has(actionId));
    const assignments: RangeAssignment[] = assignableSlots.map(({ actionId, count }) => {
      const contactIds = assignmentsByAction[actionId] ?? [];
      const targetable = Math.min(count, availableContacts.length);
      return { actionId, contactIds: contactIds.slice(0, targetable) };
    });
    const complete = assignments.every(({ actionId, contactIds }) => {
      const slot = assignableSlots.find(({ actionId: slotId }) => slotId === actionId);
      return !!slot && contactIds.length === Math.min(slot.count, availableContacts.length) &&
        new Set(contactIds).size === contactIds.length;
    });
    const unused = assignableSlots.reduce((total, { count }) => total + Math.max(0, count - availableContacts.length), 0);
    const contactById = new Map(view.contacts.map((contact) => [contact.contactId, contact]));
    const plannedWingDamage = new Map<string, number>();
    for (const { actionId, contactIds } of assignments) {
      const slot = assignableSlots.find((candidate) => candidate.actionId === actionId);
      if (!slot || typeof slot.damagePerHit !== 'number' || slot.damagePerHit < 1) continue;
      for (const contactId of contactIds) {
        const contact = contactById.get(contactId);
        if (contact && typeof contact.requiredCoverageDamage === 'number' && contact.requiredCoverageDamage > 0) {
          plannedWingDamage.set(contactId, (plannedWingDamage.get(contactId) ?? 0) + slot.damagePerHit);
        }
      }
    }
    const hasNonWingAssignment = assignments.some(({ contactIds }) => contactIds.some((contactId) =>
      contactById.get(contactId)?.requiredCoverageDamage === null));
    const uncoveredWing = availableContacts.some(({ contactId, requiredCoverageDamage }) =>
      typeof requiredCoverageDamage === 'number' && requiredCoverageDamage > (plannedWingDamage.get(contactId) ?? 0));
    return { assignments, complete: complete && !(hasNonWingAssignment && uncoveredWing), unused, uncoveredWing };
  }, [assignmentsByAction, availableContacts, view.contacts, view.hitSlots, wingCommanderTargetIds]);

  if (view.choiceStatus === 'committed') {
    return (
      <section className="wolf-range-action cic-frame" aria-label="Wolf range assignments">
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
    <section className="wolf-range-action cic-frame" aria-label="Wolf range actions">
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
              <legend>Available range actions</legend>
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
            <p className="wolf-range-action__notice">No charged range actions are available. You can still pass this range.</p>
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
          {view.range === 'short-range' && view.contacts.some(({ requiredCoverageDamage }) => requiredCoverageDamage !== undefined) && (
            <div className="wolf-range-action__coverage" role="status" aria-label="Short Range fighter coverage">
              {view.contacts.filter(({ available, requiredCoverageDamage }) => available &&
                typeof requiredCoverageDamage === 'number' && requiredCoverageDamage > 0).map((contact) => (
                <p key={contact.contactId}>Cover first — {contact.requiredCoverageDamage} damage remains on {contact.contactId}.</p>
              ))}
              {view.contacts.filter(({ available, requiredCoverageDamage }) => available && requiredCoverageDamage === 0).map((contact) => (
                <p key={contact.contactId}>{contact.contactId} — Fighter Wing already covered.</p>
              ))}
              {view.contacts.some(({ available, requiredCoverageDamage }) => available && requiredCoverageDamage === null) && (
                <p>Other ships are available after all fighter wings are covered.</p>
              )}
            </div>
          )}
          <div className="wolf-range-action__target-list">
            {view.hitSlots.map((slot) => {
              const action = view.eligibleActions.find(({ actionId }) => actionId === slot.actionId);
              if (hasWingCommanderTarget(action)) {
                return (
                  <fieldset key={slot.actionId} className="wolf-range-action__target-group" disabled={busy}>
                    <legend>{actionLabel(action.sourceId)} // {slot.count} hits</legend>
                    <p className="wolf-range-action__notice" role="status">
                      {slot.count > 0
                        ? 'Target set by the Wing Commander. This fighter hit is assigned automatically.'
                        : 'This fighter action generated no hits.'}
                    </p>
                  </fieldset>
                );
              }
              const targetable = Math.min(slot.count, availableContacts.length);
              const selected = assignmentsByAction[slot.actionId] ?? [];
              const shortfall = Math.max(0, slot.count - targetable);
              return (
                <fieldset key={slot.actionId} className="wolf-range-action__target-group" disabled={busy}>
                  <legend>{action ? actionLabel(action.sourceId) : 'AEGIS action'} // {slot.count} hits</legend>
                  {slot.count > 0 && typeof slot.damagePerHit === 'number' && <p className="wolf-range-action__notice">
                    {action ? actionLabel(action.sourceId) : 'This action'} deals {slot.damagePerHit} damage per hit.
                  </p>}
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
          {assignmentState.uncoveredWing && (
            <p className="wolf-range-action__unused" role="status">
              Assign enough damage to every uncovered Fighter Wing before choosing another ship.
            </p>
          )}
          <button type="button" className="cic-action-button" disabled={busy || !assignmentState.complete}
            onClick={() => onAssignTargets(assignmentState.assignments)}>
            Commit target assignments
          </button>
          <p className="wolf-range-action__hint">{assignmentState.unused > 0 ? `${assignmentState.unused} hit(s) will be recorded unused.`
            : assignmentState.assignments.length === 0 ? 'The Wing Commander targets are already committed.'
              : 'Choose different contacts for each hit from the same action.'}</p>
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
