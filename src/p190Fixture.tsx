import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import DioneVipCards from '@/components/DioneVipCards';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import './index.css';

const session = {
  id: 'p190-fixture', name: 'P190 Visual Fixture', joinCode: 'P190', phase: 'active', ownerUid: 'u1',
  createdAt: '', updatedAt: '', currentTurn: 1, dioneEnabled: true,
  turnPhase: { airspace: { state: 'restricted' } },
  maintenanceCycles: { dione: { step: 5, revision: 2, results: {}, charges: ['vip-lounge'], refuelled: [] } },
  shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
} as unknown as GameSession;
const cycle = { step: 5, revision: 2, results: {}, charges: ['vip-lounge'], refuelled: [] };
const me = {
  uid: 'u1', sessionId: session.id, displayName: 'Fixture Engineer', role: 'player', seatId: null, joinedAt: '',
} as Player;

useSessionStore.setState({ session, me, connection: 'live' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConsoleAccessContext.Provider value={{ writable: true, roleId: 'dione-engineer' }}>
      <main className="maintenance-systems" aria-label="P190 Dione VIP visual fixture">
        <DioneVipCards cycle={cycle} damaged={false} />
      </main>
    </ConsoleAccessContext.Provider>
  </StrictMode>,
);
