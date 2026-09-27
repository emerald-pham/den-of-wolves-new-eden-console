import { useEffect, useMemo, useState } from 'react';
import type { EndeavourResearchWorkspace } from '@/lib/endeavourResearchService';
import {
  availableEndeavourFieldUpgradeOptions,
  currentEndeavourHostShipId,
  EndeavourFieldUpgradeUncertainError,
  purchaseEndeavourFieldTargets,
  retryUncertainEndeavourFieldUpgrade,
  type EndeavourFieldUpgradePurchaseState,
  type EndeavourFieldUpgradeStaleReply,
  type EndeavourFieldUpgradeTarget,
} from '@/lib/endeavourFieldUpgradeService';
import EndeavourFieldUpgradeChoices from './EndeavourFieldUpgradeChoices';
import { hasFreshSessionAuthority } from '@/lib/sessionMutationAuthority';
import type { ShuttleControlEntry } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import './EndeavourFieldUpgradePanel.css';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly workspace: EndeavourResearchWorkspace;
  readonly purchaseState: EndeavourFieldUpgradePurchaseState | null;
  readonly onRefresh?: (() => void | EndeavourResearchWorkspace | null |
    Promise<void | EndeavourResearchWorkspace | null>) | undefined;
}

function isBoundScientist(
  me: NonNullable<ReturnType<typeof useSessionStore.getState>['me']>,
): boolean {
  if (me.replacementRoleId != null) return false;
  const assignedPress = me.assignedRoleId === 'press-officer';
  const seatPress = me.seatId === 'press-officer';
  const assigned = typeof me.assignedRoleId === 'string' && me.assignedRoleId.length > 0 && !assignedPress
    ? me.assignedRoleId : undefined;
  const seat = typeof me.seatId === 'string' && me.seatId.length > 0 && !seatPress ? me.seatId : undefined;
  if ((assignedPress && seat) || (seatPress && assigned) || (assigned && seat && assigned !== seat)) return false;
  return (assigned ?? seat) === 'shepherd-scientist';
}

function authorityScopeFor(
  session: ReturnType<typeof useSessionStore.getState>['session'],
  me: ReturnType<typeof useSessionStore.getState>['me'],
): string | null {
  if (!session || !me) return null;
  const control = session.shuttleControl?.endeavour;
  const hostShipId = currentEndeavourHostShipId(session, me.fleetGroupId ?? '');
  return JSON.stringify([
    session.id, me.uid, me.role, me.assignedRoleId, me.seatId, me.replacementRoleId, me.activeConsoleRoleId,
    me.fleetGroupId, control?.ownerRoleId, control?.holderUid, hostShipId,
  ]);
}

function isCurrentScientistAuthority(expectedScope: string): boolean {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  return hasFreshSessionAuthority() && authorityScopeFor(session, me) === expectedScope &&
    session?.phase === 'active' && me?.role === 'player' &&
    isBoundScientist(me) && me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') === true &&
    control?.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' &&
    control.holderUid === me.uid;
}

function hasLiveCoordinationWindow(
  session: ReturnType<typeof useSessionStore.getState>['session'],
  cycle: number,
): boolean {
  if (!session || session.phase !== 'active' || session.currentTurn !== cycle) return false;
  const phase = session.turnPhase;
  const endsAt = Date.parse(phase?.openAirspaceEndsAt ?? '');
  return Boolean(
    phase && phase.turn === cycle && phase.airspace?.state === 'lifted' &&
    phase.timerPause === undefined && Number.isFinite(endsAt) && Date.now() < endsAt,
  );
}

function errorMessage(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause &&
      typeof cause.message === 'string' && cause.message.length > 0) return cause.message;
  return 'The field-upgrade purchase could not be confirmed. Refresh and try again.';
}

