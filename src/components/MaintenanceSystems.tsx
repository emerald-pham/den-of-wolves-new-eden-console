import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { capybaraRationSchedule, isPopulationOnPrintedTrack } from '@/data/shipPopulation';

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
  const [productionScrap, setProductionScrap] = useState<Record<string, boolean>>({});
  const [productionOreAmount, setProductionOreAmount] = useState<Record<string, number>>({});
  useEffect(() => {
    setFoodLevel(0); setWaterLevel(0); setConsoles([]); setRefuels({}); setProductionScrap({});
    setProductionOreAmount({}); setError(''); setDamageNotices([]);
  }, [shipId, step]);
  const damage = shipState ? shipState.damage : session?.shipDamage?.[shipId];
  const resources = shipState ? shipState.resources : session?.shipResources?.[shipId];
  const maintenanceDamageDraw = cycle?.damageDrawId
    ? damageDraws.find(draw => draw.id === cycle.damageDrawId)
    : undefined;
  const awaitingMaintenanceStart = session?.currentTurn === 0;
  const maintenancePhaseBlocked = session?.turnPhase !== undefined &&
    phaseForSession(session)?.airspace.state !== 'restricted';
  const maintenanceRollbackHelpId = `${shipId}-maintenance-rollback-phase-help`;
  const blocked = !access.writable || pending || !session || !me || connection !== 'live' || awaitingMaintenanceStart;
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
  const printedSchedule = ship?.maintenance ?? { ...AEGIS_ROLE_CONSOLES.admiral.rations, reactor: AEGIS_ROLE_CONSOLES.admiral.reactorCapacity };
  const population = shipState?.population ?? session?.shipSurvivors?.[shipId] ?? ship?.initialSurvivors;
  const capybaraPopulationOffTrack = shipId === 'capybara' &&
    !isPopulationOnPrintedTrack(shipId, population);
  const activeCapybaraRations = shipId === 'capybara' &&
    isPopulationOnPrintedTrack(shipId, population)
    ? capybaraRationSchedule(population)
    : undefined;
  const schedule = activeCapybaraRations
    ? { ...printedSchedule, food: activeCapybaraRations.food, water: activeCapybaraRations.water }
    : printedSchedule;
  const printedStepCount = ship?.printedStatistics.maintenanceSteps.length ?? 6;
  const chargeable = [...systems, ...(shipId === 'aegis' ? EXECUTIVE_SYSTEMS : [])].filter(system =>
    !['storage', 'reactor'].includes(system.id) && !system.id.startsWith('shuttle-bay') && !system.id.startsWith('armoured-hull'));
  const bays = systems.filter(system => system.timing === 6 || system.timing === 7);
  const docked = session?.shuttleDockings?.filter(dock => dock.shipId === shipId) ?? [];
  const upgrades = shipState ? shipState.upgrades : session?.shipUpgrades?.[shipId] ?? [];
  const productionSystems = systems.filter(system =>
    ['hydroponics', 'water-reclamation', 'mining-drone-control', 'advanced-hydroponics',
      'advanced-hydroponics-ii', 'water-production', 'water-production-ii', 'fuel-refinery',
      'fuel-refinery-ii', 'scrap-refinery'].includes(system.id));
  const productionDisabled = (consoleId: string, mode: 'run' | 'skip' = 'run') => {
    const isDione = shipId === 'dione';
    const isCapybara = shipId === 'capybara';
    const supportedShip = ['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'].includes(shipId);
    const baseDisabled = blocked || maintenancePhaseBlocked || !supportedShip || step !== 6 ||
      !resources || !cycle?.charges.includes(consoleId) || damage?.destroyed === true;
    const waterBlockedByHydroponics = isDione && consoleId === 'water-reclamation' && cycle?.charges.includes('hydroponics') &&
      !damage?.damagedSystemIds.includes('hydroponics') && resources?.water !== undefined && resources.water >= 1;
    const hydroponicsForeclosedByWater = isDione && consoleId === 'hydroponics' && cycle?.results['5']?.includes('Water Reclamation');
    if (mode === 'skip') return baseDisabled || waterBlockedByHydroponics || hydroponicsForeclosedByWater ||
      (isCapybara && consoleId === 'scrap-refinery' && productionScrap[consoleId] === true);
    const capybaraWaterBlocked = isCapybara && consoleId === 'advanced-hydroponics' && (resources?.water ?? 0) < 2;
    const capybaraScrapBlocked = isCapybara && productionScrap[consoleId] === true && (resources?.scrap ?? 0) < 1;
    const waterCost = consoleId.startsWith('advanced-hydroponics') ? 2 : consoleId === 'hydroponics' ? 1 : 0;
    const waterCostBlocked = !isCapybara && waterCost > 0 && (resources?.water ?? 0) < waterCost;
    const refineryMax = upgrades.includes(consoleId) ? 15 : 10;
    const oreAmount = productionOreAmount[consoleId] ?? 1;
    const refineryBlocked = consoleId.startsWith('fuel-refinery') &&
      (!Number.isInteger(oreAmount) || oreAmount < 1 || oreAmount > refineryMax || (resources?.ore ?? 0) < oreAmount);
    return baseDisabled || damage?.damagedSystemIds.includes(consoleId) || hydroponicsForeclosedByWater ||
      waterBlockedByHydroponics || capybaraWaterBlocked || capybaraScrapBlocked || waterCostBlocked || refineryBlocked;
  };
  const scrapRefinerySelectionDisabled = (consoleId: string) => blocked || maintenancePhaseBlocked ||
    shipId !== 'capybara' || step !== 6 || !resources || !cycle?.charges.includes(consoleId) ||
    damage?.destroyed === true || damage?.damagedSystemIds.includes(consoleId);
  const productionChoices = (consoleId: string, mode?: 'skip'): MaintenanceChoices => ({
    productionConsoleId: consoleId as NonNullable<MaintenanceChoices['productionConsoleId']>,
    ...(mode ? { productionMode: mode } : {}),
    ...(!mode && productionScrap[consoleId] === true ? { productionScrap: true } : {}),
    ...(!mode && consoleId.startsWith('fuel-refinery')
      ? { productionOreAmount: productionOreAmount[consoleId] ?? 1 }
      : {}),
  });
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
      <aside className="maintenance-reference cic-frame" aria-label={`${name} maintenance reference`}>
        <h4>{name} maintenance reference</h4>
        <dl>
          <div><dt>Sequence</dt><dd>{labels.map((label, index) => `${index + 1} ${label}`).join(' // ')}</dd></div>
          <div><dt>Rations</dt><dd>Food {schedule.food.join(' / ')} // Water {schedule.water.join(' / ')}
            {activeCapybaraRations ? ` // ${activeCapybaraRations.populationBand} survivors` : ''}</dd></div>
          <div><dt>Unrest</dt><dd>Step 3: roll 2d6 plus both ration bonuses. Under 12 adds 2; under 20 adds 1.</dd></div>
          <div><dt>Damage</dt><dd>Step 4: roll 1d6. Below current unrest draws and applies 1 damage card.</dd></div>
          <div><dt>Charging</dt><dd>Step 5: choose up to {capacity} consoles. Unused charge clears when the next cycle starts.</dd></div>
          <div><dt>Fuel expiry</dt><dd>Shuttle fuel granted during maintenance clears when the next cycle starts.</dd></div>
        </dl>
      </aside>
      <button className="cic-action-button" disabled={disabled(0)}
        style={confirmBegin ? { color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' } : undefined}
        onBlur={() => setConfirmBegin(false)}
        onKeyDown={event => { if (event.key === 'Escape') setConfirmBegin(false); }}
        onClick={() => {
          if (!confirmBegin) { setConfirmBegin(true); return; }
          setConfirmBegin(false);
          void execute('begin');
        }}>{confirmBegin ? 'ARE YOU SURE?' : `Begin Maintenance Cycle: Cycle ${currentTurn}`}</button>
      {awaitingMaintenanceStart && <p role="status">Maintenance begins on Cycle 1</p>}
      {error && <p role="alert">{error}</p>}
      <ol aria-label={`${name} maintenance sequence`}>
        {labels.map((label, index) => {
          const step = index + 1;
          const baysForStep = systems.filter(system => system.timing === step);
          return <li key={step} aria-current={cycle?.step === step ? 'step' : undefined}>
            <div className="maintenance-systems__step"><span>{step}</span><strong>{label}</strong></div>
            {step === 1 && <button className="cic-action-button" disabled={disabled(1)} onClick={() => void execute('storage')}>Check storage</button>}
            {step === 2 && <><p>Select food and water rations separately. Add both bonuses to the roll in step 3.</p>{rations}
              {capybaraPopulationOffTrack && <p role="alert">Rations locked // survivor count is off the printed track.</p>}
              <fieldset disabled={disabled(2) || capybaraPopulationOffTrack} className="maintenance-controls"><legend>Choose rations</legend>
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
            <div className="aegis-system-grid">{systems.filter(system => system.timing === step).map(system => <Fragment key={system.id}>
              {renderSystem(system)}
            </Fragment>)}</div>
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
            {step === 6 && productionSystems.length > 0 && <fieldset disabled={blocked} className="maintenance-controls">
              <legend>{name} production consoles</legend>
              <p>Resolve or explicitly skip charged production consoles before shuttle bay refuelling. Live stores: {resources
                ? `${resources.food} food // ${resources.water} water // ${resources.materials} materials // ${resources.ore} ore // ${resources.fuel} fuel${shipId === 'capybara' ? ` // ${resources.scrap ?? 0} Scrap` : ''}`
                : 'awaiting live resource state'}.</p>
              {productionSystems.map(system => <div key={system.id}>
                {shipId === 'capybara' && system.id === 'scrap-refinery' && <fieldset className="maintenance-controls__choice">
                  <legend>{system.name} choice</legend>
                  <label>
                    <input type="radio" name={`${shipId}-${system.id}-mode`} aria-label="Generate 1 Scrap"
                      checked={productionScrap[system.id] !== true}
                      disabled={scrapRefinerySelectionDisabled(system.id)}
                      onChange={() => setProductionScrap(previous => ({ ...previous, [system.id]: false }))} />
                    Generate 1 Scrap
                  </label>
                  <label>
                    <input type="radio" name={`${shipId}-${system.id}-mode`} aria-label="Spend 1 Scrap for 3 Materials"
                      checked={productionScrap[system.id] === true}
                      disabled={scrapRefinerySelectionDisabled(system.id) || (resources?.scrap ?? 0) < 1}
                      onChange={() => setProductionScrap(previous => ({ ...previous, [system.id]: true }))} />
                    Spend 1 Scrap for 3 Materials
                  </label>
                </fieldset>}
                {shipId === 'capybara' && system.id !== 'scrap-refinery' && <label>
                  <input type="checkbox" aria-label={`Spend 1 Scrap on ${system.name}`} checked={productionScrap[system.id] === true}
                    disabled={productionDisabled(system.id) || (resources?.scrap ?? 0) < 1}
                    onChange={event => setProductionScrap(previous => ({ ...previous, [system.id]: event.target.checked }))} />
                  Spend 1 Scrap for +6 output
                </label>}
                {system.id.startsWith('fuel-refinery') && <label>
                  Ore to refine
                  <input type="number" min={1} max={upgrades.includes(system.id) ? 15 : 10}
                    aria-label={`${system.name} ore to refine`}
                    value={productionOreAmount[system.id] ?? 1}
                    disabled={blocked || maintenancePhaseBlocked || !cycle?.charges.includes(system.id) ||
                      damage?.destroyed === true || damage?.damagedSystemIds.includes(system.id)}
                    onChange={event => setProductionOreAmount(previous => ({
                      ...previous, [system.id]: Number(event.target.value),
                    }))} />
                  {' '}of {Math.min(resources?.ore ?? 0, upgrades.includes(system.id) ? 15 : 10)} available
                </label>}
                <button className="cic-action-button" disabled={productionDisabled(system.id)}
                  onClick={() => void execute('production', productionChoices(system.id))}>
                  Run {system.name}
                </button>{' '}
                <button className="cic-action-button" disabled={productionDisabled(system.id, 'skip')}
                  onClick={() => void execute('production', productionChoices(system.id, 'skip'))}>
                  Skip {system.name}
                </button>
              </div>)}
            </fieldset>}
            {(step === 6 || (step === 7 && shipId === 'aegis' && cycle?.results['7'] === undefined)) && <fieldset
              disabled={disabled(step) || (shipId === 'aegis' && step === 7 && damage?.destroyed === true)} className="maintenance-controls"><legend>Refuel {baysForStep.map(bay => bay.name).join(' / ') || 'docked shuttles'} // 1 fuel each</legend>
              {baysForStep.map(bay => {
                const bayDamaged = damage?.damagedSystemIds.includes(bay.id) === true;
                const damagedBayHelpId = `${shipId}-${bay.id}-damaged-refuelling-help`;
                return <Fragment key={bay.id}><label>{bay.name}
                  <select aria-label={`${bay.name} refuelling`}
                    aria-describedby={bayDamaged ? damagedBayHelpId : undefined}
                    disabled={bayDamaged} value={refuels[bay.id] ?? ''}
                    onChange={event => setRefuels(previous => ({ ...previous, [bay.id]: event.target.value }))}>
                    <option value="">Do not refuel</option>
                    {docked.map(dock => <option key={dock.shuttleId} value={dock.shuttleId}>
                      {SHUTTLECRAFT.find(craft => craft.id === dock.shuttleId)?.name ?? dock.shuttleId}
                    </option>)}
                  </select>
                </label>
                {bayDamaged && <p id={damagedBayHelpId} role="status">
                  Refuelling unavailable // {bay.name} is damaged. Continue maintenance without refuelling.
                </p>}</Fragment>;
              })}
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
