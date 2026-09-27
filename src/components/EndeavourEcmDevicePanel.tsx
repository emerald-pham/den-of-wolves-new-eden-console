import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import {
  activateEndeavourEcmDevice,
  createEndeavourEcmDeviceAttempt,
  readEndeavourEcmDeviceWorkspace,
  retryEndeavourEcmDeviceAttempt,
  type EndeavourEcmDeviceAttempt,
  type EndeavourEcmDeviceReply,
  type EndeavourEcmDeviceWorkspace,
} from '@/lib/endeavourEcmDeviceService';
import type { ShuttleControlEntry } from '@/types/game';
import { EndeavourEcmDeviceView, type EndeavourEcmDevicePresentation } from './EndeavourEcmDeviceView';
export { EndeavourEcmDeviceView } from './EndeavourEcmDeviceView';
export type { EndeavourEcmDevicePresentation } from './EndeavourEcmDeviceView';

function isCurrentScientistHolder(
  sessionId: string,
  uid: string,
  expectedControlRevision?: number,
  expectedCycle?: number,
): boolean {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  return session?.id === sessionId && session.phase === 'active' &&
    me?.uid === uid && me.sessionId === sessionId && me.role === 'player' &&
    me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') === true &&
    control?.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' && control.holderUid === uid &&
    (expectedControlRevision === undefined || control.revision === expectedControlRevision) &&
    (expectedCycle === undefined || session.currentTurn === expectedCycle);
}

function currentResult(value: EndeavourEcmDeviceWorkspace): EndeavourEcmDevicePresentation {
  if (value.device.status === 'used') {
    return {
      status: 'spent', groupId: value.device.ownerGroupId,
      pursuitBefore: value.device.pursuitBefore, pursuitAfter: value.device.pursuitAfter,
    };
  }
  if (!value.researchComplete) return { status: 'unavailable' };
  return { status: 'ready', groupId: value.pursuit.groupId, pursuit: value.pursuit.current };
}

function isDefinitiveRejection(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return false;
  const code = cause.code;
  return typeof code === 'string' && [
    'functions/unauthenticated',
    'functions/permission-denied',
    'functions/invalid-argument',
    'functions/not-found',
    'functions/failed-precondition',
  ].includes(code);
}

