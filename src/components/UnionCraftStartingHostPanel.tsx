import { useEffect, useRef, useState } from 'react';
import { findShip } from '@/data/ships';
import { hasFreshSessionAuthority } from '@/lib/sessionMutationAuthority';
import { setUnionCraftStartingHost, UNION_CRAFT_STARTING_HOSTS } from '@/lib/unionCraftSetupService';
import { useSessionStore } from '@/store/useSessionStore';

interface ViewProps {
  craftId: 'wobbly' | 'ally';
  hostShipIds: readonly string[];
  currentHostId: string | null;
  busy?: boolean;
  disabled?: boolean;
  status?: string;
  onChoose: (hostShipId: string) => void;
}
export function UnionCraftStartingHostPanelView({ craftId, hostShipIds, currentHostId, busy, disabled, status, onChoose }: ViewProps) {
  const name = craftId === 'wobbly' ? 'Wobbly' : 'Ally';
  const [selected, setSelected] = useState('');
  useEffect(() => setSelected(''), [currentHostId, craftId]);
  return <section className="gm-role-group" aria-label={`${name} starting host`}>
    <h3 className="gm-console__section-title">{name} starting host</h3>
    <p>Choose its starting dock. Its confirmed Union engineer receives control when play begins.</p>
    <p>Saved host: {currentHostId ? findShip(currentHostId)?.name ?? currentHostId : 'Not chosen'}</p>
    <label>{name} starting host <select aria-label={`${name} starting host`} value={selected} disabled={disabled || busy}
      onChange={event => setSelected(event.target.value)}>
      <option value="">Choose a host</option>
      {hostShipIds.map(id => <option key={id} value={id}>{findShip(id)?.name ?? id}</option>)}
    </select></label>
    <button className="cic-action-button" type="button" disabled={disabled || busy || !hostShipIds.includes(selected)} onClick={() => onChoose(selected)}>
      {busy ? 'Saving starting host…' : `Save ${name} starting host`}
    </button>
    {status && <p role="status">{status}</p>}
  </section>;
}
export default function UnionCraftStartingHostPanel() {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  const instance = useSessionStore(state => state.gmInstance);
  const connection = useSessionStore(state => state.connection);
  const freshness = useSessionStore(state => state.sessionSnapshotFreshness);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const scope = `${session?.id}:${me?.uid}:${instance?.id}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  useEffect(() => { setStatus(''); setBusy(false); }, [scope]);
  if (!session || session.currentTurn !== 0 || session.setupConfirmed !== true || session.configurationLocked === true ||
      !['lobby', 'casting'].includes(session.phase)) return null;
  const disabled = connection !== 'live' || freshness !== 'server' || !hasFreshSessionAuthority() || me?.role !== 'gm' ||
    !instance || instance.uid !== me.uid || instance.sessionId !== session.id;
  async function choose(craftId: 'wobbly' | 'ally', hostShipId: string) {
    if (busy || disabled) return;
    const binding = scope;
    setBusy(true); setStatus('');
    try {
      await setUnionCraftStartingHost(craftId, hostShipId);
      if (scopeRef.current === binding) setStatus('Starting host saved. Check the live docking list before starting play.');
    } catch (error) {
      if (scopeRef.current === binding) setStatus(error instanceof Error ? error.message : 'Starting host could not be saved. Review setup and try again.');
    } finally { if (scopeRef.current === binding) setBusy(false); }
  }
  return <>{(Object.keys(UNION_CRAFT_STARTING_HOSTS) as Array<'wobbly' | 'ally'>).filter(craftId =>
    session.activeRoleIds?.includes(UNION_CRAFT_STARTING_HOSTS[craftId].roleId)).map(craftId => {
      const dockings = session.shuttleDockings?.filter(docking => docking.shuttleId === craftId);
      return <UnionCraftStartingHostPanelView key={`${scope}:${craftId}`} craftId={craftId}
        hostShipIds={UNION_CRAFT_STARTING_HOSTS[craftId].hosts.filter(id => session.activeVesselIds?.includes(id))}
        currentHostId={dockings?.length === 1 ? dockings[0]!.shipId : null} busy={busy} disabled={disabled}
        status={status} onChoose={hostShipId => void choose(craftId, hostShipId)} />;
    })}</>;
}
