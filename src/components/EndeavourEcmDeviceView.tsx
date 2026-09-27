export type EndeavourEcmDevicePresentation =
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'ready' | 'working'; groupId: string; pursuit: number }>
  | Readonly<{
      status: 'successful' | 'spent';
      groupId: string;
      pursuitBefore: number;
      pursuitAfter: number;
    }>;

export function EndeavourEcmDeviceView({
  state,
  onActivate,
  recentSuccess,
}: Readonly<{
  state: EndeavourEcmDevicePresentation;
  onActivate?: () => void;
  recentSuccess?: Readonly<{ pursuitBefore: number; pursuitAfter: number }>;
}>) {
  const groupLabel = 'Shepherd group';

  return (
    <section className="console-workspace__section cic-frame endeavour-ecm-device"
      aria-label="Endeavour ECM Device controls">
      <p className="console-workspace__eyebrow">Science device // one use</p>
      <h3>ECM Device</h3>
      {state.status === 'unavailable' && <>
        <p>Status: Unavailable</p>
        <p>Complete ECM Device research before use.</p>
        <div className="console-workspace__actions">
          <button type="button" className="cic-action-button" disabled>Use ECM Device</button>
        </div>
      </>}
      {state.status === 'ready' && <>
        <p>Status: Ready</p>
        <p>{groupLabel} pursuit: {state.pursuit}.</p>
        <div className="console-workspace__actions">
          <button type="button" className="cic-action-button" disabled={!onActivate}
            onClick={onActivate}>Use ECM Device</button>
        </div>
      </>}
      {state.status === 'working' && <>
        <p>Status: Working</p>
        <p role="status">Working…</p>
        <p>{groupLabel} pursuit: {state.pursuit}.</p>
        <div className="console-workspace__actions">
          <button type="button" className="cic-action-button" disabled>Using ECM Device…</button>
        </div>
      </>}
      {state.status === 'successful' && <>
        <p>Status: Successful</p>
        <p role="status">Successful: {groupLabel} pursuit reduced from {state.pursuitBefore} to {state.pursuitAfter}.</p>
      </>}
      {state.status === 'spent' && <>
        <p>Status: Spent</p>
        <p>ECM Device spent; {groupLabel} pursuit changed from {state.pursuitBefore} to {state.pursuitAfter}.</p>
      </>}
      {recentSuccess && state.status === 'spent' && <p role="status">
        Successful: {groupLabel} pursuit reduced from {recentSuccess.pursuitBefore} to {recentSuccess.pursuitAfter}.
      </p>}
    </section>
  );
}
