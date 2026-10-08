import { useEffect, useId, useState } from 'react';
import {
  applyPermissionedDismantling,
  consentToPermissionedDismantling,
  declinePermissionedDismantling,
  proposePermissionedDismantling,
  revokePermissionedDismantlingConsent,
  subscribePermissionedDismantlingInbox,
  type DismantlingProposalCommand,
  type PermissionedDismantlingInbox,
} from '@/lib/permissionedDismantlingService';
import './PermissionedDismantlingPanel.css';

type CraftId = DismantlingProposalCommand['craftId'];
type Connection = 'live' | 'connecting' | 'offline';

type ProposerProps = {
  readonly mode: 'proposer';
  readonly sessionId: string;
  readonly currentPlayerUid: string;
  readonly craftId: CraftId;
  readonly targetShipId?: string;
  readonly targetSystems: readonly { readonly id: string; readonly name: string }[];
  readonly damagedSystemIds: readonly string[];
  readonly connection: Connection;
  readonly canAct: boolean;
};

type TargetProps = {
  readonly mode: 'target';
  readonly sessionId: string;
  readonly targetShipId: string;
  readonly connection?: Connection;
  readonly canAct?: boolean;
};

type Props = ProposerProps | TargetProps;

function actionId(): string {
  return globalThis.crypto.randomUUID();
}

function proposalStorageKey(sessionId: string, uid: string, craftId: CraftId): string {
  return `permissioned-dismantling:v1:${sessionId}:${uid}:${craftId}`;
}

function readStoredProposal(
  sessionId: string,
  uid: string,
  craftId: CraftId,
): DismantlingProposalCommand | null {
  try {
    const raw = sessionStorage.getItem(proposalStorageKey(sessionId, uid, craftId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 4 ||
        Object.keys(record).some((key) => !['proposalId', 'craftId', 'targetShipId', 'targetConsoleId'].includes(key)) ||
        record.craftId !== craftId || typeof record.proposalId !== 'string' ||
        typeof record.targetShipId !== 'string' || typeof record.targetConsoleId !== 'string') return null;
    return record as unknown as DismantlingProposalCommand;
  } catch {
    return null;
  }
}

function saveProposal(sessionId: string, uid: string, command: DismantlingProposalCommand): void {
  try {
    sessionStorage.setItem(proposalStorageKey(sessionId, uid, command.craftId), JSON.stringify(command));
  } catch {
    // The server's stable proposal ID remains authoritative if browser storage is unavailable.
  }
}

function clearStoredProposal(sessionId: string, uid: string, craftId: CraftId): void {
  try {
    sessionStorage.removeItem(proposalStorageKey(sessionId, uid, craftId));
  } catch {
    // Removing local retry state is best-effort; the server never trusts it for authority.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The dismantling request could not be completed.';
}

function connectionMessage(connection: Connection): string {
  if (connection === 'offline') return 'OFFLINE // reconnect before changing dismantling state.';
  if (connection === 'connecting') return 'CONNECTING // wait for a live facilitator connection.';
  return 'LIVE // server-verified player session.';
}

function useDismantlingInbox(
  sessionId: string,
  targetShipId: string | undefined,
  enabled: boolean,
) {
  const [inbox, setInbox] = useState<PermissionedDismantlingInbox | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInbox(null);
    setError(null);
    if (!enabled || !targetShipId) return undefined;
    try {
      return subscribePermissionedDismantlingInbox(sessionId, targetShipId, {
        onInbox: setInbox,
        onError: setError,
      });
    } catch (reason) {
      setInbox(null);
      setError(errorMessage(reason));
      return undefined;
    }
  }, [sessionId, targetShipId, enabled]);

  return { inbox, error };
}

