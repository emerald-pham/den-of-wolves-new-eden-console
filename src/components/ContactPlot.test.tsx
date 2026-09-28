import { useSessionStore } from '@/store/useSessionStore';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
import { setMotionOverride } from '@/lib/motionPreference';

// Plot geometry and the visible alert flag are decorative. Its semantic alert
// counterpart stays outside the aria-hidden geometry subtree.
const plotIn = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.contact-plot');
const contactsIn = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.contact-plot__contact'));
const ambientSession = {
  id: 'fleet-session',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const alertSession = (id: string, active: boolean, revision: number) => ({
  id,
  name: 'Fleet',
  joinCode: '1234',
  phase: 'active' as const,
  ownerUid: 'u1',
  createdAt: '',
  updatedAt: '',
  fleetRedAlert: { active, revision },
});

let listeners: ((event: MediaQueryListEvent) => void)[] = [];

beforeEach(() => {
  useSessionStore.setState({ session: null });
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
  setMotionOverride('system');
});

it('hides decorative plot geometry from assistive technology and keyboard navigation', () => {
  const { container } = render(<ContactPlot />);

  expect(plotIn(container)?.querySelector('.contact-plot__rig')).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelectorAll('a, button, input, select, [tabindex]')).toHaveLength(0);
  expect(screen.queryByRole('status')).toBeNull();
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

it('places every non-fleet combat band directly beneath its contact name', () => {
  const contacts = [
    { tag: 'LONG CONTACT', x: 0.8, y: 0, z: 0, color: 'white', combatRange: 'long' as const },
    { tag: 'MEDIUM CONTACT', x: 0.4, y: 0, z: 0, color: 'white', combatRange: 'medium' as const },
    { tag: 'SHORT CONTACT', x: 0.1, y: 0, z: 0, color: 'white', combatRange: 'short' as const },
  ];
  const { container } = render(<ContactPlot contacts={contacts} />);

  expect(contactsIn(container).map((contact) => ({
    name: contact.querySelector('.contact-plot__tag > span:first-child')?.textContent,
    range: contact.querySelector('.contact-plot__tag > .contact-plot__range')?.textContent,
  }))).toEqual([
    { name: 'LONG CONTACT', range: 'LONG' },
    { name: 'MEDIUM CONTACT', range: 'MEDIUM' },
    { name: 'SHORT CONTACT', range: 'SHORT' },
  ]);
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
  expect(contact?.querySelector('.contact-plot__range')).toHaveTextContent('LONG');
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

it('recalculates an unknown contact range from the viewing ship origin', () => {
  vi.useFakeTimers();
  const now = Date.parse(ambientSession.createdAt) + ambientContactIntervalMs(ambientSession.id, 1);
  vi.setSystemTime(now);
  const occurrence = ambientDradisOccurrence(ambientSession, now);
  if (!occurrence) throw new Error('Expected the ambient contact to be active.');

  const { container, rerender } = render(
    <ContactPlot contacts={[]} ambientSession={ambientSession} origin={{ x: 0, y: 0, z: 0 }} />,
  );
  const contact = () => container.querySelector<HTMLElement>("[data-ambient='true']");
  expect(contact()).toHaveAttribute('data-combat-range', 'LONG');

  rerender(
    <ContactPlot
      contacts={[]}
      ambientSession={ambientSession}
      origin={occurrence.start}
    />,
  );

  expect(contact()).toHaveAttribute('data-combat-range', 'SHORT');
  expect(contact()?.querySelector('.contact-plot__range')).toHaveTextContent('SHORT');
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

it('does not advance ambient contact position on a reduced-motion clock tick', () => {
  vi.useFakeTimers();
  vi.setSystemTime(
    Date.parse(ambientSession.createdAt) + ambientContactIntervalMs(ambientSession.id, 1),
  );
  setMotionOverride('reduce');
  const { container } = render(<ContactPlot contacts={[]} ambientSession={ambientSession} />);
  const contact = container.querySelector<HTMLElement>("[data-ambient='true']");
  if (!contact) throw new Error('Expected the ambient contact to be active.');
  const initial = ['--x', '--y', '--z'].map((property) =>
    contact.style.getPropertyValue(property),
  );

  act(() => vi.advanceTimersByTime(10_000));

  expect(container.querySelector("[data-ambient='true']")).toBe(contact);
  expect(['--x', '--y', '--z'].map((property) =>
    contact.style.getPropertyValue(property),
  )).toEqual(initial);

  act(() => vi.advanceTimersByTime(AMBIENT_CONTACT_LIFETIME_MS - 10_000));
  expect(container.querySelector("[data-ambient='true']")).not.toBeInTheDocument();
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

it('holds a moving return at its sampled fix until another sweep crosses its true position', () => {
  vi.useFakeTimers();
  let frame: FrameRequestCallback = () => undefined;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const painted: { element: Element; keyframes: Keyframe[] }[] = [];
  const firstSizeCancel = vi.fn();
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: vi.fn(function (this: Element, keyframes: Keyframe[]) {
      painted.push({ element: this, keyframes });
      return { cancel: keyframes[0]?.transform === 'scale(2)' ? firstSizeCancel : vi.fn() } as unknown as Animation;
    }),
  });
  let normal = { x: 0, y: 0, z: 1 };
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
  const pinged = vi.fn();
  plotIn(container)?.addEventListener(CONTACT_SCAN_EVENT, pinged);

  act(() => frame(0));
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(16));
  const firstFix = apparent?.style.cssText;
  expect(firstFix).toContain('--fix-x: 0.8');
  expect(firstFix).toContain('--fix-y: 0.1');
  expect(firstFix).toContain('--fix-z: 0.2');
  expect(pinged).toHaveBeenCalledTimes(1);
  expect(painted).toHaveLength(3);
  expect(painted[0]?.keyframes[0]?.transform).toBe('scale(2)');

  actualPosition = { x: 40, y: -30, z: 60 };
  act(() => frame(32));
  expect(apparent?.style.cssText).toBe(firstFix);

  normal = { x: 0, y: 0, z: 1 };
  act(() => frame(48));
  expect(apparent?.style.cssText).toBe(firstFix);
  expect(pinged).toHaveBeenCalledTimes(2);
  expect(painted).toHaveLength(5);
  expect(firstSizeCancel).not.toHaveBeenCalled();
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(64));
  // A recent repeat still confirms and brightens the contact, while the
  // original size animation keeps its own deadline and is not restarted.
  expect(apparent?.style.cssText).toBe(firstFix);
  expect(pinged).toHaveBeenCalledTimes(3);
  expect(painted).toHaveLength(7);
  expect(painted[5]?.keyframes[0]).toMatchObject({ opacity: 1 });
  expect(firstSizeCancel).not.toHaveBeenCalled();

  // Once the contact has not been pinged for the fresh-return window, the
  // next crossing may sample its current true position again.
  normal = { x: 0, y: 0, z: 1 };
  act(() => frame(64 + SCAN_FRESH_MS));
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(64 + SCAN_FRESH_MS + 16));
  expect(apparent?.style.cssText).toContain('--fix-x: 0.4');
  expect(apparent?.style.cssText).toContain('--fix-y: -0.3');
  expect(apparent?.style.cssText).toContain('--fix-z: 0.6');
  expect(pinged).toHaveBeenCalledTimes(4);
  expect(painted).toHaveLength(9);
  expect(painted[7]?.keyframes[0]).toMatchObject({ opacity: 1 });
  expect(painted.filter(({ keyframes }) => keyframes[0]?.transform === 'scale(2)')).toHaveLength(1);
  unmount();
  expect(firstSizeCancel).toHaveBeenCalledOnce();
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

it('keeps complete long edge names readable with intrinsic-width labels', () => {
  const css = readFileSync('src/styles/plot.css', 'utf8');
  expect(css).toMatch(/\.contact-plot__tag\s*\{[^}]*width:\s*max-content/s);
  expect(css).toMatch(/\.contact-plot__tag\s*\{[^}]*white-space:\s*nowrap/s);
  expect(css).not.toMatch(/\.contact-plot__tag\s*\{[^}]*overflow-wrap:/s);

  const edgeContacts = [
    { tag: 'REFINERY 124 PDF COLONEL LONG FLEET NAME', x: 0.99, y: 0.01, z: 0, color: 'white' },
    { tag: 'SNN INDEPENDENT PRESS SHUTTLE LONG NAME', x: -0.99, y: -0.01, z: 0, color: 'white' },
  ];
  const { container } = render(<ContactPlot contacts={edgeContacts} />);
  expect(contactsIn(container)).toHaveLength(2);
  expect([...container.querySelectorAll('.contact-plot__tag')].map((tag) => tag.textContent))
    .toEqual(expect.arrayContaining(edgeContacts.map(({ tag }) => `${tag}SHORT`)));
});

it.each([
  { width: 1440, height: 900, placement: 'field' as const, reduced: false },
  { width: 320, height: 844, placement: 'widget' as const, reduced: true },
  { width: 844, height: 390, placement: 'inset' as const, reduced: false },
  { width: 1440, height: 900, placement: 'widget' as const, reduced: true },
])('clamps long canonical labels inward on both axes at $width x $height ($placement, reduced=$reduced)', ({
  width,
  height,
  placement,
  reduced,
}) => {
  vi.mocked(matchMedia).mockReturnValue({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  const edgeContacts = [
    {
      tag: 'REFINERY 124 PDF COLONEL LONG FLEET NAME',
      x: 0.99, y: -0.99, z: 0, color: 'white',
    },
    {
      tag: 'SNN INDEPENDENT PRESS SHUTTLE LONG NAME',
      x: 0.99, y: 0.99, z: 0, color: 'white',
    },
    {
      tag: 'DIONE LONG-RANGE SURVEYOR CONTACT',
      x: -0.99, y: 0.99, z: 0, color: 'white',
    },
    {
      tag: 'CAPYBARA CONVOY COMMAND CONTACT',
      x: -0.99, y: -0.99, z: 0, color: 'white',
    },
  ];
  const baseRects = [
    { left: width - 4, right: width + 220, top: -100, bottom: -80 },
    { left: width - 4, right: width + 220, top: height - 20, bottom: height + 10 },
    { left: -220, right: 4, top: height - 20, bottom: height + 10 },
    { left: -220, right: 4, top: -100, bottom: -80 },
  ];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) {
      return { left: 0, top: 0, right: width, bottom: height, width, height } as DOMRect;
    }
    if (this.classList.contains('contact-plot__tag')) {
      const index = [...document.querySelectorAll<HTMLElement>('.contact-plot__tag')].indexOf(this as HTMLElement);
      const base = baseRects[index] ?? baseRects[0]!;
      const offsetX = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-x')) || 0;
      const offsetY = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-y')) || 0;
      return {
        left: base.left + offsetX,
        right: base.right + offsetX,
        top: base.top + offsetY,
        bottom: base.bottom + offsetY,
        width: base.right - base.left,
        height: base.bottom - base.top,
      } as DOMRect;
    }
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  });

  const { container, unmount } = render(
    <ContactPlot placement={placement} contacts={edgeContacts} />,
  );
  const plot = plotIn(container);
  expect(plot).toHaveAttribute('data-still', String(reduced));
  const labels = [...container.querySelectorAll<HTMLElement>('.contact-plot__tag')];
  expect(labels).toHaveLength(edgeContacts.length);
  expect([...container.querySelectorAll<HTMLElement>('.contact-plot__contact')]
    .map((contact) => contact.dataset.labelAnchor))
    .toEqual(['north-east', 'south-east', 'south-west', 'north-west']);

  for (const [index, label] of labels.entries()) {
    const rect = label.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(width);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(height);
    expect(label.style.getPropertyValue('--label-clamp-x')).not.toBe('');
    expect(label.style.getPropertyValue('--label-clamp-y')).not.toBe('');
    expect(label).toHaveTextContent(edgeContacts[index]!.tag);
  }
  unmount();
});

it('keeps clustered contact names separate from each other and the plot origin after a scan', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const baseRects = [
    bounds(100, 100, 70, 18),
    bounds(124, 105, 72, 18),
    bounds(144, 108, 74, 18),
  ];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('contact-plot__origin')) return bounds(132, 100, 54, 20);
    if (this.classList.contains('contact-plot__tag')) {
      const index = [...document.querySelectorAll<HTMLElement>('.contact-plot__tag')].indexOf(this as HTMLElement);
      const base = baseRects[index] ?? baseRects[0]!;
      const offsetX = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-x')) || 0;
      const offsetY = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(base.left + offsetX, base.top + offsetY, base.width, base.height);
    }
    return bounds(0, 0, 0, 0);
  });
  const contacts = [
    { tag: 'ICEBREAKER', x: 0.12, y: 0.03, z: 0.3, color: 'white' },
    { tag: 'QUELLON', x: 0.11, y: 0.04, z: 0.3, color: 'white' },
    { tag: 'REFINERY 124', x: 0.13, y: 0.02, z: 0.3, color: 'white' },
  ];
  const { container } = render(<ContactPlot contacts={contacts} centerLabel="AEGIS" />);
  const labels = [...container.querySelectorAll<HTMLElement>('.contact-plot__tag')];
  const origin = container.querySelector<HTMLElement>('.contact-plot__origin')!;
  const overlaps = (a: DOMRect, b: DOMRect) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const expectReadable = () => {
    const rectangles = labels.map((label) => label.getBoundingClientRect());
    for (const [index, rectangle] of rectangles.entries()) {
      expect(rectangle.left).toBeGreaterThanOrEqual(8);
      expect(rectangle.right).toBeLessThanOrEqual(312);
      expect(rectangle.top).toBeGreaterThanOrEqual(8);
      expect(rectangle.bottom).toBeLessThanOrEqual(232);
      expect(overlaps(rectangle, origin.getBoundingClientRect())).toBe(false);
      for (const other of rectangles.slice(index + 1)) expect(overlaps(rectangle, other)).toBe(false);
      expect(labels[index]).toHaveTextContent(contacts[index]!.tag);
    }
  };
  expectReadable();

  baseRects[2] = bounds(110, 102, 74, 18);
  act(() => container.querySelector('.contact-plot')?.dispatchEvent(
    new CustomEvent(CONTACT_SCAN_EVENT, { bubbles: true }),
  ));
  expectReadable();
});

