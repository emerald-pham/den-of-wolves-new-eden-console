import {expect,it} from 'vitest';
import {localDradisContacts} from './localDradisContacts';
const sampledAt='2026-10-03T01:00:00.000Z';
const projection={groupId:'fleet-2',navigationRevision:5,fleetPartitionRevision:2,sampledAt,
 ships:[{shipId:'aegis',fleetGroupId:'fleet-2',coordinate:'1413'},
  {shipId:'icebreaker',fleetGroupId:'fleet-2',coordinate:'1413'},
  {shipId:'shepherd',fleetGroupId:'fleet-2',coordinate:'5143'},
  {shipId:'dione',fleetGroupId:'fleet-1',coordinate:'1413'}],
 transits:[{shuttleId:'starlight',fleetGroupId:'fleet-2',currentPosition:{x:0.1,y:0.2,z:0.3},sampledAt,
  destinationShipId:'icebreaker',arrivesAt:'2026-10-03T01:01:00.000Z'}]};
it('renders only arrived ships matching both authoritative coordinate and group',()=>{
 const contacts=localDradisContacts('aegis',projection);
 expect(contacts.map(c=>c.tag)).toEqual(['ICEBREAKER','STARLIGHT']);
 expect(localDradisContacts('quellon',projection)).toEqual([]);
 expect(localDradisContacts('aegis',{...projection,groupId:'fleet-1'})).toEqual([]);
});
it('consumes only server sampled transit coordinates and never gives animation destination authority',()=>{
 const contact=localDradisContacts('icebreaker',projection).find(c=>c.id==='transit:starlight');
 expect(contact).toMatchObject({x:-0.16,y:0.32,z:0.02,showCombatRange:false});
 expect(contact).not.toHaveProperty('transit');
 expect(localDradisContacts('aegis',{...projection,transits:projection.transits.map(t=>({...t,sampledAt:'stale'}))})).toHaveLength(1);
 expect(localDradisContacts('aegis',{...projection,transits:projection.transits.map(t=>({...t,fleetGroupId:'foreign'}))})).toHaveLength(1);
 expect(localDradisContacts('aegis',{...projection,transits:projection.transits.map(t=>({...t,destinationShipId:'shepherd'}))})).toHaveLength(1);
});
it('drops destroyed contacts without deriving another fleet from catalog defaults',()=>{
 expect(localDradisContacts('aegis',projection,{icebreaker:{destroyed:true,damagedSystemIds:[]}}).map(c=>c.tag)).toEqual(['STARLIGHT']);
 expect(localDradisContacts('aegis',{...projection,ships:[]})).toEqual([]);
});
