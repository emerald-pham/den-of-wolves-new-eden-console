import { useEffect, useState } from 'react';

/** The same confirmed Settings exit is used in live play and the local review scene. */
export default function SettingsDisconnectAction({
  joinCode,
  queued = false,
  onDisconnect,
}: {
  readonly joinCode: string;
  readonly queued?: boolean;
  readonly onDisconnect: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (queued) setConfirming(false);
  }, [queued]);

  return <>
    <p>Disconnect this device from session {joinCode}.</p>
    <button
      className="settings-dialog__disconnect cic-action-button cic-action-button--confirm"
      type="button"
      disabled={queued}
      style={confirming
        ? { color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' }
        : undefined}
      onBlur={() => setConfirming(false)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setConfirming(false);
      }}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setConfirming(false);
        onDisconnect();
      }}
    >
      {queued ? 'Disconnect queued' : confirming ? 'ARE YOU SURE?' : 'Disconnect'}
    </button>
  </>;
}
