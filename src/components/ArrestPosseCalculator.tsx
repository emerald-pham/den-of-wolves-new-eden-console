import { useEffect, useState, type FormEvent } from 'react';
import type {
  ArrestCase,
  ArrestCaseDispositionResult,
  ArrestPosseCalculation,
  ArrestPosseOutcome,
  ArrestPrisonerDisposition,
} from '@/types/game';
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
  /** Pure, injected roster for a facilitator-authored attendance result. */
  readonly presentPlayerOptions?: readonly ArrestPosseTargetOption[];
  readonly expectedCycle?: number;
  readonly caseOutcome?: ArrestPosseOutcome | null;
  readonly caseRecord?: ArrestCase | null;
  readonly currentCycle?: number;
  readonly deadlineTeamPhaseOpen?: boolean;
  readonly onCalculate: (
    targetUid: string,
    defenders: number,
    adjustment: -1 | 1 | undefined,
    expectedRevision: number,
  ) => Promise<ArrestPosseCalculation | null>;
  readonly onResolve?: (
    targetUid: string,
    presentPlayerUids: readonly string[],
    expectedCycle: number,
    expectedRevision: number,
  ) => Promise<ArrestPosseOutcome>;
  readonly onDisposition?: (
    targetUid: string,
    disposition: ArrestPrisonerDisposition,
    expectedCycle: number,
    expectedRevision: number,
    ruling?: string,
  ) => Promise<ArrestCaseDispositionResult>;
}

