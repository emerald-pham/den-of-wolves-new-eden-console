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
import { CONTACT_SCAN_EVENT, CONTACT_SCAN_LAYOUT_EVENT } from './sweep';
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

it('keeps docked craft visibly attached to the host label without adding a plot contact', () => {
  const { container } = render(<ContactPlot contacts={[
    { id: 'ship:quellon', tag: 'QUELLON', x: 0, y: 0, z: 0, color: 'white',
      showCombatRange: false, dockedCraftTags: ['DOCKED // HUMMINGBIRD', 'DOCKED // ENDEAVOUR'] },
  ]} />);
  const contacts = contactsIn(container);
  expect(contacts).toHaveLength(1);
  expect(contacts[0]?.querySelector('.contact-plot__tag')?.textContent)
    .toContain('QUELLONDOCKED // HUMMINGBIRDDOCKED // ENDEAVOUR');
  expect([...contacts[0]!.querySelectorAll('.contact-plot__docked-craft')].map(node => node.textContent))
    .toEqual(['DOCKED // HUMMINGBIRD', 'DOCKED // ENDEAVOUR']);
});

it('keeps docked craft on the viewer ship attached to the existing origin marker', () => {
  const { container } = render(<ContactPlot centerLabel="QUELLON"
    centerDockedCraftTags={['DOCKED // HUMMINGBIRD']} contacts={[]} />);
  const origin = container.querySelector('.contact-plot__origin')!;
  expect(origin.querySelector(':scope > span')?.textContent).toBe('QUELLON');
  expect([...origin.querySelectorAll('.contact-plot__docked-craft')].map(node => node.textContent))
    .toEqual(['DOCKED // HUMMINGBIRD']);
  expect(contactsIn(container)).toHaveLength(0);
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
  for (const contact of contactsIn(container)) {
    const apparent = contact.querySelector('.contact-plot__apparent');
    expect(apparent).toContainElement(contact.querySelector('.contact-plot__blip'));
    expect(apparent).toContainElement(contact.querySelector('.contact-plot__tag'));
  }
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

it('reacquires a renamed contact before revealing its new DRADIS name', () => {
  const original = {
    id: 'ship-1', tag: 'OLD CONTACT', x: 0.8, y: 0.1, z: 0.2, color: 'white',
  };
  const { container, rerender } = render(<ContactPlot contacts={[original]} />);
  const previousContact = contactsIn(container)[0]!;
  const previousReturn = previousContact.querySelector<HTMLElement>('.contact-plot__apparent')!;

  // Model a return that a prior sweep acquired, then reuse its stable ship id
  // when the current contact name changes.
  previousReturn.dataset.acquired = 'true';
  rerender(<ContactPlot contacts={[{ ...original, tag: 'NEW CONTACT', x: -0.7, y: -0.1 }]} />);

  const contact = contactsIn(container)[0]!;
  const apparent = contact.querySelector<HTMLElement>('.contact-plot__apparent')!;
  const blip = contact.querySelector<HTMLElement>('.contact-plot__blip');
  const label = contact.querySelector<HTMLElement>('.contact-plot__tag');
  expect(contact).not.toBe(previousContact);
  expect(previousContact).not.toBeInTheDocument();
  expect(apparent).not.toHaveAttribute('data-acquired', 'true');
  expect(label).toHaveTextContent('NEW CONTACT');
  expect(apparent).toContainElement(blip);
  expect(apparent).toContainElement(label);
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
  expect(painted).toHaveLength(4);
  expect(painted[0]?.keyframes[0]?.transform).toBe('scale(2)');
  expect(painted[2]?.element).toHaveClass('contact-plot__tag');

  actualPosition = { x: 40, y: -30, z: 60 };
  act(() => frame(32));
  expect(apparent?.style.cssText).toBe(firstFix);

  normal = { x: 0, y: 0, z: 1 };
  act(() => frame(48));
  expect(apparent?.style.cssText).toBe(firstFix);
  expect(pinged).toHaveBeenCalledTimes(2);
  expect(painted).toHaveLength(7);
  expect(firstSizeCancel).not.toHaveBeenCalled();
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(64));
  // A recent repeat still confirms and brightens the contact, while the
  // original size animation keeps its own deadline and is not restarted.
  expect(apparent?.style.cssText).toBe(firstFix);
  expect(pinged).toHaveBeenCalledTimes(3);
  expect(painted).toHaveLength(10);
  expect(painted[5]?.element).toHaveClass('contact-plot__tag');
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
  expect(painted).toHaveLength(13);
  expect(painted[11]?.element).toHaveClass('contact-plot__tag');
  expect(painted[11]?.keyframes[0]).toMatchObject({ opacity: 1 });
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

it('keeps DRADIS contact names on the shared CIC type scale', () => {
  const css = readFileSync('src/styles/plot.css', 'utf8');
  const label = css.match(/\.contact-plot__tag\s*\{([^}]*)\}/)?.[1] ?? '';

  expect(label).toContain('font: clamp(0.45rem, 1.4vw, 0.55rem)/1 var(--cic-mono)');
  expect(label).toContain('letter-spacing: 0.18em');
  expect(css).not.toMatch(/\.ship-plot\[data-expanded='(?:false|true)'\] \.contact-plot__tag\s*\{[^}]*font-size/s);
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
  const name = () => container.querySelector<HTMLElement>('.contact-plot__tag');
  const blip = () => container.querySelector<HTMLElement>('.contact-plot__blip');
  const findMany = vi.spyOn(plotIn(container)!, 'querySelectorAll');
  const firstContact = contactsIn(container)[0]!;
  const findParts = vi.spyOn(firstContact, 'querySelector');
  act(() => frame(0));
  findMany.mockClear();
  findParts.mockClear();
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  expect(apparent()).toContainElement(name());
  expect(apparent()).toContainElement(blip());
  normal = { x: 0.5, y: 0, z: 0.866 };
  act(() => frame(16));
  // Stable tracks reuse their DOM handles instead of allocating query results
  // on every animation frame. Positions are still measured at full frame rate.
  expect(findMany).not.toHaveBeenCalled();
  expect(findParts).not.toHaveBeenCalled();
  expect(apparent()).not.toHaveAttribute('data-acquired', 'true');
  expect(apparent()).toContainElement(name());
  expect(apparent()).toContainElement(blip());
  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(32));
  expect(apparent()).toHaveAttribute('data-acquired', 'true');
  expect(apparent()).toContainElement(name());
  expect(apparent()).toContainElement(blip());
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
  expect(painted).toHaveLength(1 + scanFixChanges.length * 3);
  expect(painted.filter(({ keyframes }) => keyframes[0]?.transform === 'scale(2)')).toHaveLength(1);
  expect(painted.filter(({ element }) => element === name())).toHaveLength(scanFixChanges.length);
  expect(painted.filter(({ element, keyframes }) => element === blip() &&
    typeof keyframes[0]?.opacity === 'number').length).toBe(scanFixChanges.length);
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
  expect(cancel).toHaveBeenCalledTimes(8);
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

it('remeasures only the changed label for a clear deferred sweep fix', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const marks = Array.from({ length: 6 }, (_, index) => ({
    x: 100 + index * 170,
    y: 100 + index * 120,
  }));
  let markReads = 0;
  let labelReads = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 1200, 900);
    const contact = this.closest<HTMLElement>('.contact-plot__contact');
    const index = contact ? [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact) : -1;
    const mark = marks[index];
    if (this.classList.contains('contact-plot__blip') && mark) {
      markReads += 1;
      return bounds(mark.x, mark.y, 8, 8);
    }
    if (this.classList.contains('contact-plot__tag') && mark) {
      labelReads += 1;
      const anchor = contact?.dataset.labelAnchor ?? 'south-east';
      const left = anchor.endsWith('east') ? mark.x - 11 - 50 : mark.x + 8 + 11;
      const top = anchor.startsWith('north') ? mark.y - 8 - 18 : mark.y + 8 + 8;
      return bounds(left, top, 50, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const { container } = render(<ContactPlot contacts={marks.map((_, index) => ({
    id: `sweep-layout-${index}`,
    tag: `CONTACT ${index + 1}`,
    x: 0.55,
    y: 0.38,
    z: 0.1,
    color: 'white',
  }))} />);
  const plot = plotIn(container)!;
  const changedContact = contactsIn(container)[0]!;

  markReads = 0;
  labelReads = 0;
  marks[0] = { x: 108, y: 108 };
  act(() => {
    changedContact.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, {
      bubbles: true,
      detail: { fixChanged: true, layoutDeferred: true },
    }));
    plot.dispatchEvent(new Event(CONTACT_SCAN_LAYOUT_EVENT));
  });

  // Blip transform animations can change unscanned bounds. Read every mark
  // once in a batch, while retaining the expensive label-layout bound.
  expect(markReads).toBe(marks.length);
  expect(labelReads).toBeLessThanOrEqual(2);
});

type ContactGeometryMark = {
  x: number; y: number; width?: number; height?: number; labelX?: number; labelY?: number;
};

function mockAdjacentContactGeometry(
  marks: ContactGeometryMark[],
  origin?: [number, number, number, number],
): void {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('contact-plot__origin')) {
      return origin ? bounds(...origin) : bounds(0, 0, 0, 0);
    }
    const contact = this.closest<HTMLElement>('.contact-plot__contact');
    const index = contact ? [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact) : -1;
    const mark = marks[index];
    if (this.classList.contains('contact-plot__blip') && mark) {
      return bounds(mark.x, mark.y, mark.width ?? 8, mark.height ?? 8);
    }
    if (this.classList.contains('contact-plot__tag') && mark) {
      const label = this as HTMLElement;
      const cap = Number.parseFloat(label.style.maxWidth);
      const width = Number.isFinite(cap) ? Math.min(50, cap) : 50;
      const anchor = contact?.dataset.labelAnchor ?? 'south-east';
      const x = Number.parseFloat(label.style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat(label.style.getPropertyValue('--label-clamp-y')) || 0;
      const baseX = mark.labelX ?? mark.x;
      const baseY = mark.labelY ?? mark.y;
      return bounds(
        (anchor.endsWith('east') ? baseX - 11 - width : baseX + 19) + x,
        (anchor.startsWith('north') ? baseY - 26 : baseY + 16) + y,
        width, 18,
      );
    }
    return bounds(0, 0, 0, 0);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(50);
}

it('rechecks an unscanned departing mark before laying out a deferred sweep', () => {
  const marks = [{ x: 160, y: 100 }, { x: 190, y: 100 }];
  mockAdjacentContactGeometry(marks, [88, 112, 62, 24]);
  const { container } = render(<ContactPlot centerLabel="AEGIS" contacts={marks.map((_, index) => ({
    id: `departing-cache-${index}`, tag: `CONTACT ${index + 1}`,
    x: 0.55, y: index === 0 ? 0.38 : -0.38, z: 0.1, color: 'white',
  }))} />);
  const [lead, departing] = contactsIn(container);
  expect(lead?.dataset.labelAnchor).toBe('south-west');
  expect(departing?.dataset.labelAnchor).toBe('north-west');
  departing!.dataset.departing = 'true';
  marks[0] = { x: 161, y: 100 };
  marks[1] = { x: 220, y: 123 };

  act(() => {
    lead!.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, {
      bubbles: true, detail: { fixChanged: true, layoutDeferred: true },
    }));
    plotIn(container)!.dispatchEvent(new Event(CONTACT_SCAN_LAYOUT_EVENT));
  });

  const label = lead!.querySelector('.contact-plot__tag')!.getBoundingClientRect();
  const otherMark = departing!.querySelector('.contact-plot__blip')!.getBoundingClientRect();
  const overlaps = label.left < otherMark.right + 4 && label.right + 4 > otherMark.left &&
    label.top < otherMark.bottom + 4 && label.bottom + 4 > otherMark.top;
  expect(overlaps).toBe(false);
  expect(lead?.dataset.labelAnchor).toBe('north-west');
});