function ProposerPanel(props: ProposerProps) {
  const id = useId();
  const [targetConsoleId, setTargetConsoleId] = useState('');
  const [command, setCommand] = useState<DismantlingProposalCommand | null>(() =>
    readStoredProposal(props.sessionId, props.currentPlayerUid, props.craftId));
  const [replyStatus, setReplyStatus] = useState<'idle' | 'pending' | 'stale' | 'submitted' | 'applied'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyRequestId, setApplyRequestId] = useState<string | null>(null);
  const targetShipId = command?.targetShipId ?? props.targetShipId;
  const subscriptionEnabled = Boolean(command && targetShipId && props.connection === 'live' && props.canAct);
  const { inbox: latestInbox, error: inboxError } = useDismantlingInbox(
    props.sessionId, targetShipId, subscriptionEnabled,
  );
  const inbox = latestInbox?.proposalId === command?.proposalId ? latestInbox : null;
  const damaged = new Set(props.damagedSystemIds);
  const eligibleSystems = props.targetSystems.filter((system) => !damaged.has(system.id));
  const disabled = !props.canAct || props.connection !== 'live' || !targetShipId || eligibleSystems.length === 0 || busy;

  async function submitProposal(): Promise<void> {
    if (disabled) return;
    const selectedCommand = command ?? {
      proposalId: actionId(),
      craftId: props.craftId,
      targetShipId: targetShipId!,
      targetConsoleId,
    };
    if (!selectedCommand.targetConsoleId || !eligibleSystems.some((system) => system.id === selectedCommand.targetConsoleId)) {
      setFeedback('Choose one undamaged target console before requesting permission.');
      return;
    }
    setCommand(selectedCommand);
    saveProposal(props.sessionId, props.currentPlayerUid, selectedCommand);
    setFeedback(null);
    setBusy(true);
    try {
      const result = await proposePermissionedDismantling(selectedCommand);
      if (result.status === 'stale') {
        setReplyStatus('stale');
        setFeedback('The current shuttle control changed. Refresh before making a new request.');
      } else {
        setReplyStatus('submitted');
        setFeedback(`Request sent at target revision ${result.targetRevision}; waiting for the ${selectedCommand.targetShipId} player.`);
      }
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyConsent(): Promise<void> {
    if (!inbox || inbox.status !== 'consented' || !props.canAct || busy) return;
    const requestId = applyRequestId ?? actionId();
    setApplyRequestId(requestId);
    setBusy(true);
    setFeedback(null);
    try {
      const result = await applyPermissionedDismantling({ inbox, requestId });
      setReplyStatus('applied');
      setFeedback(`Applied // ${result.targetConsoleId} damaged // ${result.materialGain} materials // target now has ${result.materialsAfter}.`);
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function resetProposal(): void {
    clearStoredProposal(props.sessionId, props.currentPlayerUid, props.craftId);
    setCommand(null);
    setReplyStatus('idle');
    setApplyRequestId(null);
    setFeedback(null);
    setTargetConsoleId('');
  }

  return (
    <section className="permissioned-dismantling cic-frame" aria-label="Permissioned dismantling proposal">
      <p className="permissioned-dismantling__eyebrow">ENGINEERING CRAFT // EXACT TARGET CONSENT</p>
      <h3>Permissioned dismantling</h3>
      <p className="permissioned-dismantling__rule">
        Damage one undamaged console on this docked ship for 3 materials only after its player approves this exact request.
      </p>
      <p className="permissioned-dismantling__connection" role="status">{connectionMessage(props.connection)}</p>
      {!targetShipId ? <p>No target ship is docked. Dock this craft before requesting permission.</p> : <>
        <label className="permissioned-dismantling__field">
          Undamaged target console
          <select value={command?.targetConsoleId ?? targetConsoleId}
            onChange={(event) => setTargetConsoleId(event.target.value)}
            disabled={Boolean(command) || disabled}>
            <option value="">Choose a console</option>
            {props.targetSystems.map((system) => (
              <option key={system.id} value={system.id} disabled={damaged.has(system.id)}>
                {system.name}{damaged.has(system.id) ? ' // already damaged' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="permissioned-dismantling__guidance" id={`${id}-proposal-help`}>The target-ship player acts next: they grant or decline permission. Sending a request does not damage the console or add materials.</p>
        <div className="permissioned-dismantling__actions">
          {(!inbox || inbox.status === 'pending') ? (
            <button className="cic-action-button" type="button" aria-describedby={`${id}-proposal-help`} onClick={() => void submitProposal()}
              disabled={disabled || (!command && !targetConsoleId)}>
              {busy ? 'Sending permission request…' : command ? 'Retry the same permission request' : 'Request target-player permission'}
            </button>
          ) : null}
          {inbox?.status === 'consented' && (
            <button className="cic-action-button" type="button" onClick={() => void applyConsent()}
              disabled={!props.canAct || busy}>
              {busy ? 'Applying approved dismantling…' : 'Apply consented dismantling'}
            </button>
          )}
          {(replyStatus === 'stale' || inbox?.status === 'applied' || inbox?.status === 'declined' || inbox?.status === 'revoked') && (
            <button className="cic-text-button" type="button" onClick={resetProposal} disabled={busy}>
              {inbox?.status === 'revoked' || inbox?.status === 'declined' ? 'Start a new permission request' : 'Start another request'}
            </button>
          )}
        </div>
        {inbox?.status === 'pending' && <p className="permissioned-dismantling__status" role="status">
          Awaiting the {targetShipId} player’s approval for {inbox.targetConsoleId} // target revision {inbox.targetRevision}.
        </p>}
        {inbox?.status === 'consented' && <p className="permissioned-dismantling__status" role="status">
          Consent received from the target ship // apply this exact request to finish it.
        </p>}
        {inbox?.status === 'revoked' && <p className="permissioned-dismantling__status" role="alert">
          The target player revoked consent. The damage and resource stores are unchanged.
        </p>}
        {inbox?.status === 'declined' && <p className="permissioned-dismantling__status" role="alert">
          The target player declined this request. The damage and resource stores are unchanged.
        </p>}
        {inbox?.status === 'applied' && <p className="permissioned-dismantling__status" role="status">
          Applied // {inbox.targetConsoleId} damaged // {inbox.materialGain} materials // target balance {inbox.materialsAfter}.
        </p>}
      </>}
      {feedback && <p className="permissioned-dismantling__feedback" role={replyStatus === 'stale' ? 'alert' : 'status'}>{feedback}</p>}
      {(inboxError || (!props.canAct && props.connection === 'live')) && (
        <p className="permissioned-dismantling__guidance" role="status">
          {inboxError ?? 'A live facilitator connection and current shuttle authority are required.'}
        </p>
      )}
      {replyStatus === 'submitted' && !inbox && <p className="permissioned-dismantling__status" role="status">
        Request recorded // waiting for the target-ship decision.
      </p>}
    </section>
  );
}

function TargetPanel(props: TargetProps) {
  const id = useId();
  const connection = props.connection ?? 'live';
  const canAct = props.canAct ?? true;
  const { inbox, error } = useDismantlingInbox(
    props.sessionId, props.targetShipId, canAct && connection === 'live',
  );
  const [consentId, setConsentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setConsentId(null);
    setFeedback(null);
  }, [inbox?.proposalId]);

  async function grantConsent(): Promise<void> {
    if (!inbox || inbox.status !== 'pending' || !canAct || busy) return;
    const stableConsentId = consentId ?? actionId();
    setConsentId(stableConsentId);
    setBusy(true);
    setFeedback(null);
    try {
      await consentToPermissionedDismantling({ inbox, consentId: stableConsentId });
      setFeedback('Consent recorded // the original proposer may apply this exact request.');
    } catch (reason) {
      setFeedback(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function declineRequest(): Promise<void> {
    if (!inbox || inbox.status !== 'pending' || !canAct || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await declinePermissionedDismantling({ inbox });
      // The server-verified inbox projection confirms the terminal decision.
    } catch (reason) {
      setFeedback(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function revokeConsent(): Promise<void> {
    if (!inbox || inbox.status !== 'consented' || !canAct || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await revokePermissionedDismantlingConsent({ inbox });
      setFeedback('Consent revoked // this request can no longer damage the target console.');
    } catch (reason) {
      setFeedback(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="permissioned-dismantling permissioned-dismantling--target cic-frame"
      aria-label="Permissioned dismantling request">
      <p className="permissioned-dismantling__eyebrow">TARGET SHIP // ENGINEERING CONSENT</p>
      <h3>Permissioned dismantling request</h3>
      <p className="permissioned-dismantling__connection" role="status">{connectionMessage(connection)}</p>
      {inbox?.status === 'pending' ? <>
        <p className="permissioned-dismantling__request">
          {inbox.craftId} // {inbox.targetConsoleId} // +{inbox.materialGain} materials // target revision {inbox.targetRevision}
        </p>
        <p>Only this target-ship player can approve or decline. The proposal applies only to the console and current state shown above.</p>
        <p className="permissioned-dismantling__guidance" id={`${id}-consent-help`}>Granting permission does not damage the console yet. The craft holder acts next: applying permission damages the selected console and adds 3 materials to this ship.</p>
        <p className="permissioned-dismantling__guidance" id={`${id}-decline-help`}>Declining ends this request. The craft holder must send a new proposal to ask again.</p>
        <button className="cic-action-button" type="button" aria-describedby={`${id}-consent-help`} onClick={() => void grantConsent()}
          disabled={!canAct || busy || Boolean(consentId && feedback?.startsWith('Consent recorded'))}>
          {busy ? 'Recording consent…' : consentId ? 'Retry this consent decision' : 'Grant permission'}
        </button>
        <button className="cic-text-button" type="button" aria-describedby={`${id}-decline-help`} onClick={() => void declineRequest()}
          disabled={!canAct || busy}>
          {busy ? 'Declining request…' : 'Decline request'}
        </button>
      </> : null}
      {inbox?.status === 'consented' && <>
        <p className="permissioned-dismantling__status" role="status">Consent recorded // waiting for the engineering-craft holder to apply.</p>
        <button className="cic-text-button" type="button" onClick={() => void revokeConsent()} disabled={!canAct || busy}>
          {busy ? 'Revoking consent…' : 'Revoke consent'}
        </button>
      </>}
      {inbox?.status === 'revoked' && <p className="permissioned-dismantling__status" role="alert">
        The previous consent was revoked. The craft holder must submit a new request.
      </p>}
      {inbox?.status === 'declined' && <p className="permissioned-dismantling__status" role="alert">
        Request declined // the craft holder must submit a new request.
      </p>}
      {inbox?.status === 'applied' && <p className="permissioned-dismantling__status" role="status">
        Applied // {inbox.targetConsoleId} damaged // {inbox.materialGain} materials added to the ship.
      </p>}
      {!inbox && !error && canAct && connection === 'live' && (
        <p className="permissioned-dismantling__status" role="status">No permissioned dismantling request is pending for this ship.</p>
      )}
      {(!canAct || connection !== 'live') && <p className="permissioned-dismantling__guidance" role="status">
        A live facilitator connection and current target-ship player authority are required to read or decide.
      </p>}
      {(error || feedback) && <p className="permissioned-dismantling__feedback" role={error ? 'alert' : 'status'}>{error ?? feedback}</p>}
    </section>
  );
}

export default function PermissionedDismantlingPanel(props: Props) {
  return props.mode === 'proposer'
    ? <ProposerPanel {...props} />
    : <TargetPanel {...props} />;
}
