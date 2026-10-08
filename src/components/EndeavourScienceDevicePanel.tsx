import { useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { buildEndeavourScienceDevice, createEndeavourScienceDeviceAttempt,
  type EndeavourResearchWorkspace, type EndeavourScienceDeviceAttempt, type EndeavourScienceDeviceId,
} from '@/lib/endeavourResearchService';

const DEVICE_NAMES = { 'ecm-device': 'ECM Device', 'wolf-agent-detector': 'Wolf Agent Detector' } as const;

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
  const [pending, setPending] = useState<Readonly<{ identityKey: string; attempt: EndeavourScienceDeviceAttempt }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Readonly<{ identityKey: string; notice: string; error: string }> | null>(null);
  const devices = workspace.scienceDevices;
  const attempt = pending?.identityKey === identityKey ? pending.attempt : null;
  const currentFeedback = feedback?.identityKey === identityKey ? feedback : null;
  const online = connection === 'live' && freshness === 'server' && window.navigator.onLine;
  const current = () => {
    const state = useSessionStore.getState();
    return state.session?.id === workspace.sessionId && state.me?.uid === me?.uid &&
      state.me?.sessionId === workspace.sessionId && state.me?.activeConsoleRoleId === 'shepherd-scientist' &&
      state.session.shuttleControl?.endeavour?.holderUid === me?.uid;
  };

  async function submit(deviceId?: EndeavourScienceDeviceId) {
    if (busy || !online || (!attempt && (!liveTeamPhase || !deviceId || !devices))) return;
    let command = attempt;
    try {
      command ??= createEndeavourScienceDeviceAttempt({ workspace, deviceId: deviceId! });
      setPending({ identityKey, attempt: command });
      setBusy(true);
      setFeedback({ identityKey, notice: '', error: '' });
      const result = await buildEndeavourScienceDevice(command);
      if (!current()) return;
      setPending(null);
      setFeedback({ identityKey, notice: `${DEVICE_NAMES[result.deviceId]} built for ${result.materialCost} materials.`, error: '' });
      await onRefresh();
    } catch (cause) {
      if (!current()) return;
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : '';
      const definitive = typeof code === 'string' && ['functions/unauthenticated', 'functions/permission-denied',
        'functions/invalid-argument', 'functions/not-found', 'functions/failed-precondition'].includes(code);
      if (definitive || !command) setPending(null);
      setFeedback({ identityKey, notice: '', error: cause instanceof Error ? cause.message : 'The science device purchase could not be confirmed.' });
      if (definitive) await onRefresh();
    } finally {
      if (current()) setBusy(false);
    }
  }

  if (!devices || session?.id !== workspace.sessionId) return null;
  return <section className="console-workspace__section cic-frame" aria-label="Science device construction controls" aria-busy={busy}>
    <h3>Science device construction</h3>
    <p>Shepherd // {devices.shepherdMaterials} materials available</p>
    {!liveTeamPhase && <p>Construction is available during the live Team Phase.</p>}
    {(Object.keys(DEVICE_NAMES) as EndeavourScienceDeviceId[]).map((deviceId) => {
      const built = deviceId === 'ecm-device' ? devices.ecmBuilt : devices.detectorBuilt;
      const spent = deviceId === 'ecm-device' && devices.ecmUsed;
      const track = workspace.tracks.find((row) => row.trackId === deviceId);
      const price = track?.currentMaterialCost ?? null;
      const unavailable = !track || price === null;
      const enough = price !== null && devices.shepherdMaterials >= price;
      return <div className="console-workspace__status" key={deviceId}>
        <p>{DEVICE_NAMES[deviceId]} // {spent ? 'Spent' : built ? 'Built' : 'Unbuilt'}</p>
        {!built && !spent && <>
          <p>{unavailable ? 'Purchase unavailable until more research is completed.' : `Unlocked purchase price: ${price} materials from Shepherd.`}</p>
          {!unavailable && !enough && <p>Shepherd needs more materials before construction.</p>}
          <div className="console-workspace__actions">
            <button type="button" className="cic-action-button"
              disabled={!liveTeamPhase || !online || unavailable || !enough || busy || attempt !== null}
              onClick={() => void submit(deviceId)}>
              {price === null ? `Build ${DEVICE_NAMES[deviceId]}` : `Build ${DEVICE_NAMES[deviceId]} for ${price} materials`}
            </button>
          </div>
        </>}
      </div>;
    })}
    {busy && <p role="status">Purchasing science device…</p>}
    {currentFeedback?.notice && <p role="status">{currentFeedback.notice}</p>}
    {currentFeedback?.error && <p role="alert">{currentFeedback.error}</p>}
    {attempt && !busy && <div className="console-workspace__status">
      <p>The purchase response is uncertain. Retry the same request to confirm its outcome.</p>
      <button type="button" className="cic-action-button" disabled={!online} onClick={() => void submit()}>
        Retry same science device purchase
      </button>
    </div>}
  </section>;
}
