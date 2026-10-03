import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { subscribeConnectedPlayers } from '@/lib/firestore';
import { createCurrentFleetGroupActions, type FleetGroupNavigationProjection, type FleetGroupNote, type FleetTaxiShuttleId } from '@/lib/fleetGroupService';
import type { Player } from '@/types/game';
import FleetGroupPanel from './FleetGroupPanel';

const TAXI_SHUTTLES = {
  starlight: { ownerRoleId: 'wing-commander', anchorShipId: 'aegis' },
  hummingbird: { ownerRoleId: 'quellon-explorer', anchorShipId: 'quellon' },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
  const [loadedNavigation, setLoadedNavigation] = useState<{ key: string; projection: FleetGroupNavigationProjection } | null>(null);
  const [connectedPlayers, setConnectedPlayers] = useState<readonly Player[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true; setLoaded(null); setLoadedNavigation(null); setNotice(''); setBusy(false); setConnectedPlayers([]);
    if (!ready) return () => { current = false; };
    void actions.read().then(reply => { if (current) setLoaded({ key, notes: reply.messages }); })
      .catch(error => { if (current) setNotice(error instanceof Error ? error.message : 'Group notes could not be loaded.'); });
    if (me!.role === 'player') void actions.readNavigation().then(projection => {
      if (current) setLoadedNavigation({ key, projection });
    }).catch(error => { if (current) setNotice(error instanceof Error ? error.message : 'Current group navigation is unavailable.'); });
    if (me!.role === 'player') {
      const unsubscribe = subscribeConnectedPlayers(session!.id, players => {
        if (current && activeKey.current === key) setConnectedPlayers(players.filter(player =>
          player.role === 'player' && player.connected === true && player.fleetGroupId === me!.fleetGroupId));
      }, () => { if (current) setConnectedPlayers([]); });
      return () => { current = false; unsubscribe(); };
    }
    return () => { current = false; };
  }, [actions, key, ready]);
  useEffect(() => { setDraft(''); }, [audience]);
  if (!ready) return null;
  const notes = loaded?.key === key ? loaded.notes : [];
  const projection = loadedNavigation?.key === key ? loadedNavigation.projection : null;
  const run = async (kind: 'read' | 'send' | 'partition' | 'share' | 'taxi', value?: unknown) => {
    setBusy(true); setNotice('');
    try {
      if (kind === 'send') { await actions.send(draft); if (activeKey.current !== key) return; setDraft(''); setNotice('Group note sent.'); }
      if (kind === 'partition') {
        await actions.confirmPartition(); if (activeKey.current !== key) return;
        setNotice('Current ship positions confirmed. Colocated groups merge automatically and keep the highest prior pursuit score.');
      }
      if (kind === 'share') {
        const input = value as { coordinate: string; recipientShipIds: 'all' | readonly string[] };
        const reply = await actions.share(input.coordinate, input.recipientShipIds); if (activeKey.current !== key) return;
        const count = Array.isArray(reply.recipientShipIds) ? reply.recipientShipIds.length : 0;
        setNotice(`System ${reply.coordinate} shared with ${count} ship${count === 1 ? '' : 's'} in this group.`);
      }
      if (kind === 'taxi') {
        const reply = await actions.transferTaxi(value as Parameters<typeof actions.transferTaxi>[0]); if (activeKey.current !== key) return;
        setNotice(reply.kind === 'fuel' ? `Scout taxi delivered ${reply.units} fuel unit${reply.units === 1 ? '' : 's'}. ${reply.sourceFuelRemaining} fuel units remain at the launch ship.`
          : `Scout taxi carried ${reply.playerUids.length} connected player${reply.playerUids.length === 1 ? '' : 's'} to ${reply.targetShipId}.`);
      }
      if (kind !== 'share' && kind !== 'taxi') {
        const reply = await actions.read(); if (activeKey.current !== key) return; setLoaded({ key, notes: reply.messages });
      } else {
        const reply = await actions.read(); if (activeKey.current !== key) return; setLoaded({ key, notes: reply.messages });
      }
    } catch (error) { if (activeKey.current !== key) return; setNotice(error instanceof Error ? error.message : 'Group action failed.'); }
    finally { if (activeKey.current === key) setBusy(false); }
  };
  const canConfirm = me.role === 'gm' && gm?.uid === me.uid && gm.sessionId === session.id && session.playerDiscovery?.groupId === me.fleetGroupId;
  const scannedCoordinates = me.role === 'player' ? session.playerDiscovery?.knownCoordinates ?? [] : [];
  const activeVesselIds = session.activeVesselIds ?? [];
  const localShipIds = new Set(projection?.ships.map(ship => ship.shipId) ?? []);
  const taxiDestinations = me.role === 'player' ? activeVesselIds.filter(shipId => !localShipIds.has(shipId)) : [];
  const controls = isRecord(session.shuttleControl) ? session.shuttleControl : {};
  const taxiShuttles = (Object.keys(TAXI_SHUTTLES) as FleetTaxiShuttleId[]).filter(shuttleId => {
    if (me.role !== 'player' || me.assignedRoleId !== TAXI_SHUTTLES[shuttleId].ownerRoleId || !localShipIds.has(TAXI_SHUTTLES[shuttleId].anchorShipId)) return false;
    const control = controls[shuttleId];
    return isRecord(control) && control.ownerUid === me.uid && control.holderUid === me.uid;
  });
  const taxiPlayers = connectedPlayers.filter(player => player.uid !== me.uid).map(player => ({ uid: player.uid, label: player.displayName }));
  return <FleetGroupPanel groupId={me.fleetGroupId!} actorUid={me.uid} notes={notes} draft={draft} busy={busy} notice={notice}
    navigation={projection} scannedCoordinates={scannedCoordinates} taxiDestinations={taxiDestinations}
    taxiShuttles={taxiShuttles} taxiPlayers={taxiPlayers} canShare={me.role === 'player' && !!projection && scannedCoordinates.length > 0}
    onDraft={setDraft} onSend={() => void run('send')} onRefresh={() => void run('read')}
    onShare={(coordinate, recipients) => void run('share', { coordinate, recipientShipIds: recipients })}
    onTaxi={input => void run('taxi', input)}
    {...(canConfirm ? { onConfirm: () => void run('partition') } : {})} />;
}