it('gives the plot origin text a measurable box so contact names can avoid it', () => {
  const css = readFileSync('src/styles/plot.css', 'utf8');
  const originRule = css.match(/\.contact-plot__origin\s*\{([^}]*)\}/s)?.[1];
  expect(originRule).toMatch(/width:\s*max-content/);
  expect(originRule).toMatch(/height:\s*auto/);
});

it('keeps a contact name clear of the compact DRADIS controls', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('ship-plot__toggle')) return bounds(245, 188, 60, 30);
    if (this.classList.contains('contact-plot__tag')) {
      const x = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(240 + x, 190 + y, 70, 20);
    }
    return bounds(0, 0, 0, 0);
  });

  const { container } = render(<div className="ship-plot">
    <ContactPlot contacts={[{ tag: 'REFINERY 124', x: 0.2, y: 0.1, z: 0, color: 'white' }]} />
    <button className="ship-plot__toggle" type="button">Zoom</button>
  </div>);
  const label = container.querySelector<HTMLElement>('.contact-plot__tag')!;
  const zoom = container.querySelector<HTMLElement>('.ship-plot__toggle')!;
  const labelRect = label.getBoundingClientRect();
  const controlRect = zoom.getBoundingClientRect();
  expect(labelRect.right <= controlRect.left || labelRect.left >= controlRect.right ||
    labelRect.bottom <= controlRect.top || labelRect.top >= controlRect.bottom).toBe(true);
});

