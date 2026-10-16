import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { findConsoleRole, DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import type { Player } from '@/types/game';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import {
  allowedExplicitGmLoyaltyKinds,
  canonicalGmLoyaltyAssignmentHolders,
  canonicalGmLoyaltyHolders,
  expectedExplicitWolfCount,
  explicitLoyaltyCoverage,
  hasOtherConfiguredWolf,
  suspicionChoicesForGmLoyalty,
  type GmLoyaltyHolder,
} from '@/lib/gmLoyaltySetup';
import {
  submitExplicitGmLoyaltyAssignment,
  type ExplicitGmLoyaltyAssignmentRequest,
} from '@/lib/gmLoyaltyAssignmentService';
import './GmLoyaltySetupPanel.css';

const LOYALTY_LABELS = {
  'fleet-loyalist': 'Fleet Loyalist',
  'wolf-agent': 'Wolf Agent',
  'intelligence-agent': 'Intelligence Agent',
  'universal-arbour': 'Universal Arbour',
  'wolf-cult': 'Wolf Cult',
  android: 'Android',
  friend: 'Friend',
} as const;

function isRetryableAssignmentError(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return true;
  const code = String((cause as { code?: unknown }).code);
  return /(?:unavailable|deadline-exceeded|internal|cancelled|unknown|resource-exhausted)$/.test(code);
}

function randomRequestId(): string {
  return window.crypto.randomUUID();
}

function holderLabel(holder: GmLoyaltyHolder): string {
  const roleId = holder.assignedRoleId ?? '';
  const roleName = roleId === 'press-officer' ? 'Press Officer' : findConsoleRole(roleId)?.name ?? roleId;
  return `${roleName} — ${holder.displayName}`;
}

export interface GmLoyaltySetupPanelProps {
  /** GM-only roster projection; each target is still revalidated by the callable. */
  readonly players: readonly Player[];
}

export default function GmLoyaltySetupPanel({ players }: GmLoyaltySetupPanelProps) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const census = useSessionStore((state) => state.gmLoyaltyCensus);
  const censusStatus = useSessionStore((state) => state.gmLoyaltyCensusStatus);
  const isGm = useSessionStore(selectIsGm);
  const [targetUid, setTargetUid] = useState('');
  const [kind, setKind] = useState<'fleet-loyalist' | 'wolf-agent' | 'intelligence-agent' | 'universal-arbour' | 'wolf-cult' | 'android' | 'friend'>('fleet-loyalist');
  const [suspicion, setSuspicion] = useState<number | null>(0);
  const [partnerUid, setPartnerUid] = useState('');
  const [pendingRequest, setPendingRequest] = useState<ExplicitGmLoyaltyAssignmentRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const authorityKey = session && me && gmInstance
    ? `${session.id}:${me.uid}:${me.role}:${gmInstance.id}`
    : '';
  const authorityKeyRef = useRef(authorityKey);

  useEffect(() => {
    authorityKeyRef.current = authorityKey;
    setTargetUid('');
    setPartnerUid('');
    setPendingRequest(null);
    setBusy(false);
    setMessage(null);
  }, [authorityKey]);

  const activeRoleIds = useMemo(() => {
    const configured = session?.setup?.activeRoleIds ?? session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
    return configured.filter((roleId) => roleId !== 'press-officer');
  }, [session?.activeRoleIds, session?.setup?.activeRoleIds]);
  const coreHolders = useMemo(
    () => canonicalGmLoyaltyHolders(players as readonly GmLoyaltyHolder[], activeRoleIds),
    [activeRoleIds, players],
  );
  const pressEnabled = session?.pressEnabled !== false;
  const pressClaimed = session?.pressClaimed === true;
  const holders = useMemo(
    () => canonicalGmLoyaltyAssignmentHolders(
      players as readonly GmLoyaltyHolder[], activeRoleIds,
      { enabled: pressEnabled, claimed: pressClaimed },
    ),
    [activeRoleIds, players, pressClaimed, pressEnabled],
  );
  const pressHolder = holders.find((holder) => holder.assignedRoleId === 'press-officer');
  const pressProjectionPresent = pressEnabled && players.some((player) =>
    player.activeConsoleRoleId === 'press-officer' || player.assignedRoleId === 'press-officer');
  const pressAuthorityUnresolved = pressEnabled && (pressClaimed || pressProjectionPresent) && !pressHolder;
  const censusReady = censusStatus === 'empty' || (censusStatus === 'present' && census !== null);
  const censusReadFailed = censusStatus === 'error' || (censusStatus === 'present' && census === null);
  const configuredHolderUids = censusStatus === 'present' && census
    ? census.entries.map((entry) => entry.uid) : [];
  const coverage = explicitLoyaltyCoverage(holders, configuredHolderUids);
  const coreCoverage = explicitLoyaltyCoverage(coreHolders, configuredHolderUids);
  const pressConfigured = pressHolder !== undefined && configuredHolderUids.includes(pressHolder.uid);
  const currentHolderUids = new Set(holders.map((holder) => holder.uid));
  const currentEntries = censusStatus === 'present' && census
    ? census.entries.filter((entry) => currentHolderUids.has(entry.uid)) : [];
  const configuredWolfHolderUids = currentEntries
    .filter((entry) => entry.kind === 'wolf-agent' || entry.kind === 'wolf-cult')
    .map((entry) => entry.uid);
  const intelligenceAgentUids = currentEntries
    .filter((entry) => entry.kind === 'intelligence-agent')
    .map((entry) => entry.uid);
  const currentKindCounts = new Map<string, number>();
  for (const entry of currentEntries) currentKindCounts.set(entry.kind, (currentKindCounts.get(entry.kind) ?? 0) + 1);

  const playerCount = session?.setup?.playerCount ?? session?.playerCount ?? 18;
  let expectedWolfCount: 1 | 2 | null = null;
  try {
    expectedWolfCount = expectedExplicitWolfCount(playerCount);
  } catch {
    // Keep the panel safe on an incomplete or malformed setup projection.
  }
  const universalArbourEnabled = session?.setup?.universalArbourEnabled ?? session?.universalArbourEnabled === true;
  const wolfCultEnabled = session?.setup?.wolfCultEnabled ?? session?.wolfCultEnabled === true;
  const optionalEnabled = universalArbourEnabled || wolfCultEnabled;
  const validOptionalChoice = universalArbourEnabled !== wolfCultEnabled;
  const allowedKinds = useMemo(
    () => allowedExplicitGmLoyaltyKinds({ playerCount, universalArbourEnabled, wolfCultEnabled }),
    [playerCount, universalArbourEnabled, wolfCultEnabled],
  );
  useEffect(() => {
    if (allowedKinds.length === 0 || allowedKinds.includes(kind)) return;
    const nextKind = allowedKinds[0]!;
    setKind(nextKind);
    setSuspicion(suspicionChoicesForGmLoyalty(nextKind)[0] ?? null);
    setPartnerUid('');
  }, [allowedKinds, kind]);
  const liveGmAuthority = Boolean(session && me?.role === 'gm' && me.sessionId === session.id &&
    gmInstance?.sessionId === session.id && gmInstance.uid === me.uid && isGm &&
    connection === 'live' && freshness === 'server');
  const castingOpen = session !== null && session.configurationLocked !== true &&
    (session.phase === 'lobby' || session.phase === 'casting');
  const confirmed = session?.setupConfirmed === true;
  const currentKindCount = currentKindCounts.get(kind) ?? 0;
  const selectedTargetCurrentKind = currentEntries.some((entry) => entry.uid === targetUid && entry.kind === kind);
  const uniqueKindAlreadyElsewhere = (kind === 'universal-arbour' || (wolfCultEnabled && (kind === 'wolf-agent' || kind === 'wolf-cult')))
    ? currentKindCount > 0 && !selectedTargetCurrentKind
    : false;
  const intelligenceConflict = kind === 'intelligence-agent' &&
    intelligenceAgentUids.some((uid) => uid !== targetUid);
  const intelligenceWolfMissing = kind === 'intelligence-agent' && !hasOtherConfiguredWolf(targetUid, configuredWolfHolderUids);
  const targetEntry = currentEntries.find((entry) => entry.uid === targetUid);
  const targetWasWolf = targetEntry?.kind === 'wolf-agent' || targetEntry?.kind === 'wolf-cult';
  const requestedKindIsWolf = kind === 'wolf-agent' || kind === 'wolf-cult';
  const resultingWolfCount = configuredWolfHolderUids.length - (targetWasWolf ? 1 : 0) + (requestedKindIsWolf ? 1 : 0);
  const wolfCountWouldExceedSource = expectedWolfCount !== null && resultingWolfCount > expectedWolfCount;
  const suspicionChoices = suspicionChoicesForGmLoyalty(kind);
  const validSuspicion = suspicionChoices.some((choice) => choice === suspicion);
  const target = holders.find((holder) => holder.uid === targetUid);
  const targetConnected = target !== undefined && target.connected === true;
  const partner = holders.find((holder) => holder.uid === partnerUid);
  const partnerConnected = partner !== undefined && partner.connected === true;
  const friendPartnerMissing = kind === 'friend' && (!partnerUid || partnerUid === targetUid || !partnerConnected);
  const wolfAgentCount = currentKindCounts.get('wolf-agent') ?? 0;
  const wolfCultCount = currentKindCounts.get('wolf-cult') ?? 0;
  const intelligenceCount = currentKindCounts.get('intelligence-agent') ?? 0;
  const arbourCount = currentKindCounts.get('universal-arbour') ?? 0;
  const startBlockers = [
    censusStatus === 'loading' ? 'Wait for the live GM private-record projection before checking readiness.' : null,
    censusReadFailed ? 'The live GM private-record projection could not be verified. Reconnect before checking readiness.' : null,
    censusReady && !coverage.complete
      ? `Assign ${coverage.total - coverage.configured} more private record${coverage.total - coverage.configured === 1 ? '' : 's'} to current core holders and the claimed Press Officer before start.`
      : null,
    expectedWolfCount === null ? 'Refresh a valid printed player-count setup before checking Wolf coverage.' : null,
    expectedWolfCount !== null && configuredWolfHolderUids.length !== expectedWolfCount
      ? configuredWolfHolderUids.length < expectedWolfCount
        ? `Assign ${expectedWolfCount - configuredWolfHolderUids.length} Wolf role record${expectedWolfCount - configuredWolfHolderUids.length === 1 ? '' : 's'} before start.`
        : `Remove ${configuredWolfHolderUids.length - expectedWolfCount} excess Wolf role record${configuredWolfHolderUids.length - expectedWolfCount === 1 ? '' : 's'} before start.`
      : null,
    universalArbourEnabled && arbourCount !== 1 ? 'Universal Arbour requires exactly one current holder record before start.' : null,
    wolfCultEnabled && wolfCultCount !== 1 ? 'Wolf Cult requires exactly one current holder record before start.' : null,
    wolfCultEnabled && wolfAgentCount !== 1 ? 'Wolf Cult also requires exactly one separate Wolf Agent holder before start.' : null,
    intelligenceCount > 1 ? 'Only one Intelligence Agent record is allowed in this setup.' : null,
  ].filter((blocker): blocker is string => blocker !== null);
  const setupBlockers = [
    !confirmed ? 'Confirm the optional choice before entering private records.' : null,
    !liveGmAuthority ? 'Live GM session authority is required before changing private loyalty.' : null,
    !castingOpen ? 'Private loyalty is locked outside the unlocked lobby or casting phase.' : null,
    optionalEnabled && censusStatus === 'loading' ? 'Wait for the live GM private-record projection before assigning loyalty.' : null,
    optionalEnabled && censusReadFailed ? 'The live GM private-record projection could not be verified. Reconnect before assigning loyalty.' : null,
    optionalEnabled && !validOptionalChoice
      ? 'Choose exactly one explicit printed loyalty scenario. Ordinary Wolf designation stays automatic.' : null,
    wolfCultEnabled && playerCount < 14
      ? 'Wolf Cult requires the source-supported two-Wolf setup for 14 or more players.' : null,
    holders.length === 0 ? 'Assign current core roles before configuring loyalty.' : null,
    holders.length > 0 && !holders.some((holder) => holder.connected === true)
      ? 'Reconnect a current role or Press station holder before assigning its private record.' : null,
    pressAuthorityUnresolved
      ? 'Refresh or reconcile the claimed Press holder before configuring private loyalty. The live holder must be connected, hold only the Press station, and have no replacement or escape state.' : null,
  ].filter((blocker): blocker is string => blocker !== null);
  const editorReady = liveGmAuthority && castingOpen && confirmed && optionalEnabled && validOptionalChoice && allowedKinds.length > 0 &&
    censusReady && holders.length > 0 && holders.some((holder) => holder.connected === true) && setupBlockers.length === 0;
  const requestBlocked = !editorReady || !allowedKinds.includes(kind) || !targetConnected || !validSuspicion || uniqueKindAlreadyElsewhere ||
    intelligenceConflict || intelligenceWolfMissing || friendPartnerMissing || wolfCountWouldExceedSource || busy || pendingRequest !== null;

  if (!isGm) return null;

  async function runRequest(request: ExplicitGmLoyaltyAssignmentRequest): Promise<void> {
    const dispatchAuthorityKey = authorityKey;
    if (!dispatchAuthorityKey || authorityKeyRef.current !== dispatchAuthorityKey) return;
    setBusy(true);
    setMessage(null);
    try {
      await submitExplicitGmLoyaltyAssignment(request);
      if (authorityKeyRef.current !== dispatchAuthorityKey) return;
      const current = useSessionStore.getState();
      if (current.session?.id !== request.sessionId || current.me?.uid !== me?.uid || current.me?.role !== 'gm' || !selectIsGm(current) ||
          current.gmInstance?.id !== request.instanceId || current.gmInstance.uid !== me?.uid) return;
      setPendingRequest(null);
      setTargetUid('');
      setPartnerUid('');
      setKind(allowedKinds[0] ?? 'fleet-loyalist');
      setSuspicion(suspicionChoicesForGmLoyalty(allowedKinds[0] ?? 'fleet-loyalist')[0] ?? null);
      setMessage('Private record committed by the server. Aggregate coverage updates with the live GM projection.');
    } catch (cause) {
      if (authorityKeyRef.current !== dispatchAuthorityKey) return;
      const current = useSessionStore.getState();
      if (current.session?.id !== request.sessionId || current.me?.uid !== me?.uid || current.me?.role !== 'gm' || !selectIsGm(current) ||
          current.gmInstance?.id !== request.instanceId || current.gmInstance.uid !== me?.uid) return;
      if (isRetryableAssignmentError(cause)) {
        setPendingRequest(request);
        setMessage('The server result is not confirmed. Reconnect if needed, then retry this exact request.');
      } else {
        setPendingRequest(null);
        setMessage('The server rejected the assignment. Review the visible blockers, refresh the live setup, and choose a new request.');
      }
    } finally {
      if (authorityKeyRef.current === dispatchAuthorityKey) setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (requestBlocked || !session || !gmInstance || !targetUid) return;
    const request: ExplicitGmLoyaltyAssignmentRequest = {
      sessionId: session.id,
      instanceId: gmInstance.id,
      requestId: randomRequestId(),
      targetUid,
      kind,
      suspicion,
      ...(kind === 'friend' ? { partnerUid } : {}),
    };
    setPendingRequest(request);
    void runRequest(request);
  }

  const optionalConfiguredCount = universalArbourEnabled
    ? arbourCount
    : wolfCultCount;
  const uniqueKindConflict = uniqueKindAlreadyElsewhere || intelligenceConflict;
  const selectedBlocker = !editorReady ? setupBlockers[0] ?? 'The explicit setup is not ready for changes.'
    : !allowedKinds.includes(kind) ? 'Choose a loyalty type enabled by the confirmed printed scenario.'
      : !targetConnected ? 'Choose a connected current core role or claimed Press holder.'
      : uniqueKindConflict ? 'The optional record already has its permitted holder; reassign that holder instead of adding a duplicate.'
        : intelligenceWolfMissing ? 'Intelligence Agent requires another configured Wolf Agent or Wolf Cult holder.'
          : wolfCountWouldExceedSource ? `This choice would exceed the ${expectedWolfCount} Wolf role${expectedWolfCount === 1 ? '' : 's'} required by the printed setup.`
            : friendPartnerMissing ? 'Choose a different connected current holder for the reciprocal Friend record.'
              : !validSuspicion ? 'Choose a suspicion value allowed by the printed source.'
                : null;

  return (
    <section className="gm-loyalty-setup cic-frame" aria-label="Explicit loyalty setup">
      <div className="gm-loyalty-setup__heading">
        <div>
          <p className="gm-loyalty-setup__eyebrow">Cycle 0 // private setup</p>
          <h3>Explicit loyalty configuration</h3>
        </div>
        <span className="gm-loyalty-setup__status" aria-label="Loyalty setup mode">
          {optionalEnabled ? 'Printed variant' : 'Automatic default'}
        </span>
      </div>

      {!optionalEnabled && (
        <p className="gm-loyalty-setup__notice" role="status">
          Ordinary mode // Wolf designation and routine loyalty are assigned automatically at production start. Select an optional printed scenario only when that configuration is intended.
        </p>
      )}

      {optionalEnabled && (
        <>
          <p className="gm-loyalty-setup__notice" role="status">
            Explicit printed configuration // The live GM authors these records for this selected printed scenario. Every current core role holder and claimed Press Officer needs a private record before start; Press stays outside core role counts. Friend records are committed as a reciprocal pair. Ordinary mode keeps automatic Wolf designation.
          </p>
          <div className="gm-loyalty-setup__coverage" aria-label="Explicit loyalty coverage">
            <span>Current core holders // {coreCoverage.configured} of {coreCoverage.total} configured</span>
            {pressHolder && <span>Press holder // {pressConfigured ? 'private record configured' : 'private record required'}</span>}
            <span>All current holders // {coverage.configured} of {coverage.total} configured</span>
          </div>
          <ul className="gm-loyalty-setup__checks" aria-label="Printed setup counts and blockers">
            {universalArbourEnabled && <li>Universal Arbour // {optionalConfiguredCount} of 1</li>}
            {wolfCultEnabled && <>
              <li>Wolf Cult // {optionalConfiguredCount} of 1</li>
              <li>Wolf Agent // {wolfAgentCount} of 1</li>
            </>}
            <li>Wolf roles // {configuredWolfHolderUids.length} of {expectedWolfCount ?? 'unknown'} required</li>
            <li>Intelligence Agent // {intelligenceCount} of 1</li>
          </ul>

          {startBlockers.length > 0 && (
            <ul className="gm-loyalty-setup__blockers" aria-label="Before-start readiness blockers">
              {startBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}

          {setupBlockers.length > 0 && (
            <ul className="gm-loyalty-setup__blockers" aria-label="Loyalty setup blockers">
              {setupBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}

          {editorReady && (
            <form className="gm-loyalty-setup__form" onSubmit={onSubmit}>
              <label className="gm-loyalty-setup__field">
                <span>Current holder</span>
                <select aria-label="Loyalty holder" value={targetUid} onChange={(event) => setTargetUid(event.target.value)}>
                  <option value="">Choose a current holder</option>
                  {holders.map((holder) => {
                    const connected = holder.connected === true;
                    const configured = currentHolderUids.has(holder.uid) && configuredHolderUids.includes(holder.uid);
                    return (
                      <option key={holder.uid} value={holder.uid} disabled={!connected}>
                        {holderLabel(holder)}{configured ? ' // configured' : ''}{connected ? '' : ' // reconnect first'}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="gm-loyalty-setup__field">
                <span>Private loyalty type</span>
                <select
                  aria-label="Private loyalty type"
                  value={kind}
                  onChange={(event) => {
                    const next = event.target.value as typeof kind;
                    setKind(next);
                    setSuspicion(suspicionChoicesForGmLoyalty(next)[0] ?? null);
                    setPartnerUid('');
                  }}
                >
                  {allowedKinds.map((choice) => (
                    <option key={choice} value={choice}>{LOYALTY_LABELS[choice]}</option>
                  ))}
                </select>
              </label>

              {kind === 'friend' && (
                <label className="gm-loyalty-setup__field">
                  <span>Reciprocal Friend partner</span>
                  <select aria-label="Reciprocal Friend partner" value={partnerUid} onChange={(event) => setPartnerUid(event.target.value)}>
                    <option value="">Choose another current holder</option>
                    {holders.filter((holder) => holder.uid !== targetUid).map((holder) => {
                      const connected = holder.connected === true;
                      return (
                        <option key={holder.uid} value={holder.uid} disabled={!connected}>
                          {holderLabel(holder)}{connected ? '' : ' // reconnect first'}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}

              <label className="gm-loyalty-setup__field">
                <span>Suspicion</span>
                {suspicionChoices.length === 1 && suspicionChoices[0] === null ? (
                  <output className="gm-loyalty-setup__fixed-value" aria-label="Suspicion">Not assigned</output>
                ) : (
                  <select
                    aria-label="Suspicion"
                    value={suspicion === null ? '' : String(suspicion)}
                    onChange={(event) => setSuspicion(event.target.value === '' ? null : Number(event.target.value))}
                  >
                    {suspicionChoices.map((choice) => (
                      <option key={choice} value={choice === null ? '' : String(choice)}>{choice === null ? 'Not assigned' : choice}</option>
                    ))}
                  </select>
                )}
              </label>

              {uniqueKindConflict && <p className="gm-loyalty-setup__inline-blocker" role="status">{selectedBlocker}</p>}
              {intelligenceWolfMissing && <p className="gm-loyalty-setup__inline-blocker" role="status">{selectedBlocker}</p>}
              {friendPartnerMissing && <p className="gm-loyalty-setup__inline-blocker" role="status">{selectedBlocker}</p>}

              {!pendingRequest ? (
                <button className="cic-action-button" type="submit" disabled={requestBlocked}>
                  Assign private loyalty
                </button>
              ) : (
                <button
                  className="cic-action-button"
                  type="button"
                  disabled={busy || !liveGmAuthority}
                  onClick={() => void runRequest(pendingRequest)}
                >
                  {busy ? 'Retrying exact request' : 'Retry exact request'}
                </button>
              )}
              {selectedBlocker && !pendingRequest && <p className="gm-loyalty-setup__inline-blocker" role="status">{selectedBlocker}</p>}
            </form>
          )}

          {message && <p className="gm-loyalty-setup__message" role="status" aria-live="polite">{message}</p>}
        </>
      )}
    </section>
  );
}
