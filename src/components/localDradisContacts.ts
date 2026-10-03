import type {PlotContact} from './ContactPlot';
import {fleetOriginFor,fleetViewFrom} from '@/data/fleetFormation';
import {SHUTTLECRAFT} from '@/data/shuttles';
import type {GameSession} from '@/types/game';
/** Consumer allowlist for the audience-safe server endpoint. No hidden navigation state enters the plot. */
export interface LocalDradisNavigation {
  readonly groupId:string;
  readonly navigationRevision:number;
  readonly fleetPartitionRevision:number;
  readonly sampledAt:string;
  readonly ships:readonly {readonly shipId:string;readonly fleetGroupId:string;readonly coordinate:string}[];
  readonly dockedShuttles?:readonly {readonly shuttleId:string;readonly fleetGroupId:string;readonly hostShipId:string}[];
  readonly transits:readonly {readonly shuttleId:string;readonly fleetGroupId:string;readonly sampledAt:string;
    readonly currentPosition:{readonly x:number;readonly y:number;readonly z:number};
    readonly destinationShipId:string;readonly arrivesAt:string}[];
}
const round=(value:number)=>Math.round(value*1e4)/1e4;
function isCurrentGroupTransit(viewerId:string,projection:LocalDradisNavigation,transit:LocalDradisNavigation['transits'][number]):boolean{
 return transit.fleetGroupId===projection.groupId&&transit.sampledAt===projection.sampledAt&&
  Number.isFinite(Date.parse(transit.sampledAt))&&
  [transit.currentPosition.x,transit.currentPosition.y,transit.currentPosition.z].every(Number.isFinite)&&
  projection.ships.some(ship=>ship.shipId===viewerId&&ship.fleetGroupId===projection.groupId)&&
  projection.ships.some(ship=>ship.shipId===transit.destinationShipId&&ship.fleetGroupId===projection.groupId);
}
function dockedCraftTagsForHost(hostShipId:string,projection:LocalDradisNavigation):readonly string[]{
 const inTransit=new Set(projection.transits.filter(transit=>isCurrentGroupTransit(hostShipId,projection,transit))
  .map(transit=>transit.shuttleId));
 const seen=new Set<string>();
 return (projection.dockedShuttles??[]).flatMap(docking=>{
  const shuttle=SHUTTLECRAFT.find(candidate=>candidate.id===docking.shuttleId);
  if(!shuttle||docking.fleetGroupId!==projection.groupId||docking.hostShipId!==hostShipId||
   inTransit.has(docking.shuttleId)||seen.has(docking.shuttleId))return[];
  seen.add(docking.shuttleId);
  return[`DOCKED // ${shuttle.shortName.toUpperCase()}`];
 });
}
/** Attach the viewer's own docked craft to the existing DRADIS origin marker. */
export function localDradisCenterDockedCraftTags(viewerId:string,projection:LocalDradisNavigation):readonly string[]{
 if(!projection.ships.some(ship=>ship.shipId===viewerId&&ship.fleetGroupId===projection.groupId))return[];
 return dockedCraftTagsForHost(viewerId,projection);
}
/** Display the sampled position. Rendering cannot derive a destination or mutate movement authority. */
export function localDradisContacts(viewerId:string,projection:LocalDradisNavigation,damage?:GameSession['shipDamage']):readonly PlotContact[]{
 const viewer=projection.ships.find(s=>s.shipId===viewerId&&s.fleetGroupId===projection.groupId);
 if(!viewer)return[];
 const local=projection.ships.filter(s=>s.fleetGroupId===projection.groupId&&s.coordinate===viewer.coordinate);
 const coordinates=Object.fromEntries(local.map(s=>[s.shipId,s.coordinate]));
 const ships=fleetViewFrom(viewerId,true,coordinates,true,local.map(s=>s.shipId),damage).map(s=>{
  const dockedCraftTags=dockedCraftTagsForHost(s.id,projection);
  return{id:`ship:${s.id}`,tag:s.name.toUpperCase(),x:s.x,y:s.y,z:s.z,color:s.color,combatRange:s.combatRange,
   showCombatRange:false,...(dockedCraftTags.length?{dockedCraftTags}:{})};
 });
 const origin=fleetOriginFor(viewerId);
 const transits=projection.transits.flatMap(t=>{
  const shuttle=SHUTTLECRAFT.find(s=>s.id===t.shuttleId);
  if(!shuttle||!isCurrentGroupTransit(viewerId,projection,t)||
   !local.some(s=>s.shipId===t.destinationShipId))return[];
  return[{id:`transit:${t.shuttleId}`,tag:shuttle.shortName.toUpperCase(),
   x:round(t.currentPosition.x-origin.x),y:round(t.currentPosition.y-origin.y),z:round(t.currentPosition.z-origin.z),
   color:'#8ed9ef',combatRange:'short' as const,showCombatRange:false}];
 });
 return[...ships,...transits];
}