it('keeps a name beside its return and chooses the side farthest from other contact marks on each scan', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const markers = [{ x: 150, y: 100 }, { x: 100, y: 75 }, { x: 100, y: 125 }];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    const contact = this.closest('.contact-plot__contact');
    const index = [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact!);
    const marker = markers[index];
    if (!marker) return bounds(0, 0, 0, 0);
    if (this.classList.contains('contact-plot__blip')) return bounds(marker.x, marker.y, 8, 8);
    if (this.classList.contains('contact-plot__tag')) {
      const width = index === 0 ? 70 : 45;
      const height = 18;
      const anchor = contact?.getAttribute('data-label-anchor') ?? 'north-east';
      const left = anchor.endsWith('east') ? marker.x - 11 - width : marker.x + 8 + 11;
      const top = anchor.startsWith('north') ? marker.y - 8 - height : marker.y + 8 + 8;
      const x = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(left + x, top + y, width, height);
    }
    return bounds(0, 0, 0, 0);
  });
  const { container } = render(<ContactPlot contacts={[
    { tag: 'LEAD', x: 0.1, y: 0.1, z: 0, color: 'white' },
    { tag: 'PORT ABOVE', x: -0.1, y: 0.1, z: 0, color: 'white' },
    { tag: 'PORT BELOW', x: -0.1, y: -0.1, z: 0, color: 'white' },
  ]} />);
  const lead = container.querySelector<HTMLElement>('.contact-plot__contact')!;
  const tag = lead.querySelector<HTMLElement>('.contact-plot__tag')!;
  const blip = lead.querySelector<HTMLElement>('.contact-plot__blip')!;
  expect(lead.dataset.labelAnchor).toMatch(/west$/);
  expect(tag.getBoundingClientRect().left - blip.getBoundingClientRect().right).toBeLessThanOrEqual(15);

  markers[1] = { x: 210, y: 75 };
  markers[2] = { x: 210, y: 125 };
  act(() => container.querySelector('.contact-plot')?.dispatchEvent(
    new CustomEvent(CONTACT_SCAN_EVENT, { bubbles: true }),
  ));
  expect(lead.dataset.labelAnchor).toMatch(/east$/);
  expect(blip.getBoundingClientRect().left - tag.getBoundingClientRect().right).toBeLessThanOrEqual(15);
});