it('selects the clearer opposite anchor when an adjacent contact moves in reduced motion', () => {
  setMotionOverride('reduce');
  const marks = [{ x: 160, y: 100 }, { x: 210, y: 75 }];
  mockAdjacentContactGeometry(marks);
  const contacts = marks.map((_, index) => ({
    id: `clearance-cache-${index}`, tag: `CONTACT ${index + 1}`,
    x: 0.55, y: 0.38, z: 0.1, color: 'white',
  }));
  const { container, rerender } = render(<ContactPlot contacts={contacts} />);
  expect(contactsIn(container)[0]?.dataset.labelAnchor).toBe('south-east');
  marks[1] = { x: 100, y: 75 };

  rerender(<ContactPlot contacts={contacts.map((contact, index) => ({
    ...contact, x: index === 1 ? -contact.x : contact.x,
  }))} />);

  expect(contactsIn(container)[0]?.dataset.labelAnchor).toBe('south-west');
  const label = contactsIn(container)[0]!.querySelector('.contact-plot__tag')!.getBoundingClientRect();
  const otherMark = contactsIn(container)[1]!.querySelector('.contact-plot__blip')!.getBoundingClientRect();
  const dx = Math.max(0, otherMark.left - label.right, label.left - otherMark.right);
  const dy = Math.max(0, otherMark.top - label.bottom, label.top - otherMark.bottom);
  expect(dx * dx + dy * dy).toBe(6130);
});

