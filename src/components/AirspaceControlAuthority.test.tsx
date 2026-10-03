import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import AirspaceControl from './AirspaceControl';
import {useSessionStore} from '@/store/useSessionStore';
const command = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/airspaceService', () => ({unlockPressAirspace: command}));
beforeEach(() => {
 command.mockReset(); command.mockResolvedValue(undefined);
 const now = Date.now(), stamp = new Date(now).toISOString();
 useSessionStore.getState().setIdentity({id:'local-airspace',name:'Local airspace',joinCode:'0000',phase:'active',currentTurn:1,
  ownerUid:'admiral',createdAt:stamp,updatedAt:stamp,
  turnPhase:{turn:1,teamPhaseEndsAt:new Date(now+300000).toISOString(),openAirspaceEndsAt:new Date(now+1200000).toISOString(),
   airspace:{state:'restricted',tickerActive:true,pressAccess:false}}},
 {uid:'admiral',sessionId:'local-airspace',displayName:'Admiral',role:'player',seatId:'admiral',joinedAt:stamp});
 useSessionStore.getState().setConnection('live');
 useSessionStore.getState().setSessionSnapshotFreshness('server');
});
it('allows a current restricted Press choice but immediately withdraws it for cached authority', () => {
 render(<AirspaceControl />); fireEvent.click(screen.getByText('Systems control'));
 const button = screen.getByRole('button',{name:'Unlock airspace // Press'});
 expect(button).toBeEnabled();
 act(() => useSessionStore.getState().setSessionSnapshotFreshness('cache'));
 expect(button).toBeDisabled();fireEvent.click(button);expect(command).not.toHaveBeenCalled();
 expect(screen.getByRole('status')).toHaveTextContent('Reconnect to confirm current airspace clearance');
});
it('keeps Press choice unavailable behind every authoritative timer hold', () => {
 const session = useSessionStore.getState().session!;
 useSessionStore.getState().setSession({...session,turnPhase:{...session.turnPhase!,
  timerPause:{reason:'turn-interstitial',window:'restricted',remainingMs:300000,pausedAt:session.createdAt}}});
 render(<AirspaceControl />);fireEvent.click(screen.getByText('Systems control'));
 const button=screen.getByRole('button',{name:'Unlock airspace // Press'});
 expect(button).toBeDisabled(); fireEvent.click(button); expect(command).not.toHaveBeenCalled();
 expect(screen.getByRole('status')).toHaveTextContent('Cycle briefing clearance required');
});
it('announces a committed restriction or reopening as one current accessible state', () => {
 render(<AirspaceControl />);fireEvent.click(screen.getByText('Systems control'));
 expect(screen.getAllByRole('status')).toHaveLength(1);
 expect(screen.getByRole('status')).toHaveTextContent('Airspace restricted');
 const session=useSessionStore.getState().session!;
 act(() => useSessionStore.getState().setSession({...session,turnPhase:{...session.turnPhase!,airspace:{state:'lifted',tickerActive:true,pressAccess:true}}}));
 expect(screen.getAllByRole('status')).toHaveLength(1);
 expect(screen.getByRole('status')).toHaveTextContent('Airspace open');
 expect(screen.getByRole('button',{name:'Press airspace exception authorized'})).toBeDisabled();
});
it('keeps a denial visible and allows a fresh explicit retry without announcing clearance', async () => {
 command.mockRejectedValueOnce(new Error('The current restriction denies this request.'));
 render(<AirspaceControl />);fireEvent.click(screen.getByText('Systems control'));
 fireEvent.click(screen.getByRole('button',{name:'Unlock airspace // Press'}));
 await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('current restriction denies'));
 expect(screen.getByRole('status')).toHaveTextContent('Airspace restricted');
 expect(screen.getByRole('button',{name:'Unlock airspace // Press'})).toBeEnabled();
});
it('does not claim Press movement clearance from cached or globally held authority',()=>{
 const current=useSessionStore.getState().session!;
 useSessionStore.getState().setSession({...current,turnPhase:{...current.turnPhase!,airspace:{state:'restricted',tickerActive:true,pressAccess:true}}});
 render(<AirspaceControl />);fireEvent.click(screen.getByText('Systems control'));
 expect(screen.getByText(/Non-affiliated vessels/)).toHaveTextContent('Press clearance authorized');
 act(()=>useSessionStore.getState().setSessionSnapshotFreshness('cache'));
 expect(screen.getByText(/Non-affiliated vessels/)).toHaveTextContent('Await current clearance');
 act(()=>{
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setSession({...current,turnPhase:{...current.turnPhase!,airspace:{state:'restricted',tickerActive:true,pressAccess:true},
   timerPause:{window:'restricted',remainingMs:60000,pausedAt:current.updatedAt}}});
 });
 expect(screen.getByText(/Non-affiliated vessels/)).toHaveTextContent('Closed');
});
it.each(['actor','cycle'] as const)('withdraws a delayed denial when the current %s changes',async kind=>{
 let reject!: (error:Error)=>void;
 command.mockImplementationOnce(()=>new Promise<undefined>((_resolve,deny)=>{reject=deny;}));
 render(<AirspaceControl />);fireEvent.click(screen.getByText('Systems control'));
 fireEvent.click(screen.getByRole('button',{name:'Unlock airspace // Press'}));
 act(()=>{
  const state=useSessionStore.getState();
  if(kind==='actor')useSessionStore.setState({me:{...state.me!,uid:'new-admiral'}});
  else state.setSession({...state.session!,currentTurn:2,turnPhase:{...state.session!.turnPhase!,turn:2}});
 });
 await act(async()=>reject(new Error('Old actor restriction denied.')));
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
