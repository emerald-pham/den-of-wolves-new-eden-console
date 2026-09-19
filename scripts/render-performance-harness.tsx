import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ContactPlot, { type PlotContact } from '@/components/ContactPlot';
import ShipPlot from '@/components/ShipPlot';
import AwayMissionDiscardPanel from '@/components/AwayMissionDiscardPanel';
import { useSessionStore } from '@/store/useSessionStore';
import '@/index.css';
import '@/routes/arrival.css';
import '@/styles/starmap.css';

type Sample = { name: string; samples: number[] };
type Harness = {
  measureDradis(iterations: number): Promise<Sample>;
  measureAttack(iterations: number): Promise<Sample>;
  measureMissionHands(iterations: number): Promise<Sample>;
  measureMobileFrames(frames: number): Promise<Sample>;
};

declare global { interface Window { __p637?: Harness; } }

const container = document.getElementById('root');
if (!container) throw new Error('P637 performance harness root is missing.');
const root = createRoot(container);

const settle = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const contacts = (revision: number): PlotContact[] => Array.from({ length: 20 }, (_, index) => ({
  id: `contact-${index}`,
  tag: `CONTACT ${String(index + 1).padStart(2, '0')}`,
  x: Math.sin((index + revision) * 0.31) * 0.82,
  y: Math.cos((index + revision) * 0.23) * 0.72,
  z: Math.sin((index + revision) * 0.17) * 0.64,
  color: index % 3 === 0 ? '#ff6677' : '#79f7ff',
  combatRange: index % 3 === 0 ? 'short' : index % 3 === 1 ? 'medium' : 'long',
}));

async function renderSamples(name: string, iterations: number, render: (index: number) => void): Promise<Sample> {
  const samples: number[] = [];
  render(0);
  await settle();
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    flushSync(() => render(index + 1));
    await settle();
    samples.push(performance.now() - started);
  }
  return { name, samples };
}

function seedMissionHands(revision: number): void {
  const store = useSessionStore.getState();
  store.setSession({ id: 'p637', setupRevision: revision } as never);
  store.setMe({ uid: 'p637-player', sessionId: 'p637', role: 'player' } as never);
  store.setAwayMissionHandPointers(Array.from({ length: 8 }, (_, index) => ({
    sessionId: 'p637', participantUid: 'p637-player', missionId: `mission-${index}`,
    handId: `hand-${index}`, phase: 'discarding' as const, revision, discarded: false,
  })));
  store.setAwayMissionHands(Array.from({ length: 8 }, (_, index) => ({
    sessionId: 'p637', participantUid: 'p637-player', missionId: `mission-${index}`,
    handId: `hand-${index}`, cardId: `${(index + revision) % 10 + 1}♥`, rank: String((index + revision) % 10 + 1),
    suit: 'hearts' as const, value: (index + revision) % 10 + 1, discarded: false,
  })));
}

window.__p637 = {
  measureDradis: (iterations) => renderSamples('dradisUpdate', iterations, (revision) => {
    root.render(<ContactPlot placement="inset" size="min(92vw, 760px)" contacts={contacts(revision)} centerLabel="AEGIS" />);
  }),
  measureAttack: (iterations) => renderSamples('attackUpdate', iterations, (revision) => {
    root.render(<ShipPlot hostile={revision % 2 === 1} aboard viewerId="aegis" expanded={false} />);
  }),
  measureMissionHands: async (iterations) => {
    useSessionStore.getState().reset();
    seedMissionHands(0);
    flushSync(() => root.render(<AwayMissionDiscardPanel />));
    await settle();
    const samples: number[] = [];
    for (let revision = 1; revision <= iterations; revision += 1) {
      const started = performance.now();
      flushSync(() => seedMissionHands(revision));
      await settle();
      samples.push(performance.now() - started);
    }
    return { name: 'missionHandUpdate', samples };
  },
  measureMobileFrames: async (frames) => {
    root.render(<ContactPlot placement="inset" size="min(92vw, 760px)" contacts={contacts(0)} centerLabel="AEGIS" />);
    await settle();
    const samples: number[] = [];
    let previous = performance.now();
    for (let index = 0; index < frames; index += 1) {
      // Include one representative 20-contact production update in every
      // sampled frame. The interval therefore covers React work, layout and
      // the browser's next paint opportunity rather than idle vsync cadence.
      flushSync(() => root.render(
        <ContactPlot
          placement="inset"
          size="min(92vw, 760px)"
          contacts={contacts(index + 1)}
          centerLabel="AEGIS"
          hostile={index % 12 < 6}
        />,
      ));
      await new Promise<void>((resolve) => requestAnimationFrame((now) => {
        samples.push(now - previous);
        previous = now;
        resolve();
      }));
    }
    return { name: 'mobileFrame', samples };
  },
};

document.documentElement.dataset.ready = 'true';
