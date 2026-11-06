import { useEffect, useRef, useState } from 'react';
import { createCurrentFleetGroupActions } from '@/lib/fleetGroupService';
import {
  pdfNewsRelayDraftKey,
  readPdfNewsRelayDraft as readDraft,
  writePdfNewsRelayDraft as writeDraft,
} from '@/lib/pdfNewsRelayDraft';
import { useSessionStore } from '@/store/useSessionStore';
import './PdfNewsRelayPanel.css';

const PDF_COLONEL_ROLE_ID = 'refinery-124-pdf-colonel';
const MAX_RELAY_LENGTH = 240;

/** The P.D.F. Colonel relays news to the current fleet group; a Press hand-off is a separate explicit choice. */
export default function PdfNewsRelayPanel({ enabled }: Readonly<{ enabled: boolean }>) {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  const connection = useSessionStore(state => state.connection);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness);
  const isPdfColonel = me?.role === 'player' && me.activeConsoleRoleId === PDF_COLONEL_ROLE_ID &&
    (me.assignedRoleId === PDF_COLONEL_ROLE_ID || me.seatId === PDF_COLONEL_ROLE_ID) &&
    (!me.assignedRoleId || !me.seatId || me.assignedRoleId === me.seatId);
  const groupId = me?.fleetGroupId ?? '';
  const authorized = enabled && isPdfColonel && !!session && session.phase === 'active' &&
    me?.sessionId === session.id && /^fleet-[1-9][0-9]*$/.test(groupId);
  const ready = authorized && connection === 'live' && freshness === 'server';
  const pressAvailable = session?.pressEnabled !== false;
  const draftKey = authorized ? pdfNewsRelayDraftKey(session!.id, me!.uid, groupId) : null;
  // A new audience gets fresh actions, so an uncertain attempt never retries into another group.
  const actionsFor = useRef<{ key: string | null; actions: ReturnType<typeof createCurrentFleetGroupActions> } | null>(null);
  if (actionsFor.current?.key !== draftKey) {
    actionsFor.current = { key: draftKey, actions: createCurrentFleetGroupActions() };
  }
  const actions = actionsFor.current.actions;
  const activeKey = useRef(draftKey);
  activeKey.current = draftKey;
  const [draft, setDraft] = useState(() => readDraft(draftKey));
  const [handToPress, setHandToPress] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(readDraft(draftKey));
    setHandToPress(false);
    setNotice('');
    setError('');
    setBusy(false);
  }, [draftKey]);

  if (!authorized) return null;

  const updateDraft = (text: string) => {
    setDraft(text);
    writeDraft(draftKey, text);
  };

  const relay = async () => {
    const key = draftKey;
    const pressChoice = pressAvailable && handToPress;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const reply = await actions.relayPdfNews(draft, pressChoice);
      if (activeKey.current !== key) return;
      updateDraft('');
      setHandToPress(false);
      setNotice(reply.handedToPress
        ? `Relayed to ${reply.groupId}. Handed to the Press; the Press decides whether to publish it.`
        : `Relayed to ${reply.groupId}. Not handed to the Press.`);
    } catch (cause) {
      if (activeKey.current !== key) return;
      setError(cause instanceof Error ? cause.message : 'The P.D.F. news relay failed. Your draft is kept.');
    } finally {
      if (activeKey.current === key) setBusy(false);
    }
  };

  return <section className="console-workspace__section pdf-news-relay" aria-labelledby="pdf-news-relay-title">
    <h3 id="pdf-news-relay-title">P.D.F. Colonel news relay</h3>
    <p>Relay news to your current fleet group ({groupId}) outside Wolf attacks. Group replies appear in the fleet group panel.</p>
    {!ready && <p role="status">Reconnect and refresh current P.D.F. Colonel authority to relay news.</p>}
    <label className="pdf-news-relay__field" htmlFor="pdf-news-relay-text">News for your current fleet group</label>
    <textarea id="pdf-news-relay-text" maxLength={MAX_RELAY_LENGTH} value={draft} disabled={busy}
      onChange={event => updateDraft(event.target.value)} />
    {pressAvailable && <label className="pdf-news-relay__press">
      <input type="checkbox" checked={handToPress} disabled={busy}
        aria-describedby="pdf-news-relay-press-note"
        onChange={event => setHandToPress(event.target.checked)} />
      Also hand to the Press
    </label>}
    {pressAvailable && <p id="pdf-news-relay-press-note" className="pdf-news-relay__note">
      Off by default. Only this message text goes to the Press, and the Press decides whether to publish it.
    </p>}
    <div className="pdf-news-relay__actions">
      <button className="cic-action-button" type="button" disabled={!ready || busy || !draft.trim()}
        onClick={() => void relay()}>{busy ? 'Relaying…' : 'Relay to current fleet group'}</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
