import type { HummingbirdHarvest as HummingbirdHarvestState } from '@/types/game';

export type HummingbirdHarvestAttempt =
  | Readonly<{ kind: 'roll'; requestId: string; expectedRevision: number }>
  | Readonly<{ kind: 'allocate'; requestId: string; expectedRevision: number; foodDieIndex: 0 | 1 }>;

export interface HummingbirdHarvestChoicesView {
  readonly available: boolean;
  readonly unavailableMessages: readonly string[];
  readonly harvest: HummingbirdHarvestState | null;
  readonly retryAttempt: HummingbirdHarvestAttempt | null;
  readonly selectedFoodDieIndex: 0 | 1 | null;
  readonly busy: boolean;
  readonly notice: string;
  readonly error: string;
  readonly sampleNote?: string;
}

/** Render-only harvest controls shared by the live Explorer and prepared review scenes. */
export default function HummingbirdHarvestChoices({
  view,
  onRoll,
  onAllocate,
  onRetry,
}: Readonly<{
  view: HummingbirdHarvestChoicesView;
  onRoll: () => void;
  onAllocate: (foodDieIndex: 0 | 1) => void;
  onRetry: (attempt: HummingbirdHarvestAttempt) => void;
}>) {
  const { harvest, retryAttempt: activeRetry, selectedFoodDieIndex, busy } = view;
  const pending = harvest?.status === 'pending';
  const resolved = harvest?.status === 'resolved';

  return (
    <section className="console-workspace__section hummingbird-harvest" aria-label="Hummingbird resource harvesting">
      <h3>Harvest allocation</h3>
      <p className="hummingbird-harvest__guidance">
        Coordination Phase // Fuelled Hummingbird rolls 2d6. Choose one die for food; the other becomes water in Hummingbird cargo.
      </p>
      {view.sampleNote && <p role="note">{view.sampleNote}</p>}
      {view.unavailableMessages.map((message) => <p key={message} role="status">{message}</p>)}
      {harvest === null && view.available && !activeRetry && (
        <div className="hummingbird-harvest__actions">
          <button className="cic-action-button" type="button" disabled={busy} onClick={onRoll}>
            {busy ? 'Rolling…' : 'Roll 2d6 for harvest'}
          </button>
        </div>
      )}
      {view.available && pending && harvest && (
        <div className="hummingbird-harvest__allocation">
          <p role="status">Roll ready // choose which die becomes food.</p>
          {selectedFoodDieIndex !== null && (
            <p role="status">Die {selectedFoodDieIndex + 1} remains selected for food.</p>
          )}
          <div className="hummingbird-harvest__dice" aria-label="Hummingbird harvest dice">
            {harvest.rolls.map((die, index) => (
              <button key={`${harvest.requestId}-${index}`} className="cic-action-button" type="button"
                aria-pressed={selectedFoodDieIndex === index}
                disabled={busy || !view.available || activeRetry !== null}
                onClick={() => onAllocate(index as 0 | 1)}>
                Die {index + 1}: {die} food / {harvest.rolls[index === 0 ? 1 : 0]} water
              </button>
            ))}
          </div>
        </div>
      )}
      {activeRetry?.kind === 'roll' && view.available && harvest === null && (
        <button className="cic-action-button" type="button" disabled={busy} onClick={() => onRetry(activeRetry)}>
          {busy ? 'Checking roll…' : 'Retry roll request'}
        </button>
      )}
      {activeRetry?.kind === 'allocate' && view.available && pending && harvest && (
        <button className="cic-action-button" type="button" disabled={busy} onClick={() => onRetry(activeRetry)}>
          {busy ? 'Checking allocation…' : `Retry Die ${activeRetry.foodDieIndex + 1} allocation`}
        </button>
      )}
      {view.available && resolved && harvest && (
        <p role="status">Resolved this cycle // {harvest.food} food and {harvest.water} water added to Hummingbird cargo.</p>
      )}
      {view.available && view.notice && <p role="status">{view.notice}</p>}
      {view.available && view.error && <p className="hummingbird-harvest__error" role="alert">{view.error}</p>}
    </section>
  );
}
