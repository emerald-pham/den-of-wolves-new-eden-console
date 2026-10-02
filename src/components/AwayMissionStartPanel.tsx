import { useEffect, useMemo, useState } from 'react';
import { replacementRoleAvailableForSession, replacementRoleFor } from '@/data/replacementRoles';
import './AwayMissionStartPanel.css';
import {
  subscribeGmMissionOpportunities,
  subscribeGmMissionStartSnapshots,
} from '@/lib/firestore';
import {
  startAwayMission,
  type AwayMissionStartReply,
  type StartAwayMissionOptions,
} from '@/lib/sessionService';
import { normalizeCommandError } from '@/lib/commandErrors';
import { turnLimitForSession, turnPhaseState, turnStateForPhaseContext } from '@/lib/turnPhase';
import type {
  AwayMissionStartSnapshot,
  GameSession,
  MissionOpportunity,
  Player,
} from '@/types/game';

type MissionStartPayload = Omit<StartAwayMissionOptions, 'requestId' | 'allowReplay'>;
type ExactMissionStartCommand = Omit<StartAwayMissionOptions, 'allowReplay'>;

interface Props {
  readonly session: GameSession | null;
  readonly players: readonly Player[];
  readonly instanceId: string;
  readonly isGm: boolean;
  /** Prepared source data for a synthetic review surface; production omits it. */
  readonly preparedOpportunities?: readonly MissionOpportunity[];
  /** Prepared receipts for a synthetic review surface; production omits it. */
  readonly preparedReceipts?: readonly AwayMissionStartSnapshot[];
  /** Local command boundary for a synthetic review surface; production omits it. */
  readonly submitMissionStart?: (options: StartAwayMissionOptions) => Promise<AwayMissionStartReply>;
}

interface PendingAttempt {
  readonly fingerprint: string;
  readonly commandFingerprint: string;
  readonly command: ExactMissionStartCommand;
}

interface EligibleMissionParticipant {
  readonly player: Player;
  readonly roleId: string;
}

function requestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `mission-start-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && !('code' in error)) return error.message;
  return normalizeCommandError(error).message;
}

function storageKey(sessionId: string, instanceId: string): string {
  return `pc04:mission-start:${encodeURIComponent(sessionId)}:${encodeURIComponent(instanceId)}`;
}

function missionStartFingerprint(payload: MissionStartPayload): string {
  return JSON.stringify({ ...payload, participantUids: [...payload.participantUids] });
}

function exactCommandFingerprint(command: ExactMissionStartCommand): string {
  return JSON.stringify({ ...command, participantUids: [...command.participantUids] });
}

function currentMissionParticipantRoleId(
  player: Player,
  activeRoleIds: ReadonlySet<string>,
  session: GameSession,
  players: readonly Player[],
): string | undefined {
  if (player.replacementRoleId != null && typeof player.replacementRoleId !== 'string') return undefined;

  if (typeof player.replacementRoleId === 'string') {
    const role = replacementRoleFor(player.replacementRoleId);
    const currentReplacementHolders = players.filter((candidate) =>
      candidate.replacementRoleId === player.replacementRoleId && candidate.replacementStatus == null);
    if (!role || role.kind !== 'extra-ship' || player.replacementStatus != null ||
        player.activeConsoleRoleId != null || player.seatId != null || player.escapeState != null ||
        currentReplacementHolders.length !== 1 || currentReplacementHolders[0]?.uid !== player.uid ||
        !replacementRoleAvailableForSession(role, {
          activeVesselIds: session.activeVesselIds,
          smallShipStates: session.smallShipStates,
          expansion: session.expansion,
          capybaraEnabled: session.capybaraEnabled,
        })) return undefined;
    return role.id;
  }

  if (player.replacementStatus != null || typeof player.assignedRoleId !== 'string' ||
      !activeRoleIds.has(player.assignedRoleId)) return undefined;
  return player.assignedRoleId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restoreAttempt(key: string, sessionId: string, instanceId: string): PendingAttempt | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed) || typeof parsed.fingerprint !== 'string' ||
        typeof parsed.commandFingerprint !== 'string' || !isRecord(parsed.command)) return null;
    const raw = parsed.command;
    if (Object.prototype.hasOwnProperty.call(raw, 'allowReplay') ||
        raw.sessionId !== sessionId || raw.instanceId !== instanceId ||
        typeof raw.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.requestId) ||
        !Number.isSafeInteger(raw.expectedSetupRevision) || (raw.expectedSetupRevision as number) < 0 ||
        !Number.isSafeInteger(raw.expectedPhaseRevision) || (raw.expectedPhaseRevision as number) < 0 ||
        !Number.isSafeInteger(raw.expectedCycle) || (raw.expectedCycle as number) < 1 ||
        !Number.isSafeInteger(raw.sourceCycle) || (raw.sourceCycle as number) < 0 ||
        typeof raw.opportunityId !== 'string' || raw.opportunityId.length === 0 ||
        typeof raw.groupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(raw.groupId) ||
        (raw.chart !== 'A' && raw.chart !== 'B' && raw.chart !== 'C') ||
        typeof raw.coordinate !== 'string' || !/^\d{4}$/.test(raw.coordinate) ||
        !Array.isArray(raw.participantUids) || raw.participantUids.length === 0 ||
        raw.participantUids.some((uid) => typeof uid !== 'string' || uid.length === 0) ||
        new Set(raw.participantUids).size !== raw.participantUids.length ||
        typeof raw.missionLeaderUid !== 'string' || !raw.participantUids.includes(raw.missionLeaderUid)) return null;
    const command = raw as unknown as ExactMissionStartCommand;
    const { requestId, ...payload } = command;
    void requestId;
    const fingerprint = missionStartFingerprint(payload);
    return parsed.fingerprint === fingerprint &&
      parsed.commandFingerprint === exactCommandFingerprint(command)
      ? { fingerprint, commandFingerprint: parsed.commandFingerprint, command }
      : null;
  } catch {
    return null;
  }
}

function saveAttempt(key: string, attempt: PendingAttempt): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(attempt));
    return true;
  } catch {
    return false;
  }
}

function clearAttempt(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // A stale local receipt is harmless; the server still owns replay authority.
  }
}

function isStaleReply(
  reply: Awaited<ReturnType<typeof startAwayMission>>,
  command: ExactMissionStartCommand,
): boolean {
  return reply.status === 'stale' || reply.status === 'replayed' && (
    reply.currentSetupRevision !== undefined && reply.currentSetupRevision !== command.expectedSetupRevision ||
    reply.currentPhaseRevision !== undefined && reply.currentPhaseRevision !== command.expectedPhaseRevision ||
    reply.currentCycle !== undefined && reply.currentCycle !== command.expectedCycle
  );
}

function receiptDetails(receipt: AwayMissionStartSnapshot): readonly [string, string][] {
  const participants = receipt.inputs.participantSnapshots
    .map(({ uid, roleId }) => `${uid} (${roleId})`)
    .join('; ');
  return [
    ['Source', `${receipt.source.assumptionId} // ${receipt.source.playerGuide} // ${receipt.source.facilitatorGuide} // ${receipt.source.a4CardPack} // ${receipt.source.ruleId}`],
    ['Inputs', `setup ${receipt.inputs.expectedSetupRevision} // phase ${receipt.inputs.expectedPhaseRevision} // cycle ${receipt.inputs.expectedCycle} // participants ${participants} // Mission Leader ${receipt.inputs.missionLeaderUid}`],
    ['Available carriers', receipt.inputs.availableCarrierCraftIds.join(', ')],
    ['Modifiers', receipt.modifiers.length ? receipt.modifiers.join(', ') : 'None'],
    ['Outcome', receipt.outcome],
    ['State delta', JSON.stringify(receipt.stateDelta)],
    ['Revision state', JSON.stringify(receipt.revisions)],
    ['Replay state', JSON.stringify(receipt.replay)],
    ['Recovery', JSON.stringify(receipt.recovery)],
    ['Recorded by', `${receipt.actorUid} // ${receipt.instanceId} // request ${receipt.requestId}`],
  ];
}

