import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import ShipPlot from './ShipPlot';
vi.mock('./ContactPlot',()=>({default:({contacts}: {contacts: {tag:string}[]})=><div>{contacts.map(c=><span key={c.tag}>{c.tag}</span>)}</div>}));
vi.mock('./DradisEffectControls',()=>({default:()=>null}));
const sampledAt='2026-10-03T01:00:00.000Z';
it('fails closed until group navigation is available in the actual ShipPlot consumer',()=>{
 const {rerender}=render(<ShipPlot hostile={false} aboard viewerId="aegis" requireLocalAuthority />);
 expect(screen.queryByText('DIONE')).not.toBeInTheDocument();expect(screen.queryByText('ICEBREAKER')).not.toBeInTheDocument();
 rerender(<ShipPlot hostile={false} aboard viewerId="aegis" requireLocalAuthority localNavigation={{groupId:'local',sampledAt,
  navigationRevision:1,fleetPartitionRevision:1,ships:[{shipId:'aegis',fleetGroupId:'local',coordinate:'1413'},
  {shipId:'icebreaker',fleetGroupId:'local',coordinate:'1413'}],transits:[]}} />);
 expect(screen.getByText('ICEBREAKER')).toBeInTheDocument();expect(screen.queryByText('DIONE')).not.toBeInTheDocument();
 rerender(<ShipPlot hostile={false} aboard viewerId="aegis" requireLocalAuthority />);
 expect(screen.queryByText('ICEBREAKER')).not.toBeInTheDocument();
});
