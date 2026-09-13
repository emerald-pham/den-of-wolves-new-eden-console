import { useEffect, useMemo, useState } from 'react';
import { applyCommissarPurge, consentCommissarPurge, refreshCommissarPurgeAuthority } from '@/lib/sessionService';
import { findShip } from '@/data/ships';
import { useSessionStore } from '@/store/useSessionStore';

function captainRoleForShip(shipId: string): string {
  return shipId === 'aegis' ? 'admiral' : `${shipId}-captain`;
}

/**
 * Shared captain-consent and Commissar action surface. The captain sees only
 * their own ship's consent control; the replacement sees the current active
 * fleet targets and the server-owned consent state.
 */
export default function CommissarPurgePanel({ shipId }: { readonly shipId: string }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const authority = useSessionStore((state) => state.commissarPurgeAuthority);
  const [targetShipId, setTargetShipId] = useState(shipId);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const captain = Boolean(
    me && me.replacementRoleId == null && me.activeConsoleRoleId === captainRoleForShip(shipId),
  );
  const commissar = me?.replacementRoleId === 'commissar';
  const sessionId = session?.id;
  const uid = me?.uid;
  const canRefreshAuthority = Boolean(sessionId && uid && (captain || commissar));
  useEffect(() => {
    useSessionStore.getState().setCommissarPurgeAuthority(null);
    if (!canRefreshAuthority) return;
    void refreshCommissarPurgeAuthority()
      .then((next) => {
        if (next) useSessionStore.getState().setCommissarPurgeAuthority(next);
      })
      .catch(() => undefined);
  }, [sessionId, uid, me?.activeConsoleRoleId, me?.replacementRoleId, canRefreshAuthority]);
  const activeShips = useMemo(() => (session?.activeVesselIds ?? [])
    .filter((candidate) => findShip(candidate) !== undefined), [session?.activeVesselIds]);
  const target = commissar ? targetShipId : shipId;
  const targetName = findShip(target)?.name ?? target;
  const currentTurn = session?.currentTurn ?? 0;
  const revision = session?.vesselActionRevisions?.[target] ?? 0;
  const consent = authority?.role === 'commissar' ? authority.consents?.[target] : undefined;
  const consented = captain
    ? authority?.role === 'captain' && authority.shipId === shipId && authority.consented === true &&
      authority.consentTurn === currentTurn && authority.consentVesselRevision === revision
    : Boolean(consent && consent.turn === currentTurn && consent.vesselRevision === revision);
  const usedThisTurn = authority?.role === 'commissar'
    ? authority.ledger?.[target]?.turn === currentTurn
    : authority?.role === 'captain' && authority.shipId === shipId && authority.usedThisTurn === true;
  const gameplayFrozen = ['debrief', 'success', 'failure', 'closed'].includes(session?.phase ?? '');

  if (!session || !me || (!captain && !commissar)) return null;

  async function consentToPurge(): Promise<void> {
    if (pending || gameplayFrozen || currentTurn < 1 || consented || usedThisTurn) return;
    setPending(true);
    setMessage(null);
    try {
      await consentCommissarPurge(target);
      setMessage(`Captain consent recorded for ${targetName}.`);
    } catch {
      setMessage('Consent was not recorded. Refresh the live ship state and try again.');
    } finally {
      setPending(false);
    }
  }

  async function purge(): Promise<void> {
    if (pending || gameplayFrozen || currentTurn < 1 || !consented || usedThisTurn) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await applyCommissarPurge(target);
      setMessage(
        `Purge resolved on ${targetName}: ${result.survivorsRemoved ?? 0} survivors removed; unrest reduced by ${result.unrestReduced ?? 1}.`,
      );
    } catch {
      setMessage('Purge was not resolved. Refresh the live ship state and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="commissar-purge cic-frame" aria-label="Commissar purge">
      <p className="commissar-purge__eyebrow">Commissar // survivor purge</p>
      <h2>{captain ? `Captain consent // ${targetName}` : 'Captain consent required'}</h2>
      <p className="commissar-purge__guidance">
        The Commissar removes one printed survivor-track step, then reduces unrest by 1. Each ship can use this once per turn.
      </p>
      {commissar && (
        <label className="commissar-purge__target">
          Target ship
          <select
            value={target}
            onChange={(event) => {
              setTargetShipId(event.target.value);
              setMessage(null);
            }}
            disabled={pending || activeShips.length === 0}
          >
            {activeShips.map((candidate) => (
              <option key={candidate} value={candidate}>{findShip(candidate)?.name ?? candidate}</option>
            ))}
          </select>
        </label>
      )}
      <p className="commissar-purge__status" role="status">
        {currentTurn < 1
          ? 'Awaiting Turn 1.'
          : usedThisTurn
            ? `${targetName} has already used its purge this turn.`
            : consented
              ? `Consent recorded for ${targetName} at vessel revision ${revision}.`
              : `Waiting for ${targetName} captain consent.`}
      </p>
      {captain ? (
        <button
          className="cic-action-button"
          type="button"
          disabled={pending || gameplayFrozen || currentTurn < 1 || consented || usedThisTurn}
          onClick={() => void consentToPurge()}
        >
          {pending ? 'Recording consent…' : consented ? 'Consent recorded' : 'Consent to Commissar purge'}
        </button>
      ) : (
        <button
          className="cic-action-button cic-action-button--confirm"
          type="button"
          disabled={pending || gameplayFrozen || currentTurn < 1 || !consented || usedThisTurn}
          onClick={() => void purge()}
        >
          {pending ? 'Resolving purge…' : 'Purge survivors and reduce unrest'}
        </button>
      )}
      {message && <p className="commissar-purge__message" role="status">{message}</p>}
    </section>
  );
}