it('moves an anchored name one nearby row when both sides have crowded contact marks', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const marks = [
    { x: 150, y: 100 }, { x: 100, y: 78 }, { x: 100, y: 124 },
    { x: 190, y: 78 }, { x: 190, y: 124 },
  ];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    const contact = this.closest('.contact-plot__contact');
    const index = [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact!);
    const mark = marks[index];
    if (!mark) return bounds(0, 0, 0, 0);
    if (this.classList.contains('contact-plot__blip')) return bounds(mark.x, mark.y, 8, 8);
    if (this.classList.contains('contact-plot__tag')) {
      const width = index === 0 ? 70 : 40;
      const anchor = contact?.getAttribute('data-label-anchor') ?? 'north-east';
      const x = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds((anchor.endsWith('east') ? mark.x - 11 - width : mark.x + 19) + x,
        (anchor.startsWith('north') ? mark.y - 26 : mark.y + 16) + y, width, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const { container } = render(<ContactPlot contacts={marks.map((_, index) => ({
    tag: `RETURN ${index}`, x: 0.1 * index, y: 0, z: 0, color: 'white',
  }))} />);
  const lead = container.querySelector<HTMLElement>('.contact-plot__contact')!;
  const label = lead.querySelector<HTMLElement>('.contact-plot__tag')!;
  const mark = lead.querySelector<HTMLElement>('.contact-plot__blip')!;
  const rectangle = label.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  const horizontalGap = lead.dataset.labelAnchor?.endsWith('east')
    ? markRect.left - rectangle.right : rectangle.left - markRect.right;
  expect(horizontalGap).toBeGreaterThanOrEqual(4);
  expect(horizontalGap).toBeLessThanOrEqual(15);
  for (const other of [...container.querySelectorAll<HTMLElement>('.contact-plot__blip')].slice(1)) {
    const otherRect = other.getBoundingClientRect();
    expect(rectangle.right <= otherRect.left || rectangle.left >= otherRect.right ||
      rectangle.bottom <= otherRect.top || rectangle.top >= otherRect.bottom).toBe(true);
  }
  expect(label.style.getPropertyValue('--label-clamp-y')).not.toBe('');
  const leader = container.querySelector<SVGLineElement>('.contact-plot__leader-line');
  expect(leader?.dataset.visible).toBe('true');
  expect(Number(leader?.getAttribute('x1'))).toBeGreaterThan(0);
  expect(Number(leader?.getAttribute('x2'))).toBeGreaterThan(0);
});

it('sets readable contact-name type sizes in compact and expanded ship plots', () => {
  const css = readFileSync('src/styles/plot.css', 'utf8');
  expect(css).toMatch(/\.ship-plot\[data-expanded='false'\] \.contact-plot__tag\s*\{[^}]*font-size:\s*0\.6rem/s);
  expect(css).toMatch(/\.ship-plot\[data-expanded='true'\] \.contact-plot__tag\s*\{[^}]*font-size:\s*0\.75rem/s);
});

it('reserves the cramped phone widget for blips and makes names visible in expanded DRADIS', () => {
  const css = readFileSync('src/styles/plot.css', 'utf8');
  expect(css).toMatch(/@media\s*\(max-width:\s*32rem\)\s*\{\s*\.ship-plot\[data-expanded='false'\] \.contact-plot__tag\s*\{\s*display:\s*none/s);
  expect(css).not.toMatch(/\.ship-plot\[data-expanded='true'\] \.contact-plot__tag\s*\{[^}]*display:\s*none/s);
});

it('lets a name wider than the plot wrap inside the visible scan area', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('contact-plot__tag')) {
      const cap = Number.parseFloat((this as HTMLElement).style.maxWidth);
      return bounds(10, 20, Number.isFinite(cap) ? cap * 1.1 : 500, 18);
    }
    return bounds(0, 0, 0, 0);
  });

  const { container } = render(<ContactPlot contacts={[
    { tag: 'VERY LONG USER DEFINED CONTACT NAME', x: 0.2, y: 0.1, z: 0, color: 'white' },
  ]} />);
  const label = container.querySelector<HTMLElement>('.contact-plot__tag')!;
  expect(Number.parseFloat(label.style.maxWidth)).toBeLessThanOrEqual(304);
  expect(label.style.whiteSpace).toBe('normal');
  expect(label.style.minInlineSize).toBe('0px');
  expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(304);
});

