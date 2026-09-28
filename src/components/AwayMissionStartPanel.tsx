import { useEffect, useMemo, useState } from 'react';
import {
  subscribeGmMissionOpportunities,
  subscribeGmMissionStartSnapshots,
} from '@/lib/firestore';
import { startAwayMission } from '@/lib/sessionService';
import { normalizeCommandError } from '@/lib/commandErrors';
import { turnLimitForSession, turnPhaseState, turnStateForPhaseContext } from '@/lib/turnPhase';
import type {
  AwayMissionStartSnapshot,
  GameSession,
  MissionOpportunity,
  Player,
} from '@/types/game';

const SOURCE_ELIGIBLE_ROLE_IDS = new Set([
  'wing-commander',
  'icebreaker-miner',
  'shepherd-scientist',
  'quellon-explorer',
  'refinery-124-pdf-colonel',
]);

interface Props {
  readonly session: GameSession | null;
  readonly players: readonly Player[];
  readonly instanceId: string;
  readonly isGm: boolean;
}

interface PendingAttempt {
  readonly fingerprint: string;
  readonly requestId: string;
}

function requestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `mission-start-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && !('code' in error)) return error.message;
  return normalizeCommandError(error).message;
}

function receiptDetails(receipt: AwayMissionStartSnapshot): readonly [string, string][] {
  const participants = receipt.inputs.participantSnapshots
    .map(({ uid, roleId, craftIds }) => `${uid} (${roleId}; ${craftIds.join(', ')})`)
    .join('; ');
  return [
    ['Source', `${receipt.source.assumptionId} // ${receipt.source.playerGuide} // ${receipt.source.facilitatorGuide} // ${receipt.source.a4CardPack} // ${receipt.source.ruleId}`],
    ['Inputs', `setup ${receipt.inputs.expectedSetupRevision} // phase ${receipt.inputs.expectedPhaseRevision} // cycle ${receipt.inputs.expectedCycle} // participants ${participants} // Mission Leader ${receipt.inputs.missionLeaderUid}`],
    ['Modifiers', receipt.modifiers.length ? receipt.modifiers.join(', ') : 'None'],
    ['Outcome', receipt.outcome],
    ['State delta', JSON.stringify(receipt.stateDelta)],
    ['Revision state', JSON.stringify(receipt.revisions)],
    ['Replay state', JSON.stringify(receipt.replay)],
    ['Recovery', JSON.stringify(receipt.recovery)],
    ['Recorded by', `${receipt.actorUid} // ${receipt.instanceId} // request ${receipt.requestId}`],
  ];
}

export default function AwayMissionStartPanel({ session, players, instanceId, isGm }: Props) {
  const [opportunities, setOpportunities] = useState<readonly MissionOpportunity[]>([]);
  const [receipts, setReceipts] = useState<readonly AwayMissionStartSnapshot[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('');
  const [selectedParticipantUids, setSelectedParticipantUids] = useState<readonly string[]>([]);
  const [missionLeaderUid, setMissionLeaderUid] = useState('');
  const [locallyStartedIds, setLocallyStartedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingAttempt, setPendingAttempt] = useState<PendingAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setOpportunities([]);
    setReceipts([]);
    setSelectedOpportunityId('');
    setSelectedParticipantUids([]);
    setMissionLeaderUid('');
    setLocallyStartedIds(new Set());
    setPendingAttempt(null);
    setMessage(null);
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
  }, [isGm, session?.id, session?.phase]);

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
    if (!selectedOpportunity) return [];
    return players
      .filter((player) => player.role === 'player' && player.connected === true &&
        player.fleetGroupId === selectedOpportunity.groupId &&
        typeof player.assignedRoleId === 'string' &&
        activeRoleIds.has(player.assignedRoleId) &&
        SOURCE_ELIGIBLE_ROLE_IDS.has(player.assignedRoleId))
      .slice()
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.uid.localeCompare(right.uid));
  }, [activeRoleIds, players, selectedOpportunity]);
  const selectedParticipants = eligibleParticipants.filter(({ uid }) => selectedParticipantUids.includes(uid));
  const selectedUids = selectedParticipants.map(({ uid }) => uid);
  const leaderIsSelected = missionLeaderUid !== '' && selectedUids.includes(missionLeaderUid);
  const canStart = Boolean(session && selectedOpportunity && activePhaseReady && instanceId &&
    selectedUids.length > 0 && leaderIsSelected && !busy);

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
    const participantUids = eligibleParticipants
      .filter(({ uid }) => selectedUids.includes(uid))
      .map(({ uid }) => uid);
    const expectedSetupRevision = Number.isSafeInteger(session.setupRevision) && (session.setupRevision ?? 0) >= 0
      ? session.setupRevision ?? 0
      : 0;
    const command = {
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
    const fingerprint = JSON.stringify(command);
    const attempt = pendingAttempt?.fingerprint === fingerprint
      ? pendingAttempt
      : { fingerprint, requestId: requestId() };
    setPendingAttempt(attempt);
    setBusy(true);
    setMessage(null);
    try {
      const reply = await startAwayMission({
        ...command,
        requestId: attempt.requestId,
      });
      const replayedStale = reply.status === 'replayed' && (
        reply.currentSetupRevision !== undefined && reply.currentSetupRevision !== command.expectedSetupRevision ||
        reply.currentPhaseRevision !== undefined && reply.currentPhaseRevision !== command.expectedPhaseRevision ||
        reply.currentCycle !== undefined && reply.currentCycle !== command.expectedCycle
      );
      if (reply.status === 'stale' || replayedStale) {
        setMessage('The mission start was not committed because the game phase changed. Refresh this panel before retrying.');
        return;
      }
      setLocallyStartedIds((previous) => new Set([...previous, selectedOpportunity.id]));
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

  return (
    <section className="gm-console__module away-mission-start-panel cic-frame" aria-label="New-location mission start">
      <h2 className="gm-console__section-title">Away mission // new location</h2>
      <p className="gm-console__hint">
        Record the connected team roster and its selected Mission Leader at the exact newly reached opportunity.
        The server validates current group, craft, phase, and source authority before it deals private cards.
      </p>
      {availableOpportunities.length > 0 ? (
        <>
          {availableOpportunities.length > 1 && (
            <label className="gm-console__status">
              New-location opportunity
              <select
                aria-label="Mission opportunity"
                value={selectedOpportunity?.id ?? ''}
                onChange={(event) => selectOpportunity(event.currentTarget.value)}
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
            <fieldset className="away-mission-start-panel__roster" disabled={busy}>
              <legend>Participants selected by the team</legend>
              {eligibleParticipants.map((participant) => (
                <label key={participant.uid}>
                  <input
                    type="checkbox"
                    checked={selectedUids.includes(participant.uid)}
                    onChange={(event) => toggleParticipant(participant.uid, event.currentTarget.checked)}
                  />
                  {participant.displayName} // {participant.assignedRoleId}
                </label>
              ))}
              <label>
                Mission Leader
                <select
                  aria-label="Mission Leader"
                  value={leaderIsSelected ? missionLeaderUid : ''}
                  onChange={(event) => setMissionLeaderUid(event.currentTarget.value)}
                  disabled={busy || selectedUids.length === 0}
                >
                  <option value="">Choose one selected participant</option>
                  {selectedParticipants.map((participant) => (
                    <option key={participant.uid} value={participant.uid}>
                      {participant.displayName} // {participant.assignedRoleId}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          ) : (
            <p className="gm-console__status" role="status">
              No connected eligible mission-craft participants are currently in this fleet group.
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
