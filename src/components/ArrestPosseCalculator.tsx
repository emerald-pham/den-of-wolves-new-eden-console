import { useEffect, useState, type FormEvent } from 'react';
import type { ArrestPosseCalculation } from '@/types/game';
import { normalizeCommandError } from '@/lib/commandErrors';
import '../styles/arrest-posse.css';

export interface ArrestPosseTargetOption {
  readonly uid: string;
  readonly label: string;
}

interface ArrestPosseCalculatorProps {
  readonly targetOptions: readonly ArrestPosseTargetOption[];
  readonly censusRevision: number;
  readonly expectedRevision: number;
  readonly calculationGeneration?: number;
  readonly calculation: ArrestPosseCalculation | null;
  readonly onCalculate: (
    targetUid: string,
    defenders: number,
    adjustment: -1 | 1 | undefined,
    expectedRevision: number,
  ) => Promise<ArrestPosseCalculation | null>;
}

export default function ArrestPosseCalculator({
  targetOptions,
  censusRevision,
  expectedRevision,
  calculationGeneration = 0,
  calculation,
  onCalculate,
}: ArrestPosseCalculatorProps) {
  const [targetUid, setTargetUid] = useState(targetOptions[0]?.uid ?? '');
  const [defenders, setDefenders] = useState('0');
  const [adjustmentChoice, setAdjustmentChoice] = useState<'none' | '-1' | '1'>('none');
  const [reply, setReply] = useState<{
    readonly calculation: ArrestPosseCalculation;
    readonly generation: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!targetOptions.some((target) => target.uid === targetUid)) {
      setTargetUid(targetOptions[0]?.uid ?? '');
    }
  }, [targetOptions, targetUid]);

  useEffect(() => {
    if (!calculation) return;
    if (targetOptions.some((target) => target.uid === calculation.targetUid)) {
      setTargetUid(calculation.targetUid);
    }
    setDefenders(String(calculation.defenders));
    setAdjustmentChoice(calculation.adjustment === undefined ? 'none' : String(calculation.adjustment) as '-1' | '1');
  }, [calculation, targetOptions]);

  const defenderCount = defenders === '' ? Number.NaN : Number(defenders);
  const validDefenders = Number.isSafeInteger(defenderCount) && defenderCount >= 0;
  const adjustment = adjustmentChoice === 'none' ? undefined : Number(adjustmentChoice) as -1 | 1;
  const visibleReply = reply?.generation === calculationGeneration ? reply.calculation : null;
  const latest = calculation && visibleReply
    ? (calculation.revision > visibleReply.revision ? calculation : visibleReply)
    : calculation ?? visibleReply;
  const censusIsCurrent = latest?.censusRevision === censusRevision;
  const inputsMatch = Boolean(
    latest && targetOptions.some((target) => target.uid === targetUid) &&
    latest.targetUid === targetUid && latest.defenders === defenderCount &&
    latest.adjustment === adjustment,
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!targetUid || !validDefenders || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const next = await onCalculate(targetUid, defenderCount, adjustment, expectedRevision);
      if (next) setReply({ calculation: next, generation: calculationGeneration });
    } catch (cause) {
      setErrorMessage(normalizeCommandError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gm-console__module cic-frame gm-arrest-posse" aria-label="Arrest posse calculator">
      <h2 className="gm-console__section-title">Arrest posse calculation</h2>
      <p className="gm-arrest-posse__hint">
        Facilitator-only calculation // the server reads the current loyalty record and returns the player count.
      </p>
      <form className="gm-arrest-posse__form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="arrest-posse-target">
          Target player
          <select
            id="arrest-posse-target"
            value={targetUid}
            onChange={(event) => setTargetUid(event.target.value)}
            disabled={targetOptions.length === 0 || busy}
            required
          >
            {targetOptions.length === 0 && <option value="">No eligible target</option>}
            {targetOptions.map((target) => (
              <option key={target.uid} value={target.uid}>{target.label}</option>
            ))}
          </select>
        </label>
        <label htmlFor="arrest-posse-defenders">
          Defenders
          <input
            id="arrest-posse-defenders"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={defenders}
            onChange={(event) => setDefenders(event.target.value)}
            disabled={busy}
          />
        </label>
        <label htmlFor="arrest-posse-adjustment">
          Optional adjustment
          <select
            id="arrest-posse-adjustment"
            value={adjustmentChoice}
            onChange={(event) => setAdjustmentChoice(event.target.value as 'none' | '-1' | '1')}
            disabled={busy}
          >
            <option value="none">No adjustment</option>
            <option value="-1">Subtract 1</option>
            <option value="1">Add 1</option>
          </select>
        </label>
        <button
          className="cic-action-button gm-arrest-posse__submit"
          type="submit"
          disabled={targetOptions.length === 0 || !targetUid || !validDefenders || busy}
        >
          {busy ? 'Calculating…' : 'Calculate required players'}
        </button>
      </form>
      {targetOptions.length === 0 && (
        <p className="gm-console__status" role="status">No eligible target is available in the current facilitator census.</p>
      )}
      {latest && targetOptions.length > 0 && !censusIsCurrent && (
        <p className="gm-console__status gm-arrest-posse__result" role="status">
          The facilitator census changed. Recalculate before using this count.
        </p>
      )}
      {latest && targetOptions.length > 0 && censusIsCurrent && !inputsMatch && (
        <p className="gm-console__status gm-arrest-posse__result" role="status">
          Inputs changed. Calculate again before using this count.
        </p>
      )}
      {latest && censusIsCurrent && inputsMatch && (
        <p className="gm-arrest-posse__result" role="status" aria-live="polite">
          <strong>{latest.requiredPlayers}</strong> players needed
        </p>
      )}
      {errorMessage && <p className="gm-console__status" role="alert">{errorMessage}</p>}
    </section>
  );
}
