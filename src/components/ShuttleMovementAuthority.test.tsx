import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import ShuttleControl from './ShuttleControl';
import {useSessionStore} from '@/store/useSessionStore';
const departure = vi.hoisted(() => vi.fn());
const subscribeDeparture = vi.hoisted(() => vi.fn());
vi.mock('@/lib/firestore', () => ({
 subscribeConnectedPlayers: () => () => undefined,
 subscribeShuttleDeparture: subscribeDeparture,
}));
vi.mock('@/lib/shuttleDepartureService', () => ({requestShuttleDeparture:departure,beginShuttleTransit:vi.fn(),
 completeShuttleArrival:vi.fn(),retargetShuttleTransit:vi.fn()}));
const control={shuttleId:'starlight',ownerRoleId:'wing-commander',ownerUid:'wing',holderUid:'wing',revision:0};
beforeEach(() => {
 subscribeDeparture.mockReset().mockImplementation((_session: unknown, _craft: unknown, onValue: (v: null) => void) => {onValue(null);return () => undefined;});
 departure.mockReset();const now=Date.now(),stamp=new Date(now).toISOString();
 useSessionStore.getState().setIdentity({id:'local-flight',name:'Local flight',joinCode:'0000',phase:'active',currentTurn:2,
  ownerUid:'wing',createdAt:stamp,updatedAt:stamp,activeVesselIds:['aegis','icebreaker'],
  playerDiscovery:{groupId:'fleet-1',revision:1,fleetGroupVesselIds:['aegis','icebreaker'],currentCoordinate:'0000',
   knownCoordinates:['0000'],knownSystems:{},pursuitDistance:0,navigationLogs:[]},
  shuttleControl:{starlight:control},shuttleDockings:[{shuttleId:'starlight',shipId:'aegis',dockedAt:stamp}],
  turnPhase:{turn:2,teamPhaseEndsAt:new Date(now-1000).toISOString(),openAirspaceEndsAt:new Date(now+900000).toISOString(),
   airspace:{state:'lifted',tickerActive:true,pressAccess:true}}},
 {uid:'wing',sessionId:'local-flight',displayName:'Wing Commander',role:'player',assignedRoleId:'wing-commander',
  activeConsoleRoleId:'wing-commander',seatId:'wing-commander',fleetGroupId:'fleet-1',joinedAt:stamp});
 useSessionStore.getState().setConnection('live');useSessionStore.getState().setSessionSnapshotFreshness('server');
});
it('rebinds a route listener denied before the flight existed after the holder commits its departure', async () => {
 const stopOld=vi.fn();
 subscribeDeparture.mockReset()
  .mockImplementationOnce((_session: unknown, _craft: unknown, onValue: (v: null) => void) => {onValue(null);return stopOld;})
  .mockImplementation((_session: unknown, _craft: unknown, onValue: (v: unknown) => void) => {
   onValue({status:'requested',requestId:'new-flight',shuttleId:'starlight',holderUid:'wing',fleetGroupId:'fleet-1',
    originShipId:'aegis',destinationShipId:'icebreaker',cycle:2,controlRevision:0,requestedAt:new Date().toISOString()});
   return vi.fn();
  });
 departure.mockResolvedValue(undefined);
 render(<ShuttleControl control={control} />);
 const panel=screen.getByRole('region',{name:'Shuttle departure'});
 fireEvent.change(within(panel).getByRole('combobox'),{target:{value:'icebreaker'}});
 fireEvent.click(within(panel).getByRole('button',{name:'Request departure'}));
 expect(await within(panel).findByRole('button',{name:'Begin transit'})).toBeEnabled();
 expect(subscribeDeparture).toHaveBeenCalledTimes(2);
 expect(stopOld).toHaveBeenCalledTimes(1);
});
it('withdraws a selected cached route and restores it only from current server clearance', () => {
 render(<ShuttleControl control={control} />);
 const panel=screen.getByRole('region',{name:'Shuttle departure'});
 const destination=within(panel).getByRole('combobox');
 fireEvent.change(destination,{target:{value:'icebreaker'}});
 const button=within(panel).getByRole('button',{name:'Request departure'});
 expect(button).toBeEnabled();
 act(() => useSessionStore.getState().setSessionSnapshotFreshness('cache'));
 expect(button).toBeDisabled();expect(destination).toBeDisabled();
 fireEvent.click(button);expect(departure).not.toHaveBeenCalled();
 expect(screen.getByRole('status',{name:'Current airspace clearance'})).toHaveTextContent('Reconnect');
 const current=useSessionStore.getState().session!;
 act(() => {useSessionStore.getState().setSession({...current,turnPhase:{...current.turnPhase!,airspace:{state:'restricted',tickerActive:true,pressAccess:false}}});
  useSessionStore.getState().setSessionSnapshotFreshness('server');});
 expect(button).toBeDisabled();expect(destination).toBeDisabled();
 expect(screen.getByRole('status',{name:'Current airspace clearance'})).toHaveTextContent('Airspace restricted');
 act(() => useSessionStore.getState().setSession(current));
 expect(button).toBeEnabled();expect(screen.getByRole('status',{name:'Current airspace clearance'})).toHaveTextContent('Airspace open');
});
it('keeps a mission-committed craft docked under otherwise open current airspace', () => {
 const current=useSessionStore.getState().session!;
 useSessionStore.getState().setSession({...current,playerDiscovery:{...current.playerDiscovery!,missionCommittedCraftIds:['starlight']}});
 render(<ShuttleControl control={control} />);
 const panel=screen.getByRole('region',{name:'Shuttle departure'});
 expect(within(panel).getByRole('combobox')).toBeDisabled();
 expect(screen.getByRole('status',{name:'Current airspace clearance'})).toHaveTextContent('committed to an away mission');
});

it('shows a consumed service recharge without inventing a withheld host or console name', () => {
 const current=useSessionStore.getState().session!,service={...control,shuttleId:'wobbly',ownerRoleId:'quellon-engineer'};
 useSessionStore.getState().setSession({...current,shuttleControl:{wobbly:service},
  shuttleDockings:[{shuttleId:'wobbly',shipId:'aegis',dockedAt:'now'}],
  serviceShuttleRecharges:{wobbly:{cycle:2,revision:1,redacted:true}}});
 render(<ShuttleControl control={service} />);
 const panel=screen.getByRole('region',{name:'Service shuttle recharge'});
 expect(within(panel).getByText('Recharge already used this cycle.')).toBeVisible();
 expect(within(panel).getByRole('combobox')).toBeDisabled();
 expect(panel).not.toHaveTextContent('Recharged undefined');
});
