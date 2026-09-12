import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { runMaintenance, rollbackMaintenance, type MaintenanceChoices } from '@/lib/maintenanceService';
import { assignShipDamage, repairAllShipDamage } from '@/lib/shipDamageService';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { SHIPS } from '@/data/ships';
import { AEGIS_ROLE_CONSOLES } from '@/data/aegisConsoles';
import { EXECUTIVE_SYSTEMS } from '@/data/roleProcedures';
import { SHUTTLECRAFT } from '@/data/shuttles';
import type { DamageDraw } from '@/types/game';
import { phaseForSession } from '@/lib/turnPhase';
import { normalizeCommandError } from '@/lib/commandErrors';
import type { ShipConsoleProjection } from '@/lib/shipStateProjection';

export type SystemTiming = 1 | 5 | 6 | 7 | 'ftl' | 'combat' | 'passive';

interface TimedSystem {
  readonly id: string;
  readonly name: string;
  readonly timing?: SystemTiming;
}

/** The printed maintenance path owns system placement for every ship workspace. */
export default function MaintenanceSystems<T extends TimedSystem>({ name, shipId, systems, renderSystem, rations, damageDraws = [], shipState }: {
  readonly name: string;
  readonly shipId: string;
  readonly systems: readonly T[];
  readonly renderSystem: (system: T) => ReactNode;
  readonly rations: ReactNode;
  readonly damageDraws?: readonly DamageDraw[] | undefined;
  readonly shipState?: ShipConsoleProjection | undefined;
}) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const gmInstanceId = useSessionStore((state) => state.gmInstance?.id);
  const access = useConsoleAccess();
  const cycle = shipState ? shipState.maintenanceCycle : session?.maintenanceCycles?.[shipId];
  const step = cycle?.step ?? 0;
  const revision = cycle?.revision ?? 0;
  const currentTurn = shipState ? shipState.currentTurn ?? 1 : session?.currentTurn ?? 1;
  const [confirmBegin, setConfirmBegin] = useState(false);
  const [reactorConfirmation, setReactorConfirmation] = useState<string | null>(null);
  const reactorButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setConfirmBegin(false); }, [shipId, currentTurn, step, revision, session?.id, connection]);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [damageNotices, setDamageNotices] = useState<readonly string[]>([]);
  const [foodLevel, setFoodLevel] = useState(0);
  const [waterLevel, setWaterLevel] = useState(0);
  const [consoles, setConsoles] = useState<string[]>([]);
  const [refuels, setRefuels] = useState<Record<string, string>>({});
  useEffect(() => { setFoodLevel(0); setWaterLevel(0); setConsoles([]); setRefuels({}); setError(''); setDamageNotices([]); }, [shipId, step]);
  const damage = shipState ? shipState.damage : session?.shipDamage?.[shipId];
  const maintenanceDamageDraw = cycle?.damageDrawId
    ? damageDraws.find(draw => draw.id === cycle.damageDrawId)
    : undefined;
  const turnZeroLocked = session?.currentTurn === 0;
  const maintenancePhaseBlocked = session?.turnPhase !== undefined &&
    phaseForSession(session)?.airspace.state !== 'restricted';
  const maintenanceRollbackHelpId = `${shipId}-maintenance-rollback-phase-help`;
  const blocked = !access.writable || pending || !session || !me || connection !== 'live' || turnZeroLocked;
  const disabled = (at: number) => blocked || step !== at ||
    (at === 0 && cycle?.turn === currentTurn) || (damage?.destroyed === true && at !== 7) ||
    (shipId === 'aegis' && at === 7 && cycle?.results['7'] !== undefined);
  const execute = async (action: string, choices: MaintenanceChoices = {}) => {
    if (blocked || busy.current) return;
    busy.current = true; setPending(true); setError('');
    try { await runMaintenance(shipId, action, revision, choices, access.roleId); }
    catch (cause) { setError(normalizeCommandError(cause).message); }
    finally { busy.current = false; setPending(false); }
  };
  const ship = SHIPS.find(candidate => candidate.id === shipId);
  const schedule = ship?.maintenance ?? { ...AEGIS_ROLE_CONSOLES.admiral.rations, reactor: AEGIS_ROLE_CONSOLES.admiral.reactorCapacity };
  const printedStepCount = ship?.printedStatistics.maintenanceSteps.length ?? 6;
  const chargeable = [...systems, ...(shipId === 'aegis' ? EXECUTIVE_SYSTEMS : [])].filter(system =>
    !['storage', 'reactor'].includes(system.id) && !system.id.startsWith('shuttle-bay') && !system.id.startsWith('armoured-hull'));
  const bays = systems.filter(system => system.timing === 6 || system.timing === 7);
  const docked = session?.shuttleDockings?.filter(dock => dock.shipId === shipId) ?? [];
  const upgrades = shipState ? shipState.upgrades : session?.shipUpgrades?.[shipId] ?? [];
  const capacity = Math.max(0, schedule.reactor + (upgrades.includes('reactor') ? 1 : 0) -
    (damage?.damagedSystemIds.includes('reactor') ? (['shepherd', 'quellon'].includes(shipId) ? 2 : 3) : 0));
  const reactorDisabled = disabled(5) || maintenancePhaseBlocked || consoles.length > capacity ||
    consoles.some(id => !chargeable.some(system => system.id === id) ||
      (id !== 'jump-drive' && damage?.damagedSystemIds.includes(id)));
  const reactorConfirmationKey = JSON.stringify([
    session?.id, me?.uid, gmInstanceId, access.roleId, access.writable, connection,
    shipId, currentTurn, step, revision, session?.turnPhase, consoles, capacity,
    damage, cycle?.charges,
  ]);
  const confirmReactor = !reactorDisabled && reactorConfirmation === reactorConfirmationKey;
  useEffect(() => { setReactorConfirmation(null); }, [reactorConfirmationKey]);
  const reactorSummaryId = `${shipId}-reactor-confirmation-summary`;
  const consoleNames = (ids: readonly string[]) => ids.map(id =>
    chargeable.find(system => system.id === id)?.name ?? id).join(', ');
  const endDisabled = blocked || step !== 7 ||
    (shipId === 'aegis' && cycle?.results['7'] === undefined && damage?.destroyed !== true);
  const labels = [
    'Storage', 'Rations', 'Unrest check', 'Riot check', 'Reactor',
    ...(printedStepCount >= 6 ? [bays.length > 1 ? 'Shuttle Bay Zeta' : 'Shuttle Bay'] : []),
    ...(printedStepCount >= 7 ? ['Shuttle Bay Omega'] : []),
  ];
  return <div className="maintenance-systems">
    <section className="maintenance-systems__cycle" aria-label={`${name} maintenance cycle`}>
      <h3>Maintenance cycle</h3>
      <button className="cic-action-button" disabled={disabled(0)}
        style={confirmBegin ? { color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' } : undefined}
        onBlur={() => setConfirmBegin(false)}
        onKeyDown={event => { if (event.key === 'Escape') setConfirmBegin(false); }}
        onClick={() => {
          if (!confirmBegin) { setConfirmBegin(true); return; }
          setConfirmBegin(false);
          void execute('begin');
        }}>{confirmBegin ? 'ARE YOU SURE?' : `Begin Maintenance Cycle: Turn ${currentTurn}`}</button>
      {turnZeroLocked && <p role="status">Turn 0 // Awaiting Iris Authentication</p>}
      {error && <p role="alert">{error}</p>}
      <ol aria-label={`${name} maintenance sequence`}>
        {labels.map((label, index) => {
          const step = index + 1;
          const baysForStep = systems.filter(system => system.timing === step);
          return <li key={step} aria-current={cycle?.step === step ? 'step' : undefined}>
            <div className="maintenance-systems__step"><span>{step}</span><strong>{label}</strong></div>
            {step === 1 && <button className="cic-action-button" disabled={disabled(1)} onClick={() => void execute('storage')}>Check storage</button>}
            {step === 2 && <><p>Select food and water rations separately. Add both bonuses to the roll in step 3.</p>{rations}
              <fieldset disabled={disabled(2)} className="maintenance-controls"><legend>Choose rations</legend>
                {(['Food', 'Water'] as const).map(resource => <label key={resource}>{resource} ration level
                  <select aria-label={`${resource} ration level`} value={resource === 'Food' ? foodLevel : waterLevel}
                    onChange={event => (resource === 'Food' ? setFoodLevel : setWaterLevel)(Number(event.target.value))}>
                    {['None', 'Minimal', 'Short', 'Normal'].map((label, level) => <option key={level} value={level}>
                      {label} // {schedule[resource === 'Food' ? 'food' : 'water'][level]} // +{level * 3}
                    </option>)}
                  </select>
                </label>)}
                <button className="cic-action-button" onClick={() => void execute('rations', { foodLevel, waterLevel })}>Proceed with rations</button>
              </fieldset>
            </>}
            {step === 3 && <p>Roll 2d6 plus both ration bonuses. Under 12 adds 2 unrest; otherwise under 20 adds 1 unrest.</p>}
            {step === 3 && <button className="cic-action-button" disabled={disabled(3)} onClick={() => void execute('unrest')}>Run unrest check</button>}
            {step === 4 && <p>Roll 1d6. Below current unrest causes a riot: draw and apply 1 damage card.</p>}
            {step === 4 && <button className="cic-action-button" disabled={disabled(4)} onClick={() => void execute('riot')}>Run riot check</button>}
            {step === 5 && <p>Charge consoles with the reactor, then resolve the consoles marked 5 when charged.</p>}
            <div className="aegis-system-grid">{systems.filter(system => system.timing === step).map(renderSystem)}</div>
            {step === 5 && <>
              <p>Unused charge is lost when the reactor powers up. Choose up to {capacity} consoles.</p>
              <fieldset disabled={disabled(5) || maintenancePhaseBlocked} className="maintenance-controls"><legend>Consoles to charge // {consoles.length}/{capacity}</legend>
                {chargeable.map(system => <label key={system.id}>
                  <input type="checkbox" checked={consoles.includes(system.id)}
                    disabled={(system.id !== 'jump-drive' && damage?.damagedSystemIds.includes(system.id)) || (!consoles.includes(system.id) && consoles.length >= capacity)}
                    onChange={event => setConsoles(previous => event.target.checked ? [...previous, system.id] : previous.filter(id => id !== system.id))} />
                  {system.name}{cycle?.charges.includes(system.id) ? ' // Charged' : ''}
                </label>)}
                {confirmReactor && <p id={reactorSummaryId} role="status">
                  {consoles.length ? `Charge: ${consoleNames(consoles)}.` : 'No consoles selected.'}{' '}
                  {cycle?.charges.length
                    ? `Previous unused charges will be lost: ${consoleNames(cycle.charges)}.`
                    : 'There are no previous unused charges.'}
                </p>}
                <div className="maintenance-controls__confirmation" onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setReactorConfirmation(null);
                }} onKeyDown={event => {
                  if (event.key === 'Escape') {
                    setReactorConfirmation(null);
                    reactorButton.current?.focus();
                  }
                }}>
                  <button ref={reactorButton} className="cic-action-button" disabled={reactorDisabled}
                    aria-describedby={confirmReactor ? reactorSummaryId : undefined}
                    style={confirmReactor ? { color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' } : undefined}
                    onClick={() => {
                      if (reactorDisabled || busy.current) return;
                      if (!confirmReactor) { setReactorConfirmation(reactorConfirmationKey); return; }
                      setReactorConfirmation(null);
                      void execute('reactor', { consoles });
                    }}>{confirmReactor ? 'ARE YOU SURE?' : 'Power up reactor'}</button>
                  {confirmReactor && <button className="cic-action-button" onClick={() => {
                    setReactorConfirmation(null);
                    reactorButton.current?.focus();
                  }}>Cancel reactor power-up</button>}
                </div>
              </fieldset>
            </>}
            {(step === 6 || (step === 7 && shipId === 'aegis' && cycle?.results['7'] === undefined)) && <fieldset
              disabled={disabled(step) || (shipId === 'aegis' && step === 7 && damage?.destroyed === true)} className="maintenance-controls"><legend>Refuel {baysForStep.map(bay => bay.name).join(' / ') || 'docked shuttles'} // 1 fuel each</legend>
              {baysForStep.map(bay => <label key={bay.id}>{bay.name}
                <select aria-label={`${bay.name} refuelling`} disabled={damage?.damagedSystemIds.includes(bay.id)} value={refuels[bay.id] ?? ''}
                  onChange={event => setRefuels(previous => ({ ...previous, [bay.id]: event.target.value }))}>
                  <option value="">Do not refuel</option>
                  {docked.map(dock => <option key={dock.shuttleId} value={dock.shuttleId}>
                    {SHUTTLECRAFT.find(craft => craft.id === dock.shuttleId)?.name ?? dock.shuttleId}
                  </option>)}
                </select>
              </label>)}
              {!docked.length && <p>No shuttles docked.</p>}
              <button className="cic-action-button" onClick={() => void execute('bays', { refuels })}>Proceed with refuelling</button>
            </fieldset>}
            {cycle?.results[String(step)] && <p role="status">{cycle.results[String(step)]}</p>}
            {step === 4 && maintenanceDamageDraw && <p role="status">
              {maintenanceDamageDraw.type === 'ship-destroyed'
                ? 'No damage card remained // ship destroyed.'
                : `Damage card ${maintenanceDamageDraw.card} // ${maintenanceDamageDraw.systemName}${maintenanceDamageDraw.recycled ? ' absorbed damage // card recycled' : ' damaged'}.`}
            </p>}
          </li>;
        })}
      </ol>
      <button className="cic-action-button" disabled={endDisabled} onClick={() => void execute('end')}>End maintenance cycle</button>
      {cycle?.results['7'] && <p role="status">{cycle.results['7']}</p>}
      {me?.role === 'gm' && <div className="maintenance-controls" aria-label="GM damage controls">
        <span id={maintenanceRollbackHelpId} className="turn-start-announcement__sr">
          Roll back maintenance step is available only during Team Phase.
        </span>
        {(['Assign damage', 'Repair all damage', 'Roll back maintenance step'] as const).map(label => <button key={label} className="cic-action-button"
          aria-describedby={label === 'Roll back maintenance step' && maintenancePhaseBlocked ? maintenanceRollbackHelpId : undefined}
          disabled={!access.writable || pending || connection !== 'live' || session?.phase === 'closed' ||
            (label === 'Assign damage' ? damage?.destroyed === true : label === 'Repair all damage' ? !damage?.destroyed && !damage?.damagedSystemIds.length : revision === 0 || maintenancePhaseBlocked)}
          onClick={() => {
            if (busy.current) return;
            busy.current = true; setPending(true); setError('');
            const command = label === 'Assign damage'
              ? assignShipDamage(shipId).then(result => {
                const notice = result.destroyed
                  ? 'Damage applied // no card remained // ship destroyed.'
                  : `Damage applied // card ${result.card.card} // ${result.card.systemName}${result.recycled ? ' absorbed damage // card recycled' : ' damaged'}.`;
                setDamageNotices(current => [...current, notice]);
              })
              : label === 'Repair all damage'
                ? repairAllShipDamage(shipId)
                : rollbackMaintenance(shipId, revision);
            void command
              .catch(cause => setError(normalizeCommandError(cause).message))
              .finally(() => { busy.current = false; setPending(false); });
          }}>{label}</button>)}
        {damageNotices.map((notice, index) => <p key={`${index}-${notice}`} role="status">{notice}</p>)}
      </div>}
    </section>
    <div className="maintenance-systems__other">
      {(['ftl', 'combat', 'passive'] as const).map(timing => {
        const group = systems.filter(system => (system.timing ?? 'passive') === timing);
        if (!group.length) return null;
        const label = { ftl: 'Faster Than Light', combat: 'Wolf Attack', passive: 'Damage control' }[timing];
        return <section key={timing} aria-label={`${name} ${label} systems`}>
          <h3>{label}</h3><div className="aegis-system-grid">{group.map(renderSystem)}</div>
        </section>;
      })}
    </div>
  </div>;
}
