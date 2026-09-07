import { useSessionStore } from '@/store/useSessionStore';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ContactPlot, {
  SPASM_MS,
} from './ContactPlot';
import {
  AMBIENT_CLASSIFICATION_MS,
  AMBIENT_CONTACT_LIFETIME_MS,
  ambientContactIntervalMs,
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

it('labels every return with its explicit combat range without changing its plotted coordinates', () => {
  const contacts = [
    { tag: 'TRK 01', x: 0.08, y: -0.04, z: 0.1, color: 'white', combatRange: 'short' as const },
    { tag: 'TRK 02', x: -0.84, y: 0.22, z: -0.31, color: 'white', combatRange: 'medium' as const },
    { tag: 'TRK 03', x: 0.31, y: 0.14, z: -0.62, color: 'white', combatRange: 'long' as const },
  ];
  const { container } = render(<ContactPlot contacts={contacts} />);

  expect(contactsIn(container).map((contact) => [
    contact.style.getPropertyValue('--x'),
    contact.style.getPropertyValue('--y'),
    contact.style.getPropertyValue('--z'),
  ])).toEqual([
    ['0.08', '-0.04', '0.1'],
    ['-0.84', '0.22', '-0.31'],
    ['0.31', '0.14', '-0.62'],
  ]);
  expect([...container.querySelectorAll('.contact-plot__range')].map((range) => range.textContent))
    .toEqual(['SHORT', 'MEDIUM', 'LONG']);
});

it('omits combat-range indicators for fleet ships and their shuttles only', () => {
  const contacts = [
    {
      tag: 'FLEET SHIP', x: 0.08, y: -0.04, z: 0.1, color: 'white',
      combatRange: 'short' as const, showCombatRange: false,
    },
    {
      tag: 'FLEET SHUTTLE', x: -0.2, y: 0.18, z: -0.31, color: 'white',
      combatRange: 'medium' as const, showCombatRange: false,
    },
    {
      tag: 'WOLF CONTACT', x: 0.31, y: 0.14, z: -0.62, color: 'white',
      combatRange: 'long' as const,
    },
    { tag: 'UNKNOWN CONTACT', x: -0.44, y: 0.03, z: 0.17, color: 'white' },
  ];
  const { container } = render(<ContactPlot contacts={contacts} />);

  expect(contactsIn(container).map((contact) => ({
    tag: contact.querySelector('.contact-plot__tag > span')?.textContent,
    range: contact.querySelector('.contact-plot__range')?.textContent,
  }))).toEqual([
    { tag: 'FLEET SHIP', range: undefined },
    { tag: 'FLEET SHUTTLE', range: undefined },
    { tag: 'WOLF CONTACT', range: 'LONG' },
    { tag: 'UNKNOWN CONTACT', range: 'SHORT' },
  ]);
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

it('tracks a far-moving unknown on the shared variable cadence and drops it after two minutes', () => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-01-01T00:10:00.000Z');
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  const { container } = render(<ContactPlot contacts={[]} ambientSession={ambientSession} />);
  const firstInterval = ambientContactIntervalMs(ambientSession.id, 1);
  const secondInterval = ambientContactIntervalMs(ambientSession.id, 2);

  expect(container.querySelector("[data-ambient='true']")).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(firstInterval - 10 * 60 * 1000));

  const contact = container.querySelector<HTMLElement>("[data-ambient='true']");
  expect(contact).toHaveTextContent('UNKNOWN CONTACT');
  expect(contact?.querySelector('.contact-plot__range')).not.toBeInTheDocument();
  expect(contact).toHaveAttribute('data-combat-range', 'LONG');
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
    secondInterval - AMBIENT_CONTACT_LIFETIME_MS,
  ));
  expect(container.querySelector("[data-ambient='true']")).toBeInTheDocument();
});

it('classifies the passing unknown only when scanned after ninety seconds', () => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-01-01T00:10:00.000Z');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const { container } = render(<ContactPlot contacts={[]} ambientSession={ambientSession} />);
  act(() => vi.advanceTimersByTime(
    ambientContactIntervalMs(ambientSession.id, 1) - 10 * 60 * 1000,
  ));
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

  // Canonical position, apparent scan fix, and break-up jitter are separate
  // layers, so neither display effect can rewrite spatial truth.
  const actual = contactsIn(container)[0]?.firstElementChild;
  expect(actual).toHaveClass('contact-plot__actual');
  expect(actual?.nextElementSibling).toHaveClass('contact-plot__apparent');
  expect(actual?.nextElementSibling?.firstElementChild).toHaveClass('contact-plot__jitter');
});

it('separates a moving contact true position from its sampled visible fix', () => {
  const moving = {
    tag: 'MOVING', x: -0.8, y: 0.1, z: 0.2, color: 'white',
    transit: {
      destination: { x: 0.7, y: -0.2, z: -0.3 },
      durationMs: 120_000,
      elapsedMs: 30_000,
    },
  };
  const { container } = render(<ContactPlot contacts={[moving]} />);
  const contact = contactsIn(container)[0];
  const actual = contact?.querySelector('.contact-plot__actual');
  const apparent = contact?.querySelector('.contact-plot__apparent');

  expect(actual).toBeInTheDocument();
  expect(apparent).toBeInTheDocument();
  expect(actual?.parentElement).toBe(contact);
  expect(apparent?.parentElement).toBe(contact);
  expect(actual).not.toContainElement(apparent as HTMLElement);
});

