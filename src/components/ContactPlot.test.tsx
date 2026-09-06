import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ContactPlot, {
  SPASM_MS,
} from './ContactPlot';
import {
  AMBIENT_CLASSIFICATION_MS,
  AMBIENT_CONTACT_INTERVAL_MS,
  AMBIENT_CONTACT_LIFETIME_MS,
  ambientClassification,
  ambientDradisOccurrence,
} from './ambientDradisContact';
import { CONTACT_SCAN_EVENT } from './sweep';
import { SCAN_FRESH_MS } from './sweep';

// The plot is a decorative background layer. It deliberately exposes no role,
// no accessible name and no meaningful text, so there is nothing to query it
// by except its own container -- the one case CLAUDE.md allows a class query.
const plotIn = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.contact-plot');
const contactsIn = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.contact-plot__contact'));
const ambientSession = {
  id: 'fleet-session',
  createdAt: '2026-01-01T00:00:00.000Z',
};

let listeners: ((event: MediaQueryListEvent) => void)[] = [];

beforeEach(() => {
  listeners = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: (_: string, handler: (event: MediaQueryListEvent) => void) =>
        listeners.push(handler),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'animate');
});

it('is decorative: hidden from assistive technology and unreachable by keyboard', () => {
  const { container } = render(<ContactPlot />);

  expect(plotIn(container)).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelectorAll('a, button, input, select, [tabindex]')).toHaveLength(0);
});

it('paints every track on its own bearing so contacts never stack on one another', () => {
  const { container } = render(<ContactPlot />);
  const bearings = contactsIn(container).map((contact) =>
    contact.style.getPropertyValue('--bearing'),
  );

  expect(bearings.length).toBeGreaterThan(4);
  expect(new Set(bearings).size).toBe(bearings.length);
  expect(bearings.every((bearing) => bearing.endsWith('deg'))).toBe(true);
});

it('places contacts through the volume of the sphere rather than on a single plane', () => {
  const { container } = render(<ContactPlot />);
  const contacts = contactsIn(container);

  // A sphere is only a sphere if the tracks have depth and height of their own:
  // every one sits inside the unit ball, and they do not all share an altitude.
  const heights = contacts.map((contact) => Number(contact.style.getPropertyValue('--y')));
  const depths = contacts.map((contact) => Number(contact.style.getPropertyValue('--z')));
  expect(new Set(heights).size).toBeGreaterThan(1);
  expect(new Set(depths).size).toBeGreaterThan(1);
  expect(depths.some((z) => z < 0)).toBe(true);
  expect(depths.some((z) => z > 0)).toBe(true);

  for (const contact of contacts) {
    const x = Number(contact.style.getPropertyValue('--x'));
    const y = Number(contact.style.getPropertyValue('--y'));
    const z = Number(contact.style.getPropertyValue('--z'));
    expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(1.0001);
  }
});

it('holds station until an intrusion, then floods with spoofed contacts', () => {
  const { container, rerender } = render(<ContactPlot />);
  const quiet = contactsIn(container).length;

  expect(plotIn(container)).toHaveAttribute('data-hostile', 'false');

  rerender(<ContactPlot hostile />);

  expect(plotIn(container)).toHaveAttribute('data-hostile', 'true');
  expect(contactsIn(container).length).toBeGreaterThan(quiet);
});

it('tracks a far-moving unknown every twenty minutes and drops it after two minutes', () => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-01-01T00:10:00.000Z');
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  const { container } = render(<ContactPlot contacts={[]} ambientSession={ambientSession} />);

  expect(container.querySelector("[data-ambient='true']")).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(AMBIENT_CONTACT_INTERVAL_MS / 2));

  const contact = container.querySelector<HTMLElement>("[data-ambient='true']");
  expect(contact).toHaveTextContent('UNKNOWN CONTACT');
  const start = ['--x', '--y', '--z'].map((property) =>
    Number(contact?.style.getPropertyValue(property)),
  );
  const end = ['--transit-x', '--transit-y', '--transit-z'].map((property) =>
    Number(contact?.style.getPropertyValue(property)),
  );
  expect(Math.hypot(...start as [number, number, number])).toBeGreaterThanOrEqual(0.86);
  expect(Math.hypot(...end as [number, number, number])).toBeGreaterThanOrEqual(0.86);
  expect(end).not.toEqual(start);
  expect(contact?.style.getPropertyValue('--transit-duration'))
    .toBe(`${AMBIENT_CONTACT_LIFETIME_MS}ms`);

  act(() => vi.advanceTimersByTime(AMBIENT_CONTACT_LIFETIME_MS - 1));
  expect(container.querySelector("[data-ambient='true']")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(container.querySelector("[data-ambient='true']")).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(
    AMBIENT_CONTACT_INTERVAL_MS - AMBIENT_CONTACT_LIFETIME_MS,
  ));
  expect(container.querySelector("[data-ambient='true']")).toBeInTheDocument();
});

