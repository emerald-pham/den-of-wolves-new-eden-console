import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitWolfAttackAftermath, type WolfAttackAftermathChoice } from '@/lib/wolfAttackAftermathService';
import { hasFreshSessionAuthority } from '@/lib/sessionMutationAuthority';
import {
  pickupShipDestroyed, retainedFromDestroyedShip, scrapCollectionRoleId, type ScrapCollectionCraftId,
} from '@/lib/attackScrapCustody';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';

type Operator = 'doctor' | 'warrior' | Readonly<{ shuttleId: ScrapCollectionCraftId }>;

function actionSource(operator: Operator): (sourceId: string) => boolean {
  if (operator === 'doctor') return (sourceId) => sourceId === 'doctor-medical-aid';
  if (operator === 'warrior') return (sourceId) => sourceId === 'warrior-salvage-drones';
  return (sourceId) => sourceId === `capybara-scrap-collection-${operator.shuttleId}`;
}

function damageRows(view: WolfAttackMemberView | null) {
  return view?.results.flatMap((result) => result.sourceId === 'wolf-attack-damage' &&
    typeof result.targetId === 'string' && typeof result.outcome.damage === 'number'
    ? [{ shipId: result.targetId, damage: result.outcome.damage,
      destroyed: result.outcome.destroyed === true,
      populationLoss: typeof result.outcome.populationLoss === 'number' ? result.outcome.populationLoss : 0 }]
    : []) ?? [];
}

