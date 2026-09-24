import { useEffect, useRef, useState } from 'react';
import HackingMessageOverlay from './HackingMessageOverlay';
import {
  HACKING_MESSAGE_DURATION_MS,
  hackingMessageForNoticeId,
  type HackingMessage,
} from '@/lib/hackingMessages';
import {
  subscribeGmWolfHackingAlerts,
  subscribePlayerHackingNotices,
} from '@/lib/firestore';
import { acknowledgeWolfHackingAlert } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type { PendingWolfHackingAlert, PlayerHackingNotice } from '@/types/game';
import './WolfHackingRuntime.css';

interface GmQueueView {
  readonly key: string;
  readonly status: 'loading' | 'ready' | 'error' | 'inactive';
  readonly alerts: readonly PendingWolfHackingAlert[];
}

interface PlayerQueueView {
  readonly key: string;
  readonly status: 'loading' | 'ready' | 'error' | 'inactive';
  readonly notices: readonly PlayerHackingNotice[];
  readonly queue: readonly { readonly id: string; readonly message: HackingMessage }[];
}

function alertSummary(alert: PendingWolfHackingAlert): string {
  if (alert.action === 'sabotage-console') {
    return `Console sabotage damaged the ${alert.targetSystemName} on ${alert.targetShipId}.`;
  }
  return `Supply sabotage destroyed ${alert.destroyedAmount} ${alert.resourceId} aboard ${alert.shuttleId}.`;
}

