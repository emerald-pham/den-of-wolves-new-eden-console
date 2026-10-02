import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import Voyage33MovementPanel from '../../src/components/Voyage33MovementPanel';

const motion = new URLSearchParams(location.search).get('motion') === 'reduced' ? 'reduce' : 'full';
document.documentElement.setAttribute('data-motion', motion);
document.body.setAttribute('data-motion', motion);

createRoot(document.getElementById('root')!).render(
  <main className="gm-console">
    <section className="gm-console__module cic-frame" aria-label="Voyage 33-0 movement workspace">
      <h2 className="gm-console__section-title">Voyage 33-0 // movement and host fuel</h2>
      <p className="gm-console__status">
        Server-authorized movement // location and host fuel readouts follow the current session projection.
      </p>
      <Voyage33MovementPanel
        admitted
        connection="live"
        phase="coordination"
        currentLocation={{ coordinate: '0000', label: 'New Eden' }}
        host={{ shipId: 'aegis', name: 'AEGIS', coordinate: '0000', fuel: 7, status: 'operational' }}
        dockableHosts={[]}
        legalDestinations={[{ coordinate: '5143', label: 'Hestia Approach', length: 'medium' }]}
        outcome={{ status: 'idle' }}
        onDock={() => undefined}
        onJump={() => undefined}
      />
    </section>
  </main>,
);
