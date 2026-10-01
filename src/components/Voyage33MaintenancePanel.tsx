import { useEffect, useMemo, useState } from 'react';
import type { ShipResourceInventory } from '../../functions/src/resources';
import {
  isVoyage33InMutiny,
  parseVoyage33MaintenanceState,
  type Voyage33MaintenanceState,
} from '../../functions/src/voyage33Maintenance';
import type { GameSession } from '@/types/game';
import { commandErrorCode, normalizeCommandError } from '@/lib/commandErrors';
import { runVoyage33Maintenance } from '@/lib/smallShipService';
import { useSessionStore } from '@/store/useSessionStore';
import './Voyage33MaintenancePanel.css';

type MaintenanceAction = 'begin' | 'rations' | 'unrest' | 'riot' | 'reactor' | 'end';
type Choices = Readonly<{ foodLevel?: number; waterLevel?: number; consoles?: readonly string[] }>;
type Attempt = Readonly<{
  action: MaintenanceAction;
  choices: Choices;
  requestId: string;
  sessionId: string;
  uid: string;
  instanceId: string;
  hostShipId: string;
  expectedRevision: number;
  expectedDockingRevision: number;
  turn: number;
}>;
type ReceiptGuard =
  | Readonly<{
    kind: 'stale';
    sessionId: string;
    cycleRevision: number;
    dockingRevision: number;
  }>
  | Readonly<{
    kind: 'committed';
    sessionId: string;
    hostShipId: string;
    cycleRevision: number;
    dockingRevision: number;
    state: Voyage33MaintenanceState;
  }>;
type ServerReceipt = Readonly<{
  state: Voyage33MaintenanceState;
  hostResources: ShipResourceInventory;
  action: MaintenanceAction;
  requestId: string;
}>;
type Feedback = Readonly<{ role: 'status' | 'alert'; message: string }>;

interface Voyage33MaintenancePanelProps {
  readonly session: GameSession;
  readonly state: Voyage33MaintenanceState;
  readonly hostShipId: string;
  readonly hostName: string;
  readonly hostResources: ShipResourceInventory | undefined;
  readonly currentTurn: number;
  readonly phase: 'team' | 'coordination' | 'other';
  readonly authorityReady: boolean;
}

const CONSOLE_OPTIONS = [
  { id: 'water-reclamation', name: 'Water Reclimator' },
  { id: 'hydroponics', name: 'Hydroponics' },
] as const;
const UNCERTAIN_CODES = new Set(['cancelled', 'deadline-exceeded', 'internal', 'unknown', 'unavailable']);
const RESOURCE_KEYS = ['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseHostResources(value: unknown): ShipResourceInventory | undefined {
  if (!isRecord(value) || RESOURCE_KEYS.some((key) => !isRevision(value[key]))) return undefined;
  if (value.scrap !== undefined && !isRevision(value.scrap)) return undefined;
  return {
    ore: value.ore as number,
    fuel: value.fuel as number,
    food: value.food as number,
    water: value.water as number,
    materials: value.materials as number,
    securityTeams: value.securityTeams as number,
    ...(value.scrap === undefined ? {} : { scrap: value.scrap as number }),
  };
}