it('scores current neighbor bounds while an unscanned acquisition flash shrinks', () => {
  const marks: ContactGeometryMark[] = [
    { x: 160, y: 100 },
    { x: 233, y: 116, width: 16, height: 16, labelX: 237, labelY: 120 },
  ];
  mockAdjacentContactGeometry(marks, [84, 112, 10, 24]);
  const { container } = render(<ContactPlot centerLabel="AEGIS" contacts={marks.map((_, index) => ({
    id: `acquisition-cache-${index}`, tag: `CONTACT ${index + 1}`,
    x: 0.55, y: index === 0 ? 0.38 : -0.38, z: 0.1, color: 'white',
  }))} />);
  const [lead] = contactsIn(container);
  expect(lead?.dataset.labelAnchor).toBe('south-east');
  marks[0] = { x: 161, y: 100 };
  marks[1] = { x: 237, y: 120, width: 8, height: 8, labelX: 237, labelY: 120 };

  act(() => {
    lead!.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, {
      bubbles: true, detail: { fixChanged: true, layoutDeferred: true },
    }));
    plotIn(container)!.dispatchEvent(new Event(CONTACT_SCAN_LAYOUT_EVENT));
  });

  expect(lead?.dataset.labelAnchor).toBe('south-west');
  const label = lead!.querySelector('.contact-plot__tag')!.getBoundingClientRect();
  const neighbor = contactsIn(container)[1]!.querySelector('.contact-plot__blip')!.getBoundingClientRect();
  const dx = Math.max(0, neighbor.left - label.right, label.left - neighbor.right);
  const dy = Math.max(0, neighbor.top - label.bottom, label.top - neighbor.bottom);
  expect(dx * dx + dy * dy).toBe(49);
});

