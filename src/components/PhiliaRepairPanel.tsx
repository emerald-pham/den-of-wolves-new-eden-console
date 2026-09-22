import { useEffect, useRef, useState } from 'react';
import { findShip } from '@/data/ships';
import { repairConsolesFromPhilia, type PhiliaRepairCommand } from '@/lib/philiaRepairService';
import { useSessionStore } from '@/store/useSessionStore';
import type { PhiliaRepairLedger, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

function isRepairLedger(value: unknown): value is PhiliaRepairLedger | undefined {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const ledger = value as Record<string, unknown>;
  if (Object.keys(ledger).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(ledger.cycle) || (ledger.cycle as number) < 1 ||
      !Number.isSafeInteger(ledger.revision) || (ledger.revision as number) < 1 ||
      !Array.isArray(ledger.hosts) || ledger.hosts.length < 1 || ledger.hosts.length > 2) return false;
  const seenShips = new Set<string>();
  return ledger.hosts.every((host) => {
    if (typeof host !== 'object' || host === null || Array.isArray(host)) return false;
    const entry = host as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !['shipId', 'systemIds'].includes(key)) ||
        typeof entry.shipId !== 'string' || entry.shipId.length === 0 ||
        seenShips.has(entry.shipId) || !Array.isArray(entry.systemIds) ||
        entry.systemIds.length < 1 || entry.systemIds.length > 2 ||
        entry.systemIds.some((id) => typeof id !== 'string' || id.length === 0) ||
        new Set(entry.systemIds).size !== entry.systemIds.length) return false;
    seenShips.add(entry.shipId);
    return true;
  });
}

