import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BoardingSecurityTeamPanel from './components/BoardingSecurityTeamPanel';
import type { BoardingSecurityTeamLocationProjection } from './lib/boardingSecurityTeamService';
import './index.css';

const syntheticProjection: BoardingSecurityTeamLocationProjection = {
  status: 'ready',
  sessionId: 'local-preview-only',
  actorUid: 'synthetic-facilitator',
  gmInstanceId: 'synthetic-console',
  cycle: 4,
  ships: [
    { shipId: 'aegis', shipSecurityTeams: 4, boardingEligibleTeams: 6 },
    { shipId: 'dione', shipSecurityTeams: 1, boardingEligibleTeams: 2 },
  ],
  shuttles: [
    { shuttleId: 'pallas', securityTeams: 2, location: 'docked', currentHostShipId: 'aegis' },
    { shuttleId: 'philia', securityTeams: 1, location: 'undocked', currentHostShipId: null },
    { shuttleId: 'snn-press-shuttle', securityTeams: 1, location: 'docked', currentHostShipId: 'dione' },
  ],
  totals: {
    shipStoredSecurityTeams: 5,
    aboardDockedShuttleSecurityTeams: 3,
    boardingEligibleTotal: 8,
    shuttleCount: 3,
  },
};

export function SecurityLocationsPreview() {
  const [refreshCount, setRefreshCount] = useState(0);
  return (
    <main className="security-locations-preview">
      <h1>PC06 review // security team locations</h1>
      <p role="note" aria-label="Synthetic local-only review fixture">
        Synthetic local-only facilitator snapshot; no callable, Firestore write, or live game.
      </p>
      <p role="status" aria-label="Local preview status">
        Local preview refreshes: {refreshCount}
      </p>
      <BoardingSecurityTeamPanel
        eligible
        loadState="ready"
        projection={syntheticProjection}
        error={null}
        onRefresh={() => setRefreshCount((count) => count + 1)}
      />
    </main>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Preview root #root is missing from pc06-security-locations.html');

createRoot(container).render(
  <StrictMode>
    <SecurityLocationsPreview />
  </StrictMode>,
);
