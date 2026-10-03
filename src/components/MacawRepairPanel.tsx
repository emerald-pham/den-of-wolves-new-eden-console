import { useEffect, useRef, useState } from 'react';
import { repairConsolesFromMacaw, type MacawRepairCommand } from '@/lib/macawRepairService';
import {
  captureSessionAuthority,
  hasFreshSessionAuthority,
  isCurrentSessionAuthority,
  type SessionAuthorityCheckpoint,
} from '@/lib/sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';
import { parseMacawRepairLedger } from '@/lib/macawRepairLedger';
import type { MacawRepairCallableStaleReply } from '../../functions/src/macawRepairCallable';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
  readonly hostName?: string | undefined;
  readonly hostSystems?: readonly { readonly id: string; readonly name: string }[] | undefined;
}

interface MacawAuthorityBinding {
  readonly sessionId: string;
  readonly uid: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly ownerUid: string;
  readonly expectedHostShipId: string;
  readonly expectedControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly expectedCycle: number;
}

interface MacawStaleRecovery {
  readonly reply: MacawRepairCallableStaleReply;
  readonly binding: MacawAuthorityBinding;
}

interface MacawExactRetry {
  readonly command: MacawRepairCommand;
  readonly binding: MacawAuthorityBinding;
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentMacawDockings(session: GameSession): readonly { readonly shipId: string }[] {
  const rawDockings = (session as unknown as Record<string, unknown>).shuttleDockings;
  if (!Array.isArray(rawDockings) || rawDockings.some((entry) => {
    if (!isRecord(entry)) return true;
    return typeof entry.shuttleId !== 'string' || !entry.shuttleId.trim() ||
      typeof entry.shipId !== 'string' || !entry.shipId.trim() ||
      typeof entry.dockedAt !== 'string' || !entry.dockedAt.trim() ||
      entry.inTransit === true || entry.transit === true ||
      entry.status === 'in-transit' || entry.state === 'in-transit' ||
      entry.dockingState === 'in-transit';
  })) return [];
  return rawDockings.filter((entry): entry is { readonly shuttleId: string; readonly shipId: string } =>
    isRecord(entry) && entry.shuttleId === 'macaw' && typeof entry.shipId === 'string');
}

function currentDamageState(session: GameSession, shipId: string | undefined): {
  readonly damagedSystemIds: readonly string[];
  readonly destroyed: boolean;
} | undefined {
  if (!shipId) return undefined;
  const damageRecord = isRecord(session.shipDamage) ? session.shipDamage[shipId] : undefined;
  if (!isRecord(damageRecord) || !Array.isArray(damageRecord.damagedSystemIds) ||
      damageRecord.damagedSystemIds.some((id) => typeof id !== 'string') ||
      typeof damageRecord.destroyed !== 'boolean') return undefined;
  return {
    damagedSystemIds: damageRecord.damagedSystemIds as string[],
    destroyed: damageRecord.destroyed,
  };
}

function currentCapybaraScrap(session: GameSession): number | null {
  if (!isRecord(session.shipResources) || !isRecord(session.shipResources.capybara) ||
      !isSafeCounter(session.shipResources.capybara.scrap)) return null;
  return session.shipResources.capybara.scrap;
}

function hasLiveCoordination(session: GameSession): boolean {
  const cycle = session.currentTurn;
  const phase = session.turnPhase;
  const deadlineValue = phase?.openAirspaceEndsAt;
  if (typeof deadlineValue !== 'string') return false;
  const deadline = Date.parse(deadlineValue);
  return session.phase === 'active' && Number.isSafeInteger(cycle) && (cycle as number) >= 1 &&
    phase?.turn === cycle && phase?.airspace?.state === 'lifted' && phase?.timerPause === undefined &&
    Number.isFinite(deadline) && Date.now() < deadline;
}

function hasCurrentMacawHolderAuthority(
  binding: MacawAuthorityBinding,
  requireCoordination: boolean,
): boolean {
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me;
  const control = session?.shuttleControl?.macaw;
  const macawDockings = session ? currentMacawDockings(session) : [];
  const currentCycle = session?.currentTurn;
  const repairRevision = session?.macawRepairs?.revision ?? 0;
  const activeRoleIds = session?.activeRoleIds;
  const activeVesselIds = session?.activeVesselIds;
  return hasFreshSessionAuthority() && session?.id === binding.sessionId &&
    me?.sessionId === binding.sessionId && me.uid === binding.uid && me.role === 'player' &&
    me.assignedRoleId === binding.assignedRoleId && me.assignedRoleId === 'capybara-captain' &&
    me.activeConsoleRoleId === binding.activeConsoleRoleId &&
    me.activeConsoleRoleId === 'capybara-captain' && me.fleetGroupId === binding.fleetGroupId &&
    session.phase === 'active' && Array.isArray(activeRoleIds) &&
    activeRoleIds.every((roleId) => typeof roleId === 'string') && activeRoleIds.includes('capybara-captain') &&
    Array.isArray(activeVesselIds) && activeVesselIds.every((shipId) => typeof shipId === 'string') &&
    activeVesselIds.includes('capybara') && session.capybaraEnabled !== false &&
    control?.shuttleId === 'macaw' && control.ownerRoleId === 'capybara-captain' &&
    typeof control.ownerUid === 'string' && control.ownerUid.trim().length > 0 &&
    control.ownerUid === binding.ownerUid && control.holderUid === binding.uid &&
    isSafeCounter(control.revision) && control.revision >= binding.expectedControlRevision &&
    macawDockings.length === 1 && macawDockings[0]?.shipId === binding.expectedHostShipId &&
    activeVesselIds.includes(binding.expectedHostShipId) &&
    Number.isSafeInteger(currentCycle) && (currentCycle as number) >= binding.expectedCycle &&
    isSafeCounter(repairRevision) && repairRevision >= binding.expectedRepairRevision &&
    (!requireCoordination || hasLiveCoordination(session));
}

export default function MacawRepairPanel({ control, docking, fuelled, hostName, hostSystems }: Props) {
  const session = useSessionStore((state) => state.session)! as GameSession;
  const me = useSessionStore((state) => state.me)!;
  const connection = useSessionStore((state) => state.connection);
  const sessionSnapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [systemIds, setSystemIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [retry, setRetry] = useState<MacawExactRetry | null>(null);
  const [staleRecovery, setStaleRecovery] = useState<MacawStaleRecovery | null>(null);
  const pendingRef = useRef<SessionAuthorityCheckpoint | null>(null);
  const identity = `${session.id}:${me.uid}`;
  const authorityBase = useRef<{
    identity: string;
    assignedRoleId: string | null | undefined;
    activeConsoleRoleId: string | null | undefined;
    fleetGroupId: string;
    ownerUid: string;
  } | null>(null);
  if (authorityBase.current?.identity !== identity) authorityBase.current = null;
  const sessionControl = session.shuttleControl?.macaw;
  if (!authorityBase.current && me.assignedRoleId === 'capybara-captain' &&
      me.activeConsoleRoleId === 'capybara-captain' && typeof me.fleetGroupId === 'string' &&
      me.fleetGroupId.trim() && typeof sessionControl?.ownerUid === 'string' && sessionControl.ownerUid.trim()) {
    authorityBase.current = {
      identity,
      assignedRoleId: me.assignedRoleId,
      activeConsoleRoleId: me.activeConsoleRoleId,
      fleetGroupId: me.fleetGroupId,
      ownerUid: sessionControl.ownerUid,
    };
  }
  const ledger = parseMacawRepairLedger(session.macawRepairs);
  const currentCycle = isSafeCounter(session.currentTurn) ? session.currentTurn : 0;
  const repairHistoryValid = ledger !== null && ledger.cycle <= currentCycle;
  const repairRevision = ledger?.revision ?? 0;
  const hostsThisCycle = ledger && ledger.cycle === currentCycle ? ledger.hosts : [];
  const hostsUsedThisCycle = ledger && ledger.cycle === currentCycle ? ledger.totalHostsUsed ?? hostsThisCycle.length : 0;
  const repairedOnHost = docking
    ? hostsThisCycle.find((host) => host.shipId === docking.shipId)?.systemIds ?? [] : [];
  const hostAlreadyUsed = Boolean(docking && hostsThisCycle.some((host) => host.shipId === docking.shipId));
  const repairShipAvailable = hostAlreadyUsed || hostsUsedThisCycle === 0 ||
    (hostsUsedThisCycle === 1 && fuelled && session.shuttleFuelled?.macaw === true);
  const repairSlotsRemaining = Math.max(0, 2 - repairedOnHost.length);
  const damage = currentDamageState(session, docking?.shipId);
  const repairOptions = docking && damage
    ? damage.damagedSystemIds.filter((id) => !repairedOnHost.includes(id)) : [];
  const selectedTargetsCurrent = systemIds.length >= 1 && systemIds.every((id) => repairOptions.includes(id));
  const scrap = currentCapybaraScrap(session);
  const repairWindowOpen = hasLiveCoordination(session);
  const currentControl = session.shuttleControl?.macaw ?? control;
  const isHolder = control.shuttleId === 'macaw' &&
    control.ownerRoleId === 'capybara-captain' && me.role === 'player' &&
    me.uid === control.holderUid && me.assignedRoleId === 'capybara-captain' &&
    currentControl.shuttleId === 'macaw' && currentControl.ownerRoleId === 'capybara-captain' &&
    currentControl.holderUid === me.uid;
  const currentAuthorityBinding: MacawAuthorityBinding = {
    sessionId: session.id,
    uid: me.uid,
    assignedRoleId: authorityBase.current?.assignedRoleId ?? me.assignedRoleId,
    activeConsoleRoleId: authorityBase.current?.activeConsoleRoleId ?? me.activeConsoleRoleId,
    fleetGroupId: authorityBase.current?.fleetGroupId ?? me.fleetGroupId ?? '',
    ownerUid: authorityBase.current?.ownerUid ?? currentControl.ownerUid,
    expectedHostShipId: docking?.shipId ?? '',
    expectedControlRevision: currentControl.revision,
    expectedRepairRevision: repairRevision,
    expectedCycle: currentCycle,
  };
  const hasCurrentAuthority = hasCurrentMacawHolderAuthority(currentAuthorityBinding, false);
  const canSubmit = repairHistoryValid && isHolder && hasCurrentAuthority && Boolean(docking) &&
    repairWindowOpen && repairShipAvailable && repairSlotsRemaining > 0 && selectedTargetsCurrent &&
    systemIds.length <= Math.min(2, repairSlotsRemaining) && scrap !== null && scrap >= systemIds.length &&
    damage !== undefined && damage.destroyed !== true;

  const authoritySignal = [
    identity, me.role, me.assignedRoleId, me.activeConsoleRoleId, me.fleetGroupId,
    session.phase, currentCycle, repairWindowOpen, connection, sessionSnapshotFreshness,
    currentControl.shuttleId, currentControl.ownerRoleId, currentControl.ownerUid,
    currentControl.holderUid, docking?.shipId,
    currentMacawDockings(session).map((entry) => entry.shipId).join(','),
  ].join('|');

  useEffect(() => {
    setSystemIds([]);
    setRetry(null);
    setStaleRecovery(null);
    setMessage('');
    setError('');
  }, [identity, docking?.shipId]);

  useEffect(() => {
    if (retry && !hasCurrentMacawHolderAuthority(retry.binding, true)) setRetry(null);
    if (staleRecovery && !hasCurrentMacawHolderAuthority(staleRecovery.binding, true)) {
      setStaleRecovery(null);
    }
  }, [authoritySignal, retry, staleRecovery]);

  const staleSnapshotCurrent = staleRecovery !== null &&
    hasCurrentMacawHolderAuthority(staleRecovery.binding, true) && repairHistoryValid &&
    currentCycle >= staleRecovery.reply.currentCycle &&
    (currentControl.revision ?? -1) >= staleRecovery.reply.currentControlRevision &&
    repairRevision >= staleRecovery.reply.currentRepairRevision &&
    docking?.shipId === staleRecovery.reply.expectedHostShipId;
  const canRetryStale = Boolean(staleSnapshotCurrent && canSubmit);

  async function submitRepair(): Promise<void> {
    const current = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(current.session?.id ?? '', current.me?.uid);
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint) || pendingRef.current) return;
    if (retry && !hasCurrentMacawHolderAuthority(retry.binding, true)) return;
    const freshStaleRetry = staleRecovery !== null;
    if (freshStaleRetry && !canRetryStale) return;
    const command = retry?.command ?? {
      requestId: window.crypto.randomUUID(),
      systemIds: [...systemIds],
      expectedControlRevision: currentControl.revision,
      expectedRepairRevision: repairRevision,
      expectedCycle: currentCycle,
      expectedHostShipId: docking?.shipId ?? '',
    };
    if (!retry && !(freshStaleRetry ? canRetryStale : canSubmit)) return;
    const binding = retry?.binding ?? staleRecovery?.binding ?? currentAuthorityBinding;
    if (!hasCurrentMacawHolderAuthority(binding, true)) return;
    pendingRef.current = checkpoint;
    setPending(true); setError(''); setMessage(''); setRetry({ command, binding }); setStaleRecovery(null);
    try {
      const result = await repairConsolesFromMacaw(command);
      if (result.status === 'stale') {
        const sameSystemIds = result.systemIds.length === command.systemIds.length &&
          result.systemIds.every((id, index) => id === [...command.systemIds].sort()[index]);
        if (result.sessionId !== binding.sessionId || result.requestId !== command.requestId ||
            result.shuttleId !== 'macaw' || result.expectedHostShipId !== command.expectedHostShipId ||
            !sameSystemIds || result.expectedControlRevision !== command.expectedControlRevision ||
            result.expectedRepairRevision !== command.expectedRepairRevision ||
            result.expectedCycle !== command.expectedCycle) {
          setRetry(null);
          setError('Macaw repair returned an invalid stale request binding. Refresh before retrying.');
          return;
        }
        if (!hasCurrentMacawHolderAuthority(binding, true)) {
          setRetry(null); setStaleRecovery(null);
          setError('Macaw repair authority or Coordination changed while the request was pending.');
          return;
        }
        setRetry(null);
        setStaleRecovery({ reply: result, binding });
        setMessage('Macaw repair state changed. Review the current live state before retrying.');
        return;
      }
      if (!hasCurrentMacawHolderAuthority(binding, false)) {
        setRetry(null); setStaleRecovery(null);
        setError('Macaw repair authority changed while the request was pending.');
        return;
      }
      setMessage(result.status === 'replayed'
        ? `This repair was already recorded // ${result.scrapRemaining} Scrap remain.`
        : `Repaired ${result.systemIds.length} console${result.systemIds.length === 1 ? '' : 's'} // ${result.scrapRemaining} Scrap remain.`);
      setRetry(null); setStaleRecovery(null); setSystemIds([]);
    } catch (cause) {
      if (hasCurrentMacawHolderAuthority(binding, true)) {
        setError(cause instanceof Error ? cause.message : 'Macaw repair failed.');
      } else {
        setRetry(null); setStaleRecovery(null);
        setError('Macaw repair authority or Coordination changed while the request was pending.');
      }
    } finally {
      if (pendingRef.current === checkpoint) {
        pendingRef.current = null;
        setPending(false);
      }
    }
  }