export default function WolfAttackAftermathActionPanel({ operator }: Readonly<{ operator: Operator }>) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [view, setView] = useState<WolfAttackMemberView | null>(null);
  const [selectedShipIds, setSelectedShipIds] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const sessionId = session?.id;

  useEffect(() => {
    setView(null);
    setSelectedShipIds([]);
    setMessage('');
    setError('');
    requestRef.current = null;
    if (!sessionId) return;
    return subscribeWolfAttackMemberView(sessionId, setView);
  }, [sessionId]);

  const expectedRole = operator === 'doctor' ? 'doctor' : operator === 'warrior' ? 'warrior-captain'
    : scrapCollectionRoleId(operator.shuttleId) ?? 'unconfigured-scrap-collector';
  const shuttleControl = typeof operator === 'object' ? session?.shuttleControl?.[operator.shuttleId] : undefined;
  const correctRole = operator === 'doctor' || operator === 'warrior'
    ? me?.replacementRoleId === expectedRole && me.activeConsoleRoleId === null && me.seatId === null
    : me?.assignedRoleId === expectedRole && shuttleControl?.holderUid === me.uid &&
      shuttleControl.ownerRoleId === expectedRole && (operator.shuttleId === 'boa' || me.activeConsoleRoleId === expectedRole);
  const hasCurrentAuthority = Boolean(session && me && me.sessionId === session.id && me.role === 'player' && correctRole &&
    me.replacementStatus == null && session.phase === 'active' && connection === 'live' && freshness === 'server' &&
    hasFreshSessionAuthority());
  const hasShuttleAuthority = typeof operator !== 'object' || Boolean(session?.capybaraEnabled !== false &&
    session?.activeVesselIds?.includes('capybara'));
  const canAct = hasCurrentAuthority && hasShuttleAuthority;
  const results = view?.results ?? [];
  const damage = useMemo(() => damageRows(view), [view]);
  const alreadyCommitted = view?.status === 'resolved' && results.some((result) => actionSource(operator)(result.sourceId));
  const doctorTargets = damage.filter((row) => row.populationLoss > 0);
  // Offer only pickups this craft can legally reach: a unique dock at a live
  // target, or retained custody from the destroyed target. The server rechecks.
  const canReachPickup = (shipId: string, destroyed: boolean) => {
    if (typeof operator !== 'object') return false;
    const shuttleId = operator.shuttleId;
    const dockings = session?.shuttleDockings?.filter((docking) => docking.shuttleId === shuttleId) ?? [];
    const dockedAtLiveTarget = !destroyed && session?.retainedShuttles?.[shuttleId] === undefined &&
      dockings.length === 1 && dockings[0]?.shipId === shipId;
    const retainedAtDestroyedTarget = destroyed && session?.retainedShuttles?.[shuttleId]?.holderUid === me?.uid &&
      retainedFromDestroyedShip(session ?? undefined, shuttleId, shipId);
    return dockedAtLiveTarget || retainedAtDestroyedTarget;
  };
  const scrapTargets = typeof operator === 'object' && view?.status === 'resolved' &&
    view.currentStep === 'resolved' ? damage.filter((row) =>
      row.damage >= 3 && canReachPickup(row.shipId, row.destroyed) &&
      !results.some((result) => result.targetId === row.shipId && result.sourceId.startsWith('capybara-scrap-collection-')))
    : [];
  // Pickups the server carried past a later attack stay collectable once.
  const carriedPickups = typeof operator === 'object'
    ? Object.entries(session?.attackScrapPickups ?? {}).flatMap(([shipId, pickups]) => pickups
      .filter((pickup) => pickup.attackId !== view?.attackId &&
        canReachPickup(shipId, pickupShipDestroyed(pickup, shipId, session?.shipDamage)))
      .map((pickup) => ({ shipId, ...pickup })))
    : [];
  const warrior = session?.smallShipStates?.warrior;
  const salvageCharged = Boolean(warrior && view && warrior.cycle?.turn === view.turn &&
    warrior.cycle?.charges?.includes('salvage-drones') === true && warrior.hostShipId !== null &&
    session?.activeVesselIds?.includes(warrior.hostShipId) === true);
  const salvageDamageExists = damage.some((row) => row.damage > 0) || results.some((result) =>
    result.sourceId === 'pdf-fighter-ace' && typeof result.outcome.damage === 'number' && result.outcome.damage > 0);
  const viewReady = view?.status === 'resolved' && view.currentStep === 'resolved';

  const submit = useCallback(async (choice: WolfAttackAftermathChoice, carriedAttackId?: string) => {
    const attackId = carriedAttackId ?? (viewReady ? view?.attackId : undefined);
    if (!attackId || busy || !canAct) return;
    const fingerprint = JSON.stringify([attackId, choice]);
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, requestId: window.crypto.randomUUID() };
    }
    setBusy(true);
    setError('');
    try {
      const result = await commitWolfAttackAftermath(attackId, choice, requestRef.current.requestId);
      if (choice.action === 'doctor') {
        setMessage(`Medical Aid committed // ${result.mitigated?.length ?? 0} ship result${result.mitigated?.length === 1 ? '' : 's'}.`);
        setSelectedShipIds([]);
      } else if (choice.action === 'warrior-salvage') {
        setMessage(`Salvage Drones committed // ${result.materialsGained ?? 0} materials recovered.`);
      } else {
        setMessage(`${choice.shuttleId === 'macaw' ? 'Macaw' : 'Boa'} collected 1 Scrap from ${choice.targetShipId.toUpperCase()}.`);
      }
      requestRef.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The aftermath choice was rejected.');
    } finally {
      setBusy(false);
    }
  }, [busy, canAct, view, viewReady]);

  if (!sessionId || !correctRole) return null;
  if (operator === 'doctor') {
    if (!viewReady || !view) return null;
    if (!doctorTargets.length && !alreadyCommitted) return null;
    return <section className="role-brief__rules wolf-attack-aftermath-action" aria-label="Doctor Medical Aid">
      <p className="eyebrow">Cycle {view.turn} // resolved attack</p>
      <h3>Doctor Medical Aid</h3>
      <p>Choose damaged ships with population loss. The first selection is free; each additional ship uses 3 food and 3 water from that ship.</p>
      {alreadyCommitted ? <p role="status">Medical Aid is already committed for this attack.</p> : <>
        <fieldset disabled={!canAct || busy}>
          <legend>Choose ships</legend>
          {doctorTargets.map((row) => <label key={row.shipId}>
            <input type="checkbox" checked={selectedShipIds.includes(row.shipId)}
              onChange={(event) => setSelectedShipIds((current) => event.target.checked
                ? [...current, row.shipId] : current.filter((shipId) => shipId !== row.shipId))} />
            {row.shipId.toUpperCase()} // {row.populationLoss.toLocaleString()} population loss
          </label>)}
        </fieldset>
        <button type="button" disabled={!canAct || busy || selectedShipIds.length === 0}
          onClick={() => void submit({ action: 'doctor', selectedShipIds })}>
          {busy ? 'Recording Medical Aid…' : 'Record Medical Aid'}
        </button>
      </>}
      {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    </section>;
  }
  if (operator === 'warrior') {
    if (!viewReady || !view) return null;
    if (!salvageCharged || !salvageDamageExists) return null;
    return <section className="role-brief__rules wolf-attack-aftermath-action" aria-label="Warrior Salvage Drones">
      <p className="eyebrow">Cycle {view.turn} // resolved attack</p>
      <h3>Warrior Salvage Drones</h3>
      {alreadyCommitted ? <p role="status">Salvage Drones are already resolved for this attack.</p> : <>
        <p>One server die is rolled for each damage point dealt by either side; each result of 5 or 6 recovers one material.</p>
        <button type="button" disabled={!canAct || busy} onClick={() => void submit({ action: 'warrior-salvage' })}>
          {busy ? 'Resolving Salvage Drones…' : 'Resolve Salvage Drones'}
        </button>
      </>}
      {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    </section>;
  }
  if (!session.capybaraEnabled || !scrapTargets.length && !carriedPickups.length) return null;
  return <section className="role-brief__rules wolf-attack-aftermath-action" aria-label={`${operator.shuttleId === 'macaw' ? 'Macaw' : 'Boa'} Scrap collection`}>
    {scrapTargets.length > 0 && view && <p className="eyebrow">Cycle {view.turn} // resolved attack</p>}
    <h3>{operator.shuttleId === 'macaw' ? 'Macaw' : 'Boa'} Scrap collection</h3>
    {carriedPickups.map((pickup) => <article key={`${pickup.attackId}:${pickup.shipId}`}>
      <p>{pickup.shipId.toUpperCase()} // cycle {pickup.turn} attack // 1 Scrap pickup</p>
      <button type="button" disabled={!canAct || busy}
        onClick={() => void submit({ action: 'collect-scrap', shuttleId: operator.shuttleId, targetShipId: pickup.shipId },
          pickup.attackId)}>
        {busy ? 'Collecting Scrap…' : `Collect Scrap from ${pickup.shipId.toUpperCase()} (cycle ${pickup.turn} attack)`}
      </button>
    </article>)}
    {scrapTargets.map((row) => <article key={row.shipId}>
      <p>{row.shipId.toUpperCase()} // {row.damage} damage // 1 Scrap opportunity</p>
      <button type="button" disabled={!canAct || busy}
        onClick={() => void submit({ action: 'collect-scrap', shuttleId: operator.shuttleId, targetShipId: row.shipId })}>
        {busy ? 'Collecting Scrap…' : `Collect Scrap from ${row.shipId.toUpperCase()}`}
      </button>
    </article>)}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
