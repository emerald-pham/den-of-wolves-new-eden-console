import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, IntelligenceInvestigation, Player, PrivateLoyalty } from '@/types/game';
import FocusDialog from './FocusDialog';
import { findConsoleRole } from '@/data/roles';
import { RESOURCE_DEFINITIONS, type ResourceId } from '@/data/resources';
import { SHUTTLECRAFT } from '@/data/shuttles';
import { revealAndroidProof } from '@/lib/androidProofService';
import {
  submitWolfHomingBeacon,
  submitWolfIntelligence,
  submitWolfSupplySabotage,
} from '@/lib/wolfActionService';
import { normalizeCommandError } from '@/lib/commandErrors';
import { captureSessionAuthority, isCurrentSessionAuthority } from '@/lib/sessionMutationAuthority';
import { replacementRoleFor } from '@/data/replacementRoles';
import {
  subscribeConnectedPlayers,
  subscribeIntelligenceInvestigation,
} from '@/lib/firestore';
import { investigatePlayer } from '@/lib/intelligenceInvestigationService';

const LOYALTY_LABELS: Readonly<Record<string, string>> = {
  'fleet-loyalist': 'Fleet Loyalist',
  'wolf-agent': 'Wolf Agent',
  'universal-arbour': 'Universal Arbour',
  'wolf-cult': 'Wolf Cult',
  friend: 'Friend',
  'intelligence-agent': 'Intelligence Agent',
  arbour: 'Arbour',
  cult: 'Cult',
  android: 'Android',
};

function loyaltyLabel(loyalty: PrivateLoyalty): string {
  return LOYALTY_LABELS[loyalty.kind] ?? loyalty.kind.replace(/[-_]/g, ' ');
}

function isCurrentAndroidCard(
  current: PrivateLoyalty | null,
  dispatched: PrivateLoyalty,
): boolean {
  // The object identity is the assignment cursor. A replacement card with
  // equal-looking fields must not inherit a delayed disclosure result.
  return current === dispatched && current.kind === 'android' && dispatched.kind === 'android';
}

function partnerLabel(loyalty: PrivateLoyalty): string | undefined {
  if (loyalty.kind === 'friend' && loyalty.partnerRoleId) {
    return findConsoleRole(loyalty.partnerRoleId)?.name ?? replacementRoleFor(loyalty.partnerRoleId)?.name;
  }
  return loyalty.kind === 'friend' ? undefined : loyalty.partnerUid;
}

function isEndgameEvaluationPhase(phase: unknown): boolean {
  return phase === 'success' || phase === 'failure' || phase === 'debrief' || phase === 'closed';
}

interface WolfSupplyTarget {
  readonly key: string;
  readonly shuttleId: string;
  readonly resourceId: ResourceId;
  readonly label: string;
}

function wolfCoverRoleId(me: Player | null): string | null {
  if (me?.assignedRoleId && me.assignedRoleId !== 'press-officer') return me.assignedRoleId;
  return me?.activeConsoleRoleId === 'press-officer' ? 'press-officer' : null;
}

function wolfSupplyTargets(session: GameSession | null, me: Player | null): readonly WolfSupplyTarget[] {
  if (!session || !me || me.role !== 'player' || me.sessionId !== session.id ||
      me.replacementStatus != null || me.replacementRoleId != null || me.escapeState != null) return [];
  const coverRoleId = wolfCoverRoleId(me);
  if (!coverRoleId || (me.activeConsoleRoleId != null && me.activeConsoleRoleId !== coverRoleId)) return [];
  const roleIsActive = coverRoleId === 'press-officer'
    ? session.pressEnabled !== false
    : session.activeRoleIds?.includes(coverRoleId) === true;
  if (!roleIsActive) return [];

  return SHUTTLECRAFT.filter((shuttle) => shuttle.captainRoleId === coverRoleId)
    .flatMap((shuttle) => RESOURCE_DEFINITIONS.flatMap((resource) => {
      const amount = session.shuttleCargo?.[shuttle.id]?.[resource.id];
      if (!Number.isSafeInteger(amount) || (amount as number) <= 0) return [];
      return [{
        key: `${shuttle.id}|${resource.id}`,
        shuttleId: shuttle.id,
        resourceId: resource.id,
        label: `${shuttle.name} // ${resource.label} (${amount})`,
      }];
    }));
}