it('lays out one complete sweep batch once, while preserving every contact scan', () => {
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
    transformPoint(point: DOMPointInit) { return this.value === 'sweep' ? normal : point; }
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
  const { container } = render(<ContactPlot contacts={Array.from({ length: 20 }, (_, index) => ({
    id: `batch-${index}`, tag: `CONTACT ${index}`, x: 0.5, y: 0, z: 0, color: 'white',
  }))} />);
  const plot = plotIn(container)!;
  const layout = vi.spyOn(plot, 'getBoundingClientRect');
  const scans = vi.fn();
  plot.addEventListener(CONTACT_SCAN_EVENT, scans);
  act(() => frame(0));
  layout.mockClear();

  normal = { x: 0.996, y: 0, z: 0.087 };
  act(() => frame(16));
  expect(scans).toHaveBeenCalledTimes(20);
  expect(container.querySelectorAll('.contact-plot__apparent[data-acquired="true"]')).toHaveLength(20);
  // One sweep projection and one label layout, regardless of contact count.
  expect(layout).toHaveBeenCalledTimes(2);

  scans.mockClear();
  layout.mockClear();
  normal = { x: 0, y: 0, z: 1 };
  act(() => frame(32));
  expect(scans).toHaveBeenCalledTimes(20);
  expect(layout).toHaveBeenCalledTimes(1);
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

it('uses the prepared DRADIS label bounds for its leader without another layout read', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  let labelLayoutReads = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 320);
    if (this.classList.contains('contact-plot__blip')) return bounds(80, 80, 8, 8);
    if (this.classList.contains('contact-plot__tag')) {
      labelLayoutReads += 1;
      const anchor = this.closest<HTMLElement>('.contact-plot__contact')?.dataset.labelAnchor ?? 'south-east';
      const left = anchor.endsWith('east') ? 80 - 11 - 30 : 88 + 11;
      const top = anchor.startsWith('north') ? 80 - 8 - 18 : 88 + 8;
      return bounds(left, top, 30, 18);
    }
    return bounds(0, 0, 0, 0);
  });

  const { container } = render(<ContactPlot contacts={[
    { id: 'single', tag: 'AHEAD', x: 0.8, y: 0.8, z: 0, color: 'white' },
  ]} />);

  expect(container.querySelector('.contact-plot__leader-line')).toBeInTheDocument();
  expect(labelLayoutReads).toBeLessThanOrEqual(3);
});

