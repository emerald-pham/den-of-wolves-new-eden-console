import { useEffect, useMemo, useRef, useState } from 'react';
import { createCurrentFleetGroupActions, type FleetGroupNote } from '@/lib/fleetGroupService';
import { useSessionStore } from '@/store/useSessionStore';

const PDF_COLONEL_ROLE_ID = 'refinery-124-pdf-colonel';

export default function PdfNewsRelayPanel({ enabled }: Readonly<{ enabled: boolean }>) {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  const connection = useSessionStore(state => state.connection);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness);
  const isPdfColonel = me?.role === 'player' && me.activeConsoleRoleId === PDF_COLONEL_ROLE_ID &&
    (me.assignedRoleId === PDF_COLONEL_ROLE_ID || me.seatId === PDF_COLONEL_ROLE_ID) &&
    (!me.assignedRoleId || !me.seatId || me.assignedRoleId === me.seatId);
  const authorized = enabled && isPdfColonel && !!session && session.phase === 'active' &&
    me?.sessionId === session.id && !!me.fleetGroupId;
  const ready = authorized && connection === 'live' && freshness === 'server';
  const audience = `${session?.id ?? ''}/${me?.uid ?? ''}/${me?.fleetGroupId ?? ''}/${me?.activeConsoleRoleId ?? ''}`;
  const actions = useMemo(() => createCurrentFleetGroupActions(), [audience]);
  const activeAudience = useRef(audience);
  activeAudience.current = audience;
  const [loaded, setLoaded] = useState<{ audience: string; notes: readonly FleetGroupNote[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(''); }, [audience]);
  useEffect(() => {
    let current = true;
    setLoaded(null);
    setNotice('');
    setError('');
    setBusy(false);
    if (!ready) return () => { current = false; };
    void actions.read().then(reply => {
      if (current && activeAudience.current === audience && reply.groupId === me!.fleetGroupId) {
        setLoaded({ audience, notes: reply.messages });
      }
    }).catch(cause => {
      if (current && activeAudience.current === audience) {
        setError(cause instanceof Error ? cause.message : 'Current fleet news is unavailable.');
      }
    });
    return () => { current = false; };
  }, [actions, audience, me?.fleetGroupId, ready]);

  if (!authorized) return null;
  const notes = loaded?.audience === audience ? loaded.notes : [];

  const run = async (kind: 'send' | 'refresh') => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'send') {
        await actions.send(draft);
        if (activeAudience.current !== audience) return;
        setDraft('');
        setNotice('Message sent to your current fleet group.');
      }
      const reply = await actions.read();
      if (activeAudience.current !== audience || reply.groupId !== me!.fleetGroupId) return;
      setLoaded({ audience, notes: reply.messages });
    } catch (cause) {
      if (activeAudience.current !== audience) return;
      setError(cause instanceof Error ? cause.message : 'The current-group relay action failed.');
    } finally {
      if (activeAudience.current === audience) setBusy(false);
    }
  };

  return <section className="console-workspace__section pdf-news-relay" aria-label="PDF Colonel group news relay">
    <h3>Current fleet group relay</h3>
    <p>Read and relay messages only with active members of your current fleet group.</p>
    {!ready && <p role="status">Reconnect and refresh current PDF Colonel authority to use the group relay.</p>}
    {ready && <>
      <ul aria-label="Current fleet group messages">
        {notes.map(note => <li key={note.id}>
          <p>{note.text}</p>
          <small>{note.actorUid === me!.uid ? 'You' : 'Group participant'} // {new Date(note.sentAt).toLocaleTimeString()}</small>
        </li>)}
      </ul>
      <label htmlFor="pdf-colonel-group-message">Message to current fleet group</label>
      <textarea id="pdf-colonel-group-message" maxLength={240} value={draft} disabled={busy}
        onChange={event => setDraft(event.target.value)} />
      <div className="pdf-news-relay__actions">
        <button className="cic-action-button" type="button" disabled={busy || !draft.trim()}
          onClick={() => void run('send')}>{busy ? 'Sending group message…' : 'Relay message to current group'}</button>
        <button className="cic-action-button" type="button" disabled={busy}
          onClick={() => void run('refresh')}>Refresh current group messages</button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </>}
  </section>;
}