export default function AwayMissionStartPanel({
  session,
  players,
  instanceId,
  isGm,
  preparedOpportunities,
  preparedReceipts,
  submitMissionStart = startAwayMission,
}: Props) {
  const pendingStorageKey = session?.id && instanceId ? storageKey(session.id, instanceId) : null;
  const [opportunities, setOpportunities] = useState<readonly MissionOpportunity[]>([]);
  const [receipts, setReceipts] = useState<readonly AwayMissionStartSnapshot[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('');
  const [selectedParticipantUids, setSelectedParticipantUids] = useState<readonly string[]>([]);
  const [missionLeaderUid, setMissionLeaderUid] = useState('');
  const [locallyStartedIds, setLocallyStartedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingAttempt, setPendingAttempt] = useState<PendingAttempt | null>(() =>
    session?.id && instanceId ? restoreAttempt(storageKey(session.id, instanceId), session.id, instanceId) : null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setOpportunities(preparedOpportunities ?? []);
    setReceipts(preparedReceipts ?? []);
    setSelectedOpportunityId('');
    setSelectedParticipantUids([]);
    setMissionLeaderUid('');
    setLocallyStartedIds(new Set());
    setPendingAttempt(session?.id && instanceId
      ? restoreAttempt(storageKey(session.id, instanceId), session.id, instanceId)
      : null);
    setMessage(null);
    if (preparedOpportunities !== undefined || preparedReceipts !== undefined) return;
    if (!isGm || !session?.id || session.phase !== 'active') return;
    let active = true;
    const stopOpportunities = subscribeGmMissionOpportunities(session.id, (next) => {
      if (active) setOpportunities(next);
    });
    const stopReceipts = subscribeGmMissionStartSnapshots(session.id, (next) => {
      if (active) setReceipts(next);
    });
    return () => {
      active = false;
      stopOpportunities();
      stopReceipts();
    };
  }, [instanceId, isGm, preparedOpportunities, preparedReceipts, session?.id, session?.phase]);

  const currentPhase = session ? turnPhaseState(session.turnPhase) : undefined;
  const currentTurn = session && currentPhase
    ? turnStateForPhaseContext(
      session.turnState,
      currentPhase,
      session.currentTurn,
      turnLimitForSession(session),
    )
    : undefined;
  const activePhaseReady = Boolean(session?.phase === 'active' && currentPhase && currentTurn &&
    (session.chartSelectionLocked === true || session.configurationLocked === true));
  const startedOpportunityIds = useMemo(() => new Set([
    ...receipts.map((receipt) => receipt.opportunityId),
    ...locallyStartedIds,
  ]), [locallyStartedIds, receipts]);
  const availableOpportunities = useMemo(
    () => opportunities
      .filter((opportunity) => !startedOpportunityIds.has(opportunity.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
    [opportunities, startedOpportunityIds],
  );
  const selectedOpportunity = availableOpportunities.find(({ id }) => id === selectedOpportunityId) ??
    availableOpportunities[0];
  const activeRoleIds = useMemo(() => new Set(session?.activeRoleIds ?? []), [session?.activeRoleIds]);
  const eligibleParticipants = useMemo(() => {
    if (!selectedOpportunity || !session) return [];
    return players
      .flatMap((player): EligibleMissionParticipant[] => {
        if (player.role !== 'player' || player.connected !== true ||
            player.fleetGroupId !== selectedOpportunity.groupId) return [];
        const roleId = currentMissionParticipantRoleId(player, activeRoleIds, session, players);
        return roleId ? [{ player, roleId }] : [];
      })
      .sort((left, right) => left.player.displayName.localeCompare(right.player.displayName) ||
        left.player.uid.localeCompare(right.player.uid));
  }, [activeRoleIds, players, selectedOpportunity, session]);
  const selectedUids = selectedParticipantUids.filter((uid) =>
    eligibleParticipants.some(({ player }) => player.uid === uid));
  const selectedParticipants = selectedUids.flatMap((uid) => {
    const participant = eligibleParticipants.find((candidate) => candidate.player.uid === uid);
    return participant ? [participant] : [];
  });
  const leaderIsSelected = missionLeaderUid !== '' && selectedUids.includes(missionLeaderUid);
  const canStart = Boolean(session && selectedOpportunity && activePhaseReady && instanceId &&
    selectedUids.length > 0 && leaderIsSelected && !busy && !pendingAttempt);

  if (!isGm || !session) return null;

  const toggleParticipant = (uid: string, checked: boolean) => {
    setSelectedParticipantUids((previous) => checked
      ? previous.includes(uid) ? previous : [...previous, uid]
      : previous.filter((selectedUid) => selectedUid !== uid));
    if (!checked && missionLeaderUid === uid) setMissionLeaderUid('');
    setMessage(null);
  };

  const selectOpportunity = (opportunityId: string) => {
    setSelectedOpportunityId(opportunityId);
    setSelectedParticipantUids([]);
    setMissionLeaderUid('');
    setMessage(null);
  };

  const start = async () => {
    if (!session || !currentTurn || !selectedOpportunity || !canStart || !leaderIsSelected) return;
    const participantUids = [...selectedUids];
    const expectedSetupRevision = Number.isSafeInteger(session.setupRevision) && (session.setupRevision ?? 0) >= 0
      ? session.setupRevision ?? 0
      : 0;
    const payload: MissionStartPayload = {
      sessionId: session.id,
      instanceId,
      expectedSetupRevision,
      expectedPhaseRevision: currentTurn.phaseRevision,
      expectedCycle: currentTurn.currentTurn,
      opportunityId: selectedOpportunity.id,
      groupId: selectedOpportunity.groupId,
      chart: selectedOpportunity.chart,
      coordinate: selectedOpportunity.coordinate,
      sourceCycle: selectedOpportunity.sourceCycle,
      participantUids,
      missionLeaderUid,
    } as const;
    const fingerprint = missionStartFingerprint(payload);
    const command = { ...payload, requestId: requestId() };
    const attempt = pendingAttempt?.fingerprint === fingerprint
      ? pendingAttempt
      : { fingerprint, commandFingerprint: exactCommandFingerprint(command), command };
    if (!pendingStorageKey || !saveAttempt(pendingStorageKey, attempt)) {
      setMessage('This browser cannot save the exact retry identity, so the mission request was not submitted. Enable session storage and try again.');
      return;
    }
    setPendingAttempt(attempt);
    setBusy(true);
    setMessage(null);
    try {
      const reply = await submitMissionStart(attempt.command);
      if (isStaleReply(reply, attempt.command)) {
        if (pendingStorageKey) clearAttempt(pendingStorageKey);
        setPendingAttempt(null);
        setMessage('The mission start was not committed because the game phase changed. Refresh this panel before retrying.');
        return;
      }
      setLocallyStartedIds((previous) => new Set([...previous, selectedOpportunity.id]));
      if (pendingStorageKey) clearAttempt(pendingStorageKey);
      setPendingAttempt(null);
      setSelectedParticipantUids([]);
      setMissionLeaderUid('');
      setMessage(reply.status === 'replayed'
        ? `Mission start was already recorded for ${reply.groupId} at ${reply.coordinate}; no second deal was made.`
        : `Mission started for ${reply.groupId} at ${reply.coordinate}. Participant cards are private.`);
    } catch (error) {
      // Keep the request id while the payload is unchanged so an ambiguous
      // transport failure can only replay the same atomic deal.
      setMessage(failureMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const retryExact = async () => {
    const attempt = pendingAttempt;
    if (!session || !isGm || !attempt || !pendingStorageKey || busy ||
        attempt.command.sessionId !== session.id || attempt.command.instanceId !== instanceId) return;
    setBusy(true);
    setMessage(null);
    try {
      const reply = await submitMissionStart({ ...attempt.command, allowReplay: true });
      if (isStaleReply(reply, attempt.command)) {
        clearAttempt(pendingStorageKey);
        setPendingAttempt(null);
        setMessage('The original mission start was not committed because its saved revisions are stale. Refresh before starting a new request.');
        return;
      }
      setLocallyStartedIds((previous) => new Set([...previous, attempt.command.opportunityId]));
      clearAttempt(pendingStorageKey);
      setPendingAttempt(null);
      setMessage(reply.status === 'replayed'
        ? `Mission start was already recorded for ${reply.groupId} at ${reply.coordinate}; no second deal was made.`
        : `Mission started for ${reply.groupId} at ${reply.coordinate}. Participant cards are private.`);
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gm-console__module away-mission-start-panel cic-frame" aria-label="New-location mission start">
      <h2 className="gm-console__section-title">Away mission // new location</h2>
      <p className="gm-console__hint">
        Record the connected team roster and its selected Mission Leader at the exact newly reached opportunity.
        The server validates current group, usable source craft, phase, and source authority before it deals private cards.
      </p>
      {pendingAttempt && (
        <section className="away-mission-start-panel__pending" aria-label="Pending exact mission start">
          <p className="gm-console__status">
            Awaiting confirmation for {pendingAttempt.command.groupId} // {pendingAttempt.command.chart}{' '}
            {pendingAttempt.command.coordinate} // cycle {pendingAttempt.command.sourceCycle}.
            {' '}Retry sends the same roster, leader, revisions, and request identity.
          </p>
          <button
            type="button"
            className="cic-action-button"
            onClick={() => void retryExact()}
            disabled={busy || pendingAttempt.command.sessionId !== session.id ||
              pendingAttempt.command.instanceId !== instanceId}
          >
            {busy ? 'Retrying mission start…' : 'Retry exact mission start'}
          </button>
        </section>
      )}
      {availableOpportunities.length > 0 ? (
        <>
          {availableOpportunities.length > 1 && (
            <label className="gm-console__status">
              New-location opportunity
              <select
                aria-label="Mission opportunity"
                value={selectedOpportunity?.id ?? ''}
                onChange={(event) => selectOpportunity(event.currentTarget.value)}
                disabled={busy || Boolean(pendingAttempt)}
              >
                {availableOpportunities.map((opportunity) => (
                  <option key={opportunity.id} value={opportunity.id}>
                    {opportunity.groupId} // {opportunity.chart} {opportunity.coordinate} // cycle {opportunity.sourceCycle}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedOpportunity && (
            <div className="away-mission-start-panel__opportunity">
              <p className="gm-console__status">
                Fleet group {selectedOpportunity.groupId} // Chart {selectedOpportunity.chart} // {selectedOpportunity.coordinate}
                {' '}// source cycle {selectedOpportunity.sourceCycle}
              </p>
              <p className="gm-console__hint">
                Newly reached {selectedOpportunity.siteCode} location from {selectedOpportunity.sourceShipId}
                {' '}({selectedOpportunity.sourceTransitionId}).
              </p>
            </div>
          )}
          {!activePhaseReady && (
            <p className="gm-console__status" role="status">
              Mission start is unavailable until the active game, current phase, and locked chart are confirmed.
            </p>
          )}
          {eligibleParticipants.length > 0 ? (
            <fieldset className="away-mission-start-panel__roster" disabled={busy || Boolean(pendingAttempt)}>
              <legend>Participants selected by the team</legend>
              {eligibleParticipants.map(({ player, roleId }) => (
                <label className="away-mission-start-panel__participant" key={player.uid}>
                  <input
                    type="checkbox"
                    checked={selectedUids.includes(player.uid)}
                    onChange={(event) => toggleParticipant(player.uid, event.currentTarget.checked)}
                  />
                  {player.displayName} // {roleId}
                </label>
              ))}
              <label className="away-mission-start-panel__leader">
                Mission Leader
                <select
                  aria-label="Mission Leader"
                  value={leaderIsSelected ? missionLeaderUid : ''}
                  onChange={(event) => setMissionLeaderUid(event.currentTarget.value)}
                  disabled={busy || selectedUids.length === 0}
                >
                  <option value="">Choose one selected participant</option>
                  {selectedParticipants.map(({ player, roleId }) => (
                    <option key={player.uid} value={player.uid}>
                      {player.displayName} // {roleId}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          ) : (
            <p className="gm-console__status" role="status">
              No connected team-choice participants are currently in this fleet group.
            </p>
          )}
          <button type="button" className="cic-action-button" onClick={() => void start()} disabled={!canStart}>
            {busy ? 'Starting mission…' : 'Start mission'}
          </button>
        </>
      ) : (
        <p className="gm-console__status" role="status">
          No unstarted source-authorized new-location opportunities are available.
        </p>
      )}
      {message && <p className="gm-console__status" role="status" aria-label="Mission start result">{message}</p>}

      {receipts.length > 0 && (
        <section className="away-mission-start-panel__receipts" aria-label="Mission start receipts">
          <h3 className="gm-console__section-title">Server mission-start log</h3>
          {receipts.map((receipt) => (
            <article className="away-mission-start-panel__receipt" key={receipt.opportunityId}>
              <h4 className="gm-console__status">
                {receipt.groupId} // {receipt.chart} {receipt.coordinate} // cycle {receipt.sourceCycle}
              </h4>
              <p className="gm-console__hint">
                Mission Leader {receipt.missionLeader.uid} ({receipt.missionLeader.roleId}) // {receipt.outcome}
              </p>
              <dl>
                {receiptDetails(receipt).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
