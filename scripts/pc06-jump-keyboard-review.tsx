import { createRoot } from 'react-dom/client';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import JumpDriveConsole from '@/components/JumpDriveConsole';
import '@/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Local keyboard fixture requires #root.');
if (!Object.hasOwn(window, 'pc06KeyboardEvidence')) throw new Error('Run this fixture through its local mock-service harness.');
createRoot(root).render(
  <main className="gm-console" style={{ maxWidth: '64rem', margin: '0 auto', padding: '1rem' }}>
    <p>LOCAL KEYBOARD TEST // The harness replaces command transport with a mock. No production action or multiplayer proof.</p>
    <ConsoleAccessContext.Provider value={{ writable: true, roleId: 'aegis' }}>
      <JumpDriveConsole shipId="aegis" shipName="Aegis" currentCoordinate="0000" fuel={4}
        jumpCosts={[2, 3, 6]} charged damaged={false} upgraded={false} />
    </ConsoleAccessContext.Provider>
  </main>,
);