it('reuses intrinsic DRADIS name width across contact-position updates', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  let offsetWidthReads = 0;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.classList.contains('contact-plot__tag')) return 0;
    offsetWidthReads += 1;
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
      const anchor = this.closest<HTMLElement>('.contact-plot__contact')?.dataset.labelAnchor ?? 'south-east';
      const left = anchor.endsWith('east') ? 119 - 11 - width : 127 + 11;
      const top = anchor.startsWith('north') ? 140 - 8 - 18 : 140 + 8 + 8;
      const x = Number.parseFloat(style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat(style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(left + x, top + y, width, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const contacts = (x: number) => [{
    id: 'width-cache', tag: 'LONG RESEARCH CRUISER', x, y: 0.2, z: 0.1, color: 'white',
  }];

  const { rerender } = render(<ContactPlot contacts={contacts(0.8)} />);
  const firstUpdateReads = offsetWidthReads;
  expect(firstUpdateReads).toBeGreaterThan(0);

  rerender(<ContactPlot contacts={contacts(0.81)} />);

  expect(offsetWidthReads).toBe(firstUpdateReads);
});

function mockIntrinsicWidthForCacheTests(getNaturalWidth: (label: HTMLElement) => number) {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  let offsetWidthReads = 0;
  let labelBoundsReads = 0;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.classList.contains('contact-plot__tag')) return 0;
    offsetWidthReads += 1;
    const cap = Number.parseFloat(this.style.maxWidth);
    return Number.isFinite(cap) ? Math.min(getNaturalWidth(this), cap) : getNaturalWidth(this);
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 246, 320);
    if (this.classList.contains('contact-plot__blip')) return bounds(119, 140, 8, 8);
    if (this.classList.contains('contact-plot__tag')) {
      labelBoundsReads += 1;
      const label = this as HTMLElement;
      const cap = Number.parseFloat(label.style.maxWidth);
      const naturalWidth = getNaturalWidth(label);
      const width = (Number.isFinite(cap) ? Math.min(naturalWidth, cap) : naturalWidth) * 1.2;
      const anchor = label.closest<HTMLElement>('.contact-plot__contact')?.dataset.labelAnchor ?? 'south-east';
      const left = anchor.endsWith('east') ? 119 - 11 - width : 127 + 11;
      const top = anchor.startsWith('north') ? 140 - 8 - 18 : 140 + 8 + 8;
      const x = Number.parseFloat(label.style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat(label.style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(left + x, top + y, width, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  return {
    offsetWidthReads: () => offsetWidthReads,
    labelBoundsReads: () => labelBoundsReads,
  };
}

const cachedWidthTestContacts = (x: number) => [{
  id: 'width-cache-context', tag: 'LONG RESEARCH CRUISER', x, y: 0.2, z: 0.1, color: 'white',
}];

it('reuses intrinsic DRADIS width across sweep visual-state transitions while relaying label geometry', () => {
  const { offsetWidthReads, labelBoundsReads } = mockIntrinsicWidthForCacheTests(() => 180);
  const { container } = render(<ContactPlot contacts={cachedWidthTestContacts(0.8)} />);
  const contact = contactsIn(container)[0]!;
  const apparent = contact.querySelector<HTMLElement>('.contact-plot__apparent')!;
  const initialWidthReads = offsetWidthReads();
  let previousBoundsReads = labelBoundsReads();
  expect(initialWidthReads).toBeGreaterThan(0);
  expect(previousBoundsReads).toBeGreaterThan(0);

  for (const changeVisualState of [
    () => { apparent.dataset.acquired = 'true'; },
    () => { contact.dataset.scanFresh = 'true'; },
    () => { contact.dataset.scanFresh = 'false'; },
  ]) {
    act(() => {
      changeVisualState();
      contact.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, {
        bubbles: true,
        detail: { fixChanged: true },
      }));
    });
    expect(labelBoundsReads()).toBeGreaterThan(previousBoundsReads);
    expect(offsetWidthReads()).toBe(initialWidthReads);
    previousBoundsReads = labelBoundsReads();
  }
});

it('invalidates cached DRADIS name width when responsive viewport rules change', async () => {
  let narrowViewport = false;
  const { offsetWidthReads } = mockIntrinsicWidthForCacheTests(() => narrowViewport ? 200 : 180);
  const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
  try {
    const { rerender } = render(<ContactPlot contacts={cachedWidthTestContacts(0.8)} />);
    const firstUpdateReads = offsetWidthReads();
    expect(firstUpdateReads).toBeGreaterThan(0);

    narrowViewport = true;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      rerender(<ContactPlot contacts={cachedWidthTestContacts(0.81)} />);
    });

    expect(offsetWidthReads()).toBeGreaterThan(firstUpdateReads);
  } finally {
    if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    else Reflect.deleteProperty(window, 'innerWidth');
  }
});

it('invalidates cached DRADIS name width when an ancestor style context changes', async () => {
  const { offsetWidthReads } = mockIntrinsicWidthForCacheTests((label) => (
    label.closest<HTMLElement>('.ship-plot')?.dataset.expanded === 'true' ? 210 : 180
  ));
  const { container } = render(<div className="ship-plot" data-expanded="false">
    <ContactPlot contacts={cachedWidthTestContacts(0.8)} />
  </div>);
  const firstUpdateReads = offsetWidthReads();
  expect(firstUpdateReads).toBeGreaterThan(0);

  await act(async () => {
    container.querySelector<HTMLElement>('.ship-plot')?.setAttribute('data-expanded', 'true');
    await Promise.resolve();
  });

  expect(offsetWidthReads()).toBeGreaterThan(firstUpdateReads);
});

it('invalidates cached DRADIS name width after a font face finishes loading', async () => {
  const fontSet = new EventTarget();
  const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: fontSet });
  try {
    let fontLoaded = false;
    const { offsetWidthReads } = mockIntrinsicWidthForCacheTests(() => fontLoaded ? 210 : 180);
    render(<ContactPlot contacts={cachedWidthTestContacts(0.8)} />);
    const firstUpdateReads = offsetWidthReads();
    expect(firstUpdateReads).toBeGreaterThan(0);

    fontLoaded = true;
    await act(async () => {
      fontSet.dispatchEvent(new Event('loadingdone'));
    });

    expect(offsetWidthReads()).toBeGreaterThan(firstUpdateReads);
  } finally {
    if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts);
    else Reflect.deleteProperty(document, 'fonts');
  }
});