export default function PhiliaRepairPanel({ control, docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const me = useSessionStore((state) => state.me)!;
  const [systemIds, setSystemIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [retryCommand, setRetryCommand] = useState<PhiliaRepairCommand | null>(null);
  const pendingRef = useRef(false);

  const repairHistoryValid = isRepairLedger(session.philiaRepairs);
  const ledger = repairHistoryValid ? session.philiaRepairs : undefined;
  const repairRevision = ledger?.revision ?? 0;
  const hostsThisCycle = ledger && ledger.cycle === session.currentTurn ? ledger.hosts : [];
  const repairedOnHost = docking
    ? hostsThisCycle.find((host) => host.shipId === docking.shipId)?.systemIds ?? [] : [];
  const hostAlreadyUsed = Boolean(docking &&
    hostsThisCycle.some((host) => host.shipId === docking.shipId));
  const repairShipAvailable = hostAlreadyUsed || hostsThisCycle.length === 0 ||
    (hostsThisCycle.length === 1 && fuelled);
  const repairSlotsRemaining = Math.max(0, 2 - repairedOnHost.length);
  const damage = docking ? session.shipDamage?.[docking.shipId] : undefined;
  const repairOptions = docking
    ? (damage?.damagedSystemIds ?? []).filter((id) => !repairedOnHost.includes(id)) : [];
  const materials = docking ? session.shipResources?.[docking.shipId]?.materials ?? 0 : 0;
  const repairDeadline = session.turnPhase?.openAirspaceEndsAt
    ? Date.parse(session.turnPhase.openAirspaceEndsAt) : Number.NaN;
  const turnPhase = session.turnPhase;
  const repairWindowOpen = session.phase === 'active' &&
    (session.currentTurn ?? 0) >= 1 && turnPhase !== undefined && turnPhase.turn === session.currentTurn &&
    turnPhase.airspace.state === 'lifted' && turnPhase.timerPause === undefined &&
    Number.isFinite(repairDeadline) && Date.now() < repairDeadline;
  const isHolder = me.role === 'player' && me.uid === control.holderUid;
  const selectedMaterials = systemIds.length * 4;
  const canSubmit = repairHistoryValid && isHolder && Boolean(docking) && repairWindowOpen && repairShipAvailable &&
    repairSlotsRemaining > 0 && systemIds.length >= 1 &&
    systemIds.length <= Math.min(2, repairSlotsRemaining) && materials >= selectedMaterials &&
    damage?.destroyed !== true;

  useEffect(() => setSystemIds([]), [repairRevision, control.revision, docking?.shipId, session.currentTurn]);

  function chooseConsole(systemId: string, checked: boolean): void {
    setRetryCommand(null);
    setError('');
    setStatus('');
    setSystemIds((current) => checked
      ? current.includes(systemId) ? current : [...current, systemId]
      : current.filter((id) => id !== systemId));
  }

  async function submitRepair(): Promise<void> {
    if (pendingRef.current) return;
    const command: PhiliaRepairCommand = retryCommand ?? {
      requestId: window.crypto.randomUUID(),
      systemIds: [...systemIds],
      expectedControlRevision: control.revision,
      expectedRepairRevision: repairRevision,
      expectedCycle: session.currentTurn ?? 0,
      expectedHostShipId: docking?.shipId ?? '',
    };
    if (!retryCommand && !canSubmit) return;

    pendingRef.current = true;
    setPending(true);
    setStatus('');
    setError('');
    setRetryCommand(command);
    try {
      const result = await repairConsolesFromPhilia(command);
      setStatus(result.status === 'replayed'
        ? `This repair was already recorded // ${result.materialsRemaining} materials remain.`
        : `Repaired ${result.systemIds.length} console${result.systemIds.length === 1 ? '' : 's'} // ${result.materialsRemaining} materials remain.`);
      setRetryCommand(null);
      setSystemIds([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Philia repair failed.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return <section className="console-workspace__section shuttle-control" aria-label="Philia console repair">
    <p className="console-workspace__eyebrow">Repair rig // docked host</p>
    <h3>Repair damaged consoles</h3>
    <p>Spend 4 materials for each of up to 2 consoles on this ship. Fuelled Philia may repair a second ship in the same cycle.</p>
    {docking
      ? <p>Docked host // {findShip(docking.shipId)?.name ?? docking.shipId} // materials // {materials} // repair slots remaining // {repairSlotsRemaining}</p>
      : <p>Dock Philia before repairing consoles.</p>}
    {!isHolder && <p>The current Philia holder controls repairs.</p>}
    {!repairWindowOpen && <p>Philia repairs open during Coordination Phase.</p>}
    {hostsThisCycle.length === 1 && !hostAlreadyUsed && !fuelled &&
      <p>Fuel Philia before repairing a second ship this cycle.</p>}
    {hostsThisCycle.length >= 2 && !hostAlreadyUsed &&
      <p>Philia may repair at most two ships this cycle.</p>}
    {damage?.destroyed && <p>A destroyed host cannot receive Philia repairs.</p>}
    {repairOptions.length === 0 && <p>No damaged consoles are eligible on this ship.</p>}
    {systemIds.length > 0 && materials < selectedMaterials &&
      <p>This repair needs {selectedMaterials} materials; the host has {materials}.</p>}
    {!repairHistoryValid && <p>Philia repair history is unavailable. Refresh the live session before repairing.</p>}
    <fieldset disabled={!repairHistoryValid || pending || !isHolder || !docking || !repairWindowOpen ||
      !repairShipAvailable || repairSlotsRemaining === 0 || damage?.destroyed === true}>
      <legend>Damaged consoles</legend>
      {repairOptions.map((systemId) => {
        const checked = systemIds.includes(systemId);
        const atCapacity = systemIds.length >= Math.min(2, repairSlotsRemaining);
        const name = findShip(docking?.shipId)?.systems?.find((system) => system.id === systemId)?.name ??
          systemId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        return <label key={systemId}>
          <input type="checkbox" checked={checked} disabled={!checked && atCapacity}
            onChange={(event) => chooseConsole(systemId, event.target.checked)} /> {name}
        </label>;
      })}
    </fieldset>
    <div className="console-workspace__actions">
      <button className="cic-action-button" type="button" disabled={pending || (!retryCommand && !canSubmit)}
        onClick={() => void submitRepair()}>
        {pending ? 'Repairing consoles…' : retryCommand ? 'Retry exact repair request' : 'Repair selected consoles'}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    {retryCommand && !pending && <p>The last request needs confirmation. Retry it safely with the same request id.</p>}
    {status && <p role="status">{status}</p>}
  </section>;
}
