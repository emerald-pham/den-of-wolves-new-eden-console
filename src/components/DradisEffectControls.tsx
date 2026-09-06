import { useState } from 'react';
import { triggerDradisContact } from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';

interface DradisEffectDefinition {
  readonly id: string;
  readonly label: string;
  readonly pendingLabel: string;
  readonly trigger: () => Promise<void>;
}

/** One registry feeds every expanded DRADIS surface. Add future effects here. */
const DRADIS_EFFECTS: readonly DradisEffectDefinition[] = [
  {
    id: 'unknown-contact',
    label: 'Trigger unknown contact',
    pendingLabel: 'Triggering contact…',
    trigger: triggerDradisContact,
  },
];

export default function DradisEffectControls({ expanded }: { expanded: boolean }) {
  const isGm = useSessionStore(selectIsGm);
  const [pendingEffect, setPendingEffect] = useState<string | null>(null);

  if (!expanded || !isGm) return null;

  const run = async (effect: DradisEffectDefinition) => {
    setPendingEffect(effect.id);
    try {
      await effect.trigger();
    } catch {
      // The session service publishes the actionable communications error.
    } finally {
      setPendingEffect(null);
    }
  };

  return (
    <section className="dradis-effect-controls" aria-label="GM DRADIS effects">
      <p className="dradis-effect-controls__title">GM DRADIS effects</p>
      {DRADIS_EFFECTS.map((effect) => (
        <button
          className="cic-text-button dradis-effect-controls__trigger"
          type="button"
          key={effect.id}
          disabled={pendingEffect !== null}
          onClick={() => void run(effect)}
        >
          {pendingEffect === effect.id ? effect.pendingLabel : effect.label}
        </button>
      ))}
    </section>
  );
}