it('keeps crowded 20-contact label layout within the per-update geometry-read budget', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  let labelLayoutReads = 0;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('contact-plot__tag')) labelLayoutReads += 1;
    return 150;
  });
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

it('resolves each DRADIS label contact once during a layout update', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('contact-plot__blip')) return bounds(160, 100, 8, 8);
    if (this.classList.contains('contact-plot__tag')) return bounds(100, 80, 50, 18);
    return bounds(0, 0, 0, 0);
  });
  const contacts = Array.from({ length: 20 }, (_, index) => ({
    id: `contact-owner-${index}`,
    tag: `CONTACT ${String(index + 1).padStart(2, '0')}`,
    x: 0.45 + index * 0.001,
    y: 0.34,
    z: 0.1,
    color: 'white',
  }));
  const closest = vi.spyOn(Element.prototype, 'closest');
  const { rerender } = render(<ContactPlot contacts={contacts} />);

  closest.mockClear();
  rerender(<ContactPlot contacts={contacts.map((contact) => ({
    ...contact,
    x: contact.x + 0.001,
  }))} />);

  expect(closest.mock.calls.filter(([selector]) => selector === '.contact-plot__contact'))
    .toHaveLength(contacts.length);
});

it('skips the alternate anchor measurement when the preferred clear side has more room', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const marks = [{ x: 160, y: 100 }, { x: 190, y: 125 }];
  const labelReads = [0, 0];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    const contact = this.closest<HTMLElement>('.contact-plot__contact');
    const index = contact ? [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact) : -1;
    const mark = marks[index];
    if (this.classList.contains('contact-plot__blip') && mark) return bounds(mark.x, mark.y, 8, 8);
    if (this.classList.contains('contact-plot__tag') && mark) {
      labelReads[index] = (labelReads[index] ?? 0) + 1;
      const anchor = contact?.dataset.labelAnchor ?? 'south-east';
      const left = anchor.endsWith('east') ? mark.x - 11 - 50 : mark.x + 8 + 11;
      const top = anchor.startsWith('north') ? mark.y - 8 - 18 : mark.y + 8 + 8;
      return bounds(left, top, 50, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const contacts = marks.map((_, index) => ({
    id: `preferred-anchor-${index}`,
    tag: `CONTACT ${index + 1}`,
    x: 0.55,
    y: 0.38,
    z: 0.1,
    color: 'white',
  }));
  const { rerender } = render(<ContactPlot contacts={contacts} />);
  labelReads.fill(0);

  rerender(<ContactPlot contacts={contacts.map((contact) => ({
    ...contact,
    x: contact.x + 0.001,
  }))} />);

  expect(labelReads[0]).toBe(1);
});

it('keeps a cached clear anchor when the input preference is unchanged', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  let labelReads = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('contact-plot__origin')) return bounds(88, 112, 62, 24);
    if (this.classList.contains('contact-plot__blip')) return bounds(160, 100, 8, 8);
    if (this.classList.contains('contact-plot__tag')) {
      labelReads += 1;
      const anchor = this.closest<HTMLElement>('.contact-plot__contact')?.dataset.labelAnchor ?? 'south-east';
      const left = anchor.endsWith('east') ? 160 - 11 - 50 : 168 + 11;
      const top = anchor.startsWith('north') ? 100 - 8 - 18 : 108 + 8 + 8;
      return bounds(left, top, 50, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const contact = {
    id: 'cached-clear-anchor', tag: 'CONTACT', x: 0.55, y: 0.38, z: 0.1, color: 'white',
  };
  const { rerender } = render(<ContactPlot centerLabel="AEGIS" contacts={[contact]} />);
  expect(document.querySelector('.contact-plot__contact')?.getAttribute('data-label-anchor'))
    .toBe('south-west');
  labelReads = 0;

  rerender(<ContactPlot centerLabel="AEGIS" contacts={[{ ...contact, x: contact.x + 0.001 }]} />);

  expect(labelReads).toBe(1);
  expect(document.querySelector('.contact-plot__contact')?.getAttribute('data-label-anchor'))
    .toBe('south-west');
});

it('measures alternate anchors as one geometry batch when several defaults change', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const marks = [{ x: 200, y: 70 }, { x: 200, y: 160 }];
  const readAnchorSnapshots: string[][] = [];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('contact-plot__origin')) return bounds(210, 55, 95, 150);
    const contact = this.closest<HTMLElement>('.contact-plot__contact');
    const index = contact ? [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact) : -1;
    const mark = marks[index];
    if (this.classList.contains('contact-plot__blip') && mark) return bounds(mark.x, mark.y, 8, 8);
    if (this.classList.contains('contact-plot__tag') && mark) {
      readAnchorSnapshots.push([...document.querySelectorAll<HTMLElement>('.contact-plot__contact')]
        .map((item) => item.dataset.labelAnchor ?? ''));
      const anchor = contact?.dataset.labelAnchor ?? 'south-east';
      const left = anchor.endsWith('east') ? mark.x - 11 - 30 : mark.x + 8 + 11;
      const top = anchor.startsWith('north') ? mark.y - 8 - 18 : mark.y + 8 + 8;
      return bounds(left, top, 30, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const contacts = marks.map((_, index) => ({
    id: `batched-anchor-${index}`, tag: `CONTACT ${index + 1}`,
    x: 0.55, y: 0.3, z: 0.1, color: 'white',
  }));
  const { rerender } = render(<ContactPlot centerLabel="AEGIS" contacts={contacts} />);
  expect([...document.querySelectorAll<HTMLElement>('.contact-plot__contact')]
    .map((contact) => contact.dataset.labelAnchor)).toEqual(['south-east', 'south-east']);
  readAnchorSnapshots.length = 0;
  // The rendered marks move too, invalidating both cached anchor rectangles.
  marks.forEach((mark) => { mark.x -= 1; });

  rerender(<ContactPlot centerLabel="AEGIS" contacts={contacts.map((contact) => ({
    ...contact, x: -contact.x,
  }))} />);

  expect(readAnchorSnapshots).toHaveLength(4);
  expect(readAnchorSnapshots.slice(0, 2)).toEqual([
    ['south-west', 'south-west'], ['south-west', 'south-west'],
  ]);
  expect(readAnchorSnapshots.slice(2)).toEqual([
    ['south-east', 'south-east'], ['south-east', 'south-east'],
  ]);
});

it('batches crowded fallback translation probes while keeping names beside their marks', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const marks = [{ x: 160, y: 80 }, { x: 160, y: 160 }];
  const probeSnapshots: string[][] = [];
  const styleWrites = vi.spyOn(CSSStyleDeclaration.prototype, 'cssText', 'set');
  let writesAtLastProbe = 0;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(150);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    const contact = this.closest<HTMLElement>('.contact-plot__contact');
    const index = contact ? [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact) : -1;
    const mark = marks[index];
    if (this.classList.contains('contact-plot__blip') && mark) return bounds(mark.x, mark.y, 8, 8);
    if (this.classList.contains('contact-plot__tag') && mark) {
      const label = this as HTMLElement;
      const cap = Number.parseFloat(label.style.maxWidth);
      const width = Number.isFinite(cap) ? Math.min(180, cap * 1.2) : 180;
      const anchor = contact?.dataset.labelAnchor ?? 'south-east';
      const xText = label.style.getPropertyValue('--label-clamp-x');
      const yText = label.style.getPropertyValue('--label-clamp-y');
      if (!xText && yText === '8px') writesAtLastProbe = styleWrites.mock.calls.length;
      if (xText === '8px' && !yText) {
        probeSnapshots.push([...document.querySelectorAll<HTMLElement>('.contact-plot__tag')]
          .map((tag) => tag.style.getPropertyValue('--label-clamp-x')));
      }
      return bounds(
        (anchor.endsWith('east') ? mark.x - 11 - width : mark.x + 19) + (Number.parseFloat(xText) || 0),
        (anchor.startsWith('north') ? mark.y - 26 : mark.y + 16) + (Number.parseFloat(yText) || 0),
        width, 18,
      );
    }
    return bounds(0, 0, 0, 0);
  });

  const { container } = render(<ContactPlot contacts={marks.map((_, index) => ({
    id: `fallback-batch-${index}`, tag: `LONG CONTACT ${index + 1}`,
    x: 0.55, y: 0.38, z: 0.1, color: 'white',
  }))} />);

  expect(probeSnapshots.slice(0, 2)).toEqual([['8px', '8px'], ['8px', '8px']]);
  // Once all native axes are measured, scoring prepared candidates is pure.
  // Each label only restores its probe style and installs its final choice.
  expect(styleWrites.mock.calls.length - writesAtLastProbe).toBeLessThanOrEqual(marks.length * 2);
  contactsIn(container).forEach((contact, index) => {
    const label = contact.querySelector('.contact-plot__tag')!.getBoundingClientRect();
    expect(label.left).toBeGreaterThanOrEqual(8);
    expect(label.right).toBeLessThanOrEqual(312);
    expect(label.top).toBeGreaterThanOrEqual(8);
    expect(label.bottom).toBeLessThanOrEqual(232);
    const gap = contact.dataset.labelAnchor?.endsWith('east')
      ? marks[index]!.x - label.right : label.left - marks[index]!.x - 8;
    expect(gap).toBeGreaterThanOrEqual(4);
  });
});

