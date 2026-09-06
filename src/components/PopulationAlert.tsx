import { useState } from 'react';
import { dismissPopulationAlert } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';

export default function PopulationAlert() {
  const session = useSessionStore((state) => state.session);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const [dismissing, setDismissing] = useState(false);
  const unrestPending = gmInstance && Object.values(session?.unrestAlerts ?? {}).some(
    (candidate) => candidate.targetGmInstanceIds.includes(gmInstance.id),
  );
  const alert = gmInstance && !unrestPending
    ? Object.values(session?.populationAlerts ?? {}).find((candidate) =>
        candidate.targetGmInstanceIds.includes(gmInstance.id))
    : undefined;

  if (!alert) return null;

  async function dismiss(): Promise<void> {
    if (!alert || dismissing) return;
    setDismissing(true);
    try {
      await dismissPopulationAlert(alert.shipId);
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
        aria-labelledby="population-alert-title"
      >
        <p>Immediate command attention required</p>
        <h2 id="population-alert-title">Survivor population threshold reached</h2>
        <p>
          {alert.shipName} survivor population has reached {alert.population.toLocaleString('en-US')}.
          A census threshold requires GM attention.
        </p>
        <button type="button" disabled={dismissing} onClick={() => void dismiss()}>
          {dismissing ? 'Acknowledging' : 'Dismiss population alert'}
        </button>
      </section>
    </div>
  );
}
