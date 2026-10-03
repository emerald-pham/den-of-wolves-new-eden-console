import { useCallback, useEffect, useMemo, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import {
  assignWolfRangeTargets,
  commitWolfRangeActionChoice,
  getWolfRangeActionChoice,
} from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  WolfRangeActionChoiceReadResult,
  WolfRangeActionChoiceView,
} from '@/types/game';
import './WolfRangeActionPanel.css';

type RangeAssignment = Readonly<{ actionId: string; contactIds: readonly string[] }>;

function actionLabel(sourceId: string): string {
  if (sourceId === 'aegis-missile-launchers') return 'Missile launchers';
  if (sourceId === 'aegis-point-defence-lasers') return 'Point-defence lasers';
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
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const sessionId = suppliedSessionId ?? session?.id;
  const [view, setView] = useState<WolfRangeActionViewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const current = await getWolfRangeActionChoice();
      setView(current);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh this AEGIS range decision.');
    }
  }, [sessionId]);

  useEffect(() => {
    setView(null);
    setMessage(undefined);
    setError(undefined);
    if (!sessionId || me?.role !== 'player' || me.activeConsoleRoleId !== 'executive-officer') return;
    let live = true;
    const update = async () => {
      if (!live) return;
      try {
        const current: WolfRangeActionChoiceReadResult = await getWolfRangeActionChoice();
        if (live) setView(current);
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : 'Could not refresh this AEGIS range decision.');
      }
    };
    const unsubscribe = subscribe(sessionId, () => { void update(); });
    void update();
    return () => { live = false; unsubscribe(); };
  }, [me?.activeConsoleRoleId, me?.role, sessionId, subscribe]);

  const runMutation = useCallback(async (action: () => Promise<unknown>) => {
    if (!view || view.type !== 'wolf-range-action-choice-view' || busy) return;
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await action();
      setMessage('Choice committed to the server. Reconnecting will restore the current step.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The choice could not be committed. Refresh before retrying.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, view]);

  if (!sessionId || me?.role !== 'player' || me.activeConsoleRoleId !== 'executive-officer') return null;
  if (!view) {
    return <section className="wolf-range-action cic-frame" aria-label="AEGIS range weapons">
      <p className="wolf-range-action__notice" role="status">{error ?? 'Checking the current server attack step…'}</p>
      <button type="button" className="cic-action-button" onClick={() => void refresh()}>Refresh attack choice</button>
    </section>;
  }
  if (view.type === 'wolf-range-action-choice-unavailable') {
    return view.reason === 'waiting' ? null : <section className="wolf-range-action cic-frame" aria-label="AEGIS range weapons">
      <p className="wolf-range-action__notice" role="status">{error ?? 'No weapon choice is open. The next step follows the server attack record.'}</p>
      <button type="button" className="cic-action-button" onClick={() => void refresh()}>Refresh attack choice</button>
    </section>;
  }

  const displayMessage = error ?? message;
  return <WolfRangeActionPanelView
    view={view}
    busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onUseActions={(actionIds) => void runMutation(() => commitWolfRangeActionChoice(view.turn, view.revision, view.range, actionIds))}
    onPass={() => void runMutation(() => commitWolfRangeActionChoice(view.turn, view.revision, view.range, []))}
    onAssignTargets={(assignments) => void runMutation(() => assignWolfRangeTargets(view.turn, view.revision, view.range, assignments))}
  />;
}

type WolfRangeActionViewState = WolfRangeActionChoiceReadResult;
