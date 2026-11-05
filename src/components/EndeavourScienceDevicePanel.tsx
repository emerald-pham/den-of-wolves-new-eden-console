import { useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import {
  buildEndeavourScienceDevice,
  createEndeavourScienceDeviceAttempt,
  retryUncertainEndeavourScienceDevice,
  type EndeavourResearchWorkspace,
  type EndeavourScienceDeviceAttempt,
  type EndeavourScienceDeviceId,
} from '@/lib/endeavourResearchService';
import EndeavourScienceDeviceChoices, { ENDEAVOUR_SCIENCE_DEVICE_NAMES } from './EndeavourScienceDeviceChoices';

function isDefinitiveRejection(cause: unknown): boolean {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : '';
  return typeof code === 'string' && [
    'functions/unauthenticated', 'functions/permission-denied', 'functions/invalid-argument',
    'functions/not-found', 'functions/failed-precondition',
  ].includes(code);
}

export default function EndeavourScienceDevicePanel({ workspace, liveTeamPhase, onRefresh }: Readonly<{
  workspace: EndeavourResearchWorkspace;
  liveTeamPhase: boolean;
  onRefresh: () => Promise<EndeavourResearchWorkspace | null>;
}>) {
  const me = useSessionStore((state) => state.me);
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const identityKey = JSON.stringify([workspace.sessionId, me?.uid]);
  const [pending, setPending] = useState<Readonly<{
    identityKey: string;
    attempt: EndeavourScienceDeviceAttempt;
  }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Readonly<{
    identityKey: string;
    notice: string;
    error: string;
  }> | null>(null);
  const devices = workspace.scienceDevices;
  const attempt = pending?.identityKey === identityKey ? pending.attempt : null;
  const currentFeedback = feedback?.identityKey === identityKey ? feedback : null;
  const online = connection === 'live' && freshness === 'server' && window.navigator.onLine;

  const current = (): boolean => {
    const state = useSessionStore.getState();
    return state.session?.id === workspace.sessionId && state.session.phase === 'active' &&
      state.me?.uid === me?.uid && state.me?.sessionId === workspace.sessionId &&
      state.me?.role === 'player' && state.me?.activeConsoleRoleId === 'shepherd-scientist' &&
      state.session.activeRoleIds?.includes('shepherd-scientist') === true &&
      state.session.shuttleControl?.endeavour?.ownerRoleId === 'shepherd-scientist' &&
      state.session.shuttleControl.endeavour.holderUid === me?.uid;
  };

  async function submit(deviceId?: EndeavourScienceDeviceId): Promise<void> {
    if (busy || !online || (!attempt && (!liveTeamPhase || !deviceId || !devices))) return;
    let command = attempt;
    try {
      command ??= createEndeavourScienceDeviceAttempt({ workspace, deviceId: deviceId! });
      setPending({ identityKey, attempt: command });
      setBusy(true);
      setFeedback({ identityKey, notice: '', error: '' });
      const result = attempt
        ? await retryUncertainEndeavourScienceDevice(command)
        : await buildEndeavourScienceDevice(command);
      if (!current()) return;
      setPending(null);
      setFeedback({
        identityKey,
        notice: `${ENDEAVOUR_SCIENCE_DEVICE_NAMES[result.deviceId]} built for ${result.materialCost} materials.`,
        error: '',
      });
      await onRefresh();
    } catch (cause) {
      if (!current()) return;
      if (isDefinitiveRejection(cause) || !command) setPending(null);
      setFeedback({
        identityKey,
        notice: '',
        error: cause instanceof Error ? cause.message : 'The science device purchase could not be confirmed.',
      });
      if (isDefinitiveRejection(cause)) await onRefresh();
    } finally {
      if (current()) setBusy(false);
    }
  }

  if (!devices || session?.id !== workspace.sessionId) return null;
  return <EndeavourScienceDeviceChoices
    workspace={workspace}
    liveTeamPhase={liveTeamPhase}
    actionsEnabled={online}
    busy={busy}
    attempt={attempt}
    notice={currentFeedback?.notice ?? ''}
    error={currentFeedback?.error ?? ''}
    onBuild={deviceId => void submit(deviceId)}
    onRetry={() => void submit()}
  />;
}
