import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { createCurrentFleetGroupActions, type FleetGroupNote } from '@/lib/fleetGroupService';
import FleetGroupPanel from './FleetGroupPanel';
export default function FleetGroupWorkspace() {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  const connection = useSessionStore(state => state.connection);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness);
  const gm = useSessionStore(state => state.gmInstance);
  const ready = !!session && !!me && me.sessionId === session.id && session.phase === 'active' &&
    connection === 'live' && freshness === 'server' && !!me.fleetGroupId;
  const audience = `${session?.id}/${me?.uid}/${me?.fleetGroupId}/${gm?.id}`;
  const key = `${audience}/${ready}`;
  const activeKey = useRef(key); activeKey.current = key;
  const actions = useMemo(() => createCurrentFleetGroupActions(), [key]);
  const [loaded, setLoaded] = useState<{ key: string; notes: readonly FleetGroupNote[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true; setLoaded(null); setNotice(''); setBusy(false);
    if (ready) void actions.read().then(reply => { if (current) setLoaded({ key, notes: reply.messages }); })
      .catch(error => { if (current) setNotice(error instanceof Error ? error.message : 'Group notes could not be loaded.'); });
    return () => { current = false; };
  }, [actions, key, ready]);
  useEffect(() => { setDraft(''); }, [audience]);
  if (!ready) return null;
  const notes = loaded?.key === key ? loaded.notes : [];
  const run = async (kind: 'read' | 'send' | 'partition') => {
    setBusy(true); setNotice('');
    try {
      if (kind === 'send') { await actions.send(draft); if (activeKey.current !== key) return; setDraft(''); }
      if (kind === 'partition') {
        await actions.confirmPartition(); if (activeKey.current !== key) return; setNotice('Fleet groups confirmed from current ship positions.');
      }
      const reply = await actions.read(); if (activeKey.current !== key) return; setLoaded({ key, notes: reply.messages });
    } catch (error) { if (activeKey.current !== key) return; setNotice(error instanceof Error ? error.message : 'Group action failed.'); }
    finally { if (activeKey.current === key) setBusy(false); }
  };
  const canConfirm = me.role === 'gm' && gm?.uid === me.uid && gm.sessionId === session.id && session.playerDiscovery?.groupId === me.fleetGroupId;
  return <FleetGroupPanel groupId={me.fleetGroupId!} actorUid={me.uid} notes={notes} draft={draft} busy={busy} notice={notice}
    onDraft={setDraft} onSend={() => void run('send')} onRefresh={() => void run('read')}
    {...(canConfirm ? { onConfirm: () => void run('partition') } : {})} />;
}
