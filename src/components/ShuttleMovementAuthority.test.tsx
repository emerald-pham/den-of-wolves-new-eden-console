import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import ShuttleControl from './ShuttleControl';
import {useSessionStore} from '@/store/useSessionStore';
const departure = vi.hoisted(() => vi.fn());
vi.mock('@/lib/firestore', () => ({
 subscribeConnectedPlayers: () => () => undefined,
 subscribeShuttleDeparture: (_session: unknown, _craft: unknown, onValue: (v: null) => void) => {onValue(null);return () => undefined;},
}));
vi.mock('@/lib/shuttleDepartureService', () => ({requestShuttleDeparture:departure,beginShuttleTransit:vi.fn(),
 completeShuttleArrival:vi.fn(),retargetShuttleTransit:vi.fn()}));
const control={shuttleId:'starlight',ownerRoleId:'wing-commander',ownerUid:'wing',holderUid:'wing',revision:0};
beforeEach(() => {
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
