import { createRoot } from 'react-dom/client';
import { ConsoleAccessContext } from '@/lib/consoleAccess';
import JumpDriveConsole from '@/components/JumpDriveConsole';
import JumpFailureAdjudicationPanel from '@/components/JumpFailureAdjudicationPanel';
import '@/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('PC05 jump review requires #root.');

createRoot(root).render(
  <main className="gm-console" style={{ maxWidth: '64rem', margin: '0 auto', padding: '1rem' }}>
    <ConsoleAccessContext.Provider value={{ writable: true, roleId: 'aegis' }}>
      <JumpDriveConsole
        shipId="aegis"
        shipName="AEGIS"
        currentCoordinate="0000"
        fuel={4}
        jumpCosts={[2, 3, 6]}
        charged={false}
        damaged={false}
        upgraded={false}
        pursuitValue={10}
      />
    </ConsoleAccessContext.Provider>
    <JumpFailureAdjudicationPanel active />
  </main>,
);
