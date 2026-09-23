import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyAegisCommandAndControl,
  getAegisCommandAndControl,
} from '@/lib/sessionService';
import type { AegisCommandAndControlView } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';

type Props = Readonly<{
  sessionId?: string;
  consoleLocked?: boolean;
  readControl?: typeof getAegisCommandAndControl;
  redirectShip?: typeof applyAegisCommandAndControl;
}>;

function displayName(value: string): string {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function targetName(
  target: AegisCommandAndControlView['targets'][number],
  targets: AegisCommandAndControlView['targets'],
): string {
  const sameClass = targets.filter((candidate) => candidate.shipId === target.shipId);
  if (sameClass.length < 2) return displayName(target.shipId);
  const ordinal = sameClass.findIndex((candidate) => candidate.rosterIndex === target.rosterIndex) + 1;
  return `${displayName(target.shipId)} ${ordinal}`;
}

function hasCurrentExecutiveOfficerAuthority(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  const state = useSessionStore.getState();
  return state.session?.id === sessionId && state.me?.sessionId === sessionId &&
    state.me?.role === 'player' && state.me.activeConsoleRoleId === 'executive-officer';
}

function statusFor(view: AegisCommandAndControlView): string {
  if (view.reason === 'waiting') return 'No Wolf targeting window is open.';
  if (view.reason === 'not-targeting') return 'Wolf targeting is no longer the active attack step.';
  if (view.reason === 'commander-pending') {
    return 'Rerolls pending // reconnect and finish rerolls with the assigned Wolf Commander.';
  }
  if (view.reason === 'uncharged') return 'Unavailable // charge Command and Control for this cycle.';
  if (view.reason === 'damaged') return 'Unavailable // Command and Control is damaged.';
  if (view.reason === 'damage-unknown') return 'Unavailable // AEGIS damage status could not be verified.';
  if (view.reason === 'already-used') {
    return `Command committed // ${displayName(view.redirectedShipId ?? 'wolf ship')} redirected to AEGIS.`;
  }
  if (view.reason === 'no-targets') return 'Unavailable // no Wolf ships are available to redirect.';
  if (!view.commanderAssigned) {
    return 'No Wolf Commander is assigned // this redirect will record targeting completion.';
  }
  if (!view.rerollsFinalized) return 'Waiting for the assigned Wolf Commander to finish rerolls.';
  return 'Targeting rerolls complete // choose one Wolf ship to redirect to AEGIS.';
}

/** Executive Officer control for one server-authorized, post-reroll redirect. */
export default function AegisCommandAndControlPanel({
  sessionId: suppliedSessionId,
  consoleLocked = false,
  readControl = getAegisCommandAndControl,
  redirectShip = applyAegisCommandAndControl,
}: Props) {
  const storeSessionId = useSessionStore((state) => state.session?.id);
  const isExecutiveOfficer = useSessionStore((state) => state.me?.role === 'player' &&
      state.me.activeConsoleRoleId === 'executive-officer');
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const sessionId = suppliedSessionId ?? storeSessionId;
  const authorizedPost = isExecutiveOfficer;
  const live = connection === 'live' && freshness === 'server' && !consoleLocked;
  const [view, setView] = useState<AegisCommandAndControlView | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Refresh after the GM declares a Wolf attack.');
  const requestGeneration = useRef(0);

  useEffect(() => {
    requestGeneration.current += 1;
    setView(null);
    setSelected(null);
    setBusy(false);
    setLoading(false);
  }, [authorizedPost, sessionId]);

  const refresh = useCallback(async () => {
    if (!authorizedPost || !sessionId) return;
    if (!live) {
      setView(null);
      setSelected(null);
      setStatus('Unavailable // reconnect to the live Executive Officer authority.');
      return;
    }
    const generation = requestGeneration.current;
    setLoading(true);
    try {
      const next = await readControl();
      if (requestGeneration.current !== generation || next.sessionId !== sessionId ||
          !hasCurrentExecutiveOfficerAuthority(sessionId)) return;
      setView(next);
      setSelected(null);
      setStatus(statusFor(next));
    } catch {
      if (requestGeneration.current !== generation || !hasCurrentExecutiveOfficerAuthority(sessionId)) return;
      setView(null);
      setStatus('Command and Control unavailable // reconnect and refresh.');
    } finally {
      if (requestGeneration.current === generation) setLoading(false);
    }
  }, [authorizedPost, live, readControl, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!authorizedPost) return null;

  async function redirect(): Promise<void> {
    if (!view || !view.eligible || selected === null || busy || !live) return;
    const generation = requestGeneration.current;
    const requestSessionId = sessionId;
    setBusy(true);
    try {
      const result = await redirectShip(view.turn, view.revision, selected);
      if (requestGeneration.current !== generation || sessionId !== requestSessionId ||
          !hasCurrentExecutiveOfficerAuthority(requestSessionId)) return;
      const selectedTarget = view.targets.find((target) => target.rosterIndex === result.rosterIndex);
      if (!selectedTarget || result.rosterIndex !== selected || selectedTarget.shipId !== result.shipId) {
        setView(null);
        setSelected(null);
        setStatus('Redirect receipt did not match the selected ship // refresh the current targeting state.');
        return;
      }
      setView(result.view);
      setSelected(null);
      setStatus(`Command committed // ${targetName(selectedTarget, view.targets)} redirected to AEGIS.`);
    } catch {
      if (requestGeneration.current !== generation || sessionId !== requestSessionId ||
          !hasCurrentExecutiveOfficerAuthority(requestSessionId)) return;
      setView(null);
      setSelected(null);
      setStatus('Redirect rejected // refresh the current targeting state and try again.');
    } finally {
      if (requestGeneration.current === generation) setBusy(false);
    }
  }

  const targets = view?.targets ?? [];
  const canRedirect = live && view?.eligible === true && selected !== null && !busy;

  return (
    <section className="aegis-cnc-panel cic-frame" aria-labelledby="aegis-cnc-title">
      <header className="aegis-cnc-panel__header">
        <div>
          <p>Wolf attack // AEGIS defense</p>
          <h3 id="aegis-cnc-title">Command and Control</h3>
        </div>
        {view && <span>Cycle {view.turn} // Rev {view.revision}</span>}
      </header>
      <p className="aegis-cnc-panel__guidance">
        After Wolf Commander rerolls finish, redirect one Wolf ship to AEGIS. This action does not resolve damage.
      </p>
      {targets.length > 0 && view?.eligible && (
        <fieldset className="aegis-cnc-panel__targets">
          <legend>Choose one Wolf ship</legend>
          {targets.map((target) => (
            <label key={target.rosterIndex}>
              <input
                type="radio"
                name="aegis-cnc-target"
                value={target.rosterIndex}
                checked={selected === target.rosterIndex}
                disabled={busy || !live}
                onChange={() => setSelected(target.rosterIndex)}
              />
              <span>{targetName(target, targets)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="aegis-cnc-panel__actions">
        <button
          className="cic-action-button cic-action-button--confirm"
          type="button"
          disabled={!canRedirect}
          onClick={() => void redirect()}
        >
          {busy ? 'Redirecting…' : 'Redirect selected ship'}
        </button>
        <button className="cic-text-button" type="button" disabled={loading || busy || !live}
          onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh Command and Control'}
        </button>
      </div>
      <p className="aegis-cnc-panel__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