function wolfSupplyLoadingShuttles(session: GameSession | null, me: Player | null) {
  if (!session || !me || me.role !== 'player' || me.sessionId !== session.id ||
      me.replacementStatus != null || me.replacementRoleId != null || me.escapeState != null) return [];
  const coverRoleId = wolfCoverRoleId(me);
  if (!coverRoleId || (me.activeConsoleRoleId != null && me.activeConsoleRoleId !== coverRoleId)) return [];
  const roleIsActive = coverRoleId === 'press-officer'
    ? session.pressEnabled !== false
    : session.activeRoleIds?.includes(coverRoleId) === true;
  if (!roleIsActive) return [];
  return SHUTTLECRAFT.filter(shuttle => shuttle.captainRoleId === coverRoleId &&
    (shuttle.cargoTransferTypes?.length ?? 0) > 0);
}

/** The current browser's private setup card; never accepts another player's id. */
export default function PrivateLoyaltyPanel() {
  const loyalty = useSessionStore((state) => state.privateLoyalty);
  const wolfCultIntelligence = useSessionStore((state) => state.wolfCultIntelligence);
  const arbourVision = useSessionStore((state) => state.arbourVision);
  const setPrivateLoyalty = useSessionStore((state) => state.setPrivateLoyalty);
  const session = useSessionStore((state) => state.session);
  const sessionId = session?.id;
  const sessionPhase = session?.phase;
  const currentCycle = session?.currentTurn;
  const endgameEvaluation = useSessionStore((state) =>
    isEndgameEvaluationPhase(state.session?.phase));
  const me = useSessionStore((state) => state.me);
  const identity = JSON.stringify([
    sessionId, me?.uid, me?.role, me?.assignedRoleId, me?.activeConsoleRoleId, me?.replacementRoleId,
    me?.replacementStatus, me?.fleetGroupId,
  ]);
  const [feedback, setFeedback] = useState<{
    identity: string; card: PrivateLoyalty; pending: boolean; error: string;
  } | null>(null);
  const [wolfMessage, setWolfMessage] = useState('');
  const [wolfPending, setWolfPending] = useState(false);
  const [wolfResult, setWolfResult] = useState<{
    identity: string; loyaltyKind: string; requestId: string; cycle: number; text: string;
  } | null>(null);
  const [dismissedResultKey, setDismissedResultKey] = useState<string | null>(null);
  const resultReviewRef = useRef<HTMLButtonElement | null>(null);
  const [wolfError, setWolfError] = useState('');
  const [wolfSupplyTargetKey, setWolfSupplyTargetKey] = useState('');
  const [wolfSupplyAttempt, setWolfSupplyAttempt] = useState<{
    targetKey: string; requestId: string;
  } | null>(null);
  const [investigationTargets, setInvestigationTargets] = useState<readonly Player[]>([]);
  const [investigationTargetUid, setInvestigationTargetUid] = useState('');
  const [investigation, setInvestigation] = useState<IntelligenceInvestigation | null>(null);
  const [investigationPending, setInvestigationPending] = useState(false);
  const [investigationError, setInvestigationError] = useState('');
  const currentFeedback = feedback?.identity === identity && feedback.card === loyalty ? feedback : null;
  const pending = currentFeedback?.pending ?? false;
  const error = currentFeedback?.error ?? '';
  const privateReader = Boolean(sessionId && me?.role === 'player' && me.uid &&
    me.sessionId === sessionId && me.replacementStatus == null);
  const currentWolfResult = privateReader && wolfResult?.identity === identity &&
    wolfResult.loyaltyKind === loyalty?.kind ? wolfResult : null;
  const wolfActionUsedLocally = currentWolfResult?.cycle === currentCycle;
  const currentInvestigation = privateReader && investigation && investigation.sessionId === sessionId &&
    investigation.investigatorUid === me?.uid ? investigation : null;
  const currentWolfCultIntelligence = privateReader && wolfCultIntelligence &&
    wolfCultIntelligence.sessionId === sessionId && wolfCultIntelligence.recipientUid === me?.uid
    ? wolfCultIntelligence : null;
  const currentArbourVision = privateReader && arbourVision &&
    arbourVision.sessionId === sessionId && arbourVision.recipientUid === me?.uid
    ? arbourVision : null;
  const privateResultKey = currentWolfResult || currentInvestigation || currentWolfCultIntelligence
    ? [
      identity,
      currentWolfResult ? `wolf:${currentWolfResult.requestId}` : '',
      currentInvestigation ? `investigation:${currentInvestigation.requestId}:${currentInvestigation.revision}` : '',
      currentWolfCultIntelligence ? `cult:${currentWolfCultIntelligence.revision}` : '',
    ].join('|')
    : null;
  const privateResultReviewAvailable = privateResultKey !== null && !endgameEvaluation;
  const wolfActionAvailable = sessionPhase === 'active' && Number.isSafeInteger(currentCycle) &&
    (currentCycle as number) >= 1;
  const supplyTargets = wolfSupplyTargets(session, me);
  const supplyLoadingShuttles = wolfSupplyLoadingShuttles(session, me);
  const selectedSupplyTarget = supplyTargets.find((target) => target.key === wolfSupplyTargetKey);
  const selectedInvestigationTarget = investigationTargets.find((player) =>
    player.uid === investigationTargetUid && player.connected === true &&
    typeof me?.fleetGroupId === 'string' && me.fleetGroupId.length > 0 &&
    player.fleetGroupId === me.fleetGroupId);
  const investigationRosterInitialized = useRef(false);
  useEffect(() => { setFeedback(null); }, [identity, loyalty]);
  useEffect(() => {
    setWolfMessage('');
    setWolfPending(false);
    setWolfResult(null);
    setWolfError('');
    setWolfSupplyTargetKey('');
    setWolfSupplyAttempt(null);
  }, [identity, loyalty?.kind, currentCycle]);
  useEffect(() => {
    if (wolfSupplyTargetKey && !supplyTargets.some((target) => target.key === wolfSupplyTargetKey)) {
      setWolfSupplyTargetKey('');
      setWolfSupplyAttempt(null);
    }
  }, [supplyTargets, wolfSupplyTargetKey]);
  useEffect(() => {
    setInvestigationTargets([]);
    setInvestigationTargetUid('');
    investigationRosterInitialized.current = false;
    setInvestigation(null);
    setInvestigationPending(false);
    setInvestigationError('');
    if (loyalty?.kind !== 'intelligence-agent' || !sessionId || !me?.uid ||
        me.role !== 'player' || me.sessionId !== sessionId || me.replacementStatus != null) return;
    const stopInvestigation = subscribeIntelligenceInvestigation(
      sessionId, me.uid, setInvestigation,
    );
    let active = true;
    const currentGroupId = me.fleetGroupId;
    const stopTargets = subscribeConnectedPlayers(sessionId, (players) => {
      if (!active) return;
      const next = players
        .filter((player) => typeof currentGroupId === 'string' && currentGroupId.length > 0 &&
          player.role === 'player' && player.uid !== me.uid && player.connected === true &&
          player.fleetGroupId === currentGroupId)
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
      setInvestigationTargets(next);
      setInvestigationTargetUid((current) => {
        if (next.some((player) => player.uid === current)) return current;
        if (!investigationRosterInitialized.current && next.length > 0) {
          investigationRosterInitialized.current = true;
          return next[0]!.uid;
        }
        return '';
      });
    });
    return () => {
      active = false;
      stopTargets();
      stopInvestigation();
    };
  }, [loyalty?.kind, me?.fleetGroupId, me?.replacementStatus, me?.role, me?.sessionId, me?.uid, sessionId]);
  if (!loyalty || !privateReader) return null;

  const discloseAndroidProof = async () => {
    if (endgameEvaluation || pending || loyalty.kind !== 'android' || loyalty.proofRevealed) return;
    const state = useSessionStore.getState();
    if (isEndgameEvaluationPhase(state.session?.phase)) return;
    const checkpoint = captureSessionAuthority(state.session?.id ?? '', state.me?.uid);
    const dispatchedCard = loyalty;
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    setFeedback({ identity, card: dispatchedCard, pending: true, error: '' });
    try {
      const result = await revealAndroidProof();
      const current = useSessionStore.getState();
      if (result.disclosed && isCurrentSessionAuthority(checkpoint) &&
          isCurrentAndroidCard(current.privateLoyalty, dispatchedCard)) {
        setPrivateLoyalty({ ...dispatchedCard, proofRevealed: true });
      }
    } catch (cause) {
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) &&
          isCurrentAndroidCard(current.privateLoyalty, dispatchedCard)) {
        setFeedback((currentFeedback) => currentFeedback?.identity === identity &&
          currentFeedback.card === dispatchedCard
          ? { ...currentFeedback, error: normalizeCommandError(cause).message }
          : currentFeedback);
      }
    } finally {
      setFeedback((currentFeedback) => currentFeedback?.identity === identity &&
        currentFeedback.card === dispatchedCard
        ? { ...currentFeedback, pending: false }
        : currentFeedback);
    }
  };

  const sendWolfIntelligence = async () => {
    if (wolfPending || !wolfActionAvailable || wolfActionUsedLocally ||
        (loyalty.kind !== 'wolf-agent' && loyalty.kind !== 'wolf-cult')) return;
    const state = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(state.session?.id ?? '', state.me?.uid);
    const dispatchedCard = loyalty;
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    setWolfPending(true);
    setWolfResult(null);
    setWolfError('');
    try {
      const result = await submitWolfIntelligence(wolfMessage);
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) && current.privateLoyalty === dispatchedCard &&
          (dispatchedCard.kind === 'wolf-agent' || dispatchedCard.kind === 'wolf-cult')) {
        setPrivateLoyalty({ ...dispatchedCard, suspicion: result.suspicion });
        setWolfMessage('');
        setWolfResult({
          identity,
          loyaltyKind: dispatchedCard.kind,
          requestId: result.requestId,
          cycle: result.cycle,
          text: `Handler message sent privately. Suspicion // ${result.suspicion}.`,
        });
      }
    } catch (cause) {
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) && current.privateLoyalty === dispatchedCard) {
        setWolfError(normalizeCommandError(cause).message);
      }
    } finally {
      if (isCurrentSessionAuthority(checkpoint)) setWolfPending(false);
    }
  };

  const deployHomingBeacon = async () => {
    if (wolfPending || !wolfActionAvailable || wolfActionUsedLocally ||
        (loyalty.kind !== 'wolf-agent' && loyalty.kind !== 'wolf-cult')) return;
    const state = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(state.session?.id ?? '', state.me?.uid);
    const dispatchedCard = loyalty;
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    setWolfPending(true);
    setWolfResult(null);
    setWolfError('');
    try {
      const result = await submitWolfHomingBeacon();
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) && current.privateLoyalty === dispatchedCard &&
          (dispatchedCard.kind === 'wolf-agent' || dispatchedCard.kind === 'wolf-cult')) {
        setPrivateLoyalty({ ...dispatchedCard, suspicion: result.suspicion });
        setWolfResult({
          identity,
          loyaltyKind: dispatchedCard.kind,
          requestId: result.requestId,
          cycle: result.cycle,
          text: `Homing beacon scheduled at ${result.coordinate}. Pressure becomes eligible after ` +
            `cycle ${result.dueCycle} starts. Suspicion // ${result.suspicion}.`,
        });
      }
    } catch (cause) {
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) && current.privateLoyalty === dispatchedCard) {
        setWolfError(normalizeCommandError(cause).message);
      }
    } finally {
      if (isCurrentSessionAuthority(checkpoint)) setWolfPending(false);
    }
  };

  const sabotageShuttleSupply = async () => {
    if (wolfPending || !wolfActionAvailable || wolfActionUsedLocally || !selectedSupplyTarget ||
        (loyalty.kind !== 'wolf-agent' && loyalty.kind !== 'wolf-cult')) return;
    const state = useSessionStore.getState();
    const currentTarget = wolfSupplyTargets(state.session, state.me)
      .find((target) => target.key === selectedSupplyTarget.key);
    const dispatchedCycle = state.session?.currentTurn;
    const dispatchedRoleId = wolfCoverRoleId(state.me);
    const dispatchedCard = loyalty;
    const checkpoint = captureSessionAuthority(state.session?.id ?? '', state.me?.uid);
    if (!currentTarget || !dispatchedRoleId || !Number.isSafeInteger(dispatchedCycle) ||
        state.session?.phase !== 'active' || dispatchedCard !== state.privateLoyalty ||
        !checkpoint || !isCurrentSessionAuthority(checkpoint)) return;

    const requestId = wolfSupplyAttempt?.targetKey === currentTarget.key
      ? wolfSupplyAttempt.requestId
      : window.crypto.randomUUID();
    setWolfSupplyAttempt({ targetKey: currentTarget.key, requestId });
    setWolfPending(true);
    setWolfResult(null);
    setWolfError('');
    try {
      const result = await submitWolfSupplySabotage(
        currentTarget.shuttleId, currentTarget.resourceId, requestId,
      );
      const current = useSessionStore.getState();
      if (!isCurrentSessionAuthority(checkpoint) || current.privateLoyalty !== dispatchedCard ||
          current.me?.assignedRoleId !== state.me?.assignedRoleId ||
          current.me?.activeConsoleRoleId !== state.me?.activeConsoleRoleId ||
          current.session?.currentTurn !== dispatchedCycle) return;
      if (result.status !== 'committed' || result.type !== 'wolf-supply-sabotage' ||
          result.sessionId !== checkpoint.sessionId || result.requestId !== requestId ||
          result.idempotencyKey !== requestId || result.actorUid !== checkpoint.uid ||
          result.actorRoleId !== dispatchedRoleId || result.coverRoleId !== dispatchedRoleId ||
          result.vesselId !== currentTarget.shuttleId || result.shuttleId !== currentTarget.shuttleId ||
          result.resourceId !== currentTarget.resourceId || result.turn !== dispatchedCycle ||
          result.cycle !== dispatchedCycle || result.phase !== 'active') {
        throw new Error('The supply result did not match this player, role, cycle, or selected cargo. Refresh before continuing.');
      }
      const resourceLabel = RESOURCE_DEFINITIONS.find((resource) =>
        resource.id === result.resourceId)?.label ?? result.resourceId;
      const shuttleLabel = SHUTTLECRAFT.find((shuttle) =>
        shuttle.id === result.shuttleId)?.name ?? result.shuttleId;
      setPrivateLoyalty({ ...dispatchedCard, suspicion: result.suspicion });
      setWolfSupplyAttempt(null);
      setWolfResult({
        identity,
        loyaltyKind: dispatchedCard.kind,
        requestId: result.requestId,
        cycle: result.cycle,
        text: `${shuttleLabel} // ${result.destroyedAmount} ${resourceLabel} destroyed; ` +
          `${result.remainingAmount} remain. Suspicion // ${result.suspicion}. ` +
          `Your Wolf action for cycle ${result.cycle} is committed; continue through your assigned station.`,
      });
    } catch (cause) {
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) && current.privateLoyalty === dispatchedCard &&
          current.me?.assignedRoleId === state.me?.assignedRoleId &&
          current.me?.activeConsoleRoleId === state.me?.activeConsoleRoleId &&
          current.session?.currentTurn === dispatchedCycle) {
        setWolfError(normalizeCommandError(cause).message);
      }
    } finally {
      if (isCurrentSessionAuthority(checkpoint)) setWolfPending(false);
    }
  };

  const runInvestigation = async () => {
    if (investigationPending || !wolfActionAvailable || loyalty.kind !== 'intelligence-agent' ||
        !selectedInvestigationTarget || investigation?.cycle === currentCycle) return;
    const state = useSessionStore.getState();
    const dispatchedGroupId = state.me?.fleetGroupId;
    const dispatchedCycle = state.session?.currentTurn;
    const dispatchedTargetUid = selectedInvestigationTarget.uid;
    if (!state.session || state.session.id !== sessionId || state.session.phase !== 'active' ||
        !Number.isSafeInteger(dispatchedCycle) || dispatchedCycle !== currentCycle ||
        state.me?.role !== 'player' || state.me.sessionId !== state.session.id ||
        typeof dispatchedGroupId !== 'string' || dispatchedGroupId.length === 0 ||
        selectedInvestigationTarget.connected !== true ||
        selectedInvestigationTarget.fleetGroupId !== dispatchedGroupId ||
        selectedInvestigationTarget.role !== 'player' ||
        selectedInvestigationTarget.uid === state.me.uid ||
        investigationTargetUid !== dispatchedTargetUid) return;
    const checkpoint = captureSessionAuthority(state.session?.id ?? '', state.me?.uid);
    const dispatchedCard = loyalty;
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    const currentInvestigationContext = () => {
      const current = useSessionStore.getState();
      return isCurrentSessionAuthority(checkpoint) && current.me?.role === 'player' &&
        current.me.fleetGroupId === dispatchedGroupId && current.session?.phase === 'active' &&
        current.session.currentTurn === dispatchedCycle ? current : undefined;
    };
    setInvestigationPending(true);
    setInvestigationError('');
    try {
      const result = await investigatePlayer(dispatchedTargetUid);
      const current = currentInvestigationContext();
      if (current?.privateLoyalty === dispatchedCard && dispatchedCard.kind === 'intelligence-agent') {
        if (result.status !== 'committed' || result.type !== 'intelligence-investigation' ||
            result.sessionId !== checkpoint.sessionId || result.investigatorUid !== checkpoint.uid ||
            result.targetUid !== dispatchedTargetUid || result.cycle !== dispatchedCycle ||
            typeof result.targetDisplayName !== 'string' || result.targetDisplayName.length === 0 ||
            typeof result.reportedWolf !== 'boolean') {
          throw new Error('The investigation result did not match this player, target, or cycle. Refresh before continuing.');
        }
        setInvestigation(result);
        if (typeof result.suspicion === 'number') {
          setPrivateLoyalty({ ...dispatchedCard, suspicion: result.suspicion });
        }
      }
    } catch (cause) {
      if (currentInvestigationContext()?.privateLoyalty === dispatchedCard) {
        setInvestigationError(normalizeCommandError(cause).message);
      }
    } finally {
      if (currentInvestigationContext()) setInvestigationPending(false);
    }
  };

  return (
    <div className="private-loyalty-flow" data-private-loyalty-flow="true">
      <section className="private-loyalty-panel cic-frame" aria-label="Private loyalty card">
        <p className="private-loyalty-panel__eyebrow">Private setup // your loyalty card</p>
        <h2>{loyaltyLabel(loyalty)}</h2>
        <p className="private-loyalty-panel__suspicion">
          Suspicion // {loyalty.suspicion === null ? 'unassigned' : loyalty.suspicion}
        </p>
        {((loyalty.directives?.length ?? 0) > 0 || loyalty.kind === 'universal-arbour' || loyalty.kind === 'arbour') && (
          <section className="role-brief__rules private-loyalty-panel__directives" aria-label="Private loyalty goals">
            {loyalty.directives?.map((directive, index) => <p key={`${index}:${directive}`}>{directive}</p>)}
            {(loyalty.kind === 'universal-arbour' || loyalty.kind === 'arbour') && (
              <>
                <p>Private vision //</p>
                <p>{currentArbourVision?.text ?? 'No session-specific facilitator vision is assigned yet.'}</p>
              </>
            )}
          </section>
        )}
        {partnerLabel(loyalty) && (
          <p className="private-loyalty-panel__partner">
            {loyalty.kind === 'friend' ? 'Friend trust // partner role' : 'Partner assignment'} // {partnerLabel(loyalty)}
          </p>
        )}
        {privateResultReviewAvailable && (
          <button
            ref={resultReviewRef}
            className="cic-text-button private-loyalty-panel__review-result"
            type="button"
            onClick={() => setDismissedResultKey(null)}
          >
            Review private result
          </button>
        )}
        {loyalty.kind === 'android' && (loyalty.proofRevealed ? (
          <p className="private-loyalty-panel__proof" role="status">
            Android proof disclosed to the fleet.
          </p>
        ) : (
          <div className="private-loyalty-panel__proof">
            <p>Show your Android card only when you choose to prove your loyalty to the fleet.</p>
            <button
              className="cic-action-button"
              type="button"
              disabled={endgameEvaluation || pending}
              onClick={() => void discloseAndroidProof()}
            >
              {pending ? 'Disclosing…' : 'Disclose Android proof'}
            </button>
            {endgameEvaluation && (
              <p className="private-loyalty-panel__proof-status" role="status">
                Endgame evaluation active // Android proof disclosure is frozen.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        ))}
        {(loyalty.kind === 'wolf-agent' || loyalty.kind === 'wolf-cult') && (
          <section className="private-loyalty-panel__wolf-action" aria-label="Private Wolf action">
            <p className="eyebrow">Private Wolf action</p>
            <h3>Deploy homing beacon</h3>
            <p>Schedule Wolf pressure at your fleet’s current system for after the next cycle starts.</p>
            <button
              className="cic-action-button"
              type="button"
              disabled={wolfPending || !wolfActionAvailable || wolfActionUsedLocally}
              onClick={() => void deployHomingBeacon()}
            >
              {wolfPending ? 'Committing…' : 'Deploy homing beacon'}
            </button>
            <h3>Send intelligence</h3>
            <label htmlFor="wolf-intelligence-message">Short handler message</label>
            <textarea
              id="wolf-intelligence-message"
              maxLength={240}
              rows={3}
              value={wolfMessage}
              disabled={wolfPending || !wolfActionAvailable || wolfActionUsedLocally}
              onChange={(event) => setWolfMessage(event.target.value)}
            />
            <button
              className="cic-action-button"
              type="button"
              disabled={wolfPending || !wolfActionAvailable || wolfActionUsedLocally || !wolfMessage.trim()}
              onClick={() => void sendWolfIntelligence()}
            >
              {wolfPending ? 'Sending…' : 'Send private intelligence'}
            </button>
            <h3>Sabotage shuttle supplies</h3>
            <p>
              Choose a positive cargo balance on a shuttle assigned to your current cover role. The server
              checks the live assignment and cargo, destroys half the selected cargo, rounded down,
              adds 2 suspicion, and spends your one Wolf action for this active cycle.
            </p>
            <label htmlFor="wolf-supply-target">Shuttle cargo target</label>
            <select
              id="wolf-supply-target"
              value={wolfSupplyTargetKey}
              disabled={wolfPending || !wolfActionAvailable || wolfActionUsedLocally || supplyTargets.length === 0}
              onChange={(event) => {
                setWolfSupplyTargetKey(event.target.value);
                setWolfSupplyAttempt(null);
              }}
            >
              <option value="">Choose a shuttle cargo resource</option>
              {supplyTargets.map((target) => (
                <option value={target.key} key={target.key}>{target.label}</option>
              ))}
            </select>
            <button
              className="cic-action-button"
              type="button"
              disabled={wolfPending || !wolfActionAvailable || wolfActionUsedLocally || !selectedSupplyTarget}
              onClick={() => void sabotageShuttleSupply()}
            >
              {wolfPending ? 'Committing…' : 'Sabotage selected supply'}
            </button>
            {wolfActionAvailable && supplyTargets.length === 0 && (
              <>
                <p className="private-loyalty-panel__proof-status">
                  No positive cargo is available on an active shuttle assigned to your current cover role.
                  Refresh after the crew’s cargo projection changes.
                </p>
                {supplyLoadingShuttles.map(shuttle => <p className="private-loyalty-panel__proof-status" key={shuttle.id}>
                  Next actor // Current entitled {shuttle.name} holder: open that shuttle’s console and Transfer cargo.
                  {' '}{shuttle.name} // {shuttle.cargoTransfer}.
                  {' '}Choose a permitted Resource and Amount, then Load at a legal dock with current host stock
                  and available capacity. Return here after the crew’s cargo projection changes.
                </p>)}
              </>
            )}
            {!wolfActionAvailable && (
              <p className="private-loyalty-panel__proof-status" role="status">
                Private Wolf actions are available during active cycles.
              </p>
            )}
            {currentWolfResult && <p role="status">{currentWolfResult.text}</p>}
            {wolfError && <p role="alert">{wolfError}</p>}
          </section>
        )}
        {loyalty.kind === 'intelligence-agent' && (
          <section
            className="private-loyalty-panel__wolf-action private-loyalty-panel__investigation"
            aria-labelledby="intelligence-investigation-title"
          >
            <p className="eyebrow">Private Intelligence Bureau action</p>
            <h3 id="intelligence-investigation-title">Investigate a player</h3>
            <p>One investigation per cycle // result is approximately 80% accurate.</p>
            <label htmlFor="intelligence-investigation-target">Investigation target</label>
            <select
              id="intelligence-investigation-target"
              value={investigationTargetUid}
              disabled={investigationPending || !wolfActionAvailable ||
                investigation?.cycle === currentCycle || investigationTargets.length === 0}
              onChange={(event) => setInvestigationTargetUid(event.target.value)}
            >
              <option value="">Choose a connected player in your fleet group</option>
              {investigationTargets.map((player) => (
                <option value={player.uid} key={player.uid}>{player.displayName}</option>
              ))}
            </select>
            <button
              className="cic-action-button"
              type="button"
              disabled={investigationPending || !wolfActionAvailable ||
                investigation?.cycle === currentCycle || !selectedInvestigationTarget}
              onClick={() => void runInvestigation()}
            >
              {investigationPending ? 'Investigating…' : 'Run private investigation'}
            </button>
            {!wolfActionAvailable && (
              <p className="private-loyalty-panel__proof-status" role="status">
                Investigations are available during active cycles.
              </p>
            )}
            {wolfActionAvailable && investigationTargets.length === 0 && (
              <p className="private-loyalty-panel__proof-status" role="status">
                No other connected players are available in this fleet group.
              </p>
            )}
            {currentInvestigation && (
              <p className="private-loyalty-panel__proof-status" role="status">
                Cycle {currentInvestigation.cycle} // {currentInvestigation.targetDisplayName} //{' '}
                {currentInvestigation.reportedWolf ? 'WOLF AGENT' : 'NOT WOLF AGENT'}
              </p>
            )}
            {investigationError && <p role="alert">{investigationError}</p>}
          </section>
        )}
        {loyalty.kind === 'wolf-cult' && currentWolfCultIntelligence && (
          <section className="role-brief__rules role-brief__rules--wolf-cult-intelligence" aria-labelledby="wolf-cult-intelligence-title">
            <p className="eyebrow">{currentWolfCultIntelligence.label}</p>
            <h3 id="wolf-cult-intelligence-title">Wolf Cult intelligence</h3>
            <p>Active Wolf fortress // {currentWolfCultIntelligence.fortressCoordinate}</p>
            <p>Abandoned supplies // {currentWolfCultIntelligence.suppliesCoordinate}</p>
            <p>Other Wolf agent // {currentWolfCultIntelligence.agentUid}</p>
            <p>Code word // {currentWolfCultIntelligence.codeWord}</p>
          </section>
        )}
        <p className="private-loyalty-panel__note">
          This card belongs to this device identity only. Do not read it aloud on an open channel.
        </p>
      </section>
      <FocusDialog
        open={privateResultReviewAvailable && dismissedResultKey !== privateResultKey}
        title="Private result"
        description="This result is visible only to the current player identity on this device."
        dialogKey={privateResultKey}
        restoreRef={resultReviewRef}
        onClose={() => setDismissedResultKey(privateResultKey)}
      >
        {currentWolfResult && <p>{currentWolfResult.text}</p>}
        {currentInvestigation && (
          <section>
            <h3>Intelligence Bureau result</h3>
            <p>
              Cycle {currentInvestigation.cycle} // {currentInvestigation.targetDisplayName} //{' '}
              {currentInvestigation.reportedWolf ? 'WOLF AGENT' : 'NOT WOLF AGENT'}
            </p>
          </section>
        )}
        {currentWolfCultIntelligence && (
          <section>
            <h3>Wolf Cult intelligence</h3>
            <p>Active Wolf fortress // {currentWolfCultIntelligence.fortressCoordinate}</p>
            <p>Abandoned supplies // {currentWolfCultIntelligence.suppliesCoordinate}</p>
            <p>Other Wolf agent // {currentWolfCultIntelligence.agentUid}</p>
            <p>Code word // {currentWolfCultIntelligence.codeWord}</p>
          </section>
        )}
      </FocusDialog>
    </div>
  );
}
