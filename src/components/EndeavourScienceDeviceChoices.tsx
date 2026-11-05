import type {
  EndeavourResearchWorkspace,
  EndeavourScienceDeviceAttempt,
  EndeavourScienceDeviceId,
} from '@/lib/endeavourResearchService';

export const ENDEAVOUR_SCIENCE_DEVICE_NAMES: Readonly<Record<EndeavourScienceDeviceId, string>> = {
  'ecm-device': 'ECM Device',
  'wolf-agent-detector': 'Wolf Agent Detector',
};

/** Service-free device purchase controls shared by the live Scientist panel and review scenes. */
export default function EndeavourScienceDeviceChoices({
  workspace,
  liveTeamPhase,
  actionsEnabled,
  busy,
  attempt,
  notice,
  error,
  sampleNote,
  onBuild,
  onRetry,
}: Readonly<{
  workspace: EndeavourResearchWorkspace;
  liveTeamPhase: boolean;
  actionsEnabled: boolean;
  busy: boolean;
  attempt: EndeavourScienceDeviceAttempt | null;
  notice: string;
  error: string;
  sampleNote?: string;
  onBuild: (deviceId: EndeavourScienceDeviceId) => void;
  onRetry: () => void;
}>) {
  const devices = workspace.scienceDevices;
  if (!devices) return null;

  return <section className="console-workspace__section cic-frame"
    aria-label="Science device construction controls" aria-busy={busy}>
    {sampleNote && <p role="note">{sampleNote}</p>}
    <h3>Science device construction</h3>
    <p>Shepherd // {devices.shepherdMaterials} materials available</p>
    {!liveTeamPhase && <p>Construction is available during the live Team Phase.</p>}
    {(Object.keys(ENDEAVOUR_SCIENCE_DEVICE_NAMES) as EndeavourScienceDeviceId[]).map((deviceId) => {
      const built = deviceId === 'ecm-device' ? devices.ecmBuilt : devices.detectorBuilt;
      const spent = deviceId === 'ecm-device' && devices.ecmUsed;
      const price = devices.buildCosts[deviceId];
      const unavailable = price === null;
      const enough = price !== null && devices.shepherdMaterials >= price;
      return <div className="console-workspace__status" key={deviceId}>
          <p>{ENDEAVOUR_SCIENCE_DEVICE_NAMES[deviceId]} // {spent ? 'Spent' : built ? 'Built' : 'Unbuilt'}</p>
        {!built && !spent && <>
          <p>{unavailable
            ? 'Purchase unavailable until more research is completed.'
            : `Unlocked purchase price: ${price} materials from Shepherd.`}</p>
          {!unavailable && !enough && <p>Shepherd needs more materials before construction.</p>}
          <div className="console-workspace__actions">
            <button type="button" className="cic-action-button"
              disabled={!liveTeamPhase || !actionsEnabled || unavailable || !enough || busy || attempt !== null}
              onClick={() => onBuild(deviceId)}>
              {price === null ? `Build ${ENDEAVOUR_SCIENCE_DEVICE_NAMES[deviceId]}` :
                `Build ${ENDEAVOUR_SCIENCE_DEVICE_NAMES[deviceId]} for ${price} materials`}
            </button>
          </div>
        </>}
      </div>;
    })}
    {busy && <p role="status">Purchasing science device…</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {attempt && !busy && <div className="console-workspace__status">
      <p>The purchase response is uncertain. Retry the same request to confirm its outcome.</p>
      <button type="button" className="cic-action-button" disabled={!actionsEnabled} onClick={onRetry}>
        Retry same science device purchase
      </button>
    </div>}
  </section>;
}
