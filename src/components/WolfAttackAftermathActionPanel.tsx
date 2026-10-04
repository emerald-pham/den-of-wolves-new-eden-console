import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitWolfAttackAftermath, type WolfAttackAftermathChoice } from '@/lib/wolfAttackAftermathService';
import { hasFreshSessionAuthority } from '@/lib/sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';

type Operator = 'doctor' | 'warrior' | Readonly<{ shuttleId: 'macaw' | 'boa' }>;

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
    : operator.shuttleId === 'macaw' ? 'capybara-captain' : 'capybara-recycler';
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
  const scrapTargets = damage.filter((row) => row.damage >= 3 && !row.destroyed &&
    !results.some((result) => result.targetId === row.shipId && result.sourceId.startsWith('capybara-scrap-collection-')));
  const warrior = session?.smallShipStates?.warrior;
  const salvageCharged = Boolean(warrior && view && warrior.cycle?.turn === view.turn &&
    warrior.cycle?.charges?.includes('salvage-drones') === true && warrior.hostShipId !== null &&
    session?.activeVesselIds?.includes(warrior.hostShipId) === true);
  const salvageDamageExists = damage.some((row) => row.damage > 0) || results.some((result) =>
    result.sourceId === 'pdf-fighter-ace' && typeof result.outcome.damage === 'number' && result.outcome.damage > 0);
  const viewReady = view?.status === 'resolved' && view.currentStep === 'resolved';

  const submit = useCallback(async (choice: WolfAttackAftermathChoice) => {
    if (!viewReady || !view || busy || !canAct) return;
    const fingerprint = JSON.stringify([view.attackId, choice]);
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, requestId: window.crypto.randomUUID() };
    }
    setBusy(true);
    setError('');
    try {
      const result = await commitWolfAttackAftermath(view.attackId, choice, requestRef.current.requestId);
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
  if (!viewReady || !view) return null;
  if (operator === 'doctor') {
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
  if (!session.capybaraEnabled || !scrapTargets.length) return null;
  return <section className="role-brief__rules wolf-attack-aftermath-action" aria-label={`${operator.shuttleId === 'macaw' ? 'Macaw' : 'Boa'} Scrap collection`}>
    <p className="eyebrow">Cycle {view.turn} // resolved attack</p>
    <h3>{operator.shuttleId === 'macaw' ? 'Macaw' : 'Boa'} Scrap collection</h3>
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
