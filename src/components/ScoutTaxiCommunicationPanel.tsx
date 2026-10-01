import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { SHIPS } from '@/data/ships';
import { useSessionStore } from '@/store/useSessionStore';
import type { ShuttleControlEntry } from '@/types/game';
import { isScoutEntitlementHolder, isScoutingRequestPhaseAvailable } from '@/lib/scoutRequestAuthority';
import { createScoutTaxiCommunicationActions, type ScoutTaxiCommunicationContext } from '@/lib/scoutTaxiCommunicationService';
import './ScoutRequestControls.css';

interface Props { readonly shuttleId: 'starlight' | 'hummingbird'; readonly control: ShuttleControlEntry }
export default function ScoutTaxiCommunicationPanel({ shuttleId, control }: Props) {
  const session = useSessionStore(s => s.session);
  const me = useSessionStore(s => s.me);
  const connection = useSessionStore(s => s.connection);
  const freshness = useSessionStore(s => s.sessionSnapshotFreshness);
  const holder = isScoutEntitlementHolder(shuttleId, session, me) && control.shuttleId === shuttleId &&
    control.holderUid === me?.uid && control.ownerUid === me?.uid;
  const ready = holder && isScoutingRequestPhaseAvailable(session) && connection === 'live' && freshness === 'server' &&
    Number.isSafeInteger(session?.playerDiscovery?.revision);
  const context: ScoutTaxiCommunicationContext = { sessionId: session?.id ?? '', actorUid: me?.uid ?? '',
    groupId: me?.fleetGroupId ?? '', shuttleId, cycle: session?.currentTurn ?? -1,
    controlRevision: control.revision, navigationRevision: session?.playerDiscovery?.revision ?? -1, ready };
  const key = JSON.stringify(context);
  const currentContext = useRef(context); currentContext.current = context;
  const currentKey = useRef(key); currentKey.current = key;
  const audience = `${session?.id}/${me?.uid}/${me?.fleetGroupId}/${shuttleId}`;
  const actions = useMemo(() => createScoutTaxiCommunicationActions(() => currentContext.current), [audience]);
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);
  useEffect(() => { setText(''); setTarget(''); setNotice(null); setBusyKey(null); }, [audience]);
  if (!holder) return null;
  const label = shuttleId === 'starlight' ? 'Starlight' : 'Hummingbird';
  const busy = busyKey === key;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!ready || busy || !target || !text.trim()) return;
    setBusyKey(key); setNotice(null);
    try {
      await actions.send(target, text);
      if (currentKey.current !== key) return;
      setText(''); setNotice({ key, text: 'Courier round trip completed. Your note was delivered; your station and group are unchanged.' });
    } catch (error) {
      if (currentKey.current === key) setNotice({ key, text: error instanceof Error ? error.message : 'Courier trip was rejected. Refresh before retrying.' });
    } finally { if (currentKey.current === key) setBusyKey(null); }
  };
  return <section className="scout-request" aria-label={`${label} scout taxi courier`}>
    <h3>Scout taxi courier</h3>
    <p>Spend one scouting attempt on a round trip to deliver a note to a separated fleet group. The operator returns; no passengers or cargo change ships.</p>
    <p>{label === 'Starlight' ? 'Within two jumps of AEGIS.' : 'Within three jumps of Quellon.'} Your shuttle must be at its home ship while airspace is open.</p>
    <form className="scout-request__form" onSubmit={event => void submit(event)}>
      <label className="scout-request__field">Courier destination ship<select value={target} disabled={busy} onChange={event => setTarget(event.target.value)}>
        <option value="">Choose a ship</option>{SHIPS.filter(ship => session?.activeVesselIds?.includes(ship.id) &&
          ship.id !== (shuttleId === 'starlight' ? 'aegis' : 'quellon')).map(ship => <option key={ship.id} value={ship.id}>{ship.name}</option>)}
      </select></label>
      <label className="scout-request__field">Courier note<textarea maxLength={200} value={text} disabled={busy} onChange={event => setText(event.target.value)} /></label>
      <button className="scout-request__submit" type="submit" disabled={!ready || busy || !target || !text.trim()}>Send scout taxi courier</button>
    </form>
    {!ready && <p>Wait for current live authority and open airspace.</p>}
    {notice?.key === key && <p role="status">{notice.text}</p>}
  </section>;
}