it('keeps ambient contact names private until acquisition while labels are clamped', () => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-01-01T00:10:00.000Z');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) {
      return { left: 0, top: 0, right: 320, bottom: 844, width: 320, height: 844 } as DOMRect;
    }
    if (this.classList.contains('contact-plot__tag')) {
      return { left: 8, top: 8, right: 160, bottom: 28, width: 152, height: 20 } as DOMRect;
    }
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  });
  const { container } = render(<ContactPlot contacts={[]} ambientSession={ambientSession} />);
  act(() => vi.advanceTimersByTime(
    ambientContactIntervalMs(ambientSession.id, 1) - 10 * 60 * 1000,
  ));
  const contact = container.querySelector<HTMLElement>("[data-ambient='true']");
  if (!contact) throw new Error('Expected the passing unknown contact.');
  expect(contact).toHaveTextContent('UNKNOWN CONTACT');
  expect(contact.querySelector('.contact-plot__tag')).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(AMBIENT_CLASSIFICATION_MS);
    contact.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, { bubbles: true }));
  });
  expect(contact).not.toHaveTextContent('UNKNOWN CONTACT');
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
    return (this.classList.contains('contact-plot__actual')
      ? { x: 150, y: 100, left: 150, top: 100, width: 0, height: 0 }
      : { x: 0, y: 0, left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
  });
  // The displayed position can differ from a full 3D projection because the
  // foreground return layer is flattened by CSS. Follow the actual anchor.
  const contact = { tag: 'AHEAD', x: 0.8, y: 0, z: 0, color: 'white' };
  const { container, rerender, unmount } = render(<ContactPlot contacts={[contact]} />);
  const scanFixChanges: boolean[] = [];
  plotIn(container)?.addEventListener(CONTACT_SCAN_EVENT, (event) => {
    scanFixChanges.push((event as CustomEvent<{ fixChanged: boolean }>).detail?.fixChanged ?? false);
  });
  const apparent = () => container.querySelector<HTMLElement>('.contact-plot__apparent');
  const findMany = vi.spyOn(plotIn(container)!, 'querySelectorAll');
  const firstContact = contactsIn(container)[0]!;
  const findParts = vi.spyOn(firstContact, 'querySelector');
  act(() => frame(0));
  findMany.mockClear();
  findParts.mockClear();
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  normal = { x: 0.5, y: 0, z: 0.866 };
  act(() => frame(16));
  // Stable tracks reuse their DOM handles instead of allocating query results
  // on every animation frame. Positions are still measured at full frame rate.
  expect(findMany).not.toHaveBeenCalled();
  expect(findParts).not.toHaveBeenCalled();
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(32));
  expect(apparent()).toHaveAttribute('data-acquired', 'true');
  expect(scanFixChanges).toEqual([true]);
  expect(apparent()?.parentElement).toHaveAttribute('data-scan-fresh', 'true');
  // A second sweep can reach the same return during its first enlargement.
  // Its ordinary ping must not restart the initial size animation.
  normal = { x: 0, y: 0, z: 1 };
  act(() => frame(48));
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(64));
  expect(scanFixChanges.slice(1).length).toBeGreaterThan(0);
  expect(scanFixChanges.slice(1).every((changed) => changed === false)).toBe(true);
  expect(painted).toHaveLength(7);
  expect(painted.filter(({ keyframes }) => keyframes[0]?.transform === 'scale(2)')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(SCAN_FRESH_MS - 1));
  expect(apparent()?.parentElement).toHaveAttribute('data-scan-fresh', 'true');
  act(() => vi.advanceTimersByTime(1));
  expect(apparent()?.parentElement).toHaveAttribute('data-scan-fresh', 'false');
  expect(painted[0]?.keyframes[0]?.transform).toBe('scale(2)');
  expect(painted[1]?.keyframes[0]).toMatchObject({ opacity: 1 });
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
  expect(painted.filter(({ keyframes }) => keyframes[0]?.transform === 'scale(2)')).toHaveLength(2);
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
  expect(scanFixChanges.at(-1)).toBe(true);
  // Removing tracks must also release their cached handles, animations and timers.
  rerender(<ContactPlot contacts={[]} />);
  cancel.mockClear();
  act(() => frame(112 + SCAN_FRESH_MS));
  expect(cancel).toHaveBeenCalledTimes(6);
  expect(vi.getTimerCount()).toBe(0);
  rerender(<ContactPlot contacts={[contact]} />);
  act(() => frame(128 + SCAN_FRESH_MS));
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  unmount();
  expect(cancelAnimationFrame).toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});

