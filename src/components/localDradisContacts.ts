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
  readonly transits:readonly {readonly shuttleId:string;readonly fleetGroupId:string;readonly sampledAt:string;
    readonly currentPosition:{readonly x:number;readonly y:number;readonly z:number};
    readonly destinationShipId:string;readonly arrivesAt:string}[];
}
const round=(value:number)=>Math.round(value*1e4)/1e4;
/** Display the sampled position. Rendering cannot derive a destination or mutate movement authority. */
export function localDradisContacts(viewerId:string,projection:LocalDradisNavigation,damage?:GameSession['shipDamage']):readonly PlotContact[]{
 const viewer=projection.ships.find(s=>s.shipId===viewerId&&s.fleetGroupId===projection.groupId);
 if(!viewer)return[];
 const local=projection.ships.filter(s=>s.fleetGroupId===projection.groupId&&s.coordinate===viewer.coordinate);
 const coordinates=Object.fromEntries(local.map(s=>[s.shipId,s.coordinate]));
 const ships=fleetViewFrom(viewerId,true,coordinates,true,local.map(s=>s.shipId),damage).map(s=>({id:`ship:${s.id}`,tag:s.name.toUpperCase(),x:s.x,y:s.y,z:s.z,color:s.color,combatRange:s.combatRange,showCombatRange:false}));
 const origin=fleetOriginFor(viewerId);
 const transits=projection.transits.flatMap(t=>{
  const shuttle=SHUTTLECRAFT.find(s=>s.id===t.shuttleId);
  if(!shuttle||t.fleetGroupId!==projection.groupId||t.sampledAt!==projection.sampledAt||
   !Number.isFinite(Date.parse(t.sampledAt))||![t.currentPosition.x,t.currentPosition.y,t.currentPosition.z].every(Number.isFinite)||
   !local.some(s=>s.shipId===t.destinationShipId))return[];
  return[{id:`transit:${t.shuttleId}`,tag:shuttle.shortName.toUpperCase(),
   x:round(t.currentPosition.x-origin.x),y:round(t.currentPosition.y-origin.y),z:round(t.currentPosition.z-origin.z),
   color:'#8ed9ef',combatRange:'short' as const,showCombatRange:false}];
 });
 return[...ships,...transits];
}
