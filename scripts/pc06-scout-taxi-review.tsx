import { createRoot } from 'react-dom/client';
import { useSessionStore } from '@/store/useSessionStore';
import ScoutTaxiCommunicationPanel from '@/components/ScoutTaxiCommunicationPanel';
import '@/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Local layout fixture requires #root.');
if (!Object.hasOwn(window, 'pc06CourierLayoutFixture')) throw new Error('Run through the local-only layout harness.');
useSessionStore.getState().setIdentity({ id: 'local-courier', name: 'Local fixture', joinCode: '0000', phase: 'active', currentTurn: 3,
  activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'], activeVesselIds: ['aegis', 'quellon', 'shepherd'],
  playerDiscovery: { groupId: 'fleet-2', shipId: 'quellon', knownCoordinates: ['1413'], knownSystems: {},
    pursuitDistance: 0, navigationLogs: [], revision: 2 },
  turnPhase: { turn: 3, teamPhaseEndsAt: '2020-01-01T00:00:00Z', openAirspaceEndsAt: '2099-01-01T00:00:00Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
  ownerUid: 'fixture-gm', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
{ uid: 'fixture-player', sessionId: 'local-courier', displayName: 'Operator', role: 'player', connected: true,
  fleetGroupId: 'fleet-2', assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer',
  joinedAt: '2026-01-01T00:00:00Z' });
useSessionStore.getState().setConnection('live');
useSessionStore.getState().setSessionSnapshotFreshness('server');
createRoot(root).render(<main className="gm-console" style={{ maxWidth: '64rem', margin: '0 auto', padding: '1rem' }}>
  <p>LOCAL LAYOUT FIXTURE // No production gameplay or multiplayer proof.</p>
  <ScoutTaxiCommunicationPanel shuttleId="hummingbird" control={{ shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer',
    ownerUid: 'fixture-player', holderUid: 'fixture-player', revision: 0 }} />
</main>);
