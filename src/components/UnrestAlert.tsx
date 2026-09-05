import { useState } from 'react';
import { dismissUnrestAlert } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';

export default function UnrestAlert() {
  const session = useSessionStore((state) => state.session);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const [dismissing, setDismissing] = useState(false);
  const alert = gmInstance
    ? Object.values(session?.unrestAlerts ?? {}).find((candidate) =>
        candidate.targetGmInstanceIds.includes(gmInstance.id))
    : undefined;

  if (!alert) return null;

  async function dismiss(): Promise<void> {
    if (!alert || dismissing) return;
    setDismissing(true);
    try {
      await dismissUnrestAlert(alert.shipId);
    } catch {
      // The shared communications notice explains the failure; keep this alert retryable.
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div className="unrest-alert">
      <section
        className="unrest-alert__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unrest-alert-title"
      >
        <p>Immediate command attention required</p>
        <h2 id="unrest-alert-title">Unrest threshold exceeded</h2>
        <p>
          {alert.shipName} has exceeded the maximum unrest dial rating of 7.
          Shipboard stability is no longer measurable.
        </p>
        <button type="button" disabled={dismissing} onClick={() => void dismiss()}>
          {dismissing ? 'Acknowledging' : 'Dismiss unrest alert'}
        </button>
      </section>
    </div>
  );
}
