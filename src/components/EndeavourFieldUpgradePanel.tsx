import { useEffect, useMemo, useState } from 'react';
import type { EndeavourResearchWorkspace } from '@/lib/endeavourResearchService';
import {
  availableEndeavourFieldUpgradeOptions,
  purchaseEndeavourFieldTargets,
  type EndeavourFieldUpgradePurchaseState,
  type EndeavourFieldUpgradeTarget,
} from '@/lib/endeavourFieldUpgradeService';
import type { ShuttleControlEntry } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import './EndeavourFieldUpgradePanel.css';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly workspace: EndeavourResearchWorkspace;
  readonly purchaseState: EndeavourFieldUpgradePurchaseState | null;
  readonly onRefresh?: (() => void | Promise<void>) | undefined;
}

function isCurrentScientistHolder(expectedSessionId: string, expectedUid: string): boolean {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.endeavour;
  return session?.id === expectedSessionId && session.phase === 'active' &&
    me?.sessionId === expectedSessionId && me.uid === expectedUid && me.role === 'player' &&
    me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') === true &&
    control?.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' &&
    control.holderUid === expectedUid;
}

function hasLiveCoordinationWindow(
  session: ReturnType<typeof useSessionStore.getState>['session'],
  cycle: number,
): boolean {
  if (!session || session.phase !== 'active' || session.currentTurn !== cycle) return false;
  const phase = session.turnPhase;
  const endsAt = Date.parse(phase?.openAirspaceEndsAt ?? '');
  return Boolean(
    phase && phase.turn === cycle && phase.airspace.state === 'lifted' &&
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

interface LocalPurchaseState {
  readonly scope: string;
  readonly value: EndeavourFieldUpgradePurchaseState;
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
  const identityKey = sessionId && uid ? JSON.stringify([sessionId, uid]) : null;
  const entitled = Boolean(
    session?.phase === 'active' && me?.sessionId === session.id && me.role === 'player' &&
    me.activeConsoleRoleId === 'shepherd-scientist' &&
    session.activeRoleIds?.includes('shepherd-scientist') &&
    control.shuttleId === 'endeavour' && control.ownerRoleId === 'shepherd-scientist' &&
    control.holderUid === me.uid && session.shuttleControl?.endeavour?.holderUid === me.uid,
  );
  const purchaseScope = JSON.stringify([
    identityKey, me?.fleetGroupId, control.revision,
    workspace.sessionId, workspace.cycle, workspace.researchRevision,
  ]);
  const [localPurchaseState, setLocalPurchaseState] = useState<LocalPurchaseState | null>(null);
  const [selection, setSelection] = useState<Readonly<{ scope: string; keys: readonly string[] }> | null>(null);
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
  const selectionScope = JSON.stringify([
    purchaseScope, activePurchaseState?.upgradeRevision, activePurchaseState?.targetsUsedThisCycle,
  ]);
  const selectedKeys = selection?.scope === selectionScope ? selection.keys : [];
  const selectedTargets = selectedKeys.flatMap((key) => {
    const option = options.find((candidate) => targetKey(candidate) === key);
    return option ? [{ shipId: option.shipId, systemId: option.systemId }] : [];
  });
  const currentPanel = Boolean(
    entitled && identityKey && workspace.sessionId === sessionId &&
    control.holderUid === uid,
  );

  useEffect(() => {
    if (!currentPanel) {
      setSelection(null);
      setFeedback(null);
      return;
    }
    setFeedback((current) => current?.identityKey === identityKey ? current : null);
  }, [currentPanel, identityKey]);

  if (!currentPanel || !sessionId || !uid || !identityKey) return null;
  const currentSessionId = sessionId;
  const currentUid = uid;
  const currentIdentityKey = identityKey;

  function changeSelection(option: EndeavourFieldUpgradeTarget, checked: boolean): void {
    setSelection((current) => {
      const existing = current?.scope === selectionScope ? [...current.keys] : [];
      const key = targetKey(option);
      const next = checked ? [...existing, key] : existing.filter((candidate) => candidate !== key);
      return { scope: selectionScope, keys: next };
    });
    setFeedback({ identityKey: currentIdentityKey, notice: '', error: '' });
  }

  async function submit(): Promise<void> {
    if (!activePurchaseState || !aligned || !liveCoordinationWindow ||
        selectedTargets.length === 0 || selectedTargets.length > remaining || busy) return;
    setBusy(true);
    setFeedback({ identityKey: currentIdentityKey, notice: '', error: '' });
    try {
      const result = await purchaseEndeavourFieldTargets({
        workspace, purchaseState: activePurchaseState, targets: selectedTargets,
      });
      if (!isCurrentScientistHolder(currentSessionId, currentUid)) return;
      const nextPurchaseState: EndeavourFieldUpgradePurchaseState = {
        ...activePurchaseState,
        upgradeRevision: result.upgradeRevision,
        targetsUsedThisCycle: activePurchaseState.targetsUsedThisCycle + result.appliedTargets.length,
      };
      setLocalPurchaseState({ scope: purchaseScope, value: nextPurchaseState });
      setSelection(null);
      setFeedback({
        identityKey: currentIdentityKey,
        notice: `Installed ${result.appliedTargets.length} console${result.appliedTargets.length === 1 ? '' : 's'} for this cycle.`,
        error: '',
      });
      void Promise.resolve(onRefresh?.()).catch(() => undefined);
    } catch (cause) {
      if (isCurrentScientistHolder(currentSessionId, currentUid)) {
        setFeedback({ identityKey: currentIdentityKey, notice: '', error: errorMessage(cause) });
        void Promise.resolve(onRefresh?.()).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  const purchaseDisabled = !aligned || !liveCoordinationWindow || remaining === 0 ||
    selectedTargets.length === 0 || selectedTargets.length > remaining || busy;

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
      </div>
      {!aligned && purchaseState && <button type="button" className="cic-text-button"
        disabled={busy} onClick={() => void onRefresh?.()}>
        Refresh private research and purchase state
      </button>}
      {aligned && options.length === 0 && <p>Current fleet-group upgrade targets are not available.</p>}
      {aligned && options.length > 0 && <fieldset disabled={!liveCoordinationWindow || busy || remaining === 0}>
        <legend>Choose target consoles</legend>
        <ul aria-label="Available Endeavour field upgrades">
          {options.map((option) => {
            const key = targetKey(option);
            const checked = selectedKeys.includes(key);
            const full = !checked && selectedKeys.length >= remaining;
            const label = `${option.shipName} // ${option.systemName} // ${option.materialCost} materials`;
            return <li key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={full}
                  onChange={(event) => changeSelection(option, event.currentTarget.checked)}
                />
                <span>{label}</span>
              </label>
            </li>;
          })}
        </ul>
      </fieldset>}
      <div className="console-workspace__actions">
        <button type="button" className="cic-action-button" disabled={purchaseDisabled}
          onClick={() => void submit()}>
          {busy ? 'Installing upgrades…' : 'Purchase selected upgrades'}
        </button>
        <button type="button" className="cic-text-button" disabled={busy || !onRefresh}
          onClick={() => void onRefresh?.()}>
          Refresh private research and purchase state
        </button>
      </div>
    </section>
  );
}
