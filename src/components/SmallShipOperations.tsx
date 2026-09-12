import { useState } from 'react';
import { SMALL_SHIPS, SHIPS } from '@/data/ships';
import type { SmallShipId, SmallShipState } from '@/types/game';
import { runSmallShipMaintenance, setSmallShipDocking } from '@/lib/smallShipService';
import { useSessionStore } from '@/store/useSessionStore';
import { normalizeCommandError } from '@/lib/commandErrors';

const SMALL_SHIP_IDS: readonly SmallShipId[] = ['gorgoneion', 'capybara-small', 'warrior', 'vulcan'];
const SMALL_SHIP_RULES: Readonly<Record<SmallShipId, { readonly reactorCapacity: number; readonly food: readonly number[]; readonly water: readonly number[] }>> = {
  gorgoneion: { reactorCapacity: 2, food: [0, 3, 5, 8], water: [0, 2, 3, 6] },
  'capybara-small': { reactorCapacity: 2, food: [0, 3, 5, 8], water: [0, 2, 3, 6] },
  warrior: { reactorCapacity: 1, food: [0, 3, 5, 8], water: [0, 2, 3, 6] },
  vulcan: { reactorCapacity: 2, food: [0, 3, 6, 10], water: [0, 2, 4, 7] },
};

const RATION_NAMES = ['None', 'Minimal', 'Short', 'Normal'];

interface SmallShipCardProps {
  readonly id: SmallShipId;
  readonly state: SmallShipState | undefined;
  readonly currentTurn: number;
  readonly activeHostShipIds: readonly string[];
  readonly available: boolean;
}