it('holds a moving return at its sampled fix while it stays on one side of a sweep, then refreshes on a later crossing', () => {
  vi.useFakeTimers();
  let frame: FrameRequestCallback = () => undefined;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation),
  });
  let normal = { x: 0, y: 1, z: 0 };
  let actualPosition = { x: 80, y: 10, z: 20 };
  vi.stubGlobal('DOMMatrixReadOnly', class {
    constructor(private value: string) {}
    inverse() { return this; }
    transformPoint(point: DOMPointInit) {
      if (this.value === 'sweep') return normal;
      if (this.value === 'actual') return actualPosition;
      return point;
    }
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
    transform: element.classList.contains('contact-plot__sweep')
      ? 'sweep'
      : element.classList.contains('contact-plot__actual') ? 'actual' : 'none',
    width: '200px', height: '200px', perspective: '300px', perspectiveOrigin: '100px 100px',
  }) as CSSStyleDeclaration);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return (this.classList.contains('contact-plot__actual')
      ? { x: 150, y: 100, left: 150, top: 100, width: 0, height: 0 }
      : { x: 0, y: 0, left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
  });
  const moving = {
    tag: 'MOVING', x: -0.8, y: 0.1, z: 0.2, color: 'white',
    transit: {
      destination: { x: 0.7, y: -0.2, z: -0.3 },
      durationMs: 120_000,
      elapsedMs: 30_000,
    },
  };
  const { container, unmount } = render(<ContactPlot contacts={[moving]} />);
  const apparent = container.querySelector<HTMLElement>('.contact-plot__apparent');

  act(() => frame(0));
  normal = { x: 0, y: -1, z: 0 };
  act(() => frame(16));
  const firstFix = apparent?.style.cssText;
  expect(firstFix).toContain('--fix-x: 0.8');
  expect(firstFix).toContain('--fix-y: 0.1');
  expect(firstFix).toContain('--fix-z: 0.2');

  actualPosition = { x: 40, y: 30, z: 60 };
  act(() => frame(32));
  expect(apparent?.style.cssText).toBe(firstFix);

  normal = { x: 0, y: 1, z: 0 };
  act(() => frame(48));
  act(() => frame(64));
  expect(apparent?.style.cssText).toContain('--fix-x: 0.4');
  expect(apparent?.style.cssText).toContain('--fix-y: 0.3');
  expect(apparent?.style.cssText).toContain('--fix-z: 0.6');
  unmount();
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
  // The foreground return layer is a display-only projection. Acquisition
  // follows the contact's canonical position in the rig's 3D coordinate space.
  const contact = { tag: 'AHEAD', x: 0.8, y: 0, z: 0.2, color: 'white' };
  const { container, rerender, unmount } = render(<ContactPlot contacts={[contact]} />);
  const apparent = () => container.querySelector<HTMLElement>('.contact-plot__apparent');
  const findMany = vi.spyOn(plotIn(container)!, 'querySelectorAll');
  const firstContact = contactsIn(container)[0]!;
  const findParts = vi.spyOn(firstContact, 'querySelector');
  act(() => frame(0));
  findMany.mockClear();
  findParts.mockClear();
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  normal = { x: 1, y: 0, z: 0 };
  act(() => frame(16));
  // Stable tracks reuse their DOM handles instead of allocating query results
  // on every animation frame. Sweep matrices are still sampled at full frame rate.
  expect(findMany).not.toHaveBeenCalled();
  expect(findParts).not.toHaveBeenCalled();
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  normal = { x: 0, y: 0, z: -1 };
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
  expect(container.querySelectorAll('[data-acquired="true"]')).toHaveLength(1);
  expect(apparent()?.style.cssText).toBe(fix);
  expect(painted[2]?.keyframes[0]?.transform).toBe('scale(1)');
  normal = { x: 0, y: 0, z: -1 };
  act(() => frame(96));
  expect(container.querySelectorAll('[data-acquired="true"]')).toHaveLength(2);
  expect(apparent()?.style.cssText).toBe(fix);
  normal = { x: 0, y: 0, z: -1 };
  act(() => frame(112));
  expect(apparent()?.style.cssText).toBe(fix);
  // Keep sampling while both returns fade; expiry alone must never move one.
  for (let now = 128; now < 96 + SCAN_FRESH_MS; now += 16) {
    act(() => frame(now));
  }
  expect(apparent()?.style.cssText).toBe(fix);
  normal = { x: 0, y: 0, z: 1 };
  act(() => frame(96 + SCAN_FRESH_MS + 1));
  expect(apparent()?.style.cssText).not.toBe(fix);
  // Removing tracks must also release their cached handles, animations and timers.
  rerender(<ContactPlot contacts={[]} />);
  cancel.mockClear();
  act(() => frame(112 + SCAN_FRESH_MS));
  expect(cancel).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(0);
  rerender(<ContactPlot contacts={[contact]} />);
  act(() => frame(128 + SCAN_FRESH_MS));
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  unmount();
  expect(cancelAnimationFrame).toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});