it('reclamps a stationary return when a sweep changes its held fix but skips same-fix pings', () => {
  const { container } = render(<ContactPlot contacts={[
    { tag: 'AHEAD', x: 0.8, y: 0, z: 0, color: 'white' },
  ]} />);
  const plot = plotIn(container)!;
  const contact = contactsIn(container)[0]!;
  const layout = vi.spyOn(plot, 'getBoundingClientRect');
  layout.mockClear();

  act(() => contact.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, {
    bubbles: true,
    detail: { fixChanged: false },
  })));
  expect(layout).not.toHaveBeenCalled();

  act(() => contact.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, {
    bubbles: true,
    detail: { fixChanged: true },
  })));
  expect(layout).toHaveBeenCalled();
});

it('reuses stationary return projections until DRADIS geometry changes', () => {
  let frame: FrameRequestCallback = () => undefined;
  let notifyResize: (() => void) | undefined;
  let normal = { x: 0, y: 0, z: 1 };
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) {
      notifyResize = () => callback([], this as unknown as ResizeObserver);
    }

    observe() {}
    disconnect() {}
  });
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
  const actualBounds = vi.fn();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot__actual')) {
      actualBounds();
      return { x: 150, y: 100, left: 150, top: 100, width: 0, height: 0 } as DOMRect;
    }
    return { x: 0, y: 0, left: 0, top: 0, width: 200, height: 200 } as DOMRect;
  });

  const { container } = render(
    <ContactPlot contacts={[{ tag: 'AHEAD', x: 0.8, y: 0, z: 0, color: 'white' }]} />,
  );

  act(() => frame(0));
  normal = { x: 0.5, y: 0, z: 0.866 };
  act(() => frame(16));
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(32));
  // The sweep itself is still sampled on each animation frame. A stationary
  // return's screen projection only changes when the plot's geometry changes.
  expect(actualBounds).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.contact-plot__apparent')).toHaveAttribute(
    'data-acquired',
    'true',
  );

  act(() => notifyResize?.());
  act(() => frame(48));
  expect(actualBounds).toHaveBeenCalledTimes(2);
});

