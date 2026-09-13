import { useMemo, useState } from 'react';
import { SHIPS } from '@/data/ships';
import { VULCAN_ADDITIONAL_LABOUR_CONSOLES, VULCAN_LABOUR_TARGETS } from '@/data/vulcanLabour';
import { runVulcanAdditionalLabour } from '@/lib/vulcanLabourService';
import { normalizeCommandError } from '@/lib/commandErrors';
import { useSessionStore } from '@/store/useSessionStore';

/** Player-facing Vulcan action surface. The callable remains the authority. */
export default function VulcanAdditionalLabourPanel() {
  const session = useSessionStore((state) => state.session);
  const [targetShipId, setTargetShipId] = useState('');
  const [targetConsoleId, setTargetConsoleId] = useState('');
  const [productionScrap, setProductionScrap] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const sourceState = session?.smallShipStates?.vulcan;
  const sourceCharges = sourceState?.cycle.charges.filter((id) =>
    (VULCAN_ADDITIONAL_LABOUR_CONSOLES as readonly string[]).includes(id)) ?? [];
  const activeShipIds = session?.activeVesselIds ?? session?.setup?.activeVesselIds ?? SHIPS.map((ship) => ship.id);
  const targetShips = SHIPS.filter((ship) => activeShipIds.includes(ship.id));
  const effectiveTargetShipId = targetShipId || targetShips[0]?.id || '';
  const selectedTargets = VULCAN_LABOUR_TARGETS[effectiveTargetShipId] ?? [];
  const effectiveTargetConsoleId = targetConsoleId || selectedTargets[0]?.id || '';
  const targetCycle = session?.maintenanceCycles?.[effectiveTargetShipId];
  const targetDamage = session?.shipDamage?.[effectiveTargetShipId];
  const targetAlreadyCharged = targetCycle?.charges.includes(effectiveTargetConsoleId) ?? false;
  const damaged = effectiveTargetConsoleId !== 'jump-drive' && (targetDamage?.damagedSystemIds.includes(effectiveTargetConsoleId) ?? false);
  const targetName = useMemo(
    () => targetShips.find((ship) => ship.id === effectiveTargetShipId)?.name ?? effectiveTargetShipId,
    [effectiveTargetShipId, targetShips],
  );
  const coordination = session?.turnPhase === undefined || session.turnPhase.airspace.state === 'lifted';
  const ready = sourceState?.cycle.step === 5 && sourceState.cycle.turn === session?.currentTurn && sourceCharges.length > 0;

  if (!session) return null;

  const chooseShip = (nextShipId: string) => {
    setTargetShipId(nextShipId);
    setTargetConsoleId(VULCAN_LABOUR_TARGETS[nextShipId]?.[0]?.id ?? '');
    setProductionScrap(false);
  };
  const submit = async () => {
    if (!sourceState || !effectiveTargetShipId || !effectiveTargetConsoleId || pending) return;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const result = await runVulcanAdditionalLabour(
        sourceCharges[0]!, effectiveTargetShipId, effectiveTargetConsoleId,
        sourceState.cycle.revision, targetCycle?.revision ?? 0,
        effectiveTargetShipId === 'capybara' && effectiveTargetConsoleId === 'scrap-refinery' ? productionScrap : undefined,
      );
      const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
        ? result.message : 'Additional Labour committed.';
      setStatus(message);
    } catch (cause) {
      setError(normalizeCommandError(cause).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="role-brief__rules vulcan-labour-panel" aria-labelledby="vulcan-labour-title">
      <h2 id="vulcan-labour-title">Additional Labour</h2>
      <p>During Coordination, spend one charged console to charge one permitted console on another active ship.</p>
      <p role="status">Remaining uses this turn: {sourceCharges.length} // {sourceState?.hostShipId ? `docked with ${sourceState.hostShipId}` : 'dock the Vulcan first'}</p>
      {!sourceState && <p role="status">Vulcan state is unavailable. Reconnect to the session.</p>}
      {sourceState && sourceState.cycle.step !== 5 && <p role="status">Finish Vulcan maintenance before using Additional Labour.</p>}
      {sourceState && sourceState.cycle.step === 5 && sourceState.cycle.turn !== session.currentTurn && <p role="status">The charged consoles belong to another turn.</p>}
      {ready && targetShips.length === 0 && <p role="status">No active fleet ship can receive a console charge.</p>}
      {ready && targetShips.length > 0 && (
        <fieldset className="maintenance-controls" disabled={pending || !coordination}>
          <legend>Choose one external console</legend>
          <label>Ship
            <select aria-label="Additional Labour target ship" value={effectiveTargetShipId} onChange={(event) => chooseShip(event.target.value)}>
              <option value="" disabled>Choose a ship</option>
              {targetShips.map((ship) => <option key={ship.id} value={ship.id}>{ship.name}</option>)}
            </select>
          </label>
          <label>Console
            <select aria-label="Additional Labour target console" value={effectiveTargetConsoleId} onChange={(event) => setTargetConsoleId(event.target.value)}>
              {selectedTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
            </select>
          </label>
          {effectiveTargetShipId === 'capybara' && effectiveTargetConsoleId === 'scrap-refinery' && (
            <label>Scrap Refinery choice
              <select aria-label="Scrap Refinery choice" value={productionScrap ? 'convert' : 'generate'} onChange={(event) => setProductionScrap(event.target.value === 'convert')}>
                <option value="generate">Generate 1 Scrap</option>
                <option value="convert">Spend 1 Scrap for 3 materials</option>
              </select>
            </label>
          )}
          <button className="cic-action-button" type="button" disabled={!coordination || !effectiveTargetConsoleId || targetAlreadyCharged || damaged || pending} onClick={() => void submit()}>
            {pending ? 'Charging…' : `Use Additional Labour // ${sourceCharges.length} left`}
          </button>
          {!coordination && <p role="status">Additional Labour is available during Coordination Phase.</p>}
          {targetAlreadyCharged && <p role="status">That console is already charged this turn.</p>}
          {damaged && <p role="status">That console is damaged and cannot be charged.</p>}
          {status && <p role="status">{status}</p>}
          {error && <p role="alert">{error}</p>}
          <p role="status">Target: {targetName} // server checks current revisions before writing.</p>
        </fieldset>
      )}
    </section>
  );
}