function targetKey(target: EndeavourFieldUpgradeTarget): string {
  return `${target.shipId}:${target.systemId}`;
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

interface LocalPurchaseState {
  readonly scope: string;
  readonly value: EndeavourFieldUpgradePurchaseState;
}

interface RecoveryState {
  readonly scope: string;
  readonly stale: EndeavourFieldUpgradeStaleReply;
  readonly retryInvalidated: boolean;
}

interface UncertainState {
  readonly scope: string;
  readonly retryToken: string;
}

interface RetryRefreshRequirement {
  readonly scope: string;
  readonly workspace: EndeavourResearchWorkspace;
  readonly freshWorkspace: EndeavourResearchWorkspace | null;
}

export default function EndeavourFieldUpgradePanel({
  control,
  workspace,
  purchaseState,
  onRefresh,
}: Props) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const sessionId = session?.id;
  const uid = me?.uid;
  const currentControl = session?.shuttleControl?.endeavour;
  const identityKey = sessionId && uid ? JSON.stringify([sessionId, uid]) : null;
  const authorityScope = authorityScopeFor(session, me);
  const currentHostShipId = session && me
    ? currentEndeavourHostShipId(session, me.fleetGroupId ?? '') : null;
  const entitled = Boolean(
    session?.phase === 'active' && me?.sessionId === session.id && me.role === 'player' &&
    isBoundScientist(me) &&
    me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') &&
    control.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' &&
    control.holderUid === me.uid && currentControl?.holderUid === me.uid && currentHostShipId,
  );
  const purchaseScope = JSON.stringify([
    identityKey, authorityScope, currentControl?.revision,
    workspace.sessionId, workspace.cycle, workspace.researchRevision,
  ]);
  const [localPurchaseState, setLocalPurchaseState] = useState<LocalPurchaseState | null>(null);
  const [selection, setSelection] = useState<Readonly<{ scope: string; keys: readonly string[] }> | null>(null);
  const [recoveryState, setRecoveryState] = useState<RecoveryState | null>(null);
  const [uncertainState, setUncertainState] = useState<UncertainState | null>(null);
  const [retryRefreshRequirement, setRetryRefreshRequirement] = useState<RetryRefreshRequirement | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Readonly<{
    identityKey: string;
    notice: string;
    error: string;
  }> | null>(null);
  const notice = feedback?.identityKey === identityKey ? feedback.notice : '';
  const error = feedback?.identityKey === identityKey ? feedback.error : '';

  const activePurchaseState = localPurchaseState?.scope === purchaseScope && purchaseState &&
    localPurchaseState.value.upgradeRevision > purchaseState.upgradeRevision
    ? localPurchaseState.value : purchaseState;
  const aligned = Boolean(
    session && purchaseState && activePurchaseState?.status === 'ready' &&
    activePurchaseState.sessionId === session.id && workspace.sessionId === session.id &&
    activePurchaseState.cycle === workspace.cycle && workspace.cycle === session.currentTurn &&
    activePurchaseState.researchRevision === workspace.researchRevision,
  );
  const options = useMemo(() => aligned && session && me?.fleetGroupId
    ? availableEndeavourFieldUpgradeOptions(session, me.fleetGroupId, workspace)
    : [], [aligned, me?.fleetGroupId, session, workspace]);
  const limit = session?.shuttleFuelled?.endeavour === true ? 4 : 2;
  const used = aligned ? activePurchaseState?.targetsUsedThisCycle ?? 0 : 0;
  const remaining = Math.max(0, limit - used);
  const liveCoordinationWindow = Boolean(session && hasLiveCoordinationWindow(session, workspace.cycle));
  const selectionScope = authorityScope ?? '';
  const selectedKeys = selection?.scope === selectionScope ? selection.keys : [];
  const selectedTargets = selectedKeys.flatMap((key) => {
    const option = options.find((candidate) => targetKey(candidate) === key);
    return option ? [{ shipId: option.shipId, systemId: option.systemId }] : [];
  });
  const recovery = recoveryState?.scope === authorityScope ? recoveryState : null;
  const uncertain = uncertainState?.scope === authorityScope ? uncertainState : null;
  const retryRefreshRequired = Boolean(retryRefreshRequirement &&
    retryRefreshRequirement.scope === authorityScope &&
    retryRefreshRequirement.freshWorkspace !== workspace);
  const recoveryProjectionReady = Boolean(
    recovery && aligned && hasFreshSessionAuthority() && session && currentControl &&
    isCounter(currentControl.revision) && currentControl.revision >= recovery.stale.currentControlRevision &&
    activePurchaseState && activePurchaseState.upgradeRevision >= recovery.stale.currentUpgradeRevision &&
    isCounter(session.currentTurn) && session.currentTurn >= recovery.stale.currentCycle &&
    workspace.cycle === session.currentTurn && liveCoordinationWindow,
  );
  const recoveryTargetsMatch = Boolean(recovery && selectedTargets.length === recovery.stale.targets.length &&
    JSON.stringify(selectedTargets.map(targetKey).sort()) ===
      JSON.stringify(recovery.stale.targets.map(targetKey).sort()));
  const recoveryTargetsEligible = Boolean(recovery &&
    recovery.stale.targets.every((target) => options.some((option) => targetKey(option) === targetKey(target))));
  const recoveryReady = recoveryProjectionReady && recoveryTargetsEligible;
  const canRetryStaleSelection = recoveryReady && recoveryTargetsMatch && !recovery?.retryInvalidated;
  const staleSelectionPending = Boolean(recovery && recoveryTargetsMatch && !recovery.retryInvalidated);
  const currentPanel = Boolean(
    entitled && identityKey && authorityScope && currentHostShipId &&
    workspace.sessionId === sessionId && control.holderUid === uid,
  );

  useEffect(() => {
    if (!currentPanel) {
      setSelection(null);
      setRecoveryState(null);
      setUncertainState(null);
      setRetryRefreshRequirement(null);
      setFeedback(null);
      return;
    }
    if (recoveryState && recoveryState.scope !== authorityScope) setRecoveryState(null);
    if (uncertainState && uncertainState.scope !== authorityScope) setUncertainState(null);
    setFeedback((current) => current?.identityKey === identityKey ? current : null);
  }, [authorityScope, currentPanel, identityKey, recoveryState, uncertainState]);

  useEffect(() => {
    if (!retryRefreshRequirement) return;
    if (retryRefreshRequirement.scope !== authorityScope) {
      setRetryRefreshRequirement(null);
      return;
    }
    if (retryRefreshRequirement.freshWorkspace && retryRefreshRequirement.freshWorkspace === workspace) {
      setRetryRefreshRequirement(null);
      setFeedback({
        identityKey: identityKey ?? '',
        notice: 'Scientist purchase state refreshed. Review the current targets before purchasing.',
        error: '',
      });
    }
  }, [authorityScope, identityKey, retryRefreshRequirement, workspace]);

  useEffect(() => {
    if (!aligned || !hasFreshSessionAuthority() || !selection || selection.scope !== selectionScope) return;
    const eligibleKeys = new Set(options.map(targetKey));
    const keys = selection.keys.filter((key) => eligibleKeys.has(key));
    if (keys.length !== selection.keys.length) {
      setSelection({ scope: selectionScope, keys });
    }
  }, [aligned, options, selection, selectionScope]);

  useEffect(() => {
    if (!recovery || !recoveryProjectionReady || recoveryTargetsEligible) return;
    const eligibleKeys = new Set(options.map(targetKey));
    setSelection((current) => current?.scope === selectionScope
      ? { scope: selectionScope, keys: current.keys.filter((key) => eligibleKeys.has(key)) }
      : current);
    setRecoveryState(null);
    setFeedback({
      identityKey: identityKey ?? '', notice: '',
      error: 'One or more selected consoles are no longer available. Choose current eligible targets again.',
    });
  }, [authorityScope, identityKey, options, recovery, recoveryProjectionReady, recoveryTargetsEligible, selectionScope]);

  if (!currentPanel || !sessionId || !uid || !identityKey) return null;
  const currentIdentityKey = identityKey;

  function changeSelection(option: EndeavourFieldUpgradeTarget, checked: boolean): void {
    setSelection((current) => {
      const existing = current?.scope === selectionScope ? [...current.keys] : [];
      const key = targetKey(option);
      const next = checked ? [...existing, key] : existing.filter((candidate) => candidate !== key);
      return { scope: selectionScope, keys: next };
    });
    setRecoveryState((current) => current?.scope === authorityScope
      ? { ...current, retryInvalidated: true } : current);
    setFeedback({ identityKey: currentIdentityKey, notice: '', error: '' });
  }

  function applyCommittedResult(result: Extract<Awaited<ReturnType<typeof purchaseEndeavourFieldTargets>>, { status: 'committed' | 'replayed' }>): void {
    const nextPurchaseState: EndeavourFieldUpgradePurchaseState = {
      ...activePurchaseState!,
      upgradeRevision: result.upgradeRevision,
      targetsUsedThisCycle: activePurchaseState!.targetsUsedThisCycle + result.appliedTargets.length,
    };
    setLocalPurchaseState({ scope: purchaseScope, value: nextPurchaseState });
    setSelection(null);
    setRecoveryState(null);
    setUncertainState(null);
    setRetryRefreshRequirement(null);
    setFeedback({
      identityKey: currentIdentityKey,
      notice: `Installed ${result.appliedTargets.length} console${result.appliedTargets.length === 1 ? '' : 's'} for this cycle.`,
      error: '',
    });
    void Promise.resolve(onRefresh?.()).catch(() => undefined);
  }

  async function submit(mode: 'purchase' | 'stale-retry' | 'uncertain-retry' = 'purchase'): Promise<void> {
    if (busy) return;
    if (mode === 'uncertain-retry') {
      if (!uncertain) return;
    } else if (!activePurchaseState || !aligned || !liveCoordinationWindow ||
        selectedTargets.length === 0 || selectedTargets.length > remaining || uncertain ||
        retryRefreshRequired || (recovery && !recoveryReady) ||
        (mode === 'stale-retry' && !canRetryStaleSelection)) return;
    setBusy(true);
    setFeedback({ identityKey: currentIdentityKey, notice: '', error: '' });
    try {
      const result = mode === 'uncertain-retry'
        ? await retryUncertainEndeavourFieldUpgrade(uncertain!.retryToken)
        : await purchaseEndeavourFieldTargets({
          workspace, purchaseState: activePurchaseState!, targets: selectedTargets,
        });
      if (!isCurrentScientistAuthority(authorityScope!)) return;
      if (result.status === 'stale') {
        setRecoveryState({ scope: authorityScope!, stale: result, retryInvalidated: false });
        setUncertainState(null);
        setRetryRefreshRequirement(null);
        setFeedback({ identityKey: currentIdentityKey, notice: '', error: '' });
        void Promise.resolve(onRefresh?.()).catch(() => undefined);
      } else if (mode === 'uncertain-retry' || result.status === 'replayed') {
        setSelection(null);
        setRecoveryState(null);
        setUncertainState(null);
        setRetryRefreshRequirement(null);
        setFeedback({
          identityKey: currentIdentityKey,
          notice: 'The earlier upgrade request was confirmed. Refresh the Scientist workspace for current purchase state.',
          error: '',
        });
        void Promise.resolve(onRefresh?.()).catch(() => undefined);
      } else {
        applyCommittedResult(result);
      }
    } catch (cause) {
      if (isCurrentScientistAuthority(authorityScope!)) {
        if (cause instanceof EndeavourFieldUpgradeUncertainError) {
          setUncertainState({ scope: authorityScope!, retryToken: cause.retryToken });
          setFeedback({
            identityKey: currentIdentityKey, notice: '',
            error: 'The request could not be confirmed. Retry that exact request before starting another purchase.',
          });
          void Promise.resolve(onRefresh?.()).catch(() => undefined);
          return;
        }
        if (mode === 'uncertain-retry') {
          setUncertainState(null);
          setRetryRefreshRequirement({ scope: authorityScope!, workspace, freshWorkspace: null });
          setFeedback({
            identityKey: currentIdentityKey, notice: '',
            error: `The exact request was rejected. ${errorMessage(cause)} Refresh the Scientist workspace before starting a new purchase.`,
          });
          return;
        }
        setFeedback({ identityKey: currentIdentityKey, notice: '', error: errorMessage(cause) });
        void Promise.resolve(onRefresh?.()).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  const purchaseDisabled = !aligned || !liveCoordinationWindow || remaining === 0 ||
    selectedTargets.length === 0 || selectedTargets.length > remaining || busy || Boolean(uncertain) ||
    retryRefreshRequired ||
    Boolean(recovery && !recoveryReady);
  const purchaseLabel = recovery && recoveryReady
    ? 'Purchase selected upgrades with current state'
    : 'Purchase selected upgrades';

  return (
    <section className="console-workspace__section endeavour-field-upgrade-panel"
      aria-label="Endeavour field-upgrade purchase controls" aria-busy={busy}>
      <div className="console-workspace__status">
        <p>Private Scientist workspace // Endeavour field upgrades</p>
        <p>Cycle purchases: {used} of {limit} consoles used. Choose up to {remaining} more.</p>
        {!purchaseState && <p role="alert">Field-upgrade purchase state is not available. Refresh the Scientist workspace.</p>}
        {purchaseState && !aligned && <p role="alert">Research pricing changed. Refresh the Scientist workspace.</p>}
        {!liveCoordinationWindow && aligned &&
          <p>Purchases are available during the live Coordination window.</p>}
        {remaining === 0 && aligned && <p>No Endeavour target-console purchases remain this cycle.</p>}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
        {recovery && !recoveryReady &&
          <p role="status">Waiting for the live purchase projection before retrying these upgrades.</p>}
        {uncertain && <p role="status">An earlier request may have completed. Confirm it by retrying the exact request.</p>}
        {retryRefreshRequired && <p role="status">Refresh current Scientist purchase state before starting another request.</p>}
      </div>
      {retryRefreshRequired && <button type="button" className="cic-text-button"
        disabled={busy || !onRefresh} onClick={() => {
          if (!onRefresh || busy) return;
          const requirement = retryRefreshRequirement;
          setBusy(true);
          void Promise.resolve(onRefresh()).then((freshWorkspace) => {
            if (freshWorkspace && requirement && isCurrentScientistAuthority(authorityScope!)) {
              setRetryRefreshRequirement((current) => current?.scope === requirement.scope &&
                current.workspace === requirement.workspace
                ? { ...current, freshWorkspace }
                : current);
            }
          }).catch((cause: unknown) => {
            if (isCurrentScientistAuthority(authorityScope!)) {
              setFeedback({ identityKey: currentIdentityKey, notice: '', error: errorMessage(cause) });
            }
          }).finally(() => setBusy(false));
        }}>
        Refresh Scientist workspace
      </button>}
      {!aligned && purchaseState && <button type="button" className="cic-text-button"
        disabled={busy} onClick={() => void onRefresh?.()}>
        Refresh private research and purchase state
      </button>}
      {aligned && options.length === 0 && <p>Current fleet-group upgrade targets are not available.</p>}
      <EndeavourFieldUpgradeChoices
        options={options}
        selectedKeys={selectedKeys}
        remaining={remaining}
        showTargets={aligned}
        selectionDisabled={!liveCoordinationWindow || busy || remaining === 0 || Boolean(uncertain) || retryRefreshRequired}
        purchaseDisabled={purchaseDisabled}
        busy={busy}
        staleSelectionPending={staleSelectionPending}
        uncertain={Boolean(uncertain)}
        purchaseLabel={purchaseLabel}
        refreshDisabled={!onRefresh}
        onTargetChange={changeSelection}
        onPurchase={() => void submit()}
        onRetryStale={() => void submit('stale-retry')}
        onRetryExact={() => void submit('uncertain-retry')}
        onRefresh={() => void onRefresh?.()}
      />
    </section>
  );
}