function SmallShipCard({ id, state, currentTurn, activeHostShipIds, available }: SmallShipCardProps) {
  const vessel = SMALL_SHIPS.find((entry) => entry.id === id);
  const rules = SMALL_SHIP_RULES[id];
  const [hostShipId, setHostShipId] = useState(state?.hostShipId ?? '');
  const [foodLevel, setFoodLevel] = useState(0);
  const [waterLevel, setWaterLevel] = useState(0);
  const [consoles, setConsoles] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (!vessel) return null;
  if (!available) {
    return (
      <section className="small-ship-operations__card cic-frame" aria-label={`${vessel.name} small-ship operations`}>
        <header>
          <h3>{vessel.name}</h3>
          <p>{vessel.vesselType} // expansion Capybara is active</p>
        </header>
        <p className="small-ship-operations__status" role="status">Unavailable // the expansion Capybara uses the full-ship rules.</p>
      </section>
    );
  }
  const cycle = state?.cycle;
  const currentHost = state?.hostShipId ?? null;
  const selectedHost = currentHost ?? hostShipId;
  const submit = async (action: string, choices: { foodLevel?: number; waterLevel?: number; consoles?: readonly string[] } = {}) => {
    if (!state) return;
    setError('');
    setPending(true);
    try {
      await runSmallShipMaintenance(id, action, cycle?.revision ?? 0, choices);
      setConsoles([]);
    } catch (cause) {
      setError(normalizeCommandError(cause).message);
    } finally {
      setPending(false);
    }
  };
  const dock = async (docked: boolean) => {
    setError('');
    setPending(true);
    try {
      await setSmallShipDocking(id, docked ? hostShipId : null, docked, state?.dockingRevision ?? 0);
    } catch (cause) {
      setError(normalizeCommandError(cause).message);
    } finally {
      setPending(false);
    }
  };
  const step = cycle?.step ?? 0;
  const disabled = pending || !state?.hostShipId;
  return (
    <section className="small-ship-operations__card cic-frame" aria-label={`${vessel.name} small-ship operations`}>
      <header>
        <h3>{vessel.name}</h3>
        <p>{vessel.vesselType} // {vessel.printedStatistics.population.toLocaleString()} survivors // no ship damage deck</p>
      </header>
      <label>Host ship
        <select aria-label={`${vessel.name} host ship`} value={selectedHost} disabled={currentHost !== null || pending}
          onChange={(event) => setHostShipId(event.target.value)}>
          <option value="">Choose an active host</option>
          {SHIPS.filter((ship) => activeHostShipIds.includes(ship.id)).map((ship) => <option key={ship.id} value={ship.id}>{ship.name}</option>)}
        </select>
      </label>
      {currentHost === null ? (
        <button className="cic-action-button" type="button" disabled={!hostShipId || pending} onClick={() => void dock(true)}>
          {pending ? 'Docking…' : 'Dock for Team / Wolf Attack'}
        </button>
      ) : (
        <>
          <p role="status">Docked with {SHIPS.find((ship) => ship.id === currentHost)?.name ?? currentHost} // host stores fund rations</p>
          {step === 0 && <button className="cic-action-button" type="button" disabled={pending} onClick={() => void submit('begin')}>Begin small-ship cycle // Turn {currentTurn}</button>}
          {step === 1 && <fieldset disabled={pending} className="maintenance-controls"><legend>Step 1 // Rations</legend>
            <label>Food<select aria-label={`${vessel.name} food ration`} value={foodLevel} onChange={(event) => setFoodLevel(Number(event.target.value))}>{RATION_NAMES.map((name, index) => <option key={name} value={index}>{name} // {rules.food[index]}</option>)}</select></label>
            <label>Water<select aria-label={`${vessel.name} water ration`} value={waterLevel} onChange={(event) => setWaterLevel(Number(event.target.value))}>{RATION_NAMES.map((name, index) => <option key={name} value={index}>{name} // {rules.water[index]}</option>)}</select></label>
            <button className="cic-action-button" type="button" onClick={() => void submit('rations', { foodLevel, waterLevel })}>Apply host-funded rations</button>
          </fieldset>}
          {step === 2 && <button className="cic-action-button" type="button" disabled={disabled} onClick={() => void submit('unrest')}>Run unrest roll // server dice</button>}
          {step === 3 && <button className="cic-action-button" type="button" disabled={disabled} onClick={() => void submit('riot')}>Run population / riot roll // server dice</button>}
          {step === 4 && <fieldset disabled={pending} className="maintenance-controls"><legend>Step 4 // Reactor // up to {rules.reactorCapacity}</legend>
            {Array.from({ length: rules.reactorCapacity }, (_, index) => {
              const consoleId = `console-${index + 1}`;
              return <label key={consoleId}><input type="checkbox" checked={consoles.includes(consoleId)} onChange={(event) => setConsoles((current) => event.target.checked ? [...current, consoleId] : current.filter((id) => id !== consoleId))} /> Console {index + 1}</label>;
            })}
            <button className="cic-action-button" type="button" onClick={() => void submit('reactor', { consoles })}>Charge selected consoles</button>
          </fieldset>}
          {step === 5 && <button className="cic-action-button" type="button" disabled={pending} onClick={() => void submit('end')}>End small-ship cycle</button>}
          {cycle?.results[String(Math.min(step, 4))] && <p role="status">{cycle.results[String(Math.min(step, 4))]}</p>}
          {step === 0 && <button className="cic-text-button" type="button" disabled={pending} onClick={() => void dock(false)}>Undock after cycle</button>}
        </>
      )}
      {currentHost === null && <p className="small-ship-operations__status" role="status">No live docked state // GM admission required.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default function SmallShipOperations() {
  const session = useSessionStore((store) => store.session);
  const activeHostShipIds = session?.activeVesselIds ?? [];
  return (
    <section className="gm-console__module small-ship-operations cic-frame" aria-label="Small-ship operations">
      <h2 className="gm-console__section-title">Optional small ships</h2>
      <p className="gm-console__hint">GM docks each small ship with an active fleet host. Team maintenance borrows only that host’s food and water; a failed population / riot roll never draws ship damage.</p>
      {!session && <p className="small-ship-operations__status" role="status">Small-ship state unavailable // reconnect to the session.</p>}
      <div className="small-ship-operations__grid">
        {SMALL_SHIP_IDS.map((id) => <SmallShipCard key={id} id={id} state={session?.smallShipStates?.[id]} currentTurn={session?.currentTurn ?? 0} activeHostShipIds={activeHostShipIds} available={id !== 'capybara-small' || session?.expansion === 'base'} />)}
      </div>
    </section>
  );
}
