import { useEffect, useRef, useState } from 'react';
import { recycleWithBoa, type BoaRecyclingCommand } from '@/lib/boaRecyclingService';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';
import type { BoaRecyclingRecipeId } from '../../functions/src/boaRecycling';

interface Recipe {
  readonly id: BoaRecyclingRecipeId;
  readonly resourceId: 'food' | 'water' | 'ore' | 'materials' | 'fuel';
  readonly cost: 3 | 6;
  readonly label: string;
}

const RECIPES: readonly Recipe[] = [
  { id: 'food', resourceId: 'food', cost: 6, label: '6 Food' },
  { id: 'water', resourceId: 'water', cost: 6, label: '6 Water' },
  { id: 'ore', resourceId: 'ore', cost: 6, label: '6 Ore' },
  { id: 'materials', resourceId: 'materials', cost: 3, label: '3 Materials' },
  { id: 'fuel', resourceId: 'fuel', cost: 6, label: '6 Fuel' },
];

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
  readonly hostName?: string | undefined;
}

export default function BoaRecyclingPanel({ control, docking, fuelled, hostName }: Props) {
  const session = useSessionStore((state) => state.session)! as GameSession;
  const me = useSessionStore((state) => state.me)!;
  const [recipeId, setRecipeId] = useState<BoaRecyclingRecipeId>('food');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<BoaRecyclingCommand | null>(null);
  const pendingRef = useRef<SessionAuthorityCheckpoint | null>(null);
  const identity = `${session.id}:${me.uid}`;
  const ledger = session.boaRecycling;
  const historyValid = ledger === undefined || (ledger !== null &&
    Number.isSafeInteger(ledger.cycle) && ledger.cycle >= 0 &&
      Number.isSafeInteger(ledger.revision) && ledger.revision >= 0 &&
      Number.isSafeInteger(ledger.exchangesThisCycle) &&
      ledger.exchangesThisCycle >= 0 && ledger.exchangesThisCycle <= 2 &&
      (ledger.cycle !== 0 || ledger.revision === 0 && ledger.exchangesThisCycle === 0) &&
      (ledger.cycle === 0 || ledger.revision >= 1 && ledger.exchangesThisCycle >= 1));
  const currentCycle = session.currentTurn ?? 0;
  const ledgerRevision = ledger?.revision ?? 0;
  const exchangesThisCycle = ledger?.cycle === currentCycle ? ledger.exchangesThisCycle : 0;
  const scrap = session.shuttleCargo?.boa?.scrap ?? 0;
  const hostResources = docking ? session.shipResources?.[docking.shipId] : undefined;
  const selectedRecipe = RECIPES.find((recipe) => recipe.id === recipeId) ?? RECIPES[0]!;
  const hostBalance = hostResources?.[selectedRecipe.resourceId];
  const deadline = Date.parse(session.turnPhase?.openAirspaceEndsAt ?? '');
  const turnPhase = session.turnPhase;
  const coordinationWindowOpen = session.phase === 'active' && currentCycle >= 1 &&
    turnPhase?.turn === currentCycle && turnPhase.airspace.state === 'lifted' &&
    turnPhase.timerPause === undefined && Number.isFinite(deadline) && Date.now() < deadline;
  const isHolder = control.shuttleId === 'boa' && control.ownerRoleId === 'capybara-recycler' &&
    me.role === 'player' && me.uid === control.holderUid && me.assignedRoleId === 'capybara-recycler';
  const quotaRemaining = Math.max(0, 2 - exchangesThisCycle);
  const canSubmit = historyValid && isHolder && Boolean(docking && hostResources) &&
    fuelled && coordinationWindowOpen && quotaRemaining > 0 &&
    Number.isSafeInteger(hostBalance) && (hostBalance ?? 0) >= selectedRecipe.cost;

  useEffect(() => {
    setRecipeId('food');
    setRetry(null);
    setMessage('');
    setError('');
  }, [ledgerRevision, control.revision, docking?.shipId, currentCycle, identity]);

  async function submitExchange(): Promise<void> {
    const current = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    if (pendingRef.current && isCurrentSessionAuthority(pendingRef.current)) return;
    const command = retry ?? {
      requestId: window.crypto.randomUUID(), recipeId,
      expectedControlRevision: control.revision,
      expectedRecyclingRevision: ledgerRevision,
      expectedCycle: currentCycle,
      expectedHostShipId: docking?.shipId ?? '',
    };
    if (!retry && !canSubmit) return;
    pendingRef.current = checkpoint;
    setPending(true); setError(''); setMessage(''); setRetry(command);
    try {
      const result = await recycleWithBoa(command);
      if (!isCurrentSessionAuthority(checkpoint)) return;
      const recipe = RECIPES.find((entry) => entry.id === result.recipeId)!;
      setMessage(result.status === 'replayed'
        ? `This exchange was already recorded // Boa carries ${result.scrapRemaining} Scrap.`
        : `Recycled ${recipe.label} from ${hostName ?? result.hostShipId} // Boa carries ${result.scrapRemaining} Scrap.`);
      setRetry(null);
    } catch (cause) {
      if (isCurrentSessionAuthority(checkpoint)) {
        setError(cause instanceof Error ? cause.message : 'Boa recycling failed.');
      }
    } finally {
      if (isCurrentSessionAuthority(checkpoint) && pendingRef.current === checkpoint) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

  return <section className="console-workspace__section shuttle-control" aria-label="Boa recycling">
    <p className="console-workspace__eyebrow">Recycler // docked host inventory</p>
    <h3>Recycle host resources</h3>
    <p>When fuelled during Coordination, trade one printed recipe from Boa’s docked host for 1 Scrap, up to twice each cycle.</p>
    {docking && hostResources
      ? <p>Docked host // {hostName ?? docking.shipId} // Boa Scrap // {scrap} // exchanges remaining this cycle // {quotaRemaining}</p>
      : <p>Dock Boa to an active fleet ship before recycling.</p>}
    {!isHolder && <p>The current Capybara Recycler holding Boa controls recycling.</p>}
    {!fuelled && <p>Fuel Boa during the Team Phase before recycling.</p>}
    {!coordinationWindowOpen && <p>Boa recycling is available during a live Coordination Phase.</p>}
    {quotaRemaining === 0 && <p>Boa has completed its two exchanges for this cycle.</p>}
    {historyValid && hostBalance !== undefined && hostBalance < selectedRecipe.cost &&
      <p>The docked host needs {selectedRecipe.cost} {selectedRecipe.resourceId} for this recipe; it has {hostBalance}.</p>}
    {!historyValid && <p>Boa recycling history is unavailable. Refresh the live session before recycling.</p>}
    <label>
      Resource to recycle
      <select aria-label="Resource to recycle" value={recipeId} onChange={(event) =>
        setRecipeId(event.target.value as BoaRecyclingRecipeId)} disabled={pending || Boolean(retry)}>
        {RECIPES.map((recipe) => <option key={recipe.id} value={recipe.id}>
          {recipe.label} for 1 Scrap
        </option>)}
      </select>
    </label>
    <div className="console-workspace__actions">
      <button className="cic-action-button" type="button"
        disabled={pending || (!retry && !canSubmit)} onClick={() => void submitExchange()}>
        {pending ? 'Recycling resources…' : retry ? 'Retry exact recycling request' : `Recycle ${selectedRecipe.label} for 1 Scrap`}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    {retry && !pending && <p>The last request needs confirmation. Retry it safely with the same request id.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
