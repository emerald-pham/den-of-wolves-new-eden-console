import { useEffect, useMemo, useState } from 'react';
import { subscribeConnectedPlayers } from '@/lib/firestore';
import { transferShuttleControl } from '@/lib/shuttleControlService';
import { useSessionStore } from '@/store/useSessionStore';
import type { Player, ShuttleControlEntry } from '@/types/game';

interface Props {
  readonly control: ShuttleControlEntry;
}

export default function ShuttleControl({ control }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const me = useSessionStore((state) => state.me)!;
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [targetUid, setTargetUid] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const canTransfer = me.role === 'gm' || me.uid === control.ownerUid;

  useEffect(() => subscribeConnectedPlayers(session.id, setPlayers), [session.id, me.fleetGroupId]);
  const holder = players.find((player) => player.uid === control.holderUid);
  const targets = useMemo(() => players.filter((player) =>
    player.role === 'player' && player.uid !== control.holderUid), [control.holderUid, players]);

  async function submit(action: 'handoff' | 'reclaim'): Promise<void> {
    if (pending) return;
    setPending(true);
    setStatus('');
    try {
      await transferShuttleControl(
        control.shuttleId,
        action,
        control.revision,
        action === 'handoff' ? targetUid : undefined,
      );
      setStatus(action === 'reclaim' ? 'Shuttle control reclaimed.' : 'Shuttle control handed off.');
      setTargetUid('');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Shuttle control transfer failed.');
    } finally {
      setPending(false);
    }
  }

  return <section className="console-workspace__section shuttle-control" aria-label="Shuttle control">
    <p className="console-workspace__eyebrow">Custody // server authorised</p>
    <h3>Shuttle control</h3>
    <p>Current holder // {holder?.displayName ?? (control.holderUid === me.uid ? me.displayName : 'Connected player')}</p>
    {canTransfer && <>
      <label htmlFor={`shuttle-recipient-${control.shuttleId}`}>Hand off to</label>
      <select id={`shuttle-recipient-${control.shuttleId}`} value={targetUid}
        disabled={pending} onChange={(event) => setTargetUid(event.target.value)}>
        <option value="">Choose connected player</option>
        {targets.map((player) => <option value={player.uid} key={player.uid}>{player.displayName}</option>)}
      </select>
      <div className="console-workspace__actions">
        <button type="button" disabled={pending || !targetUid}
          onClick={() => void submit('handoff')}>Hand off control</button>
        {control.holderUid !== control.ownerUid && <button type="button" disabled={pending}
          onClick={() => void submit('reclaim')}>Reclaim control</button>}
      </div>
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}