export default function WolfHackingRuntime() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const connection = useSessionStore((state) => state.connection);
  const sessionSnapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const sessionId = session?.id;
  const uid = me?.uid;
  const serverTrusted = connection === 'live' && sessionSnapshotFreshness === 'server';
  const gmAuthorized = Boolean(serverTrusted && sessionId && uid && me?.role === 'gm' &&
    gmInstance?.sessionId === sessionId && gmInstance.uid === uid);
  const gmKey = gmAuthorized ? `${sessionId}:${uid}:${gmInstance!.id}` : '';
  const playerAuthorized = Boolean(serverTrusted && sessionId && uid && me?.role === 'player');
  const playerKey = playerAuthorized ? `${sessionId}:${uid}` : '';
  const [gmView, setGmView] = useState<GmQueueView>({ key: '', status: 'inactive', alerts: [] });
  const [playerView, setPlayerView] = useState<PlayerQueueView>({
    key: '', status: 'inactive', notices: [], queue: [],
  });
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [acknowledgementError, setAcknowledgementError] = useState(false);
  const gmGeneration = useRef(0);
  const playerGeneration = useRef(0);
  const gmActiveKey = useRef('');
  const playerActiveKey = useRef('');
  const acknowledgedIds = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const seenNoticeIds = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });

  useEffect(() => {
    const generation = ++gmGeneration.current;
    gmActiveKey.current = gmKey;
    setAcknowledgingId(null);
    setAcknowledgementError(false);
    if (!gmKey || !sessionId) {
      acknowledgedIds.current = { key: '', ids: new Set() };
      setGmView({ key: '', status: 'inactive', alerts: [] });
      return () => { gmGeneration.current += 1; };
    }
    acknowledgedIds.current = { key: gmKey, ids: new Set() };
    setGmView({ key: gmKey, status: 'loading', alerts: [] });
    const unsubscribe = subscribeGmWolfHackingAlerts(sessionId, (alerts) => {
      const current = useSessionStore.getState();
      const authorityCurrent = gmGeneration.current === generation && gmActiveKey.current === gmKey &&
        current.connection === 'live' && current.sessionSnapshotFreshness === 'server' &&
        current.session?.id === sessionId && current.me?.uid === uid && current.me?.role === 'gm' &&
        current.gmInstance?.id === gmInstance?.id && current.gmInstance?.uid === uid;
      if (!authorityCurrent) return;
      if (alerts === null) {
        setGmView({ key: gmKey, status: 'error', alerts: [] });
        return;
      }
      const handled = acknowledgedIds.current.key === gmKey ? acknowledgedIds.current.ids : new Set<string>();
      setGmView({
        key: gmKey,
        status: 'ready',
        alerts: alerts.filter((alert) => !handled.has(alert.alertId)),
      });
    });
    return () => {
      if (gmGeneration.current === generation) gmGeneration.current += 1;
      unsubscribe();
    };
  }, [gmKey, gmInstance?.id, sessionId, uid]);

  useEffect(() => {
    const generation = ++playerGeneration.current;
    playerActiveKey.current = playerKey;
    if (!playerKey || !sessionId) {
      seenNoticeIds.current = { key: '', ids: new Set() };
      setPlayerView({ key: '', status: 'inactive', notices: [], queue: [] });
      return () => { playerGeneration.current += 1; };
    }
    seenNoticeIds.current = { key: playerKey, ids: new Set() };
    setPlayerView({ key: playerKey, status: 'loading', notices: [], queue: [] });
    const unsubscribe = subscribePlayerHackingNotices(sessionId, (notices) => {
      const current = useSessionStore.getState();
      const authorityCurrent = playerGeneration.current === generation &&
        playerActiveKey.current === playerKey && current.connection === 'live' &&
        current.sessionSnapshotFreshness === 'server' && current.session?.id === sessionId &&
        current.me?.uid === uid && current.me?.role === 'player';
      if (!authorityCurrent) return;
      if (notices === null) {
        setPlayerView({ key: playerKey, status: 'error', notices: [], queue: [] });
        return;
      }
      const tracker = seenNoticeIds.current;
      if (tracker.key !== playerKey) return;
      const freshNotices = notices.filter((notice) => !tracker.ids.has(notice.id));
      freshNotices.forEach((notice) => tracker.ids.add(notice.id));
      setPlayerView((previous) => {
        const alreadyQueued = new Set(previous.key === playerKey
          ? previous.queue.map((entry) => entry.id) : []);
        const next = freshNotices
          .filter((notice) => !alreadyQueued.has(notice.id))
          .map((notice) => ({ id: notice.id, message: hackingMessageForNoticeId(notice.id) }));
        return {
          key: playerKey,
          status: 'ready',
          notices,
          queue: previous.key === playerKey ? [...previous.queue, ...next] : next,
        };
      });
    });
    return () => {
      if (playerGeneration.current === generation) playerGeneration.current += 1;
      unsubscribe();
    };
  }, [playerKey, sessionId, uid]);

  const visibleGmView = gmAuthorized && gmView.key === gmKey ? gmView : undefined;
  const currentAlert = visibleGmView?.status === 'ready' ? visibleGmView.alerts[0] : undefined;
  const visiblePlayerView = playerAuthorized && playerView.key === playerKey ? playerView : undefined;
  const activeNotice = visiblePlayerView?.status === 'ready' ? visiblePlayerView.queue[0] : undefined;
  const activeNoticeId = activeNotice?.id;

  useEffect(() => {
    if (!activeNoticeId || !playerKey) return;
    const timeout = window.setTimeout(() => {
      setPlayerView((previous) => previous.key === playerKey
        ? { ...previous, queue: previous.queue.slice(1) }
        : previous);
    }, HACKING_MESSAGE_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [activeNoticeId, playerKey]);

  const acknowledge = async (alert: PendingWolfHackingAlert) => {
    const key = gmKey;
    setAcknowledgingId(alert.alertId);
    setAcknowledgementError(false);
    try {
      const result = await acknowledgeWolfHackingAlert(alert);
      const current = useSessionStore.getState();
      if (gmActiveKey.current !== key || current.session?.id !== alert.sessionId ||
          current.me?.role !== 'gm' || current.me.uid !== uid ||
          current.gmInstance?.id !== gmInstance?.id || result.alertId !== alert.alertId) return;
      if (acknowledgedIds.current.key === key) acknowledgedIds.current.ids.add(alert.alertId);
      setGmView((previous) => previous.key === key
        ? { ...previous, alerts: previous.alerts.filter((item) => item.alertId !== alert.alertId) }
        : previous);
    } catch {
      const current = useSessionStore.getState();
      if (gmActiveKey.current === key && current.session?.id === alert.sessionId &&
          current.me?.role === 'gm' && current.me.uid === uid) {
        setAcknowledgementError(true);
      }
    } finally {
      if (gmActiveKey.current === key) setAcknowledgingId(null);
    }
  };

  return (
    <>
      {visibleGmView && visibleGmView.status !== 'inactive' && (
        <aside
          className="wolf-hacking-alert"
          aria-label="Facilitator sabotage alerts"
          aria-live="polite"
          data-testid="wolf-hacking-alert"
        >
          {visibleGmView.status === 'loading' && <p>Checking private sabotage alerts…</p>}
          {visibleGmView.status === 'error' && (
            <p role="alert">The private sabotage alert queue could not be verified. Reconnect to continue.</p>
          )}
          {visibleGmView.status === 'ready' && currentAlert && (
            <>
              <header className="wolf-hacking-alert__header">
                <div>
                  <p className="wolf-hacking-alert__eyebrow cic-overline">PRIVATE FACILITATOR ALERT · CYCLE {currentAlert.cycle}</p>
                  <h2>Wolf sabotage committed</h2>
                </div>
                <span className="wolf-hacking-alert__count">
                  1 / {visibleGmView.alerts.length} pending
                </span>
              </header>
              <p>{alertSummary(currentAlert)}</p>
              <p className="wolf-hacking-alert__clue">
                <strong>Clue instruction:</strong> {currentAlert.clueInstruction}
              </p>
              {acknowledgementError && (
                <p className="wolf-hacking-alert__error" role="alert">
                  The alert was not acknowledged. Reconnect and retry.
                </p>
              )}
              <button
                type="button"
                className="cic-action-button"
                onClick={() => void acknowledge(currentAlert)}
                disabled={acknowledgingId === currentAlert.alertId}
              >
                {acknowledgingId === currentAlert.alertId
                  ? 'Recording acknowledgement…'
                  : 'Acknowledge alert and clue instruction handled'}
              </button>
            </>
          )}
          {visibleGmView.status === 'ready' && !currentAlert && null}
        </aside>
      )}
      <HackingMessageOverlay
        enabled={Boolean(activeNotice)}
        message={activeNotice?.message ?? null}
      />
    </>
  );
}