it('keeps crowded 20-contact label layout within the per-update geometry-read budget', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(150);
  let labelLayoutReads = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('contact-plot__blip')) return bounds(160, 100, 8, 8);
    if (this.classList.contains('contact-plot__tag')) {
      labelLayoutReads += 1;
      const anchor = this.closest<HTMLElement>('.contact-plot__contact')?.dataset.labelAnchor ?? 'north-east';
      const style = (this as HTMLElement).style;
      const cap = Number.parseFloat(style.maxWidth);
      const width = Number.isFinite(cap) ? Math.min(180, cap * 1.2) : 180;
      const left = anchor.endsWith('east') ? 160 - 11 - width : 168 + 11;
      const top = anchor.startsWith('north') ? 100 - 8 - 18 : 108 + 8;
      const x = Number.parseFloat(style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat(style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(left + x, top + y, width, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const contacts = Array.from({ length: 20 }, (_, index) => ({
    id: `perf-${index}`,
    tag: `CONTACT ${String(index + 1).padStart(2, '0')}`,
    x: (index % 2 === 0 ? 0.1 : -0.1), y: Math.floor(index / 2) * 0.01, z: 0.4,
    color: 'white',
  }));

  const { rerender } = render(<ContactPlot contacts={contacts} />);
  expect(labelLayoutReads).toBeLessThanOrEqual(20 * contacts.length);

  labelLayoutReads = 0;
  rerender(<ContactPlot contacts={contacts.map((contact, index) => ({ ...contact, x: contact.x + index * 0.001 }))} />);
  expect(labelLayoutReads).toBeLessThanOrEqual(20 * contacts.length);
});

it('keeps 20 readable DRADIS returns within 12 label reads per contact', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(150);
  const markers = Array.from({ length: 20 }, (_, index) => ({ x: 160, y: 70 + index * 34 }));
  let labelLayoutReads = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 800);
    const contact = this.closest<HTMLElement>('.contact-plot__contact');
    const index = contact ? [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact) : -1;
    const marker = markers[index];
    if (this.classList.contains('contact-plot__blip') && marker) return bounds(marker.x, marker.y, 8, 8);
    if (this.classList.contains('contact-plot__tag') && marker) {
      labelLayoutReads += 1;
      const anchor = contact?.dataset.labelAnchor ?? 'north-east';
      const style = this as HTMLElement;
      const cap = Number.parseFloat(style.style.maxWidth);
      const width = Number.isFinite(cap) ? Math.min(180, cap * 1.2) : 180;
      const left = anchor.endsWith('east') ? marker.x - 11 - width : marker.x + 8 + 11;
      const top = anchor.startsWith('north') ? marker.y - 8 - 18 : marker.y + 8 + 8;
      const x = Number.parseFloat(style.style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat(style.style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(left + x, top + y, width, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const contacts = markers.map((_, index) => ({
    id: `readable-${index}`, tag: `CONTACT ${String(index + 1).padStart(2, '0')}`,
    x: index % 2 === 0 ? 0.4 : -0.4, y: 0.4, z: 0.1, color: 'white',
  }));

  const { container } = render(<ContactPlot contacts={contacts} />);

  expect(container.querySelectorAll('.contact-plot__tag')).toHaveLength(contacts.length);
  expect(labelLayoutReads).toBeLessThanOrEqual(12 * contacts.length);
});

it('fits an expanded DRADIS name using widths measured in the same label state', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const offsetWidthRead = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.classList.contains('contact-plot__tag')) return 0;
    const cap = Number.parseFloat(this.style.maxWidth);
    return Number.isFinite(cap) ? Math.min(180, cap) : 180;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 246, 320);
    if (this.classList.contains('contact-plot__blip')) return bounds(119, 140, 8, 8);
    if (this.classList.contains('contact-plot__tag')) {
      const style = (this as HTMLElement).style;
      const cap = Number.parseFloat(style.maxWidth);
      const width = (Number.isFinite(cap) ? Math.min(180, cap) : 180) * 1.2;
      const anchor = this.closest<HTMLElement>('.contact-plot__contact')?.dataset.labelAnchor ?? 'north-east';
      const left = anchor.endsWith('east') ? 119 - 11 - width : 127 + 11;
      const top = anchor.startsWith('north') ? 140 - 8 - 18 : 140 + 8 + 8;
      const x = Number.parseFloat(style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat(style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(left + x, top + y, width, 18);
    }
    return bounds(0, 0, 0, 0);
  });

  const { container } = render(<ContactPlot contacts={[
    { tag: 'LONG RESEARCH CRUISER', x: 0.8, y: 0.2, z: 0.1, color: 'white' },
  ]} />);
  const label = container.querySelector<HTMLElement>('.contact-plot__tag')!;

  expect(offsetWidthRead).not.toHaveBeenCalled();
  expect(label.getBoundingClientRect().width).toBeGreaterThanOrEqual(90);
  expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(100);
});

it('exposes the active fleet alert outside the decorative plot for assistive technology', () => {
  useSessionStore.setState({ session: alertSession('s1', true, 1) });
  const { container } = render(<ContactPlot placement="widget" />);
  expect(container.querySelector('.contact-plot__red-alert')).toHaveTextContent('RED ALERT');
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('FLEETWIDE RED ALERT ACTIVE');
  expect(status.closest('[aria-hidden="true"]')).toBeNull();
  expect(status.closest('.contact-plot__rig')).toBeNull();
});

it('clears or restores the DRADIS alert cue only from the current session projection', () => {
  useSessionStore.setState({ session: alertSession('s1', true, 1) });
  const { container, rerender } = render(<ContactPlot placement="widget" />);
  const initialStatus = screen.getByRole('status');
  expect(initialStatus).toHaveTextContent('FLEETWIDE RED ALERT ACTIVE');
  act(() => useSessionStore.setState({ session: alertSession('s1', true, 1) }));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toBe(initialStatus);

  act(() => useSessionStore.setState({ session: alertSession('s1', false, 2) }));
  expect(screen.queryByRole('status')).toBeNull();
  expect(container.querySelector('.contact-plot__red-alert')).toBeNull();

  act(() => useSessionStore.setState({ session: alertSession('s1', true, 3) }));
  expect(screen.getByRole('status')).toHaveTextContent('FLEETWIDE RED ALERT ACTIVE');
  act(() => useSessionStore.setState({ session: alertSession('s2', false, 2) }));
  expect(screen.queryByRole('status')).toBeNull();

  act(() => useSessionStore.setState({ session: null }));
  expect(screen.queryByRole('status')).toBeNull();
  act(() => useSessionStore.setState({ session: alertSession('s3', true, 1) }));
  expect(screen.getByRole('status')).toHaveTextContent('FLEETWIDE RED ALERT ACTIVE');

  rerender(<ContactPlot placement="inset" />);
  expect(screen.getByRole('status')).toHaveTextContent('FLEETWIDE RED ALERT ACTIVE');
});

it('keeps the non-color cue available when DRADIS motion is reduced', () => {
  setMotionOverride('reduce');
  useSessionStore.setState({ session: alertSession('s1', true, 1) });
  const { container } = render(<ContactPlot placement="widget" />);

  expect(screen.getByRole('status')).toHaveTextContent('FLEETWIDE RED ALERT ACTIVE');
  expect(plotIn(container)).toHaveAttribute('data-still', 'true');
});
