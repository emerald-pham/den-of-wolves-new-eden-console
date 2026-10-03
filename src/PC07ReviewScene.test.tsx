import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import PC07ReviewScene from './PC07ReviewScene';
import {useSessionStore} from '@/store/useSessionStore';
vi.mock('./components/ContactPlot',()=>({default:({contacts}: {contacts: {tag:string}[]})=><div>{contacts.map(c=><span key={c.tag}>{c.tag}</span>)}</div>}));
it('provides the five numbered solo checks and explicit navigation without a live session',()=>{
 render(<PC07ReviewScene />);
 expect(screen.getByRole('heading',{name:/PC07.*airspace.*split.*attack/i})).toBeVisible();
 expect(screen.getByRole('note',{name:'Prepared review boundary'})).toHaveTextContent('No live session writes');
 const steps=screen.getByRole('navigation',{name:'PC07 review steps'});
 expect(within(steps).getAllByRole('button')).toHaveLength(5);
 for(const label of ['1 Groups and DRADIS','2 Known systems','3 Taxi and rejoin','4 Attack lifecycle','5 Recovery']){
  fireEvent.click(within(steps).getByRole('button',{name:label}));
  expect(within(steps).getByRole('button',{name:label})).toHaveAttribute('aria-pressed','true');
 }
 expect(screen.getByRole('link',{name:'Return to station and console chooser'})).toHaveAttribute('href','/#/');
 fireEvent.click(screen.getByRole('button',{name:'Previous review step'}));
 expect(within(steps).getByRole('button',{name:'4 Attack lifecycle'})).toHaveAttribute('aria-pressed','true');
});
it('uses group-local contacts and notes and immediately removes contacts for a cached sample',()=>{
 render(<PC07ReviewScene />);
 expect(screen.getByText('ICEBREAKER')).toBeVisible();expect(screen.queryByText('DIONE')).not.toBeInTheDocument();
 fireEvent.change(screen.getByRole('textbox',{name:'Note to your fleet group'}),{target:{value:'HOLD AT LOCAL FIX'}});
 fireEvent.click(screen.getByRole('button',{name:'Send group note'}));
 expect(screen.getByRole('list',{name:'Current group announcements'})).toHaveTextContent('HOLD AT LOCAL FIX');
 fireEvent.click(screen.getByRole('button',{name:'View Fleet-2 sample'}));
 expect(screen.queryByText('ICEBREAKER')).not.toBeInTheDocument();expect(screen.getByText('DIONE')).toBeVisible();
 expect(screen.getByRole('list',{name:'Current group announcements'})).not.toHaveTextContent('HOLD AT LOCAL FIX');
 fireEvent.click(screen.getByRole('button',{name:'Cached connection sample'}));
 expect(screen.queryByText('DIONE')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Current server sample'}));expect(screen.getByText('DIONE')).toBeVisible();
});
it('offers only scanned locations and current local recipients in the known-system sample',()=>{
 render(<PC07ReviewScene />);
 fireEvent.click(screen.getByRole('button',{name:'2 Known systems'}));
 const systems=screen.getByRole('combobox',{name:'Scanned system to share'});
 expect(within(systems).getAllByRole('option').map(option=>option.textContent)).toEqual(['3145','3155']);
 expect(screen.queryByRole('checkbox',{name:'DIONE'})).not.toBeInTheDocument();
 const send=screen.getByRole('button',{name:'Share scanned system'});
 expect(send).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:'ICEBREAKER'}));
 fireEvent.change(systems,{target:{value:'3155'}});fireEvent.click(send);
 expect(screen.getByRole('status',{name:'Known system sample result'})).toHaveTextContent('3155 // ICEBREAKER');
 fireEvent.click(screen.getByRole('button',{name:'Cached knowledge sample'}));
 expect(send).toBeDisabled();
});
it('shows a bounded taxi payload, one-attempt recovery and an explicit rejoin result',()=>{
 render(<PC07ReviewScene />);fireEvent.click(screen.getByRole('button',{name:'3 Taxi and rejoin'}));
 expect(within(screen.getByRole('combobox',{name:'Fuel units'})).getAllByRole('option')).toHaveLength(2);
 fireEvent.change(screen.getByRole('combobox',{name:'Taxi destination ship'}),{target:{value:'shepherd'}});
 fireEvent.change(screen.getByRole('combobox',{name:'Fuel units'}),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'Send scout taxi'}));
 expect(screen.getByRole('status',{name:'Taxi sample result'})).toHaveTextContent('2 fuel');
 expect(screen.getByRole('button',{name:'Send scout taxi'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Restore taxi sample'}));
 fireEvent.click(screen.getByRole('button',{name:'Out-of-range destination sample'}));
 fireEvent.click(screen.getByRole('button',{name:'Send scout taxi'}));
 expect(screen.getByRole('status',{name:'Taxi sample result'})).toHaveTextContent('Range denied');
 expect(screen.getByRole('button',{name:'Rejoin co-located sample'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Arrival at the same fix sample'}));
 fireEvent.click(screen.getByRole('button',{name:'Rejoin co-located sample'}));
 expect(screen.getByRole('status',{name:'Rejoin sample result'})).toHaveTextContent('pursuit 4');
});
it('renders committed safe attack results and offers genuine use, pass and recovery samples',()=>{
 render(<PC07ReviewScene />);fireEvent.click(screen.getByRole('button',{name:'4 Attack lifecycle'}));
 fireEvent.click(screen.getByRole('button',{name:'Declare attack sample'}));
 expect(screen.getByRole('region',{name:'Wolf attack status'})).toHaveTextContent('Long Range');
 fireEvent.click(screen.getByRole('button',{name:'Pause attack sample'}));
 expect(screen.getByRole('button',{name:'Pass charged weapon sample'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Reconnect attack sample'}));
 fireEvent.click(screen.getByRole('button',{name:'Pass charged weapon sample'}));
 expect(screen.getByRole('status',{name:'Attack sample result'})).toHaveTextContent('Charge retained');
 fireEvent.click(screen.getByRole('button',{name:'Commit boarding sample'}));
 expect(screen.getByRole('region',{name:'Wolf attack status'})).toHaveTextContent('Attack complete');
 expect(screen.getByRole('status',{name:'Attack sample result'})).toHaveTextContent('airspace opens');
 expect(screen.queryByText(/facilitator notes|unresolved dice|hidden composition/i)).not.toBeInTheDocument();
});
it('retains a reusable charged combat console in the prepared use result',()=>{
 render(<PC07ReviewScene />);fireEvent.click(screen.getByRole('button',{name:'4 Attack lifecycle'}));
 fireEvent.click(screen.getByRole('button',{name:'Declare attack sample'}));
 fireEvent.click(screen.getByRole('button',{name:'Use charged weapon sample'}));
 expect(screen.getByRole('status',{name:'Attack sample result'})).toHaveTextContent('Charge retained');
});
it('keeps the actual held-clock presentation isolated from an existing signed-in identity',()=>{
 const original=useSessionStore.getState();
 const stamp='2026-10-02T12:00:00.000Z';
 const me={uid:'prepared-gm',sessionId:'prepared-existing-session',displayName:'Existing facilitator',role:'gm' as const,seatId:null,joinedAt:stamp};
 const gmInstance={id:'prepared-existing-instance',sessionId:me.sessionId,uid:me.uid,name:'Existing console',deviceLabel:'Existing device',claimedAt:stamp};
 useSessionStore.setState({me,gmInstance});
 try {
  render(<PC07ReviewScene />);
  expect(screen.queryByRole('button',{name:'Trigger unknown contact'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'5 Recovery'}));
  expect(screen.getByRole('region',{name:'Cycle briefing clearance'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Clear cycle briefing // resume clock'}));
  expect(screen.getByRole('status',{name:'Recovery sample result'})).toHaveTextContent('5:00 preserved');
  expect(useSessionStore.getState().session).toBe(original.session);
  expect(useSessionStore.getState().me).toBe(me);
  expect(useSessionStore.getState().gmInstance).toBe(gmInstance);
 }finally{useSessionStore.setState(original);}
});

it('lets the owner see the prepared automatic Comms report and GM result log together',()=>{
 render(<PC07ReviewScene />);
 fireEvent.click(screen.getByRole('button',{name:'2 Known systems'}));
 expect(screen.getByRole('region',{name:'Comms Officer scout report'})).toHaveTextContent('Prepared system detail');
 expect(screen.getByRole('region',{name:'GM scouting result log'})).toHaveTextContent('Automatic server resolution');
 expect(screen.getByRole('note',{name:'Prepared review boundary'})).toHaveTextContent('Controls change local samples only');
});
