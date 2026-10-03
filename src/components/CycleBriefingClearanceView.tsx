import type {Ref} from 'react';

/** Presentation shared by the real held clock and the isolated owner review. */
export default function CycleBriefingClearanceView({online, clearing, error = '', onClear, buttonRef}: {
  readonly online: boolean;
  readonly clearing: boolean;
  readonly error?: string;
  readonly onClear: () => void;
  readonly buttonRef?: Ref<HTMLButtonElement>;
}) {
  return <section className="turn-interstitial-clear cic-frame" aria-label="Cycle briefing clearance">
    <p role="status">Cycle clock held // preserved time resumes when this briefing clears.</p>
    <button ref={buttonRef} className="cic-action-button" type="button" disabled={!online || clearing} onClick={onClear}>
      {clearing ? 'Clearing cycle briefing…' : 'Clear cycle briefing // resume clock'}
    </button>
    {!online && <p>Reconnect to clear the briefing.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