function nextRequestId(): string {
  const generated = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `voyage-maint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return generated.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
}

function actionLabel(action: MaintenanceAction): string {
  switch (action) {
    case 'begin': return 'begin maintenance';
    case 'rations': return 'apply rations';
    case 'unrest': return 'roll unrest';
    case 'riot': return 'roll population';
    case 'reactor': return 'resolve charging';
    case 'end': return 'end maintenance';
  }
}

function parseStaleReceipt(value: unknown, attempt: Attempt): ReceiptGuard | undefined {
  if (!isRecord(value) || value.status !== 'stale' ||
      value.requestId !== attempt.requestId || value.sessionId !== attempt.sessionId ||
      value.shipId !== 'voyage-33-0' ||
      value.action !== attempt.action || value.expectedRevision !== attempt.expectedRevision ||
      value.expectedDockingRevision !== attempt.expectedDockingRevision ||
      !isRevision(value.currentRevision) || !isRevision(value.currentDockingRevision) ||
      value.currentRevision < attempt.expectedRevision ||
      value.currentDockingRevision < attempt.expectedDockingRevision ||
      value.currentRevision === attempt.expectedRevision &&
        value.currentDockingRevision === attempt.expectedDockingRevision) return undefined;
  return {
    kind: 'stale',
    sessionId: attempt.sessionId,
    cycleRevision: value.currentRevision as number,
    dockingRevision: value.currentDockingRevision as number,
  };
}

function sameCycle(left: Voyage33MaintenanceState['cycle'], right: Voyage33MaintenanceState['cycle']): boolean {
  const normalize = (cycle: Voyage33MaintenanceState['cycle']) => ({
    step: cycle.step,
    revision: cycle.revision,
    results: Object.fromEntries(Object.entries(cycle.results).sort(([a], [b]) => a.localeCompare(b))),
    charges: [...cycle.charges],
    ...(cycle.turn === undefined ? {} : { turn: cycle.turn }),
    ...(cycle.rationBonus === undefined ? {} : { rationBonus: cycle.rationBonus }),
    ...(cycle.chargingSkipped === undefined ? {} : { chargingSkipped: cycle.chargingSkipped }),
    ...(cycle.startedAt === undefined ? {} : { startedAt: cycle.startedAt }),
    ...(cycle.completedAt === undefined ? {} : { completedAt: cycle.completedAt }),
  });
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function sameMaintenanceState(left: Voyage33MaintenanceState, right: Voyage33MaintenanceState): boolean {
  return left.id === right.id && left.hostShipId === right.hostShipId &&
    left.dockingRevision === right.dockingRevision && left.population === right.population &&
    left.unrest === right.unrest && JSON.stringify(left.mutiny ?? null) === JSON.stringify(right.mutiny ?? null) &&
    sameCycle(left.cycle, right.cycle);
}

function parseCommittedReceipt(value: unknown, attempt: Attempt): ServerReceipt | undefined {
  if (!isRecord(value) || (value.status !== 'committed' && value.status !== 'replayed') ||
      value.requestId !== attempt.requestId || value.sessionId !== attempt.sessionId ||
      value.shipId !== 'voyage-33-0' || value.hostShipId !== attempt.hostShipId ||
      value.action !== attempt.action || value.expectedRevision !== attempt.expectedRevision ||
      value.expectedDockingRevision !== attempt.expectedDockingRevision ||
      value.currentTurn !== attempt.turn ||
      !isRevision(value.committedRevision) || value.committedRevision !== attempt.expectedRevision + 1 ||
      value.currentDockingRevision !== attempt.expectedDockingRevision || !isRecord(value.result)) return undefined;

  const state = parseVoyage33MaintenanceState(value.result.state);
  const topLevelCycleState = state && parseVoyage33MaintenanceState({ ...state, cycle: value.cycle });
  const hostResources = parseHostResources(value.result.hostResources);
  if (!state || !topLevelCycleState || !hostResources || state.hostShipId !== attempt.hostShipId ||
      state.dockingRevision !== attempt.expectedDockingRevision ||
      state.cycle.revision !== value.committedRevision ||
      !sameCycle(state.cycle, topLevelCycleState.cycle)) return undefined;

  return { state, hostResources, action: attempt.action, requestId: attempt.requestId };
}

function projectionMatches(session: GameSession | null, guard: ReceiptGuard): boolean {
  if (!session || session.id !== guard.sessionId) return false;
  const state = parseVoyage33MaintenanceState(session.voyage33Maintenance);
  if (!state || state.dockingRevision < guard.dockingRevision || state.cycle.revision < guard.cycleRevision) return false;
  const laterServerMutation = state.dockingRevision > guard.dockingRevision ||
    state.cycle.revision > guard.cycleRevision;
  if (laterServerMutation) return true;
  if (guard.kind === 'stale') return true;
  if (state.hostShipId !== guard.hostShipId) return false;
  return sameMaintenanceState(state, guard.state);
}

function attemptStillMatches(attempt: Attempt): boolean {
  const current = useSessionStore.getState();
  const currentSession = current.session;
  const currentState = parseVoyage33MaintenanceState(currentSession?.voyage33Maintenance);
  return typeof window !== 'undefined' && window.navigator.onLine &&
    current.connection === 'live' && current.sessionSnapshotFreshness === 'server' &&
    currentSession?.id === attempt.sessionId && current.me?.uid === attempt.uid &&
    current.me.role === 'gm' && current.me.sessionId === attempt.sessionId &&
    current.gmInstance?.id === attempt.instanceId && current.gmInstance.sessionId === attempt.sessionId &&
    current.gmInstance.uid === attempt.uid && currentSession.phase === 'active' &&
    currentSession.singlePlayerDemo == null && currentSession.currentTurn === attempt.turn &&
    currentState?.hostShipId === attempt.hostShipId &&
    currentState.cycle.revision === attempt.expectedRevision &&
    currentState.dockingRevision === attempt.expectedDockingRevision;
}

export default function Voyage33MaintenancePanel({
  session,
  state,
  hostShipId,
  hostName,
  hostResources,
  currentTurn,
  phase,
  authorityReady,
}: Voyage33MaintenancePanelProps) {
  const [foodLevel, setFoodLevel] = useState(0);
  const [waterLevel, setWaterLevel] = useState(0);
  const [selectedConsole, setSelectedConsole] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [receipt, setReceipt] = useState<ServerReceipt | null>(null);
  const [guard, setGuard] = useState<ReceiptGuard | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const connection = useSessionStore((current) => current.connection);
  const snapshotFreshness = useSessionStore((current) => current.sessionSnapshotFreshness);
  const liveProjectionFresh = connection === 'live' && snapshotFreshness === 'server' &&
    typeof window !== 'undefined' && window.navigator.onLine;

  useEffect(() => {
    if (!guard || session.id !== guard.sessionId) return;
    if (liveProjectionFresh && projectionMatches(session, guard)) {
      setGuard(null);
      setReceipt(null);
      setAttempt(null);
      setFeedback({ role: 'status', message: 'The live session projection now matches the server maintenance receipt.' });
    }
  }, [session, guard, liveProjectionFresh]);

  const currentResources = parseHostResources(hostResources);
  const displayCycle = receipt?.state.cycle ?? state.cycle;
  const latestResult = useMemo(() => Object.entries(displayCycle.results)
    .sort(([left], [right]) => Number(left) - Number(right))
    .at(-1)?.[1], [displayCycle]);
  const inMutiny = isVoyage33InMutiny(state);
  const inCurrentCycle = state.cycle.turn === currentTurn;
  const alreadyCompleted = state.cycle.step === 0 && inCurrentCycle;
  const cycleFromPriorTurn = state.cycle.step > 0 && !inCurrentCycle;
  const controlsHeld = !!guard || !!attempt;
  let blockedReason: string | undefined;
  if (phase !== 'team') blockedReason = 'Voyage 33-0 maintenance is available during Team Phase.';
  else if (!authorityReady) blockedReason = 'Wait for the live GM session, active host, and current server projection before maintenance.';
  else if (!currentResources) blockedReason = 'The docked host resource projection is unavailable.';
  else if (inMutiny) blockedReason = 'Mutiny lock // a captain change is required before maintenance.';
  else if (cycleFromPriorTurn) blockedReason = 'The maintenance cycle belongs to an earlier turn. Refresh the live session before proceeding.';
  else if (alreadyCompleted) blockedReason = 'This maintenance cycle is already complete for the current turn.';
  else if (controlsHeld) blockedReason = guard?.kind === 'stale'
    ? 'STALE // waiting for the latest live maintenance and host projection.'
    : guard?.kind === 'committed'
      ? 'Server receipt confirmed // waiting for the current session projection.'
      : attempt
      ? 'UNCERTAIN // retry the exact request before choosing another maintenance action.'
      : 'Waiting for the server maintenance receipt.';

  const perform = async (nextAttempt: Attempt) => {
    setPending(true);
    setFeedback({ role: 'status', message: `Waiting for the server receipt for ${actionLabel(nextAttempt.action)}.` });
    try {
      const raw = await runVoyage33Maintenance(
        nextAttempt.action,
        nextAttempt.expectedRevision,
        nextAttempt.expectedDockingRevision,
        nextAttempt.choices,
        nextAttempt.requestId,
      );
      const stale = parseStaleReceipt(raw, nextAttempt);
      if (stale) {
        setAttempt(null);
        setReceipt(null);
        setGuard(stale);
        setFeedback({ role: 'alert', message: 'STALE // maintenance or host state changed. Waiting for the current server projection before another action.' });
        return;
      }
      const committed = parseCommittedReceipt(raw, nextAttempt);
      if (!committed) {
        setAttempt(nextAttempt);
        setFeedback({ role: 'alert', message: 'UNCERTAIN // the maintenance response did not match this request. Retry only the exact action after confirming the same live GM context.' });
        return;
      }
      const current = useSessionStore.getState();
      if (current.session?.id !== nextAttempt.sessionId ||
          current.me?.uid !== nextAttempt.uid || current.gmInstance?.id !== nextAttempt.instanceId) {
        setAttempt(nextAttempt);
        setFeedback({ role: 'alert', message: 'UNCERTAIN // the GM session changed while maintenance was pending. Restore the same live GM instance and retry only this request.' });
        return;
      }
      setAttempt(null);
      setReceipt(committed);
      const nextGuard: ReceiptGuard = {
        kind: 'committed',
        sessionId: nextAttempt.sessionId,
        hostShipId: nextAttempt.hostShipId,
        cycleRevision: committed.state.cycle.revision,
        dockingRevision: committed.state.dockingRevision,
        state: committed.state,
      };
      setGuard(nextGuard);
      setFeedback({
        role: 'status',
        message: `SERVER RECEIPT // ${nextAttempt.action.toUpperCase()} confirmed at maintenance revision ${committed.state.cycle.revision}. Waiting for the live session projection to reflect this result and the current host resource ledger.`,
      });
    } catch (cause) {
      const code = commandErrorCode(cause);
      const normalized = normalizeCommandError(cause);
      if (UNCERTAIN_CODES.has(code)) {
        setAttempt(nextAttempt);
        setFeedback({ role: 'alert', message: `UNCERTAIN // ${normalized.message} Retry only this exact request while the same live GM instance and maintenance revisions remain current.` });
      } else {
        setAttempt(null);
        setFeedback({ role: 'alert', message: `DENIED // ${normalized.message}` });
      }
    } finally {
      setPending(false);
    }
  };

  const submit = (action: MaintenanceAction, choices: Choices = {}) => {
    if (blockedReason || pending || !currentResources) return;
    const current = useSessionStore.getState();
    const me = current.me;
    const instance = current.gmInstance;
    if (!me || me.role !== 'gm' || !instance || !attemptStillMatches({
      action, choices, requestId: 'preflight', sessionId: session.id, uid: me.uid,
      instanceId: instance.id, hostShipId, expectedRevision: state.cycle.revision,
      expectedDockingRevision: state.dockingRevision, turn: currentTurn,
    })) {
      setFeedback({ role: 'alert', message: 'The current GM instance or live maintenance projection changed. Refresh before sending another command.' });
      return;
    }
    const nextAttempt: Attempt = {
      action, choices, requestId: nextRequestId(), sessionId: session.id, uid: me.uid,
      instanceId: instance.id, hostShipId, expectedRevision: state.cycle.revision,
      expectedDockingRevision: state.dockingRevision, turn: currentTurn,
    };
    setFeedback(null);
    void perform(nextAttempt);
  };

  const retryExact = () => {
    if (!attempt || pending) return;
    if (!attemptStillMatches(attempt)) {
      setFeedback({ role: 'alert', message: 'The original GM instance or maintenance revisions are no longer current. Keep this request unresolved and restore its exact live context before retrying.' });
      return;
    }
    void perform(attempt);
  };

  const step = state.cycle.step;
  const chargingSkipped = state.cycle.chargingSkipped === true;
  const disabled = Boolean(blockedReason) || pending;
  const receiptWaiting = guard?.kind === 'committed';

  return (
    <section className="voyage33-maintenance cic-frame" aria-label="Voyage 33-0 maintenance">
      <header className="voyage33-maintenance__header">
        <div>
          <p className="voyage33-maintenance__eyebrow">TEAM PHASE // HOST-FUNDED</p>
          <h3>Voyage 33-0 maintenance</h3>
        </div>
        <span className="voyage33-maintenance__step">STEP {step} / 5 // REV {state.cycle.revision}</span>
      </header>

      <p className="voyage33-maintenance__identity">
        Four maintenance steps use the currently docked host. The server checks and updates its resource ledger.
      </p>
      <div className="voyage33-maintenance__readouts">
        <p><span>Population</span><strong>{(receipt?.state.population ?? state.population).toLocaleString()}</strong></p>
        <p><span>Unrest</span><strong>{receipt?.state.unrest ?? state.unrest} / 10</strong></p>
        <p><span>Current host</span><strong>{hostName} // {hostShipId}</strong></p>
        <p><span>Host resources</span><strong>{currentResources
          ? `${currentResources.food} food // ${currentResources.water} water // ${currentResources.fuel} fuel`
          : 'Unavailable // waiting for the live resource ledger'}</strong></p>
      </div>

      {phase !== 'team' && (
        <p className="voyage33-maintenance__notice" role="status">Maintenance actions are held outside Team Phase. Server-recorded results remain visible.</p>
      )}
      {inMutiny && (
        <p className="voyage33-maintenance__notice" role="status">Mutiny lock // maintenance remains unavailable until the captain is replaced.</p>
      )}
      {cycleFromPriorTurn && (
        <p className="voyage33-maintenance__notice" role="status">This maintenance cycle belongs to an earlier turn. Refresh before acting.</p>
      )}
      {alreadyCompleted && (
        <p className="voyage33-maintenance__notice" role="status">This maintenance cycle is already complete for the current turn.</p>
      )}
      {chargingSkipped && step === 4 && (
        <p className="voyage33-maintenance__notice" role="status">Population loss skipped console charging. Confirm the skipped reactor step to continue.</p>
      )}
      {blockedReason && phase === 'team' && !inMutiny && !cycleFromPriorTurn && !alreadyCompleted && (
          <p className="voyage33-maintenance__notice" role="status">{blockedReason}</p>
      )}

      <section className="voyage33-maintenance__controls" aria-label="Four-step Team maintenance">
        {step === 0 && !alreadyCompleted && (
          <button className="cic-action-button" type="button" disabled={disabled}
            onClick={() => submit('begin')}>Begin maintenance cycle // Turn {currentTurn}</button>
        )}
        {step === 1 && (
          <fieldset className="maintenance-controls" disabled={disabled}>
            <legend>Step 1 // Rations</legend>
            <p>Choose a food and water ration level. The server validates the selected cost against {hostName}’s current ledger.</p>
            <label>Food ration level
              <select aria-label="Voyage 33-0 food ration level" value={foodLevel}
                onChange={(event) => setFoodLevel(Number(event.target.value))}>
                {[0, 1, 2, 3].map((level) => <option key={level} value={level}>Level {level}</option>)}
              </select>
            </label>
            <label>Water ration level
              <select aria-label="Voyage 33-0 water ration level" value={waterLevel}
                onChange={(event) => setWaterLevel(Number(event.target.value))}>
                {[0, 1, 2, 3].map((level) => <option key={level} value={level}>Level {level}</option>)}
              </select>
            </label>
            <button className="cic-action-button" type="button" onClick={() => submit('rations', { foodLevel, waterLevel })}>
              Apply host-funded rations
            </button>
          </fieldset>
        )}
        {step === 2 && (
          <button className="cic-action-button" type="button" disabled={disabled}
            onClick={() => submit('unrest')}>Roll unrest // server dice</button>
        )}
        {step === 3 && (
          <button className="cic-action-button" type="button" disabled={disabled}
            onClick={() => submit('riot')}>Roll population / riot // server dice</button>
        )}
        {step === 4 && (
          <fieldset className="maintenance-controls" disabled={disabled}>
            <legend>Step 4 // Reactor // 1 console</legend>
            {chargingSkipped ? (
              <button className="cic-action-button" type="button" onClick={() => submit('reactor', { consoles: [] })}>
                Confirm skipped console charging
              </button>
            ) : (
              <>
                <p>Select up to one printed production console. Each charge is checked by the server.</p>
                {CONSOLE_OPTIONS.map((option) => (
                  <label key={option.id}>
                    <input type="radio" name="voyage33-console" value={option.id}
                      checked={selectedConsole === option.id}
                      onChange={() => setSelectedConsole(option.id)} />
                    {option.name}
                  </label>
                ))}
                <button className="cic-action-button" type="button"
                  onClick={() => submit('reactor', { consoles: selectedConsole ? [selectedConsole] : [] })}>
                  Resolve console charging
                </button>
              </>
            )}
          </fieldset>
        )}
        {step === 5 && (
          <button className="cic-action-button" type="button" disabled={disabled}
            onClick={() => submit('end')}>End maintenance cycle</button>
        )}
      </section>

      {latestResult && (
        <p className="voyage33-maintenance__result" role="status">
          {receiptWaiting ? 'SERVER RECEIPT RESULT // ' : 'SERVER RESULT // '}{latestResult}
        </p>
      )}
      {receiptWaiting && receipt && (
        <p className="voyage33-maintenance__receipt" role="status">
          Receipt host state // {hostName} // {receipt.hostResources.food} food // {receipt.hostResources.water} water // {receipt.hostResources.fuel} fuel. Waiting for the live session projection.
        </p>
      )}
      {feedback && <p className="voyage33-maintenance__feedback" role={feedback.role} aria-live={feedback.role === 'alert' ? 'assertive' : 'polite'}>{feedback.message}</p>}
      {attempt && !pending && (
        <button className="cic-action-button" type="button" onClick={retryExact}>
          Retry exact {actionLabel(attempt.action)} request
        </button>
      )}
    </section>
  );
}