it('stops comparing distant obstacles once a collided lane cannot improve the chosen label', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  let centralReads = 0;
  let distantReads = 0;
  const watchedBounds = (left: number, top: number, width: number, height: number, distant: boolean) => {
    const rect = bounds(left, top, width, height);
    Object.defineProperty(rect, 'right', { get: () => {
      if (distant) distantReads += 1;
      else centralReads += 1;
      return left + width;
    } });
    return rect;
  };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 320, 240);
    if (this.classList.contains('contact-plot__origin')) return watchedBounds(110, 100, 100, 40, false);
    if (this.hasAttribute('data-plot-obstacle')) return watchedBounds(0, 0, 4, 4, true);
    if (this.classList.contains('contact-plot__blip')) return bounds(160, 120, 8, 8);
    if (this.classList.contains('contact-plot__tag')) {
      const label = this as HTMLElement;
      const anchor = label.closest<HTMLElement>('.contact-plot__contact')?.dataset.labelAnchor ?? 'south-east';
      return bounds(
        (anchor.endsWith('east') ? 160 - 11 - 80 : 160 + 19) +
          (Number.parseFloat(label.style.getPropertyValue('--label-clamp-x')) || 0),
        (anchor.startsWith('north') ? 120 - 26 : 120 + 16) +
          (Number.parseFloat(label.style.getPropertyValue('--label-clamp-y')) || 0),
        80, 18,
      );
    }
    return bounds(0, 0, 0, 0);
  });
  const { container } = render(<div className="ship-plot">
    <span data-plot-obstacle="distant" />
    <ContactPlot centerLabel="AEGIS" contacts={[{ id: 'bounded-score', tag: 'CONTACT', x: 0.55, y: 0.38, z: 0.1, color: 'white' }]} />
  </div>);
  const label = container.querySelector<HTMLElement>('.contact-plot__tag')!;
  const placed = label.getBoundingClientRect();
  expect(placed.top).toBeGreaterThanOrEqual(144);
  expect(placed.bottom).toBeLessThanOrEqual(232);
  expect(placed.right).toBeLessThanOrEqual(156);
  expect(distantReads).toBeLessThanOrEqual(centralReads / 2);
});

