import type { FleetGroupNote } from '@/lib/fleetGroupService';
import './FleetGroupWorkspace.css';
interface Props {
  readonly groupId: string; readonly actorUid: string; readonly notes: readonly FleetGroupNote[];
  readonly draft: string; readonly busy: boolean; readonly notice: string;
  readonly onDraft: (text: string) => void; readonly onSend: () => void; readonly onRefresh: () => void;
  readonly onConfirm?: () => void;
}
export default function FleetGroupPanel({ groupId, actorUid, notes, draft, busy, notice, onDraft, onSend, onRefresh, onConfirm }: Props) {
  return <section className="fleet-group-workspace" aria-label="Fleet group communication">
    <h2>Fleet group // {groupId}</h2>
    <p>Ordinary notes stay within your current fleet group. Refresh to receive the latest notes.</p>
    <ul aria-label="Current group notes">{notes.map(note => <li key={note.id}><p>{note.text}</p>
      <small>{note.actorUid === actorUid ? 'You' : 'Group participant'} // {new Date(note.sentAt).toLocaleTimeString()}</small></li>)}</ul>
    <label>Note to your fleet group<textarea maxLength={240} value={draft} onChange={event => onDraft(event.target.value)} disabled={busy} /></label>
    <div className="fleet-group-workspace__actions">
      <button type="button" disabled={busy || !draft.trim()} onClick={onSend}>Send group note</button>
      <button type="button" disabled={busy} onClick={onRefresh}>Refresh group notes</button>
      {onConfirm && <button type="button" disabled={busy} onClick={onConfirm}>Confirm separated fleet groups</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
