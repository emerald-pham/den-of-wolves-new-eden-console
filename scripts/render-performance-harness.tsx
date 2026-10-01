import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ContactPlot, { type PlotContact } from '@/components/ContactPlot';
import ShipPlot from '@/components/ShipPlot';
import AwayMissionDiscardPanel from '@/components/AwayMissionDiscardPanel';
import { useSessionStore } from '@/store/useSessionStore';
import { createAnimationSampler, installRenderClock, measureRenderUpdate } from './render-performance-clock';
import '@/index.css';
import '@/routes/arrival.css';
import '@/styles/starmap.css';

type Sample = { name: string; samples: number[]; workSamples?: number[]; labelLayoutReads?: number; labelLayoutReadSamples?: number[] };
type Harness = {
  measureDradis(iterations: number): Promise<Sample>;
  measureAttack(iterations: number): Promise<Sample>;
  measureMissionHands(iterations: number): Promise<Sample>;
  measureMobileFrames(frames: number): Promise<Sample>;
};

declare global { interface Window { __p637?: Harness; } }

const mount = document.getElementById('root');
if (!mount) throw new Error('P637 performance harness root is missing.');
const container = mount;
const root = createRoot(container);

const nativeFrame = window.requestAnimationFrame.bind(window);
const settle = (): Promise<void> => new Promise((resolve) => nativeFrame(() => nativeFrame(() => resolve())));
const contacts = (revision: number): PlotContact[] => Array.from({ length: 20 }, (_, index) => ({
  id: `contact-${index}`,
  tag: `CONTACT ${String(index + 1).padStart(2, '0')}`,
  x: Math.sin((index + revision) * 0.31) * 0.82,
  y: Math.cos((index + revision) * 0.23) * 0.72,
  z: Math.sin((index + revision) * 0.17) * 0.64,
  color: index % 3 === 0 ? '#ff6677' : '#79f7ff',
  combatRange: index % 3 === 0 ? 'short' : index % 3 === 1 ? 'medium' : 'long',
}));

async function renderSamples(
  name: string,
  iterations: number,
  render: (index: number) => void,
  afterSample?: () => void,
): Promise<Sample> {
  const samples: number[] = [];
  const workSamples: number[] = [];
  // Every surface starts from a fresh mount and the same clock. Native paint
  // waits remain in the budgeted interval; work-only cost is diagnostic.
  flushSync(() => root.render(null));
  const clock = installRenderClock(window);
  const sampleAnimations = createAnimationSampler();
  const animations = () => sampleAnimations(document.getAnimations(), clock.nowMs);
  const settleWork = async () => {
    animations();
    for (let frame = 0; frame < 2; frame += 1) {
      await Promise.resolve(); // Deliver mutation observers from the prior commit.
      flushSync(() => clock.stepFrame(() => animations()));
      animations(); // Include flares created by the production sweep callback.
      container.getBoundingClientRect(); // Flush the updated styles and geometry.
    }
    await Promise.resolve();
  };
  try {
    flushSync(() => render(0));
    await settleWork();
    await settle();
    for (let index = 0; index < iterations; index += 1) {
      const sample = await measureRenderUpdate(() => flushSync(() => render(index + 1)), settleWork, settle);
      samples.push(sample.totalMs);
      workSamples.push(sample.workMs);
      afterSample?.();
    }
    return { name, samples, workSamples };
  } finally {
    // Let production effects cancel their callbacks while this clock owns them.
    flushSync(() => root.render(null));
    clock.restore();
  }
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
  measureDradis: async (iterations) => {
    const getBounds = Element.prototype.getBoundingClientRect;
    const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    if (!offsetWidthDescriptor?.get) throw new Error('P637 could not instrument HTMLElement.offsetWidth.');
    let labelLayoutReads = 0;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (this.classList.contains('contact-plot__tag')) labelLayoutReads += 1;
      return getBounds.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      ...offsetWidthDescriptor,
      get: function (this: HTMLElement) {
        if (this.classList.contains('contact-plot__tag')) labelLayoutReads += 1;
        return offsetWidthDescriptor.get!.call(this);
      },
    });
    try {
      const labelLayoutReadSamples: number[] = [];
      let previousReads = 0;
      const sample = await renderSamples('dradisUpdate', iterations, (revision) => {
        root.render(<ContactPlot placement="inset" size="min(92vw, 760px)" contacts={contacts(revision)} centerLabel="AEGIS" />);
      }, () => {
        labelLayoutReadSamples.push(labelLayoutReads - previousReads);
        previousReads = labelLayoutReads;
      });
      return { ...sample, labelLayoutReads, labelLayoutReadSamples };
    } finally {
      Element.prototype.getBoundingClientRect = getBounds;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidthDescriptor);
    }
  },
  measureAttack: (iterations) => renderSamples('attackUpdate', iterations, (revision) => {
    root.render(<ShipPlot hostile={revision % 2 === 1} aboard viewerId="aegis" expanded={false} />);
  }),
  measureMissionHands: async (iterations) => {
    useSessionStore.getState().reset();
    return renderSamples('missionHandUpdate', iterations, (revision) => {
      seedMissionHands(revision);
      if (revision === 0) root.render(<AwayMissionDiscardPanel />);
    });
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