it('acquires a target when the sweep crosses its true 3D position, not its 2D projection', () => {
  let frame: FrameRequestCallback = () => undefined;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation),
  });
  let normal = { x: 0, y: 1, z: 0 };
  vi.stubGlobal('DOMMatrixReadOnly', class {
    constructor(private value: string) {}
    inverse() { return this; }
    transformPoint(point: DOMPointInit) {
      if (this.value === 'sweep') return normal;
      if (this.value === 'actual') return { x: 50, y: 60, z: 40, w: 1 };
      return point;
    }
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
    transform: element.classList.contains('contact-plot__sweep')
      ? 'sweep'
      : element.classList.contains('contact-plot__actual') ? 'actual' : 'none',
    width: '200px', height: '200px', perspective: '300px', perspectiveOrigin: '100px 100px',
  }) as CSSStyleDeclaration);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return (this.classList.contains('contact-plot__actual')
      ? { x: 120, y: 120, left: 120, top: 120, width: 0, height: 0 }
      : { x: 0, y: 0, left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
  });

  const moving = {
    tag: '3D TARGET', x: 0.5, y: 0.6, z: 0.4, color: 'white',
    transit: {
      destination: { x: -0.2, y: 0.3, z: -0.5 },
      durationMs: 120_000,
      elapsedMs: 10_000,
    },
  };
  const { container, unmount } = render(<ContactPlot contacts={[moving]} />);
  const apparent = container.querySelector<HTMLElement>('.contact-plot__apparent');

  act(() => frame(0));
  expect(apparent).not.toHaveAttribute('data-acquired', 'true');
  normal = { x: 0, y: -1, z: 0 };
  act(() => frame(16));

  expect(apparent).toHaveAttribute('data-acquired', 'true');
  expect(apparent?.style.cssText).toContain('--fix-x: 0.5');
  expect(apparent?.style.cssText).toContain('--fix-y: 0.6');
  expect(apparent?.style.cssText).toContain('--fix-z: 0.4');
  unmount();
});

it('uses canonical 3D coordinates without projecting contacts through viewport layout', () => {
  let frame: FrameRequestCallback = () => undefined;
  let normal = { x: 0, y: 0, z: 1 };
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
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
  const bounds = vi.spyOn(Element.prototype, 'getBoundingClientRect');

  const { container } = render(
    <ContactPlot contacts={[{ tag: 'AHEAD', x: 0.2, y: 0, z: 0.6, color: 'white' }]} />,
  );

  act(() => frame(0));
  normal = { x: 0, y: 0, z: -1 };
  act(() => frame(16));

  expect(bounds).not.toHaveBeenCalled();
  expect(container.querySelector('.contact-plot__apparent')).toHaveAttribute(
    'data-acquired',
    'true',
  );
});

it('uses the rendered sweep-disc radius instead of a fixed logical radius', () => {
  let frame: FrameRequestCallback = () => undefined;
  let normal = { x: 0.8, y: 0, z: 0.6 };
  let sweepDiameter = 100;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('DOMMatrixReadOnly', class {
    constructor(private value: string) {}
    transformPoint(point: DOMPointInit) {
      return this.value === 'sweep' ? normal : point;
    }
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const sweep = element.classList.contains('contact-plot__sweep');
    const rig = element.classList.contains('contact-plot__rig');
    const size = rig ? 200 : sweep ? sweepDiameter : 0;
    return {
      transform: sweep ? 'sweep' : 'none',
      width: `${size}px`,
      height: `${size}px`,
      boxSizing: 'border-box',
      borderLeftWidth: '0px',
      borderRightWidth: '0px',
      borderTopWidth: '0px',
      borderBottomWidth: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
      paddingTop: '0px',
      paddingBottom: '0px',
    } as CSSStyleDeclaration;
  });

  const { container } = render(
    <ContactPlot contacts={[{ tag: 'EDGE', x: 0.1, y: 0.75, z: 0, color: 'white' }]} />,
  );
  const apparent = container.querySelector<HTMLElement>('.contact-plot__apparent');

  act(() => frame(0));
  normal = { x: -0.8, y: 0, z: 0.6 };
  act(() => frame(16));
  expect(apparent).not.toHaveAttribute('data-acquired', 'true');

  sweepDiameter = 200;
  act(() => frame(32));
  normal = { x: 0.8, y: 0, z: 0.6 };
  act(() => frame(48));
  expect(apparent).toHaveAttribute('data-acquired', 'true');
});

it('shows a bottom-left warning for active fleet alerts and clears it on stand-down', () => {
  useSessionStore.setState({ session: { id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '', fleetRedAlert: { active: true, revision: 1 } } });
  const { container } = render(<ContactPlot placement="widget" />);
  expect(container.querySelector('.contact-plot__red-alert')).toHaveTextContent('RED ALERT');
  act(() => useSessionStore.setState({ session: null }));
  expect(container.querySelector('.contact-plot__red-alert')).toBeNull();
});