export default function ArrestPosseCalculator({
  targetOptions,
  censusRevision,
  expectedRevision,
  calculationGeneration = 0,
  calculation,
  presentPlayerOptions = [],
  expectedCycle,
  caseOutcome = null,
  caseRecord = null,
  currentCycle,
  deadlineTeamPhaseOpen = false,
  onCalculate,
  onResolve,
  onDisposition,
}: ArrestPosseCalculatorProps) {
  const [targetUid, setTargetUid] = useState(targetOptions[0]?.uid ?? '');
  const [defenders, setDefenders] = useState('0');
  const [adjustmentChoice, setAdjustmentChoice] = useState<'none' | '-1' | '1'>('none');
  const [reply, setReply] = useState<{
    readonly calculation: ArrestPosseCalculation;
    readonly generation: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedPresentUids, setSelectedPresentUids] = useState<readonly string[]>([]);
  const [resolving, setResolving] = useState(false);
  const [resolvedOutcome, setResolvedOutcome] = useState<ArrestPosseOutcome | null>(null);
  const [ruling, setRuling] = useState('');
  const [dispositionReply, setDispositionReply] = useState<ArrestCaseDispositionResult | null>(null);
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
  const visibleOutcome = resolvedOutcome?.targetUid === targetUid
    ? resolvedOutcome
    : caseOutcome?.targetUid === targetUid ? caseOutcome : null;
  const selectedPresent = [...new Set(selectedPresentUids)].filter((uid) =>
    uid !== targetUid && presentPlayerOptions.some((player) => player.uid === uid));
  const canResolve = Boolean(onResolve && expectedCycle !== undefined && Number.isSafeInteger(expectedCycle) &&
    expectedCycle >= 1 && inputsMatch && censusIsCurrent && !resolving && !busy);
  const activeCase = caseRecord?.targetUid === targetUid && caseRecord.status === 'pending-resolution' &&
    caseRecord.deadlineCycle !== undefined
    ? caseRecord : null;
  const deadlineOpen = Boolean(activeCase && currentCycle === activeCase.deadlineCycle && deadlineTeamPhaseOpen);
  const caseIsOverdue = Boolean(activeCase && currentCycle !== undefined &&
    (currentCycle > activeCase.deadlineCycle! || currentCycle === activeCase.deadlineCycle && !deadlineTeamPhaseOpen));
  const canDisposition = Boolean(activeCase && onDisposition && currentCycle !== undefined &&
    Number.isSafeInteger(currentCycle) && currentCycle >= activeCase.deadlineCycle! && !resolving &&
    (deadlineOpen || caseIsOverdue && ruling.trim().length > 0));

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

  async function resolveAttendance(): Promise<void> {
    if (!canResolve || !onResolve || expectedCycle === undefined || !latest) return;
    setResolving(true);
    setErrorMessage(null);
    try {
      const result = await onResolve(targetUid, selectedPresent, expectedCycle, latest.revision);
      setResolvedOutcome(result);
    } catch (cause) {
      setErrorMessage(normalizeCommandError(cause).message);
    } finally {
      setResolving(false);
    }
  }

  async function recordDisposition(disposition: ArrestPrisonerDisposition): Promise<void> {
    if (!canDisposition || !activeCase || !onDisposition || currentCycle === undefined) return;
    const late = caseIsOverdue;
    if (late && disposition !== 'facilitator-resolution') return;
    if (!late && disposition === 'facilitator-resolution') return;
    setResolving(true);
    setErrorMessage(null);
    try {
      const result = await onDisposition(targetUid, disposition, currentCycle, activeCase.revision,
        disposition === 'facilitator-resolution' ? ruling.trim() : undefined);
      setDispositionReply(result);
    } catch (cause) {
      setErrorMessage(normalizeCommandError(cause).message);
    } finally {
      setResolving(false);
    }
  }

  return (
    <section className="gm-console__module cic-frame gm-arrest-posse" aria-label="Arrest posse calculator">
      <h2 className="gm-console__section-title">Arrest posse calculation</h2>
      <p className="gm-arrest-posse__hint">
        Facilitator-only calculation // the server returns only the required player count.
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
      {onResolve && latest && inputsMatch && censusIsCurrent && (
        <fieldset className="gm-arrest-posse__attendance" role="group" aria-label="Posse attendance"
          disabled={resolving || busy}>
          <legend>Players present in the arresting posse</legend>
          {presentPlayerOptions.filter((player) => player.uid !== targetUid).map((player) => (
            <label key={player.uid}>
              <input type="checkbox" checked={selectedPresent.includes(player.uid)}
                onChange={(event) => setSelectedPresentUids((current) => event.target.checked
                  ? [...new Set([...current, player.uid])]
                  : current.filter((uid) => uid !== player.uid))} />
              {player.label}
            </label>
          ))}
          {presentPlayerOptions.filter((player) => player.uid !== targetUid).length === 0 &&
            <p>No active posse members are available.</p>}
        </fieldset>
      )}
      {onResolve && latest && inputsMatch && censusIsCurrent && (
        <button type="button" className="cic-action-button" disabled={!canResolve}
          onClick={() => void resolveAttendance()}>
          {resolving ? 'Resolving attendance…' : 'Resolve attendance'}
        </button>
      )}
      {visibleOutcome?.outcome === 'arrested' && visibleOutcome.deadlineCycle !== undefined && (
        <p className="gm-console__status" role="status" aria-live="polite">
          Arrested; resolve the prisoner by the end of Team Phase {visibleOutcome.deadlineCycle}.
        </p>
      )}
      {visibleOutcome?.outcome === 'not-arrested' && (
        <p className="gm-console__status" role="status" aria-live="polite">
          Posse did not reach the required number.
        </p>
      )}
      {activeCase && (
        <section className="gm-arrest-posse__case" aria-label="Arrested prisoner case">
          <h3>Prisoner ruling // due by Team Phase {activeCase.deadlineCycle}</h3>
          <p>Record a facilitator decision for this arrested player. Execution opens the ordinary replacement eligibility process.</p>
          {currentCycle !== undefined && currentCycle < activeCase.deadlineCycle! && (
            <p role="status">The ruling window begins in Team Phase {activeCase.deadlineCycle}.</p>
          )}
          {currentCycle === activeCase.deadlineCycle && !deadlineTeamPhaseOpen && (
            <p role="status">The Team Phase ruling window is closed. Record a reasoned facilitator resolution.</p>
          )}
          {onDisposition && deadlineOpen && (
            <div className="gm-arrest-posse__case-actions">
              <button type="button" className="cic-action-button" disabled={resolving}
                onClick={() => void recordDisposition('released')}>Release prisoner</button>
              <button type="button" className="cic-action-button" disabled={resolving}
                onClick={() => void recordDisposition('executed')}>Execute prisoner</button>
            </div>
          )}
          {onDisposition && caseIsOverdue && (
            <div className="gm-arrest-posse__late-ruling">
              <label htmlFor="arrest-facilitator-ruling">Facilitator ruling
                <textarea id="arrest-facilitator-ruling" maxLength={240} value={ruling}
                  onChange={(event) => setRuling(event.target.value)} disabled={resolving} />
              </label>
              <button type="button" className="cic-action-button" disabled={!canDisposition}
                onClick={() => void recordDisposition('facilitator-resolution')}>
                {resolving ? 'Recording ruling…' : 'Record facilitator resolution'}
              </button>
            </div>
          )}
          {dispositionReply?.targetUid === activeCase.targetUid && (
            <p role="status">Prisoner case recorded // {dispositionReply.disposition}.</p>
          )}
        </section>
      )}
      {errorMessage && <p className="gm-console__status" role="alert">{errorMessage}</p>}
    </section>
  );
}
