import { useEffect, useState } from 'react';
import { findShip } from '@/data/ships';
import { phaseForSession } from '@/lib/turnPhase';
import { hasFreshSessionAuthority } from '@/lib/sessionMutationAuthority';
import { parseMaliadesState } from '@/lib/maliadesLedger';
import { repairMaliades, type MaliadesRepairStaleReply } from '@/lib/maliadesService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, ShuttleControlEntry, ShuttleDocking } from '@/types/game';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

interface MaliadesAttemptAuthority {
  readonly sessionId: string;
  readonly uid: string;
  readonly role: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly ownerUid: string;
  readonly expectedHostShipId: string;
  readonly expectedControlRevision: number;
}

interface MaliadesStaleRecovery {
  readonly reply: MaliadesRepairStaleReply;
  readonly binding: MaliadesAttemptAuthority;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function safeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function maliadesDockings(session: GameSession): readonly Record<string, unknown>[] | null {
  const raw = (session as unknown as Record<string, unknown>).shuttleDockings;
  if (!Array.isArray(raw) || raw.some((entry) => {
    const docking = record(entry);
    return !docking || typeof docking.shuttleId !== 'string' || !docking.shuttleId.trim() ||
      typeof docking.shipId !== 'string' || !docking.shipId.trim() ||
      typeof docking.dockedAt !== 'string' || !docking.dockedAt.trim() ||
      docking.inTransit === true || docking.transit === true || docking.status === 'in-transit' ||
      docking.state === 'in-transit' || docking.dockingState === 'in-transit';
  })) return null;
  const seen = new Set<string>();
  for (const entry of raw) {
    const shuttleId = (entry as Record<string, unknown>).shuttleId as string;
    if (seen.has(shuttleId)) return null;
    seen.add(shuttleId);
  }
  return raw.filter((entry) => (entry as Record<string, unknown>).shuttleId === 'maliades') as Record<string, unknown>[];
}

function liveTeamPhase(session: GameSession): boolean {
  const cycle = session.currentTurn;
  const phase = phaseForSession(session);
  if (!phase || !Number.isSafeInteger(cycle) || (cycle as number) < 1) return false;
  const teamEnds = Date.parse(phase.teamPhaseEndsAt);
  return session.phase === 'active' && phase.turn === cycle && phase.airspace.state === 'restricted' && !phase.timerPause &&
    Number.isFinite(teamEnds) && Date.now() < teamEnds;
}

function currentAuthorityMatches(binding: MaliadesAttemptAuthority): boolean {
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me;
  const control = session?.shuttleControl?.maliades;
  const dockings = session ? maliadesDockings(session) : null;
  const activeVesselIds = session?.activeVesselIds;
  return hasFreshSessionAuthority() && session?.id === binding.sessionId &&
    me?.sessionId === binding.sessionId && me.uid === binding.uid && me.role === binding.role &&
    me.role === 'player' && me.assignedRoleId === binding.assignedRoleId &&
    me.assignedRoleId === 'dione-engineer' && me.activeConsoleRoleId === binding.activeConsoleRoleId &&
    me.activeConsoleRoleId === 'dione-engineer' && me.fleetGroupId === binding.fleetGroupId &&
    Boolean(binding.fleetGroupId.trim()) && liveTeamPhase(session) &&
    control?.shuttleId === 'maliades' && control.ownerRoleId === 'dione-engineer' &&
    control.ownerUid === binding.ownerUid && control.holderUid === binding.uid &&
    safeCounter(control.revision) && control.revision >= binding.expectedControlRevision &&
    dockings !== null && dockings.length === 1 && dockings[0]?.shipId === binding.expectedHostShipId &&
    Array.isArray(activeVesselIds) && activeVesselIds.every((shipId) => typeof shipId === 'string') &&
    activeVesselIds.includes(binding.expectedHostShipId);
}

function captureAuthority(
  session: GameSession,
  me: NonNullable<ReturnType<typeof useSessionStore.getState>['me']>,
  expectedHostShipId: string,
): MaliadesAttemptAuthority | undefined {
  const control = session.shuttleControl?.maliades;
  const dockings = maliadesDockings(session);
  if (!control || control.shuttleId !== 'maliades' || control.ownerRoleId !== 'dione-engineer' ||
      typeof control.ownerUid !== 'string' || !control.ownerUid.trim() || control.holderUid !== me.uid ||
      !safeCounter(control.revision) || me.role !== 'player' || me.assignedRoleId !== 'dione-engineer' ||
      me.activeConsoleRoleId !== 'dione-engineer' || typeof me.fleetGroupId !== 'string' ||
      !me.fleetGroupId.trim() || dockings === null || dockings.length !== 1 ||
      dockings[0]?.shipId !== expectedHostShipId) return undefined;
  return {
    sessionId: session.id, uid: me.uid, role: me.role,
    assignedRoleId: me.assignedRoleId, activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId: me.fleetGroupId, ownerUid: control.ownerUid,
    expectedHostShipId, expectedControlRevision: control.revision,
  };
}

function repairSnapshotReady(
  session: GameSession,
  control: ShuttleControlEntry,
  docking: ShuttleDocking | undefined,
  fuelled: boolean,
  recovery: MaliadesStaleRecovery,
): boolean {
  const maliades = parseMaliadesState(session.maliadesState);
  const activeVesselIds = session.activeVesselIds;
  const hostResources = record(record((session as unknown as Record<string, unknown>).shipResources)?.[recovery.reply.expectedHostShipId]);
  return currentAuthorityMatches(recovery.binding) && hasFreshSessionAuthority() &&
    liveTeamPhase(session) && Number.isSafeInteger(session.currentTurn) &&
    (session.currentTurn as number) >= recovery.reply.currentCycle &&
    safeCounter(control.revision) && control.revision >= recovery.reply.currentControlRevision &&
    maliades !== undefined && maliades !== null && maliades.launched && !maliades.destroyed &&
    maliades.damage >= recovery.reply.damageToRepair && maliades.revision >= recovery.reply.currentRevision &&
    Array.isArray(activeVesselIds) && activeVesselIds.includes(recovery.reply.expectedHostShipId) &&
    docking?.shipId === recovery.reply.expectedHostShipId && fuelled &&
    session.shuttleFuelled?.maliades === true && hostResources !== undefined &&
    safeCounter(hostResources.materials) && hostResources.materials >= recovery.reply.damageToRepair;
}

/** The Dione Engineer's live Maliades controls. Every mutation is server-authoritative. */
export default function MaliadesPanel({ control, docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session)! as GameSession;
  const me = useSessionStore((state) => state.me)!;
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [staleRecovery, setStaleRecovery] = useState<MaliadesStaleRecovery | null>(null);
  const state = session.maliadesState;
  const phase = phaseForSession(session);
  const cycle = session.currentTurn ?? 0;
  const currentControl = session.shuttleControl?.maliades;
  const phaseOpen = liveTeamPhase(session);
  const isHolder = control.shuttleId === 'maliades' && control.ownerRoleId === 'dione-engineer' &&
    control.holderUid === me.uid && me.role === 'player' && me.assignedRoleId === 'dione-engineer' &&
    me.activeConsoleRoleId === 'dione-engineer' && currentControl?.shuttleId === 'maliades' &&
    currentControl.ownerRoleId === 'dione-engineer' && currentControl.ownerUid === control.ownerUid &&
    currentControl.holderUid === me.uid && safeCounter(currentControl.revision);
  const hostName = docking ? findShip(docking.shipId)?.name ?? docking.shipId : undefined;
  const canRepair = Boolean(state?.launched && state.damage > 0 && !state.destroyed && isHolder && phaseOpen &&
    fuelled && docking && !busy && !staleRecovery);
  const staleSnapshotReady = Boolean(staleRecovery && currentControl && repairSnapshotReady(
    session, currentControl, docking, fuelled, staleRecovery,
  ));
  const authoritySignal = [
    session.id, me.uid, me.role, me.assignedRoleId, me.activeConsoleRoleId, me.fleetGroupId,
    session.phase, cycle, phase?.airspace.state, phase?.timerPause?.window, connection, freshness,
    currentControl?.shuttleId, currentControl?.ownerRoleId, currentControl?.ownerUid,
    currentControl?.holderUid, currentControl?.revision, docking?.shipId,
    session.shuttleDockings?.map((entry) => `${entry.shuttleId}:${entry.shipId}`).join(','),
    session.activeVesselIds?.join(','),
  ].join('|');

  useEffect(() => {
    setStaleRecovery(null);
    setStatus('');
  }, [session.id, me.uid, docking?.shipId]);

  useEffect(() => {
    if (staleRecovery && !currentAuthorityMatches(staleRecovery.binding)) {
      setStaleRecovery(null);
      setStatus('Maliades repair authority or Team Phase changed. Refresh before retrying.');
    }
  }, [authoritySignal, staleRecovery]);

  async function submitRepair(isStaleRetry: boolean): Promise<void> {
    if (busy || (isStaleRetry ? !staleRecovery || !staleSnapshotReady : !canRepair)) return;
    const current = useSessionStore.getState();
    const currentSession = current.session as GameSession | undefined;
    const currentMe = current.me;
    const currentState = currentSession ? parseMaliadesState(currentSession.maliadesState) : undefined;
    const currentCycle = currentSession?.currentTurn;
    const hostShipId = docking?.shipId;
    if (!currentSession || !currentMe || !currentState || !Number.isSafeInteger(currentCycle) ||
        (currentCycle as number) < 1 || !hostShipId || hostShipId !== docking?.shipId) return;
    const binding = isStaleRetry
      ? staleRecovery?.binding
      : captureAuthority(currentSession, currentMe, hostShipId);
    if (!binding || !currentAuthorityMatches(binding)) {
      setStaleRecovery(null);
      setStatus('Maliades repair authority or Team Phase changed. Refresh before acting.');
      return;
    }
    if (isStaleRetry && (!staleRecovery || !repairSnapshotReady(
      currentSession, currentSession.shuttleControl?.maliades ?? control,
      docking, fuelled, staleRecovery,
    ))) return;
    setBusy(true);
    setStatus('');
    setStaleRecovery(null);
    try {
      const result = await repairMaliades(currentCycle as number, currentState.revision, hostShipId, 1);
      if (result.status === 'stale') {
        if (result.expectedHostShipId !== binding.expectedHostShipId || result.damageToRepair !== 1 ||
            result.expectedControlRevision !== binding.expectedControlRevision ||
            result.expectedCycle !== (currentCycle as number) || result.expectedRevision !== currentState.revision) {
          setStatus('Maliades repair returned a mismatched stale request. Refresh before retrying.');
          return;
        }
        if (!currentAuthorityMatches(binding)) {
          setStatus('Maliades repair authority or Team Phase changed while the request was pending.');
          return;
        }
        setStaleRecovery({ reply: result, binding });
        return;
      }
      setStatus(`${result.status === 'replayed' ? 'Repair request replayed' : 'Repair committed'} // ${result.hostShipId} // damage ${result.state.damage}/3.`);
    } catch (cause) {
      if (currentAuthorityMatches(binding)) {
        setStatus(cause instanceof Error ? cause.message : 'Maliades repair failed.');
      } else {
        setStatus('Maliades repair authority or Team Phase changed while the request was pending.');
      }
    } finally {
      setBusy(false);
    }
  }

  return <section className="console-workspace__section shuttle-control" aria-label="Maliades operations">
    <p className="console-workspace__eyebrow">Escort fighter // authoritative state</p>
    <h3>Maliades operations</h3>
    <p>Damage // {state?.damage ?? 0} / 3 {state?.destroyed ? '// destroyed' : '// operational'}</p>
    {!state?.launched && <p>Launch Maliades from the Dione Engineer console before operating it.</p>}
    {!isHolder && <p>Only the current Dione Engineer holding Maliades may resolve its actions.</p>}
    {!phaseOpen && <p>Wolf attack actions and Team Phase repairs require restricted airspace in the current cycle.</p>}
    {docking ? <p>Docked host // {hostName} // fuel // {fuelled ? 'fuelled' : 'unfuelled'}</p> : <p>Maliades is not docked with an active host.</p>}
    <p>Maliades Medium and Short attacks are unavailable until this console has safe Wolf target choices.</p>

    <fieldset disabled={busy || (!staleRecovery && !canRepair)}>
      <legend>Team Phase repair</legend>
      <p>Repair one damage for one material while fuelled and docked.</p>
      {!staleRecovery && <button className="cic-action-button" type="button" disabled={busy || !canRepair} onClick={() => void submitRepair(false)}>
        Repair 1 damage
      </button>}
      {staleRecovery && <>
        <p role="status">{staleSnapshotReady
          ? 'Maliades state changed. Review the live repair state before retrying.'
          : 'Waiting for the current live Maliades repair state before retrying.'}</p>
        <button className="cic-action-button" type="button" disabled={busy || !staleSnapshotReady} onClick={() => void submitRepair(true)}>
          Retry Maliades repair
        </button>
      </>}
    </fieldset>
    {!staleRecovery && status && <p role="status">{status}</p>}
  </section>;
}
