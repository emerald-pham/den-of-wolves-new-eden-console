export interface GorgoneionRepairDronesViewProps {
  hostName?: string | undefined;
  hostDescription: string;
  materials: number;
  isCaptain: boolean;
  hostIsActive: boolean;
  maintenanceReady: boolean;
  coordinationOpen: boolean;
  usedThisCycle: boolean;
  hostDestroyed: boolean;
  repairHistoryValid: boolean;
  eligibleSystems: readonly { readonly id: string; readonly name: string }[];
  systemId: string;
  selectedName: string;
  pending: boolean;
  submitDisabled: boolean;
  submitLabel: string;
  errorMessage?: string;
  retryMessage?: string | undefined;
  statusMessage?: string;
  onChooseSystem: (systemId: string) => void;
  onSubmit: () => void;
}

/** Presentation only; the connected controller owns all command authority. */
export default function GorgoneionRepairDronesView({
  hostName, hostDescription, materials, isCaptain, hostIsActive, maintenanceReady,
  coordinationOpen, usedThisCycle, hostDestroyed, repairHistoryValid, eligibleSystems,
  systemId, selectedName, pending, submitDisabled, submitLabel, errorMessage,
  retryMessage, statusMessage, onChooseSystem, onSubmit,
}: GorgoneionRepairDronesViewProps) {
  return (
    <section className="role-brief__rules gorgoneion-repair-drones" aria-labelledby="gorg-repair-title">
      <p className="eyebrow">Current host // {hostName ?? 'unavailable'}</p>
      <h3 id="gorg-repair-title">Gorgoneion Repair Drones</h3>
      <p>During Coordination, when charged, spend exactly 3 materials from Gorgoneion’s current docked host to repair 1 damaged console. Once per cycle.</p>
      <p role="status">
        Docked host // {hostDescription} // host materials // {materials}
      </p>
      {!isCaptain && <p>The current Gorgoneion Captain replacement role controls this repair.</p>}
      {!hostIsActive && <p>Gorgoneion must be docked with a current active fleet host before repairing.</p>}
      {!maintenanceReady && <p>Finish current-cycle Gorgoneion Team maintenance and charge Repair Drones before repairing.</p>}
      {!coordinationOpen && <p>Repair Drones are available during the current Coordination cycle.</p>}
      {usedThisCycle && <p>Gorgoneion Repair Drones have already been used this cycle.</p>}
      {hostDestroyed && <p>A destroyed host cannot receive Repair Drones.</p>}
      {hostIsActive && !hostDestroyed && eligibleSystems.length === 0 &&
        <p>No eligible damaged host consoles are available.</p>}
      {hostIsActive && !hostDestroyed && materials < 3 &&
        <p>Repair Drones need 3 host materials; this host has {materials}.</p>}
      {!repairHistoryValid && <p>Repair history is unavailable. Refresh the live session before repairing.</p>}
      <fieldset className="maintenance-controls" disabled={!isCaptain || !repairHistoryValid || !hostIsActive ||
        !maintenanceReady || !coordinationOpen || usedThisCycle || hostDestroyed === true || pending}>
        <legend>Choose one damaged host console</legend>
        <label htmlFor="gorg-repair-console">Damaged console</label>
        <select id="gorg-repair-console" aria-label="Gorgoneion repair console" value={systemId}
          onChange={(event) => onChooseSystem(event.target.value)}>
          <option value="">Choose a console</option>
          {eligibleSystems.map(({ id, name }) => <option key={id} value={id}>
            {name}
          </option>)}
        </select>
        <p role="status">Selected // {systemId ? selectedName : 'No console selected'} // cost // 3 materials</p>
      </fieldset>
      <div className="maintenance-controls__confirmation">
        <button className="cic-action-button" type="button"
          disabled={submitDisabled}
          onClick={onSubmit}>
          {submitLabel}
        </button>
      </div>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {retryMessage && <p role="status">{retryMessage}</p>}
      {statusMessage && <p role="status">{statusMessage}</p>}
    </section>
  );
}