export default function EndeavourEcmDevicePanel({ control }: { readonly control: ShuttleControlEntry }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const snapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [loadedWorkspace, setLoadedWorkspace] = useState<Readonly<{
    identityKey: string;
    value: EndeavourEcmDeviceWorkspace;
  }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<Readonly<{
    identityKey: string;
    attempt: EndeavourEcmDeviceAttempt;
  }> | null>(null);
  const [lastSuccess, setLastSuccess] = useState<Readonly<{
    identityKey: string;
    value: EndeavourEcmDeviceReply;
  }> | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const sessionId = session?.id;
  const uid = me?.uid;
  const identityKey = sessionId && uid ? JSON.stringify([sessionId, uid]) : null;
  const workspace = loadedWorkspace?.identityKey === identityKey ? loadedWorkspace.value : null;
  const activeAttempt = pendingAttempt?.identityKey === identityKey ? pendingAttempt.attempt : null;
  const recentSuccess = lastSuccess?.identityKey === identityKey ? lastSuccess.value : null;
  const entitled = Boolean(
    session?.phase === 'active' && me?.role === 'player' &&
    me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') &&
    control.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' &&
    control.holderUid === me.uid,
  );
  const canActivate = Boolean(
    entitled && connection === 'live' && snapshotFreshness === 'server' &&
    window.navigator.onLine && workspace?.device.status === 'ready' && workspace.researchComplete,
  );

  const reload = useCallback(async (): Promise<EndeavourEcmDeviceWorkspace | null> => {
    if (!entitled || !sessionId || !uid || !identityKey || !isCurrentScientistHolder(sessionId, uid)) return null;
    const currentGeneration = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const next = await readEndeavourEcmDeviceWorkspace();
      if (currentGeneration !== generation.current || !isCurrentScientistHolder(sessionId, uid)) return null;
      setLoadedWorkspace({ identityKey, value: next });
      return next;
    } catch (cause) {
      if (currentGeneration === generation.current && isCurrentScientistHolder(sessionId, uid)) {
        setError(cause instanceof Error && cause.message ? cause.message : 'ECM Device status could not be loaded.');
      }
      return null;
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, [entitled, identityKey, sessionId, uid]);

  useEffect(() => {
    void reload();
    return () => { generation.current += 1; };
  }, [reload, connection, snapshotFreshness, session?.currentTurn, control.revision]);

  const submit = useCallback(async (retry = false): Promise<void> => {
    if (!entitled || !identityKey || !sessionId || !uid || connection !== 'live' ||
        snapshotFreshness !== 'server' || !window.navigator.onLine) return;
    if (retry ? !activeAttempt : (!canActivate || !workspace)) return;
    let attempt = retry ? activeAttempt : null;
    try {
      if (!attempt) {
        if (!workspace) return;
        attempt = createEndeavourEcmDeviceAttempt(workspace);
        setPendingAttempt({ identityKey, attempt });
      }
      setBusy(true);
      setError('');
      const result = retry
        ? await retryEndeavourEcmDeviceAttempt(attempt)
        : await activateEndeavourEcmDevice(attempt);
      if (!isCurrentScientistHolder(sessionId, uid)) return;
      setLastSuccess({ identityKey, value: result });
      setPendingAttempt(null);
      await reload();
    } catch (cause) {
      if (isCurrentScientistHolder(sessionId, uid)) {
        if (isDefinitiveRejection(cause)) {
          setPendingAttempt(null);
          const message = cause instanceof Error && cause.message
            ? cause.message
            : 'The ECM Device request was rejected.';
          await reload();
          if (isCurrentScientistHolder(sessionId, uid)) setError(message);
        } else {
          setError(cause instanceof Error && cause.message
            ? cause.message
            : 'The ECM Device result is uncertain. Retry the same request or refresh.');
        }
      }
    } finally {
      if (isCurrentScientistHolder(sessionId, uid)) setBusy(false);
    }
  }, [activeAttempt, canActivate, connection, entitled, identityKey, reload, sessionId,
    snapshotFreshness, uid, workspace]);

  if (!entitled) return null;
  if (loading && !workspace) {
    return <section className="console-workspace__section cic-frame endeavour-ecm-device"
      aria-label="Endeavour ECM Device controls"><h3>ECM Device</h3>
      <p role="status">Loading private ECM Device status…</p></section>;
  }
  if (!workspace) {
    return <section className="console-workspace__section cic-frame endeavour-ecm-device"
      aria-label="Endeavour ECM Device controls"><h3>ECM Device</h3>
      <p role="alert">{error || 'ECM Device status is unavailable.'}</p>
      <div className="console-workspace__actions">
        <button type="button" className="cic-text-button" disabled={loading} onClick={() => void reload()}>
          Refresh ECM Device status
        </button>
      </div></section>;
  }

  const presentation = busy
    ? workspace.device.status === 'used'
      ? currentResult(workspace)
      : { status: 'working' as const, groupId: workspace.pursuit.groupId, pursuit: workspace.pursuit.current }
    : currentResult(workspace);

  return <>
    <EndeavourEcmDeviceView
      state={presentation}
      {...(canActivate && !busy && !activeAttempt ? { onActivate: () => void submit(false) } : {})}
      {...(recentSuccess ? { recentSuccess } : {})}
    />
    {activeAttempt && !busy && <section className="console-workspace__status" aria-label="Unconfirmed ECM Device request">
      <p role="alert">The ECM Device response is uncertain. Retry the exact request to confirm its outcome.</p>
      <button type="button" className="cic-text-button" disabled={busy || loading}
        onClick={() => void reload()}>Refresh ECM Device status</button>
      <button type="button" className="cic-action-button"
        disabled={busy || loading || connection !== 'live' || snapshotFreshness !== 'server' || !window.navigator.onLine}
        onClick={() => void submit(true)}>Retry same ECM Device request</button>
    </section>}
    {!activeAttempt && error && <p role="alert">{error}</p>}
  </>;
}
