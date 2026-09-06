import { useState } from 'react';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import AssignedShuttlecraft from './AssignedShuttlecraft';
import { SHIPS } from '@/data/ships';
import { resourcesForShip } from '@/data/resources';
import { useSessionStore } from '@/store/useSessionStore';

export default function JointEngineeringWorkspace({ roleId }: { readonly roleId: string }) {
  const ids = roleId === 'joint-engineering-quellon-refinery' ? ['quellon', 'refinery-124'] : ['shepherd', 'icebreaker'];
  const [selected, setSelected] = useState(ids[0]);
  const session = useSessionStore(state => state.session);
  const ship = SHIPS.find(item => item.id === (ids.includes(selected ?? '') ? selected : ids[0]));
  if (!ship || !session) return null;
  const role = ship.roles.find(item => item.id.endsWith('-engineer'));
  if (!role) return null;
  return <>
    <AssignedShuttlecraft roleId={roleId} />
    <nav className="console-workspace__nav" aria-label="Engineering ship selection">{ids.map(id => <button type="button" key={id} aria-pressed={ship.id === id} onClick={() => setSelected(id)}>{SHIPS.find(item => item.id === id)?.name}</button>)}</nav>
    <FleetSystemsWorkspace key={ship.id} ship={ship} role={role} fuel={resourcesForShip(ship.id, session.shipResources)?.fuel ?? 0} galacticCoordinate="Refer to ship console" />
  </>;
}
