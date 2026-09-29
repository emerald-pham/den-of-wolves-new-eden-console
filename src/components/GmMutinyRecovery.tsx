import { useState } from 'react';
import { resolveShipMutiny } from '@/lib/sessionService';
import { normalizeCommandError } from '@/lib/commandErrors';
import type { GameSession } from '@/types/game';

export interface MutinyCaptainCandidate {
  readonly uid: string;
  readonly displayName: string;
  readonly roleId: string;
  readonly eligibilityRevision?: number;
}

export type MutinyRecoveryMode = 'captain-swap' | 'replacement-transfer' | 'crew-attestation';

export default function GmMutinyRecovery({
  shipId, shipName, unrest, mutiny, candidates, expectedRevision, writable,
  mode = 'captain-swap', currentCaptain,
}: {
  readonly shipId: string;
  readonly shipName: string;
  readonly unrest: number;
  readonly mutiny?: NonNullable<GameSession['shipMutinies']>[string] | undefined;
  readonly candidates: readonly MutinyCaptainCandidate[];
  readonly mode?: MutinyRecoveryMode;
  readonly currentCaptain?: MutinyCaptainCandidate;
  readonly expectedRevision: number;
  readonly writable: boolean;
}) {
  const [newCaptainUid, setNewCaptainUid] = useState('');
  const [reduction, setReduction] = useState<1 | 2 | 3>(2);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const active = mutiny?.status === 'active' || (unrest >= 8 && mutiny?.status !== 'resolved');
  if (!active) return null;
  const crewAttestation = mode === 'crew-attestation';

  const submit = async () => {
    const selectedCandidate = candidates.find(candidate => candidate.uid === newCaptainUid);
    if (!writable || pending ||
        (!crewAttestation && !selectedCandidate) ||
        (mode === 'replacement-transfer' &&
          (!selectedCandidate || !Number.isSafeInteger(selectedCandidate.eligibilityRevision) ||
            Number(selectedCandidate.eligibilityRevision) < 1))) return;
    setPending(true); setMessage('');
    try {
      const result = mode === 'captain-swap'
        ? await resolveShipMutiny(shipId, newCaptainUid, reduction, expectedRevision)
        : mode === 'replacement-transfer'
          ? await resolveShipMutiny(
            shipId, newCaptainUid, reduction, expectedRevision, mode,
            selectedCandidate?.eligibilityRevision,
          )
          : await resolveShipMutiny(shipId, null, reduction, expectedRevision, mode);
      setMessage(result.status === 'stale'
        ? 'The ship changed. Refresh before installing the new captain.'
        : crewAttestation
          ? 'Crew captain replacement recorded. Voyage 33-0 is usable again.'
          : 'Replacement captain installed. The former captain is waiting for a new role.');
    } catch (cause) {
      setMessage(normalizeCommandError(cause).message);
    } finally { setPending(false); }
  };

  return <section className="gm-mutiny-recovery cic-frame" aria-label={`${shipName} mutiny recovery`}>
    <h4>{shipName} mutiny // new captain required</h4>
    {mode === 'replacement-transfer' && currentCaptain && (
      <p>Current captain // {currentCaptain.displayName} // {currentCaptain.roleId}</p>
    )}
    <p>{crewAttestation
      ? 'Confirm that the crew has installed a new in-world captain, then choose the printed 1–3 unrest reduction. This attestation does not create a player identity or grant a player role.'
      : mode === 'replacement-transfer'
        ? 'Select a different active player, then choose the printed 1–3 unrest reduction. The server requires current replacement eligibility, transfers this craft’s Captain role, and leaves the former captain waiting for a new role.'
        : 'This ship cannot be used until a different officer takes command. Select an active officer aboard this ship, then choose the printed 1–3 unrest reduction. If the captain station is occupied, their roles exchange; a sparse roster appoints the officer as acting captain. The default reduction is 2.'}</p>
    <fieldset className="maintenance-controls" disabled={!writable || pending}>
      <legend>{crewAttestation ? 'Confirm crew captain replacement' : 'Install replacement captain'}</legend>
      {!crewAttestation && <label>New captain
          <select aria-label="New captain" value={newCaptainUid}
            onChange={event => setNewCaptainUid(event.target.value)}>
            <option value="">Choose an officer</option>
            {candidates.map(candidate => <option key={candidate.uid} value={candidate.uid}>
              {candidate.displayName} // {candidate.roleId}
            </option>)}
          </select>
        </label>}
      <label>Unrest reduction
        <select aria-label="Unrest reduction" value={reduction}
          onChange={event => setReduction(Number(event.target.value) as 1 | 2 | 3)}>
          <option value={1}>1 // close to old captain</option>
          <option value={2}>2 // default</option>
          <option value={3}>3 // confident improvement</option>
        </select>
      </label>
      <button className="cic-action-button" type="button"
        disabled={!writable || pending || (!crewAttestation &&
          (!newCaptainUid || !candidates.some(candidate => candidate.uid === newCaptainUid)))}
        onClick={() => void submit()}>{pending
          ? 'Installing…'
          : crewAttestation ? 'Confirm crew captain replacement' : 'Install replacement captain'}</button>
    </fieldset>
    {!crewAttestation && !candidates.length && (
      <p role="status">No eligible officer aboard this ship is available to take command.</p>
    )}
    {message && <p role="status">{message}</p>}
  </section>;
}
