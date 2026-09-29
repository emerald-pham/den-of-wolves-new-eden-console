import { createRoot } from 'react-dom/client';
import ContactPlot, { type PlotContact } from '@/components/ContactPlot';
import ShipPlot from '@/components/ShipPlot';
import { MotionPreferenceProvider, type MotionOverride } from '@/lib/motionPreference';
import '@/index.css';

type RenderMode = 'contact' | 'ship';
type HarnessApi = {
  setTag(tag: string): void;
  renderMode(mode: RenderMode): void;
};

declare global {
  interface Window { __dradisVisibility?: HarnessApi; }
}

const mount = document.getElementById('root');
if (!mount) throw new Error('DRADIS visibility harness root is missing.');
const root = createRoot(mount);
const query = new URLSearchParams(location.search);
const motion: MotionOverride = query.get('motion') === 'reduce' ? 'reduce' : 'full';
let mode: RenderMode = query.get('mode') === 'ship' ? 'ship' : 'contact';
let tag = 'CONTACT ALPHA';

const contacts = (): PlotContact[] => [{
  id: 'visibility-contact',
  tag,
  x: 0.28,
  y: 0.16,
  z: -0.22,
  color: '#79f7ff',
  combatRange: 'long',
  showCombatRange: false,
}];

function render(): void {
  root.render(
    <MotionPreferenceProvider safetyOverride={motion}>
      <main className="dradis-visibility-harness" data-motion={motion === 'reduce' ? 'reduce' : 'full'}>
        {mode === 'contact' ? (
          <ContactPlot
            placement="field"
            size="min(92vmin, 760px)"
            centerLabel="AEGIS"
            contacts={contacts()}
          />
        ) : (
          <ShipPlot
            hostile={false}
            aboard
            viewerId="aegis"
            activeVesselIds={['capybara', 'dione']}
            expanded
          />
        )}
      </main>
    </MotionPreferenceProvider>,
  );
}

window.__dradisVisibility = {
  setTag(nextTag) {
    tag = nextTag;
    mode = 'contact';
    render();
  },
  renderMode(nextMode) {
    mode = nextMode;
    render();
  },
};

// Keep the real production sweep observer and opacity rules, shortening only
// the rotating sweep period so the browser regression reaches a crossing fast.
const speed = document.createElement('style');
speed.textContent = '.dradis-visibility-harness .contact-plot { --plot-turn: 900ms !important; }';
document.head.append(speed);
render();