it('classifies the passing unknown only when scanned after ninety seconds', () => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-01-01T00:10:00.000Z');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const { container } = render(<ContactPlot contacts={[]} ambientSession={ambientSession} />);
  act(() => vi.advanceTimersByTime(AMBIENT_CONTACT_INTERVAL_MS / 2));
  const contact = container.querySelector<HTMLElement>("[data-ambient='true']");
  if (!contact) throw new Error('Expected the passing unknown contact.');

  act(() => {
    vi.advanceTimersByTime(AMBIENT_CLASSIFICATION_MS - 1);
    contact.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, { bubbles: true }));
  });
  expect(contact).toHaveTextContent('UNKNOWN CONTACT');

  act(() => {
    vi.advanceTimersByTime(1);
    contact.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, { bubbles: true }));
  });
  const occurrence = ambientDradisOccurrence(ambientSession, Date.now());
  expect(contact).toHaveTextContent(occurrence?.classification ?? '');

  act(() => vi.advanceTimersByTime(
    AMBIENT_CONTACT_LIFETIME_MS - AMBIENT_CLASSIFICATION_MS,
  ));
  expect(container.querySelector("[data-ambient='true']")).not.toBeInTheDocument();
});

it('samples every possible name when an ambient contact is classified', () => {
  expect([0, 0.2, 0.4, 0.6, 0.8].map((sample) =>
    ambientClassification(() => sample),
  )).toEqual([
    'Asteroid',
    'Rock',
    "Your Mom's Big Butt",
    'Emerald Nebula Interference',
    'Metallic Asteroid',
  ]);
});

it('starts still when reduced motion is requested', () => {
  vi.mocked(matchMedia).mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);

  const { container } = render(<ContactPlot />);

  expect(plotIn(container)).toHaveAttribute('data-still', 'true');
});

it('stills a running plot when the reduced-motion preference arrives late', () => {
  const { container } = render(<ContactPlot />);
  expect(plotIn(container)).toHaveAttribute('data-still', 'false');

  act(() => {
    listeners.forEach((handler) => handler({ matches: true } as MediaQueryListEvent));
  });

  expect(plotIn(container)).toHaveAttribute('data-still', 'true');
});

it('keeps both sweep discs on the rig without an intrusion speed boost', () => {
  const { container } = render(<ContactPlot hostile />);
  const discs = container.querySelectorAll('.contact-plot__sweep');

  expect(discs).toHaveLength(2);
  expect(discs[1]).toHaveClass('contact-plot__sweep--polar');
  for (const disc of discs) {
    expect(disc.parentElement).toHaveClass('contact-plot__rig');
  }
});

it('separates a contact from the fault that shakes it', () => {
  const { container } = render(<ContactPlot />);

  // Canonical station, apparent scan drift, and break-up jitter are separate
  // layers, so neither display effect can rewrite the true coordinate.
  const apparent = contactsIn(container)[0]?.firstElementChild;
  expect(apparent).toHaveClass('contact-plot__apparent');
  expect(apparent?.firstElementChild).toHaveClass('contact-plot__jitter');
});

it('groups every return above the three-dimensional scan planes', () => {
  const { container } = render(<ContactPlot />);
  const layer = container.querySelector('.contact-plot__returns');

  expect(layer).toBeInTheDocument();
  expect(layer?.querySelectorAll('.contact-plot__contact')).toHaveLength(
    contactsIn(container).length,
  );
});

it('passes the spoofed tracks off as ordinary contacts until the hack ends, then calls them false', () => {
  vi.useFakeTimers();
  const { container, rerender } = render(<ContactPlot hostile />);

  // While the hack is running the board cannot tell them from real returns.
  expect(container.textContent ?? '').not.toMatch(/FALSE/);

  rerender(<ContactPlot />);

  expect(container.textContent ?? '').toMatch(/FALSE/);
});

it('anchors nearby contact names on different sides of their returns', () => {
  const contacts = [
    { tag: 'ALPHA', x: 0.08, y: 0.06, z: 0.2, color: 'white' },
    { tag: 'BETA', x: 0.1, y: 0.04, z: 0.24, color: 'white' },
  ];
  const { container } = render(<ContactPlot contacts={contacts} />);
  const anchors = contactsIn(container).map((contact) => contact.dataset.labelAnchor);

  expect(anchors.every(Boolean)).toBe(true);
  expect(new Set(anchors)).toHaveLength(2);
});

it('holds the hostile tracks on the board after an intrusion so they can break up, then drops them', () => {
  vi.useFakeTimers();
  const { container, rerender } = render(<ContactPlot hostile />);
  const during = contactsIn(container).length;

  // Nothing is breaking up while the intrusion is still on screen.
  expect(container.querySelectorAll("[data-departing='true']")).toHaveLength(0);

  rerender(<ContactPlot />);

  // Still on the board, and now going to pieces.
  expect(contactsIn(container)).toHaveLength(during);
  expect(container.querySelectorAll("[data-departing='true']").length).toBeGreaterThan(0);

  act(() => {
    vi.advanceTimersByTime(SPASM_MS);
  });

  expect(contactsIn(container).length).toBeLessThan(during);
});

