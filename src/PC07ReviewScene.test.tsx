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
 expect(screen.getByRole('list',{name:'Current group notes'})).toHaveTextContent('HOLD AT LOCAL FIX');
 fireEvent.click(screen.getByRole('button',{name:'View Fleet-2 sample'}));
 expect(screen.queryByText('ICEBREAKER')).not.toBeInTheDocument();expect(screen.getByText('DIONE')).toBeVisible();
 expect(screen.getByRole('list',{name:'Current group notes'})).not.toHaveTextContent('HOLD AT LOCAL FIX');
 fireEvent.click(screen.getByRole('button',{name:'Cached connection sample'}));
 expect(screen.queryByText('DIONE')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Current server sample'}));expect(screen.getByText('DIONE')).toBeVisible();
});
it('keeps the actual held-clock presentation isolated from an existing signed-in identity',()=>{
 const original=useSessionStore.getState().session;
 render(<PC07ReviewScene />);
 fireEvent.click(screen.getByRole('button',{name:'5 Recovery'}));
 expect(screen.getByRole('region',{name:'Cycle briefing clearance'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Clear cycle briefing // resume clock'}));
 expect(screen.getByRole('status',{name:'Recovery sample result'})).toHaveTextContent('5:00 preserved');
 expect(useSessionStore.getState().session).toBe(original);
 expect(screen.queryByRole('button',{name:'Trigger unknown contact'})).not.toBeInTheDocument();
});