  const staleSelectedIds = systemIds.filter((id) => !repairOptions.includes(id));
  const visibleSystemIds = [...repairOptions, ...staleSelectedIds];

  return <section className="console-workspace__section shuttle-control" aria-label="Macaw console repair">
    <p className="console-workspace__eyebrow">Repair rig // docked host</p>
    <h3>Repair damaged consoles</h3>
    <p>Spend 1 Scrap per console to repair up to 2 consoles on this ship. A fuelled Macaw may repair a second ship in the same cycle.</p>
    {docking
      ? <p>Docked host // {hostName ?? docking.shipId} // Capybara Scrap // {scrap ?? 'Unavailable'} // repair slots remaining // {repairSlotsRemaining}</p>
      : <p>Dock Macaw before repairing consoles.</p>}
    {!isHolder && <p>The current Capybara Captain holding Macaw controls repairs.</p>}
    {!repairWindowOpen && <p>Macaw repairs open during Coordination Phase.</p>}
    {hostsUsedThisCycle === 1 && !hostAlreadyUsed && !fuelled && <p>Fuel Macaw before repairing a second ship this cycle.</p>}
    {hostsUsedThisCycle >= 2 && !hostAlreadyUsed && <p>Macaw may repair at most two ships this cycle.</p>}
    {damage?.destroyed && <p>A destroyed ship cannot receive Macaw repairs.</p>}
    {!damage && docking && <p>The current host damage state is unavailable. Refresh the live session before repairing.</p>}
    {damage && repairOptions.length === 0 && <p>No damaged consoles are eligible on this ship.</p>}
    {scrap === null && <p>The current Capybara Scrap ledger is unavailable. Refresh the live session before repairing.</p>}
    {scrap !== null && systemIds.length > scrap && <p>This repair needs {systemIds.length} Scrap; the Capybara ledger has {scrap}.</p>}
    {!repairHistoryValid && <p>Macaw repair history is unavailable. Refresh the live session before repairing.</p>}
    {staleSelectedIds.length > 0 && <p>One or more selected consoles are no longer eligible in the current repair state.</p>}
    <fieldset disabled={!repairHistoryValid || pending || !isHolder || !hasCurrentAuthority || !docking ||
      !repairWindowOpen || !repairShipAvailable || repairSlotsRemaining === 0 || damage === undefined ||
      damage.destroyed === true || scrap === null}>
      <legend>Damaged consoles</legend>
      {visibleSystemIds.map((systemId) => {
        const checked = systemIds.includes(systemId);
        const eligible = repairOptions.includes(systemId);
        const atCapacity = systemIds.length >= Math.min(2, repairSlotsRemaining);
        const name = hostSystems?.find((system) => system.id === systemId)?.name ??
          systemId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        return <label key={systemId}>
          <input type="checkbox" checked={checked} disabled={!checked && (atCapacity || !eligible)}
            onChange={(event) => {
              setRetry(null);
              setError('');
              setSystemIds((current) => event.target.checked
                ? [...current, systemId] : current.filter((id) => id !== systemId));
            }} /> {name}{checked && !eligible ? ' (no longer eligible)' : ''}
        </label>;
      })}
    </fieldset>
    <div className="console-workspace__actions">
      <button className="cic-action-button" type="button"
        disabled={pending || (retry
          ? !hasCurrentMacawHolderAuthority(retry.binding, true)
          : staleRecovery ? !canRetryStale : !canSubmit)}
        onClick={() => void submitRepair()}>
        {pending ? 'Repairing consoles…' : retry ? 'Retry exact repair request' : staleRecovery
          ? 'Retry selected consoles using current state' : 'Repair selected consoles'}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    {retry && !pending && <p>The last request needs confirmation. Retry it safely with the same request id.</p>}
    {staleRecovery && !canRetryStale && !pending &&
      <p>The current live Macaw repair state is still updating. Wait for it before retrying.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
