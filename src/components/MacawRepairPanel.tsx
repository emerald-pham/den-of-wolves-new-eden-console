import { useEffect, useRef, useState } from 'react';
import { repairConsolesFromMacaw, type MacawRepairCommand } from '@/lib/macawRepairService';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
  readonly hostName?: string | undefined;
  readonly hostSystems?: readonly { readonly id: string; readonly name: string }[] | undefined;
}

export default function MacawRepairPanel({ control, docking, fuelled, hostName, hostSystems }: Props) {
  const session = useSessionStore((state) => state.session)! as GameSession;
  const me = useSessionStore((state) => state.me)!;
  const [systemIds, setSystemIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [retry, setRetry] = useState<MacawRepairCommand | null>(null);
  const pendingRef = useRef<SessionAuthorityCheckpoint | null>(null);
  const identity = `${session.id}:${me.uid}`;
  const ledger = session.macawRepairs;
  const repairHistoryValid = ledger === undefined ? true :
    (ledger.cycle >= 1 && ledger.revision >= 1 && ledger.hosts.length >= 1 && ledger.hosts.length <= 2);
  const repairRevision = ledger?.revision ?? 0;
  const hostsThisCycle = ledger && ledger.cycle === session.currentTurn ? ledger.hosts : [];
  const repairedOnHost = docking
    ? hostsThisCycle.find((host) => host.shipId === docking.shipId)?.systemIds ?? [] : [];
  const hostAlreadyUsed = Boolean(docking && hostsThisCycle.some((host) => host.shipId === docking.shipId));
  const repairShipAvailable = hostAlreadyUsed || hostsThisCycle.length === 0 ||
    (hostsThisCycle.length === 1 && fuelled);
  const repairSlotsRemaining = Math.max(0, 2 - repairedOnHost.length);
  const damage = docking ? session.shipDamage?.[docking.shipId] : undefined;
  const repairOptions = docking
    ? (damage?.damagedSystemIds ?? []).filter((id) => !repairedOnHost.includes(id)) : [];
  const scrap = session.shipResources?.capybara?.scrap ?? 0;
  const deadline = Date.parse(session.turnPhase?.openAirspaceEndsAt ?? '');
  const turnPhase = session.turnPhase;
  const repairWindowOpen = session.phase === 'active' &&
    (session.currentTurn ?? 0) >= 1 && turnPhase?.turn === session.currentTurn &&
    turnPhase?.airspace.state === 'lifted' && turnPhase.timerPause === undefined &&
    Number.isFinite(deadline) && Date.now() < deadline;
  const isHolder = control.shuttleId === 'macaw' &&
    control.ownerRoleId === 'capybara-captain' && me.role === 'player' &&
    me.uid === control.holderUid && me.assignedRoleId === 'capybara-captain';
  const canSubmit = repairHistoryValid && isHolder && Boolean(docking) && repairWindowOpen &&
    repairShipAvailable && repairSlotsRemaining > 0 && systemIds.length >= 1 &&
    systemIds.length <= Math.min(2, repairSlotsRemaining) && scrap >= systemIds.length &&
    damage?.destroyed !== true;

  useEffect(() => setSystemIds([]), [repairRevision, control.revision, docking?.shipId, session.currentTurn, identity]);

  async function submitRepair(): Promise<void> {
    const current = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    if (pendingRef.current && isCurrentSessionAuthority(pendingRef.current)) return;
    const command = retry ?? {
      requestId: window.crypto.randomUUID(), systemIds: [...systemIds],
      expectedControlRevision: control.revision, expectedRepairRevision: repairRevision,
      expectedCycle: session.currentTurn ?? 0, expectedHostShipId: docking?.shipId ?? '',
    };
    if (!retry && !canSubmit) return;
    pendingRef.current = checkpoint;
    setPending(true); setError(''); setMessage(''); setRetry(command);
    try {
      const result = await repairConsolesFromMacaw(command);
      if (!isCurrentSessionAuthority(checkpoint)) return;
      setMessage(result.status === 'replayed'
        ? `This repair was already recorded // ${result.scrapRemaining} Scrap remain.`
        : `Repaired ${result.systemIds.length} console${result.systemIds.length === 1 ? '' : 's'} // ${result.scrapRemaining} Scrap remain.`);
      setRetry(null); setSystemIds([]);
    } catch (cause) {
      if (isCurrentSessionAuthority(checkpoint)) setError(cause instanceof Error ? cause.message : 'Macaw repair failed.');
    } finally {
      if (isCurrentSessionAuthority(checkpoint) && pendingRef.current === checkpoint) {
        pendingRef.current = null; setPending(false);
      }
    }
  }

  return <section className="console-workspace__section shuttle-control" aria-label="Macaw console repair">
    <p className="console-workspace__eyebrow">Repair rig // docked host</p>
    <h3>Repair damaged consoles</h3>
    <p>Spend 1 Scrap per console to repair up to 2 consoles on this ship. A fuelled Macaw may repair a second ship in the same cycle.</p>
    {docking
      ? <p>Docked host // {hostName ?? docking.shipId} // Capybara Scrap // {scrap} // repair slots remaining // {repairSlotsRemaining}</p>
      : <p>Dock Macaw before repairing consoles.</p>}
    {!isHolder && <p>The current Capybara Captain holding Macaw controls repairs.</p>}
    {!repairWindowOpen && <p>Macaw repairs open during Coordination Phase.</p>}
    {hostsThisCycle.length === 1 && !hostAlreadyUsed && !fuelled && <p>Fuel Macaw before repairing a second ship this cycle.</p>}
    {hostsThisCycle.length >= 2 && !hostAlreadyUsed && <p>Macaw may repair at most two ships this cycle.</p>}
    {damage?.destroyed && <p>A destroyed ship cannot receive Macaw repairs.</p>}
    {repairOptions.length === 0 && <p>No damaged consoles are eligible on this ship.</p>}
    {systemIds.length > scrap && <p>This repair needs {systemIds.length} Scrap; the Capybara ledger has {scrap}.</p>}
    {!repairHistoryValid && <p>Macaw repair history is unavailable. Refresh the live session before repairing.</p>}
    <fieldset disabled={!repairHistoryValid || pending || !isHolder || !docking || !repairWindowOpen ||
      !repairShipAvailable || repairSlotsRemaining === 0 || damage?.destroyed === true}>
      <legend>Damaged consoles</legend>
      {repairOptions.map((systemId) => {
        const checked = systemIds.includes(systemId);
        const atCapacity = systemIds.length >= Math.min(2, repairSlotsRemaining);
        const name = hostSystems?.find((system) => system.id === systemId)?.name ??
          systemId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        return <label key={systemId}>
          <input type="checkbox" checked={checked} disabled={!checked && atCapacity}
            onChange={(event) => setSystemIds((current) => event.target.checked
              ? [...current, systemId] : current.filter((id) => id !== systemId))} /> {name}
        </label>;
      })}
    </fieldset>
    <div className="console-workspace__actions">
      <button className="cic-action-button" type="button" disabled={pending || (!retry && !canSubmit)}
        onClick={() => void submitRepair()}>
        {pending ? 'Repairing consoles…' : retry ? 'Retry exact repair request' : 'Repair selected consoles'}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    {retry && !pending && <p>The last request needs confirmation. Retry it safely with the same request id.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