it('clears the departure timer when it leaves the screen', () => {
  vi.useFakeTimers();
  const { rerender, unmount } = render(<ContactPlot hostile />);
  rerender(<ContactPlot />);

  unmount();

  expect(vi.getTimerCount()).toBe(0);
});

it('runs full-bleed by default but lets a route inset it instead', () => {
  // The board is never absent from a screen -- a route chooses how prominent it
  // is, never whether it is there.
  const { container, rerender } = render(<ContactPlot />);

  expect(plotIn(container)).toHaveAttribute('data-placement', 'field');
  expect(plotIn(container)?.style.getPropertyValue('--plot-size')).toBe('');

  rerender(<ContactPlot placement="inset" size="18rem" />);

  expect(plotIn(container)).toHaveAttribute('data-placement', 'inset');
  expect(plotIn(container)?.style.getPropertyValue('--plot-size')).toBe('18rem');
});

it('can become a compact shipboard widget without restarting its scan', () => {
  const { container, rerender } = render(<ContactPlot />);
  const originalRig = container.querySelector('.contact-plot__rig');

  rerender(<ContactPlot placement="widget" />);

  expect(plotIn(container)).toHaveAttribute('data-placement', 'widget');
  expect(container.querySelector('.contact-plot__rig')).toBe(originalRig);
});

it('carries no unrelated franchise-specific terminology', () => {
  const { container } = render(<ContactPlot hostile />);

  expect(container.textContent ?? '').not.toMatch(/colonial/i);
});

it('acquires and refreshes only when a rendered sweep crosses, including late-added contacts', () => {
  vi.useFakeTimers();
  let frame: FrameRequestCallback = () => undefined;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const painted: { element: Element; keyframes: Keyframe[] }[] = [];
  const cancel = vi.fn();
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: vi.fn(function (this: Element, keyframes: Keyframe[]) {
    painted.push({ element: this, keyframes });
    return { cancel } as unknown as Animation;
  }) });
  let normal = { x: 0, y: 0, z: 1 };
  vi.stubGlobal('DOMMatrixReadOnly', class {
    constructor(private value: string) {}
    inverse() { return this; }
    transformPoint(point: DOMPointInit) {
      return this.value === 'sweep' ? normal : point;
    }
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
    transform: element.classList.contains('contact-plot__sweep') ? 'sweep' : 'none',
    width: '200px', height: '200px', perspective: '300px', perspectiveOrigin: '100px 100px',
  }) as CSSStyleDeclaration);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return (this.classList.contains('contact-plot__apparent')
      ? { x: 150, y: 100, left: 150, top: 100, width: 0, height: 0 }
      : { x: 0, y: 0, left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
  });
  // The displayed position can differ from a full 3D projection because the
  // foreground return layer is flattened by CSS. Follow the actual anchor.
  const contact = { tag: 'AHEAD', x: 0.8, y: 0, z: 0, color: 'white' };
  const { container, rerender, unmount } = render(<ContactPlot contacts={[contact]} />);
  const apparent = () => container.querySelector<HTMLElement>('.contact-plot__apparent');
  act(() => frame(0));
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  normal = { x: 0.5, y: 0, z: 0.866 };
  act(() => frame(16));
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(32));
  expect(apparent()).toHaveAttribute('data-acquired', 'true');
  expect(apparent()?.parentElement).toHaveAttribute('data-scan-fresh', 'true');
  act(() => vi.advanceTimersByTime(SCAN_FRESH_MS - 1));
  expect(apparent()?.parentElement).toHaveAttribute('data-scan-fresh', 'true');
  act(() => vi.advanceTimersByTime(1));
  expect(apparent()?.parentElement).toHaveAttribute('data-scan-fresh', 'false');
  expect(painted.map(({ element }) => element.className)).toEqual(['contact-plot__blip', 'contact-plot__drop']);
  expect(painted[0]?.keyframes[0]?.transform).toBe('scale(2)');
  const fix = apparent()?.style.cssText;
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(48));
  expect(apparent()?.style.cssText).toBe(fix);
  rerender(<ContactPlot placement="widget" contacts={[contact, { ...contact, tag: 'NEW' }]} />);
  act(() => frame(64));
  expect(container.querySelectorAll('[data-acquired="true"]')).toHaveLength(1);
  normal = { x: 0, y: 0, z: 1 };
  act(() => frame(80));
  expect(container.querySelectorAll('[data-acquired="true"]')).toHaveLength(2);
  expect(apparent()?.style.cssText).toBe(fix);
  expect(painted[2]?.keyframes[0]?.transform).toBe('scale(1)');
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(96));
  expect(apparent()?.style.cssText).toBe(fix);
  // Keep sampling while both returns fade; expiry alone must never move one.
  for (let now = 112; now < 96 + SCAN_FRESH_MS; now += 16) {
    act(() => frame(now));
  }
  expect(apparent()?.style.cssText).toBe(fix);
  normal = { x: 0, y: 0, z: 1 };
  act(() => frame(96 + SCAN_FRESH_MS));
  expect(apparent()?.style.cssText).not.toBe(fix);
  unmount();
  expect(cancelAnimationFrame).toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});