it('measures a spread 20-contact DRADIS anchor batch twice per label', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  const markers = Array.from({ length: 20 }, (_, index) => ({
    x: 90 + (index % 5) * 140,
    y: 60 + Math.floor(index / 5) * 140,
  }));
  let labelLayoutReads = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('contact-plot')) return bounds(0, 0, 760, 620);
    const contact = this.closest<HTMLElement>('.contact-plot__contact');
    const index = contact ? [...document.querySelectorAll('.contact-plot__contact')].indexOf(contact) : -1;
    const marker = markers[index];
    if (this.classList.contains('contact-plot__blip') && marker) return bounds(marker.x, marker.y, 8, 8);
    if (this.classList.contains('contact-plot__tag') && marker) {
      labelLayoutReads += 1;
      const anchor = contact?.dataset.labelAnchor ?? 'north-east';
      const left = anchor.endsWith('east') ? marker.x - 11 - 80 : marker.x + 8 + 11;
      const top = anchor.startsWith('north') ? marker.y - 8 - 18 : marker.y + 8 + 8;
      const style = this as HTMLElement;
      const x = Number.parseFloat(style.style.getPropertyValue('--label-clamp-x')) || 0;
      const y = Number.parseFloat(style.style.getPropertyValue('--label-clamp-y')) || 0;
      return bounds(left + x, top + y, 80, 18);
    }
    return bounds(0, 0, 0, 0);
  });
  const contacts = markers.map((_, index) => ({
    id: `spread-${index}`, tag: `CONTACT ${String(index + 1).padStart(2, '0')}`,
    x: (index % 5 - 2) * 0.3, y: (Math.floor(index / 5) - 1.5) * 0.3,
    z: 0.1, color: 'white',
  }));

  const { rerender } = render(<ContactPlot contacts={contacts} />);
  expect(labelLayoutReads).toBeLessThanOrEqual(2 * contacts.length);

  labelLayoutReads = 0;
  rerender(<ContactPlot contacts={contacts.map((contact) => ({
    ...contact, x: contact.x + 0.01,
  }))} />);
  expect(labelLayoutReads).toBeLessThanOrEqual(2 * contacts.length);
});

it('keeps 20 readable DRADIS returns within 12 label reads per contact', () => {
  const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
  }) as DOMRect;
  let labelLayoutReads = 0;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('contact-plot__tag')) labelLayoutReads += 1;
    return 150;
  });
  const markers = Array.from({ length: 20 }, (_, index) => ({ x: 160, y: 70 + index * 34 }));
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
  const maxWidthsAtIntrinsicRead: string[] = [];
  const offsetWidthRead = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.classList.contains('contact-plot__tag')) return 0;
    maxWidthsAtIntrinsicRead.push(this.style.maxWidth);
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

  expect(offsetWidthRead).toHaveBeenCalled();
  expect(maxWidthsAtIntrinsicRead.length).toBeGreaterThan(0);
  expect(maxWidthsAtIntrinsicRead.every((maxWidth) => maxWidth === '')).toBe(true);
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
