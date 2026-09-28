import { useState } from 'react';
import { resolveShipMutiny } from '@/lib/sessionService';
import { normalizeCommandError } from '@/lib/commandErrors';
import type { GameSession } from '@/types/game';

export interface MutinyCaptainCandidate {
  readonly uid: string;
  readonly displayName: string;
  readonly roleId: string;
}

export default function GmMutinyRecovery({
  shipId, shipName, unrest, mutiny, candidates, expectedRevision, writable,
}: {
  readonly shipId: string;
  readonly shipName: string;
  readonly unrest: number;
  readonly mutiny?: NonNullable<GameSession['shipMutinies']>[string] | undefined;
  readonly candidates: readonly MutinyCaptainCandidate[];
  readonly expectedRevision: number;
  readonly writable: boolean;
}) {
  const [newCaptainUid, setNewCaptainUid] = useState('');
  const [reduction, setReduction] = useState<1 | 2 | 3>(2);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const active = mutiny?.status === 'active' || (unrest >= 8 && mutiny?.status !== 'resolved');
  if (!active) return null;

  const submit = async () => {
    if (!writable || pending || !candidates.some(candidate => candidate.uid === newCaptainUid)) return;
    setPending(true); setMessage('');
    try {
      const result = await resolveShipMutiny(shipId, newCaptainUid, reduction, expectedRevision);
      setMessage(result.status === 'stale'
        ? 'The ship changed. Refresh before installing the new captain.'
        : 'Replacement captain installed. The crew can select their new stations.');
    } catch (cause) {
      setMessage(normalizeCommandError(cause).message);
    } finally { setPending(false); }
  };

  return <section className="gm-mutiny-recovery cic-frame" aria-label={`${shipName} mutiny recovery`}>
    <h4>{shipName} mutiny // new captain required</h4>
    <p>This ship cannot be used until a different officer takes command. Swap the current captain with one active officer aboard this ship, then choose the printed 1–3 unrest reduction. The default is 2.</p>
    <fieldset className="maintenance-controls" disabled={!writable || pending}>
      <legend>Install replacement captain</legend>
      <label>New captain
        <select aria-label="New captain" value={newCaptainUid}
          onChange={event => setNewCaptainUid(event.target.value)}>
          <option value="">Choose an officer</option>
          {candidates.map(candidate => <option key={candidate.uid} value={candidate.uid}>
            {candidate.displayName} // {candidate.roleId}
          </option>)}
        </select>
      </label>
      <label>Unrest reduction
        <select aria-label="Unrest reduction" value={reduction}
          onChange={event => setReduction(Number(event.target.value) as 1 | 2 | 3)}>
          <option value={1}>1 // close to old captain</option>
          <option value={2}>2 // default</option>
          <option value={3}>3 // confident improvement</option>
        </select>
      </label>
      <button className="cic-action-button" type="button"
        disabled={!writable || pending || !newCaptainUid || !candidates.some(candidate => candidate.uid === newCaptainUid)}
        onClick={() => void submit()}>{pending ? 'Installing…' : 'Install replacement captain'}</button>
    </fieldset>
    {!candidates.length && <p role="status">No active officer aboard this ship can exchange roles with the captain.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
