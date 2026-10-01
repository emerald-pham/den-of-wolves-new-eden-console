import { useSessionStore } from '@/store/useSessionStore';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CONTACT_SCAN_EVENT, CONTACT_SCAN_LAYOUT_EVENT, followSweeps, type Vector } from './sweep';
import {
  AMBIENT_CLASSIFICATION_MS,
  AMBIENT_CONTACT_LIFETIME_MS,
  ambientDradisOccurrence,
  nextAmbientDradisChange,
  type AmbientDradisSession,
} from './ambientDradisContact';
import { useMotionPreference } from '@/lib/motionPreference';
import { ambientCombatRange as ambientCombatRangeFor, type CombatRange } from './dradisRange';

/**
 * The threat board behind the launcher.
 *
 * A spherical scan is not a flat sweep on a floor: it is a two-dimensional
 * circle turning through a three-dimensional volume. So the board is a
 * wireframe sphere -- meridians and parallels -- with two discs turning
 * through it on different axes at different rates, and contacts hung anywhere
 * inside that volume rather than pinned to one plane. Perspective does the
 * depth work: a contact behind the centre is genuinely further from the camera
 * and paints smaller.
 *
 * Assume the board is on screen at all times. A route chooses how prominent it
 * is -- full-bleed behind everything, or inset at whatever size suits the
 * screen -- never whether it is there at all.
 *
 * CSS owns the sweep rotations. A frame observer reads those rendered planes
 * to acquire and refresh returns when their visible circumferences pass them. Reduced motion
 * stops both the CSS motion and the observer.
 */

type Track = {
  readonly tag: string;
  /** Degrees clockwise around the vertical axis. */
  readonly bearing: number;
  /** Degrees above (positive) or below the equator. */
  readonly elevation: number;
  /** Distance out from us: 0 at the centre of the sphere, 1 at its skin. */
  readonly range: number;
  /** Gameplay range is deliberately independent from this track's 3D position. */
  readonly combatRange: CombatRange;
  /** Fleet contacts and their shuttlecraft do not print a combat-range indicator. */
  readonly showCombatRange?: boolean;
  readonly color?: string;
};

export interface PlotContact {
  readonly id?: string;
  readonly tag: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: string;
  /** Gameplay range is deliberately independent from this contact's 3D position. */
  readonly combatRange?: CombatRange;
  /** Friendly fleet contacts, including their shuttlecraft, suppress the range label. */
  readonly showCombatRange?: boolean;
  readonly transit?: {
    readonly destination: Vector;
    readonly durationMs: number;
    readonly elapsedMs: number;
  };
}

/** Hand-placed rather than random, so the board is composed and never flickers
 *  into a new arrangement on re-render. */
const CONTACTS: readonly Track[] = [
  { tag: 'TRK 01', bearing: 18, elevation: 22, range: 0.72, combatRange: 'short' },
  { tag: 'TRK 02', bearing: 63, elevation: -14, range: 0.44, combatRange: 'short' },
  { tag: 'UNKN', bearing: 107, elevation: 41, range: 0.86, combatRange: 'short' },
  { tag: 'TRK 04', bearing: 152, elevation: -33, range: 0.61, combatRange: 'short' },
  { tag: 'TRK 05', bearing: 198, elevation: 8, range: 0.93, combatRange: 'short' },
  { tag: 'UNKN', bearing: 241, elevation: -52, range: 0.55, combatRange: 'short' },
  { tag: 'TRK 07', bearing: 286, elevation: 29, range: 0.78, combatRange: 'short' },
  { tag: 'TRK 08', bearing: 331, elevation: -6, range: 0.38, combatRange: 'short' },
];

/**
 * What the hack puts on the board. These are not contacts -- they are returns
 * injected by whatever is inside the console with us, and while the hack is
 * running the board has no way to tell them from the real ones, so they are
 * tagged like ordinary tracks. It is only once the intrusion ends that the
 * system works out they were never there.
 */
const SPOOFED: readonly Track[] = [
  { tag: 'TRK 09', bearing: 41, elevation: 12, range: 0.99, combatRange: 'short' },
  { tag: 'UNKN', bearing: 128, elevation: -25, range: 0.95, combatRange: 'short' },
  { tag: 'TRK 11', bearing: 214, elevation: 37, range: 0.97, combatRange: 'short' },
  { tag: 'TRK 12', bearing: 269, elevation: -9, range: 0.92, combatRange: 'short' },
  { tag: 'UNKN', bearing: 349, elevation: 19, range: 0.98, combatRange: 'short' },
];

/** What a spoofed track is called once the board knows better. */
const EXPOSED = 'FALSE';

/** How long the hostile tracks stay on the board after the intrusion clears,
 *  going to pieces. Long enough for the slowest of them to finish; the CSS
 *  carries the same budget across its duration and its delay. */
export const SPASM_MS = 3300;
const AMBIENT_RANGE_UPDATE_MS = 1_000;
const ZERO_ORIGIN: Vector = { x: 0, y: 0, z: 0 };
const LABEL_VIEWPORT_GUTTER_PX = 8;
const LABEL_HORIZONTAL_GAP_PX = 11;
const LABEL_LANE_OFFSETS = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7, -8, 8] as const;
const intrinsicLabelWidths = new WeakMap<HTMLElement, { context: string; width: number }>();
type LabelCandidateLayout = { anchor: LabelAnchor; bounds: DOMRect; style: string };
type PreparedAnchorLayout = { original: DOMRect; sideWidth: number; style: string };
type ContactLabelLayoutCache = {
  styleScope: string;
  context: string;
  plotBounds: DOMRect;
  markBounds: DOMRect;
  labelBounds: DOMRect;
  preferred: LabelCandidateLayout;
  opposite: LabelCandidateLayout;
  chosenAnchor: LabelAnchor;
  direct: boolean;
};
const contactLabelLayouts = new WeakMap<HTMLElement, ContactLabelLayoutCache>();
const handledFontEvents = new WeakSet<Event>();
let fontMetricsVersion = 0;

const MERIDIANS = [0, 30, 60, 90, 120, 150];
const PARALLELS = [-60, -30, 0, 30, 60];

/** Custom properties are how the geometry reaches the stylesheet. */
type PlotStyle = CSSProperties & Record<`--${string}`, string | number>;

const round = (value: number): number => Math.round(value * 1e4) / 1e4;
const radians = (degrees: number): number => (degrees * Math.PI) / 180;

type LabelAnchor = 'north-east' | 'north-west' | 'south-east' | 'south-west';
type ProjectedAxes = {
  x: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;
  y: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;
};

function measuredTranslationAxes(original: DOMRect, xProbe: DOMRect, yProbe: DOMRect, probePx: number): ProjectedAxes {
  return {
    x: {
      left: (xProbe.left - original.left) / probePx,
      right: (xProbe.right - original.right) / probePx,
      top: (xProbe.top - original.top) / probePx,
      bottom: (xProbe.bottom - original.bottom) / probePx,
    },
    y: {
      left: (yProbe.left - original.left) / probePx,
      right: (yProbe.right - original.right) / probePx,
      top: (yProbe.top - original.top) / probePx,
      bottom: (yProbe.bottom - original.bottom) / probePx,
    },
  };
}

function labelAnchor(track: Track | PlotContact, index: number): LabelAnchor {
  let x: number;
  let y: number;
  if ('x' in track) {
    ({ x, y } = track);
  } else {
    const a = radians(track.bearing);
    const e = radians(track.elevation);
    x = track.range * Math.cos(e) * Math.sin(a);
    y = -track.range * Math.sin(e);
  }

  // Push labels away from the origin. Near either centreline, alternate sides
  // so close returns do not paint their names into the same strip of space.
  const horizontal = Math.abs(x) < 0.16
    ? (index % 2 === 0 ? 'east' : 'west')
    : (x < 0 ? 'west' : 'east');
  const vertical = Math.abs(y) < 0.16
    ? (Math.floor(index / 2) % 2 === 0 ? 'south' : 'north')
    : (y < 0 ? 'north' : 'south');
  return `${vertical}-${horizontal}`;
}

function combatRangeLabel(track: Track | PlotContact): string {
  return (track.combatRange ?? 'short').toUpperCase();
}

/** A new ship name needs a new sweep acquisition; an ambient classification
 *  changes only after its already-acquired return is scanned. */
function contactRenderKey(track: Track | PlotContact, index: number, ambient: boolean): string {
  if ('id' in track && track.id) {
    return JSON.stringify([track.id, ambient ? null : track.tag]);
  }
  return JSON.stringify([track.tag, index]);
}

function styleScopeElementSignature(element: HTMLElement): string {
  const attributes = Array.from(element.attributes)
    .filter((attribute) => attribute.name !== 'style' && attribute.name !== 'data-label-anchor')
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .sort()
    .join(';');
  return `${element.tagName}[${attributes}]{${element.getAttribute('style') ?? ''}}`;
}

/** Shared style and responsive context outside one contact label. */
function labelWidthStyleScope(plot: HTMLElement): string {
  const ancestors: string[] = [];
  for (let element: HTMLElement | null = plot; element; element = element.parentElement) {
    ancestors.push(styleScopeElementSignature(element));
  }
  const viewport = typeof window === 'undefined'
    ? 'server'
    : `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`;
  const fonts = typeof document === 'undefined' ? 'unavailable' : document.fonts?.status ?? 'unavailable';
  return `${fontMetricsVersion}|${fonts}|${viewport}|${ancestors.join('>')}`;
}

const LABEL_FONT_STYLE_PROPERTIES = [
  'display', 'font', 'font-family', 'font-size', 'font-stretch', 'font-style', 'font-variant',
  'font-weight', 'line-height', 'letter-spacing', 'word-spacing', 'white-space', 'width',
  'min-width', 'max-width', 'box-sizing', 'padding-inline', 'padding-left', 'padding-right',
  'border-left-width', 'border-right-width',
] as const;

function labelFontStyleSignature(element: HTMLElement): string {
  const properties = LABEL_FONT_STYLE_PROPERTIES
    .map((property) => `${property}:${element.style.getPropertyValue(property)}`)
    .join(';');
  const fontVariables = Array.from(element.style)
    .filter((property) => property.startsWith('--') && /(font|mono|type|letter|spacing)/i.test(property))
    .map((property) => `${property}:${element.style.getPropertyValue(property)}`)
    .join(';');
  return `${properties};${fontVariables}`;
}

// Sweeps change these visibility/animation flags without changing the label's
// intrinsic typography. Its rendered position is still measured on each fix.
const SWEEP_VISUAL_ATTRIBUTES = new Set(['data-acquired', 'data-scan-fresh']);

/** Label ancestors inside the 3D contact may move every update; only their
 * typography-affecting inline declarations belong in this intrinsic-width key. */
function intrinsicLabelWidthContext(
  plot: HTMLElement,
  label: HTMLElement,
  contact: HTMLElement | null,
  plotBounds: DOMRect,
  styleScope: string,
): string {
  const path: string[] = [];
  let insideContact = contact !== null;
  for (let element: HTMLElement | null = label; element && element !== plot; element = element.parentElement) {
    const attributes = Array.from(element.attributes)
      .filter((attribute) => attribute.name !== 'style' && attribute.name !== 'data-label-anchor' &&
        !SWEEP_VISUAL_ATTRIBUTES.has(attribute.name))
      .map((attribute) => `${attribute.name}=${attribute.value}`)
      .sort()
      .join(';');
    const inlineStyle = insideContact && element !== label
      ? labelFontStyleSignature(element)
      : element.getAttribute('style') ?? '';
    path.push(`${element.tagName}[${attributes}]{${inlineStyle}}`);
    if (element === contact) insideContact = false;
  }
  return `${styleScope}|${plotBounds.width}x${plotBounds.height}|${label.textContent ?? ''}|${path.join('>')}`;
}

function samePlotBounds(a: DOMRect, b: DOMRect): boolean {
  return a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom &&
    a.width === b.width && a.height === b.height;
}

/**
 * Sweep batches only move the held fix for contacts they just scanned. Reuse
 * the last full layout for every other return, then replay the direct-anchor
 * scoring pass against the new marks. If any label would need a different
 * anchor or the crowded fallback, return false so the caller runs the exact
 * full layout path.
 */
function clampScannedContactLabels(
  plot: HTMLElement,
  styleScope: string,
  changedContacts: readonly HTMLElement[],
): DOMRect | undefined {
  const plotBounds = plot.getBoundingClientRect();
  if (plotBounds.width <= 0 || plotBounds.height <= 0) return plotBounds;
  const labels = [...plot.querySelectorAll<HTMLElement>('.contact-plot__tag')];
  const contacts = labels.map((label) => label.closest<HTMLElement>('.contact-plot__contact'));
  const indices = new Map(contacts.flatMap((contact, index) => contact ? [[contact, index] as const] : []));
  const targets = [...new Set(changedContacts.map((contact) => indices.get(contact)))]
    .filter((index): index is number => index !== undefined)
    .sort((a, b) => a - b);
  if (targets.length === 0) return plotBounds;
  const targetSet = new Set(targets);
  const cached = contacts.map((contact) => contact ? contactLabelLayouts.get(contact) : undefined);
  if (cached.some((layout, index) => !layout?.direct || layout.styleScope !== styleScope ||
    !samePlotBounds(layout.plotBounds, plotBounds) || layout.context !==
      intrinsicLabelWidthContext(plot, labels[index]!, contacts[index] ?? null, plotBounds, styleScope))) {
    return plotBounds;
  }
  // Departing spoof jitter can move an unscanned mark and its label between
  // sweeps. Only stationary, non-departing held fixes have reusable geometry.
  if (contacts.some((contact) => contact?.dataset.moving === 'true' ||
    contact?.dataset.departing === 'true')) return plotBounds;

  // First-acquisition flashes animate the blip's rendered scale even when
  // its held fix is stationary and no scan event targets it. Refresh every
  // mark in this read batch; only unchanged label rectangles can be reused.
  const marks: DOMRect[] = [];
  for (const contact of contacts) {
    const mark = contact?.querySelector<HTMLElement>('.contact-plot__blip');
    if (!mark) return plotBounds;
    const bounds = mark.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return plotBounds;
    marks.push(bounds);
  }
  const shipPlot = plot.closest<HTMLElement>('.ship-plot');
  const overlayControls = shipPlot?.querySelectorAll<HTMLElement>(
    '.ship-plot__label, .ship-plot__toggle, .ship-plot__galactic-coordinate, ' +
    '.ship-plot__close, .ship-plot__compass, [data-plot-obstacle], .dradis-effect-controls',
  ) ?? [];
  const baseObstacles = [
    ...plot.querySelectorAll<HTMLElement>('.contact-plot__origin, .contact-plot__red-alert'),
    ...overlayControls,
  ].map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  const changedLayouts = new Map<number, { preferred: LabelCandidateLayout; opposite: LabelCandidateLayout }>();
  const preferredStyles = new Map<number, string>();
  for (const index of targets) {
    const label = labels[index]!;
    const contact = contacts[index]!;
    const preferred = cached[index]!.preferred.anchor;
    resetSweepLabelLayout(label);
    contact.dataset.labelAnchor = preferred;
    preferredStyles.set(index, label.style.cssText);
  }
  for (const index of targets) {
    changedLayouts.set(index, {
      preferred: {
        anchor: cached[index]!.preferred.anchor,
        bounds: labels[index]!.getBoundingClientRect(),
        style: preferredStyles.get(index)!,
      },
      opposite: cached[index]!.opposite,
    });
  }
  const oppositeStyles = new Map<number, string>();
  for (const index of targets) {
    const label = labels[index]!;
    const contact = contacts[index]!;
    const opposite = cached[index]!.opposite.anchor;
    contact.dataset.labelAnchor = opposite;
    oppositeStyles.set(index, label.style.cssText);
  }
  for (const index of targets) {
    const label = labels[index]!;
    changedLayouts.get(index)!.opposite = {
      anchor: cached[index]!.opposite.anchor,
      bounds: label.getBoundingClientRect(),
      style: oppositeStyles.get(index)!,
    };
  }

  const gap = 4;
  const overlaps = (a: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
    b: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>) =>
    a.left < b.right + gap && a.right + gap > b.left &&
    a.top < b.bottom + gap && a.bottom + gap > b.top;
  const minX = plotBounds.left + LABEL_VIEWPORT_GUTTER_PX;
  const maxX = plotBounds.right - LABEL_VIEWPORT_GUTTER_PX;
  const minY = plotBounds.top + LABEL_VIEWPORT_GUTTER_PX;
  const maxY = plotBounds.bottom - LABEL_VIEWPORT_GUTTER_PX;
  const obstacles = [...baseObstacles];
  const chosen = new Map<number, LabelCandidateLayout>();
  for (const index of labels.keys()) {
    const contact = contacts[index];
    const mark = marks[index];
    const layoutCache = cached[index]!;
    const layouts = changedLayouts.get(index) ?? {
      preferred: layoutCache.preferred,
      opposite: layoutCache.opposite,
    };
    if (!contact || !mark || mark.width <= 0 || mark.height <= 0) return plotBounds;
    const nearby = [
      ...obstacles,
      ...marks.filter((_, otherIndex) => otherIndex !== index),
    ];
    const directCandidates: { layout: LabelCandidateLayout; clearance: number }[] = [];
    for (const layout of [layouts.preferred, layouts.opposite]) {
      const { bounds, anchor } = layout;
      const sideWidth = anchor.endsWith('east')
        ? mark.left - plotBounds.left - LABEL_VIEWPORT_GUTTER_PX - LABEL_HORIZONTAL_GAP_PX
        : plotBounds.right - LABEL_VIEWPORT_GUTTER_PX - mark.right - LABEL_HORIZONTAL_GAP_PX;
      const anchorGap = anchor.endsWith('east') ? mark.left - bounds.right : bounds.left - mark.right;
      const fits = sideWidth > 0 && bounds.width <= sideWidth && bounds.height > 0 &&
        bounds.left >= minX && bounds.right <= maxX &&
        bounds.top >= minY && bounds.bottom <= maxY && anchorGap >= 4;
      if (!fits) continue;
      let clearance = Number.POSITIVE_INFINITY;
      let collides = false;
      for (const rect of nearby) {
        if (overlaps(bounds, rect)) {
          collides = true;
          break;
        }
        const x = Math.max(0, rect.left - bounds.right, bounds.left - rect.right);
        const y = Math.max(0, rect.top - bounds.bottom, bounds.top - rect.bottom);
        clearance = Math.min(clearance, x * x + y * y);
      }
      if (!collides) directCandidates.push({
        layout,
        clearance: Number.isFinite(clearance) ? clearance : 0,
      });
    }
    if (directCandidates.length === 0) return plotBounds;
    const best = directCandidates.reduce((current, candidate) =>
      candidate.clearance > current.clearance ? candidate : current);
    if (!targetSet.has(index) && best.layout.anchor !== layoutCache.chosenAnchor) return plotBounds;
    chosen.set(index, best.layout);
    obstacles.push(best.layout.bounds);
  }

  const leaders = [...plot.querySelectorAll<SVGLineElement>('.contact-plot__leader-line')];
  for (const index of targets) {
    const label = labels[index]!;
    const contact = contacts[index]!;
    const mark = marks[index]!;
    const layout = chosen.get(index)!;
    contact.dataset.labelAnchor = layout.anchor;
    label.style.cssText = layout.style;
    contactLabelLayouts.set(contact, {
      styleScope,
      context: intrinsicLabelWidthContext(plot, label, contact, plotBounds, styleScope),
      plotBounds,
      markBounds: mark,
      labelBounds: layout.bounds,
      preferred: changedLayouts.get(index)!.preferred,
      opposite: changedLayouts.get(index)!.opposite,
      chosenAnchor: layout.anchor,
      direct: true,
    });
    const leader = leaders[index];
    if (!leader || contact.dataset.moving === 'true' || layout.bounds.width === 0 || layout.bounds.height === 0) {
      if (leader) leader.dataset.visible = 'false';
      continue;
    }
    const verticalGap = Math.max(0, mark.top - layout.bounds.bottom, layout.bounds.top - mark.bottom);
    const rowShift = Math.abs(Number.parseFloat(label.style.getPropertyValue('--label-clamp-y')) || 0);
    leader.dataset.visible = String(verticalGap > 14 || rowShift > 14);
    const east = layout.anchor.endsWith('east');
    leader.setAttribute('x1', String(round((east ? mark.left : mark.right) - plotBounds.left)));
    leader.setAttribute('y1', String(round(mark.top + mark.height / 2 - plotBounds.top)));
    leader.setAttribute('x2', String(round((east ? layout.bounds.right : layout.bounds.left) - plotBounds.left)));
    leader.setAttribute('y2', String(round(Math.max(layout.bounds.top, Math.min(
      mark.top + mark.height / 2, layout.bounds.bottom,
    )) - plotBounds.top)));
  }
  return undefined;
}

function resetSweepLabelLayout(label: HTMLElement): void {
  label.style.removeProperty('--label-clamp-x');
  label.style.removeProperty('--label-clamp-y');
  label.style.removeProperty('max-width');
  label.style.removeProperty('min-inline-size');
  label.style.removeProperty('white-space');
  label.style.removeProperty('overflow-wrap');
}

/** Keep intrinsic-width labels inside the actual rendered plot, on both axes. */
function clampContactLabels(
  plot: HTMLElement,
  styleScope: string,
  measuredPlotBounds?: DOMRect,
  reuseUnchangedGeometry = false,
): void {
  const plotBounds = measuredPlotBounds ?? plot.getBoundingClientRect();
  if (plotBounds.width <= 0 || plotBounds.height <= 0) return;
  const labels = [...plot.querySelectorAll<HTMLElement>('.contact-plot__tag')];
  // Resolve each owner once. The scoring passes revisit each contact several
  // times, and repeated closest() walks add up during a moving plot update.
  const contacts = labels.map((label) => label.closest<HTMLElement>('.contact-plot__contact'));
  const marks = contacts.map((contact) =>
    contact?.querySelector<HTMLElement>('.contact-plot__blip')?.getBoundingClientRect() ?? null);
  const passWidths = new Map<HTMLElement, { context: string; width: number }>();
  const intrinsicWidth = (label: HTMLElement, index: number): number => {
    const context = intrinsicLabelWidthContext(
      plot, label, contacts[index] ?? null, plotBounds, styleScope,
    );
    const passCached = passWidths.get(label);
    if (passCached?.context === context) return passCached.width;
    const cached = intrinsicLabelWidths.get(label);
    if (cached?.context === context) {
      passWidths.set(label, cached);
      return cached.width;
    }
    const width = label.offsetWidth;
    const measured = { context, width };
    intrinsicLabelWidths.set(label, measured);
    passWidths.set(label, measured);
    return width;
  };
  const finalBounds: Array<DOMRect | null> = Array.from({ length: labels.length }, () => null);
  const directPlacements = Array.from({ length: labels.length }, () => false);
  const gap = 4;
  const overlaps = (a: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
    b: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>) =>
    a.left < b.right + gap && a.right + gap > b.left &&
    a.top < b.bottom + gap && a.bottom + gap > b.top;
  const shift = (label: HTMLElement, x: number, y: number) => {
    if (x !== 0) {
      const previous = Number.parseFloat(label.style.getPropertyValue('--label-clamp-x')) || 0;
      label.style.setProperty('--label-clamp-x', `${round(previous + x)}px`);
    }
    if (y !== 0) {
      const previous = Number.parseFloat(label.style.getPropertyValue('--label-clamp-y')) || 0;
      label.style.setProperty('--label-clamp-y', `${round(previous + y)}px`);
    }
  };
  const resetLabelLayout = (label: HTMLElement) => {
    label.style.removeProperty('--label-clamp-x');
    label.style.removeProperty('--label-clamp-y');
    label.style.removeProperty('max-width');
    label.style.removeProperty('min-inline-size');
    label.style.removeProperty('white-space');
    label.style.removeProperty('overflow-wrap');
  };
  labels.forEach((label, index) => {
    // Measurable returns use the anchored pass below, which resets these
    // styles before scoring. Avoid a full throwaway sizing pass for each one.
    if (marks[index] && marks[index].width > 0 && marks[index].height > 0) return;
    resetLabelLayout(label);
    const visibleWidth = Math.max(1, plotBounds.width - 2 * LABEL_VIEWPORT_GUTTER_PX);
    if (label.getBoundingClientRect().width > visibleWidth) {
      label.style.maxWidth = `${visibleWidth}px`;
      label.style.minInlineSize = '0px';
      label.style.whiteSpace = 'normal';
      label.style.overflowWrap = 'anywhere';
      // The 3D contact plane can magnify a CSS-width label. Reduce the cap
      // until the rendered rectangle, rather than its untransformed width,
      // fits the visible scan area.
      for (let pass = 0; pass < 3; pass += 1) {
        const renderedWidth = label.getBoundingClientRect().width;
        if (renderedWidth <= visibleWidth) break;
        const cap = Number.parseFloat(label.style.maxWidth);
        label.style.maxWidth = `${Math.max(1, cap * visibleWidth / renderedWidth - 2)}px`;
      }
    }
  });

  // The second pass accounts for the transform changing the measured box in
  // perspective layouts without ever allowing a label to oscillate.
  for (let pass = 0; pass < 2; pass += 1) {
    labels.forEach((label, index) => {
      if (marks[index] && marks[index].width > 0 && marks[index].height > 0) return;
      const bounds = label.getBoundingClientRect();
      const minX = plotBounds.left + LABEL_VIEWPORT_GUTTER_PX;
      const maxX = plotBounds.right - LABEL_VIEWPORT_GUTTER_PX;
      const minY = plotBounds.top + LABEL_VIEWPORT_GUTTER_PX;
      const maxY = plotBounds.bottom - LABEL_VIEWPORT_GUTTER_PX;
      const x = bounds.left < minX ? minX - bounds.left : bounds.right > maxX ? maxX - bounds.right : 0;
      const y = bounds.top < minY ? minY - bounds.top : bounds.bottom > maxY ? maxY - bounds.bottom : 0;
      shift(label, x, y);
    });
  }

  // Reserve controls, the centre identifier, and every return mark. A name
  // stays beside its own return: choose its clearer left or right side before
  // considering a boundary correction. A scan reruns this for moving fixes.
  const shipPlot = plot.closest<HTMLElement>('.ship-plot');
  const overlayControls = shipPlot?.querySelectorAll<HTMLElement>(
    '.ship-plot__label, .ship-plot__toggle, .ship-plot__galactic-coordinate, ' +
    '.ship-plot__close, .ship-plot__compass, [data-plot-obstacle], .dradis-effect-controls',
  ) ?? [];
  const obstacles = [
    ...plot.querySelectorAll<HTMLElement>('.contact-plot__origin, .contact-plot__red-alert'),
    ...overlayControls,
  ].map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  const distanceFrom = (a: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
    b: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>) => {
    const x = Math.max(0, b.left - a.right, a.left - b.right);
    const y = Math.max(0, b.top - a.bottom, a.top - b.bottom);
    return Math.hypot(x, y);
  };

  // Reset every measurable label first, then read the two adjacent anchor
  // choices in batches. Reading and writing one contact at a time forces the
  // browser to repeat a full plot layout for every label. Most contacts fit
  // naturally on one of these exact rendered anchors. Crowded or
  // width-constrained labels continue through the measured fallback below.
  const preferredAnchors = contacts.map((contact) => contact?.dataset.labelAnchor as LabelAnchor | undefined);
  const oppositeAnchors = preferredAnchors.map((anchor): LabelAnchor | undefined => {
    if (!anchor) return undefined;
    const vertical = anchor.startsWith('north') ? 'north' : 'south';
    const side = anchor.endsWith('east') ? 'west' : 'east';
    return `${vertical}-${side}`;
  });
  const measureAnchorBatch = (anchors: Array<LabelAnchor | undefined>) => {
    const styles = labels.map((label, index) => {
      const marker = marks[index];
      const contact = contacts[index];
      const anchor = anchors[index];
      if (!marker || marker.width <= 0 || marker.height <= 0 || !contact || !anchor) return null;
      resetLabelLayout(label);
      contact.dataset.labelAnchor = anchor;
      return label.style.cssText;
    });
    return labels.map((label, index) => {
      const anchor = anchors[index];
      if (styles[index] === null || !anchor) return null;
      return { anchor, bounds: label.getBoundingClientRect(), style: styles[index]! };
    });
  };
  const preferredLayouts = measureAnchorBatch(preferredAnchors);
  // Reuse an alternate rectangle only when this contact's mark, measured
  // preferred rectangle and typography context are unchanged. Neighborhood
  // geometry may change: the exact two-anchor scorer below still compares
  // both candidates against every current mark and chosen label.
  const cachedAlternates = contacts.map((contact, index): LabelCandidateLayout | null => {
    const prior = contact ? contactLabelLayouts.get(contact) : undefined;
    const preferred = preferredLayouts[index];
    const marker = marks[index];
    if (!reuseUnchangedGeometry || !contact || !prior?.direct || !preferred || !marker ||
      contact.dataset.moving === 'true' || contact.dataset.departing === 'true' ||
      prior.styleScope !== styleScope || !samePlotBounds(prior.plotBounds, plotBounds) ||
      !samePlotBounds(prior.markBounds, marker) || prior.context !==
        intrinsicLabelWidthContext(plot, labels[index]!, contact, plotBounds, styleScope)) return null;
    const candidates = [prior.preferred, prior.opposite];
    const priorPreferred = candidates.find((candidate) => candidate.anchor === preferred.anchor);
    if (!priorPreferred || !samePlotBounds(priorPreferred.bounds, preferred.bounds)) return null;
    return candidates.find((candidate) => candidate.anchor === oppositeAnchors[index]) ?? null;
  });
  const oppositeLayouts = measureAnchorBatch(oppositeAnchors.map((anchor, index) =>
    cachedAlternates[index] ? undefined : anchor))
    .map((layout, index) => layout ?? cachedAlternates[index] ?? null);
  const anchorOrders = preferredAnchors.map((preferred): LabelAnchor[] => preferred ? [
    preferred,
    ...(['north-east', 'south-east', 'north-west', 'south-west'] as const)
      .filter((anchor) => anchor !== preferred),
  ] : []);
  const sideWidthAt = (index: number, anchor: LabelAnchor): number => anchor.endsWith('east')
    ? marks[index]!.left - plotBounds.left - LABEL_VIEWPORT_GUTTER_PX - LABEL_HORIZONTAL_GAP_PX
    : plotBounds.right - LABEL_VIEWPORT_GUTTER_PX - marks[index]!.right - LABEL_HORIZONTAL_GAP_PX;
  const preparedLayouts = labels.map((_, index) => {
    const prepared = new Map<LabelAnchor, PreparedAnchorLayout>();
    if (marks[index]) {
      for (const layout of [preferredLayouts[index], oppositeLayouts[index]]) {
        if (layout) prepared.set(layout.anchor, {
          original: layout.bounds, sideWidth: sideWidthAt(index, layout.anchor), style: layout.style,
        });
      }
    }
    return prepared;
  });
  // These contacts cannot fit either adjacent natural anchor even before
  // prior names become obstacles, so they necessarily need the full fallback.
  // Prepare their independent geometry together. Contacts made crowded only
  // by an earlier chosen name retain the exact on-demand path below.
  const batchFallback = labels.map((_, index) => index).filter((index) => {
    const marker = marks[index];
    if (!marker || !contacts[index] || !preferredLayouts[index] || !oppositeLayouts[index]) return false;
    const nearby = [...obstacles, ...marks.filter((mark, other): mark is DOMRect =>
      other !== index && mark !== null && mark.width > 0 && mark.height > 0)];
    return [preferredLayouts[index], oppositeLayouts[index]].every((layout) => {
      const { anchor, bounds } = layout!;
      const anchorGap = anchor.endsWith('east') ? marker.left - bounds.right : bounds.left - marker.right;
      return bounds.width <= 0 || bounds.height <= 0 ||
        bounds.left < plotBounds.left + LABEL_VIEWPORT_GUTTER_PX ||
        bounds.right > plotBounds.right - LABEL_VIEWPORT_GUTTER_PX ||
        bounds.top < plotBounds.top + LABEL_VIEWPORT_GUTTER_PX ||
        bounds.bottom > plotBounds.bottom - LABEL_VIEWPORT_GUTTER_PX ||
        anchorGap < 4 || nearby.some((rect) => overlaps(bounds, rect));
    });
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const anchors = new Map(batchFallback.map((index) => [index, anchorOrders[index]!
      .filter((anchor) => !preparedLayouts[index]!.has(anchor))[0]!]));
    // Each pass takes the next unprepared quadrant, preserving the original
    // natural two anchors and the same width-cap/correction arithmetic.
    for (const [index, anchor] of anchors) {
      resetLabelLayout(labels[index]!);
      contacts[index]!.dataset.labelAnchor = anchor;
    }
    const originals = new Map([...anchors].map(([index]) => [index, labels[index]!.getBoundingClientRect()]));
    const caps = [...anchors].filter(([index, anchor]) => originals.get(index)!.width > sideWidthAt(index, anchor) &&
      sideWidthAt(index, anchor) > 0);
    const capWidths = new Map(caps.map(([index, anchor]) => {
      const width = intrinsicWidth(labels[index]!, index);
      const scale = width > 0 ? originals.get(index)!.width / width : 1;
      return [index, Math.max(1, Math.max(1, sideWidthAt(index, anchor) - 2) / scale)];
    }));
    for (const [index] of caps) {
      const label = labels[index]!;
      label.style.maxWidth = `${capWidths.get(index)!}px`;
      label.style.minInlineSize = '0px';
      label.style.whiteSpace = 'normal';
      label.style.overflowWrap = 'anywhere';
    }
    for (const [index] of caps) originals.set(index, labels[index]!.getBoundingClientRect());
    const corrections = caps.filter(([index, anchor]) => originals.get(index)!.width > sideWidthAt(index, anchor));
    for (const [index, anchor] of corrections) {
      const label = labels[index]!;
      const cap = Number.parseFloat(label.style.maxWidth);
      label.style.maxWidth = `${Math.max(1, cap * Math.max(1, sideWidthAt(index, anchor) - 2) /
        originals.get(index)!.width)}px`;
    }
    for (const [index] of corrections) originals.set(index, labels[index]!.getBoundingClientRect());
    for (const [index, anchor] of anchors) preparedLayouts[index]!.set(anchor, {
      original: originals.get(index)!, sideWidth: sideWidthAt(index, anchor), style: labels[index]!.style.cssText,
    });
  }
  const batchedProjections: Partial<Record<'east' | 'west', ProjectedAxes>>[] = labels.map(() => ({}));
  for (const side of ['east', 'west'] as const) {
    const references = new Map(batchFallback.map((index) => [index,
      anchorOrders[index]!.find((anchor) => anchor.endsWith(side))!]));
    for (const [index, anchor] of references) {
      contacts[index]!.dataset.labelAnchor = anchor;
      labels[index]!.style.cssText = preparedLayouts[index]!.get(anchor)!.style;
      labels[index]!.style.setProperty('--label-clamp-x', '8px');
    }
    const xProbes = new Map(batchFallback.map((index) => [index, labels[index]!.getBoundingClientRect()]));
    for (const [index, anchor] of references) {
      labels[index]!.style.cssText = preparedLayouts[index]!.get(anchor)!.style;
      labels[index]!.style.setProperty('--label-clamp-y', '8px');
    }
    const yProbes = new Map(batchFallback.map((index) => [index, labels[index]!.getBoundingClientRect()]));
    for (const [index, anchor] of references) {
      const prepared = preparedLayouts[index]!.get(anchor)!;
      labels[index]!.style.cssText = prepared.style;
      batchedProjections[index]![side] = measuredTranslationAxes(prepared.original,
        xProbes.get(index)!, yProbes.get(index)!, 8);
    }
  }
  for (const [index, label] of labels.entries()) {
    const marker = marks[index];
    const contact = contacts[index];
    const preferredLayout = preferredLayouts[index];
    const oppositeLayout = oppositeLayouts[index];
    if (marker && marker.width > 0 && marker.height > 0 && contact &&
      preferredLayout && preferredLayout.bounds.width > 0) {
      const nearby = [
        ...obstacles,
        ...marks.filter((mark, markIndex): mark is DOMRect =>
          markIndex !== index && mark !== null && mark.width > 0 && mark.height > 0),
      ];
      const preferred = preferredAnchors[index]!;
      const minX = plotBounds.left + LABEL_VIEWPORT_GUTTER_PX;
      const maxX = plotBounds.right - LABEL_VIEWPORT_GUTTER_PX;
      const minY = plotBounds.top + LABEL_VIEWPORT_GUTTER_PX;
      const maxY = plotBounds.bottom - LABEL_VIEWPORT_GUTTER_PX;
      const directCandidate = (layout: LabelCandidateLayout | null) => {
        if (!layout) return null;
        const { anchor, bounds } = layout;
        const sideWidth = anchor.endsWith('east')
          ? marker.left - plotBounds.left - LABEL_VIEWPORT_GUTTER_PX - LABEL_HORIZONTAL_GAP_PX
          : plotBounds.right - LABEL_VIEWPORT_GUTTER_PX - marker.right - LABEL_HORIZONTAL_GAP_PX;
        const anchorGap = anchor.endsWith('east')
          ? marker.left - bounds.right : bounds.left - marker.right;
        const fits = sideWidth > 0 && bounds.width <= sideWidth && bounds.height > 0 &&
          bounds.left >= minX && bounds.right <= maxX &&
          bounds.top >= minY && bounds.bottom <= maxY &&
          anchorGap >= 4;
        if (!fits) return null;
        let clearance = Number.POSITIVE_INFINITY;
        let collides = false;
        for (const rect of nearby) {
          if (overlaps(bounds, rect)) {
            collides = true;
            break;
          }
          const x = Math.max(0, rect.left - bounds.right, bounds.left - rect.right);
          const y = Math.max(0, rect.top - bounds.bottom, bounds.top - rect.bottom);
          clearance = Math.min(clearance, x * x + y * y);
        }
        if (collides) return null;
        return { layout, clearance: Number.isFinite(clearance) ? clearance : 0 };
      };
      const directCandidates = [] as NonNullable<ReturnType<typeof directCandidate>>[];
      const preferredCandidate = directCandidate(preferredLayout);
      const oppositeCandidate = directCandidate(oppositeLayout ?? null);
      if (preferredCandidate) directCandidates.push(preferredCandidate);
      if (oppositeCandidate) directCandidates.push(oppositeCandidate);
      if (directCandidates.length > 0) {
        const bestDirect = directCandidates.reduce((best, candidate) =>
          candidate.clearance > best.clearance ? candidate : best).layout;
        contact.dataset.labelAnchor = bestDirect.anchor;
        label.style.cssText = bestDirect.style;
        finalBounds[index] = bestDirect.bounds;
        obstacles.push(bestDirect.bounds);
        directPlacements[index] = true;
        continue;
      }
      const preparedByAnchor = preparedLayouts[index]!;
      const prepareAnchor = (anchor: LabelAnchor) => {
        const prepared = preparedByAnchor.get(anchor);
        if (prepared) {
          contact.dataset.labelAnchor = anchor;
          label.style.cssText = prepared.style;
          return prepared;
        }
        contact.dataset.labelAnchor = anchor;
        resetLabelLayout(label);
        const sideWidth = anchor.endsWith('east')
          ? marker.left - plotBounds.left - LABEL_VIEWPORT_GUTTER_PX - LABEL_HORIZONTAL_GAP_PX
          : plotBounds.right - LABEL_VIEWPORT_GUTTER_PX - marker.right - LABEL_HORIZONTAL_GAP_PX;
        let original = label.getBoundingClientRect();
        if (original.width > sideWidth && sideWidth > 0) {
          // Read the untransformed width before changing the cap. This shares
          // the intrinsic layout state with `original`, so perspective scale
          // is estimated without a second style/layout flush.
          const untransformedWidth = intrinsicWidth(label, index);
          const projectedScale = untransformedWidth > 0
            ? original.width / untransformedWidth
            : 1;
          label.style.maxWidth = `${Math.max(1, Math.max(1, sideWidth - 2) / projectedScale)}px`;
          label.style.minInlineSize = '0px';
          label.style.whiteSpace = 'normal';
          label.style.overflowWrap = 'anywhere';
          // Check the first projection after capping and correct any nonlinear
          // perspective or wrapping difference with one counted read.
          original = label.getBoundingClientRect();
          if (original.width > sideWidth) {
            const cap = Number.parseFloat(label.style.maxWidth);
            label.style.maxWidth = `${Math.max(1, cap * Math.max(1, sideWidth - 2) / original.width)}px`;
            original = label.getBoundingClientRect();
          }
        }
        const candidate = { original, sideWidth, style: label.style.cssText };
        preparedByAnchor.set(anchor, candidate);
        return candidate;
      };
      const preferredVertical = preferred.startsWith('north') ? 'north' : 'south';
      const oppositeSide = preferred.endsWith('east') ? 'west' : 'east';
      const quickCandidates: {
        anchor: LabelAnchor;
        style: string;
        bounds: DOMRect;
        clearance: number;
      }[] = [];
      for (const anchor of [preferred, `${preferredVertical}-${oppositeSide}` as LabelAnchor]) {
        const candidate = prepareAnchor(anchor);
        const bounds = candidate.original;
        const anchorGap = anchor.endsWith('east')
          ? marker.left - bounds.right : bounds.left - marker.right;
        const fits = bounds.width > 0 && bounds.height > 0 &&
          bounds.left >= minX && bounds.right <= maxX &&
          bounds.top >= minY && bounds.bottom <= maxY &&
          anchorGap >= 4;
        if (!fits) continue;
        let clearance = Number.POSITIVE_INFINITY;
        let collides = false;
        for (const rect of nearby) {
          if (overlaps(bounds, rect)) {
            collides = true;
            break;
          }
          const x = Math.max(0, rect.left - bounds.right, bounds.left - rect.right);
          const y = Math.max(0, rect.top - bounds.bottom, bounds.top - rect.bottom);
          clearance = Math.min(clearance, x * x + y * y);
        }
        if (!collides) quickCandidates.push({
          anchor,
          style: candidate.style,
          bounds,
          clearance: Number.isFinite(clearance) ? clearance : 0,
        });
      }
      if (quickCandidates.length > 0) {
        const bestQuick = quickCandidates.reduce((best, candidate) =>
          candidate.clearance > best.clearance ? candidate : best);
        contact.dataset.labelAnchor = bestQuick.anchor;
        label.style.cssText = bestQuick.style;
        finalBounds[index] = bestQuick.bounds;
        obstacles.push(bestQuick.bounds);
        continue;
      }
      const anchors = anchorOrders[index]!;
      const sideProjections = { ...batchedProjections[index] };
      let best: { anchor: LabelAnchor; style: string; x: number; y: number; score: number } | null = null;
      for (const anchor of anchors) {
        const { original, sideWidth, style: baseStyle } = prepareAnchor(anchor);
        let nearestClearLane: number | null = null;
        // A contact sits in a 3D plane. Measure its local translation axes
        // once per side, then score every anchor and nearby row without forcing a
        // browser layout for each candidate. Measure the final choice again.
        const probePx = 8;
        const side = anchor.endsWith('east') ? 'east' : 'west';
        const projection: ProjectedAxes = sideProjections[side] ?? (() => {
          label.style.setProperty('--label-clamp-x', `${probePx}px`);
          const xProbe = label.getBoundingClientRect();
          label.style.removeProperty('--label-clamp-x');
          label.style.setProperty('--label-clamp-y', `${probePx}px`);
          const yProbe = label.getBoundingClientRect();
          label.style.cssText = baseStyle;
          return measuredTranslationAxes(original, xProbe, yProbe, probePx);
        })();
        sideProjections[side] = projection;
        const projected = (cssX: number, cssY: number) => ({
          left: original.left + cssX * projection.x.left + cssY * projection.y.left,
          right: original.right + cssX * projection.x.right + cssY * projection.y.right,
          top: original.top + cssX * projection.x.top + cssY * projection.y.top,
          bottom: original.bottom + cssX * projection.x.bottom + cssY * projection.y.bottom,
        });
        const x = original.left < minX ? minX - original.left
          : original.right > maxX ? maxX - original.right : 0;
        const y = original.top < minY ? minY - original.top
          : original.bottom > maxY ? maxY - original.bottom : 0;
        // If both adjacent quadrants are occupied, move the name only along
        // its return's side, one nearby text row at a time. Its horizontal
        // gap from the return remains fixed, even in a crowded plot.
        for (const lane of LABEL_LANE_OFFSETS) {
          const laneY = y + lane * (original.height + gap);
          const candidate = projected(x, laneY);
          const correctionY = candidate.top < minY ? minY - candidate.top
            : candidate.bottom > maxY ? maxY - candidate.bottom : 0;
          const bounds = projected(x, laneY + correctionY);
          const anchorGap = anchor.endsWith('east')
            ? marker.left - bounds.right : bounds.left - marker.right;
          let collisionCount = 0;
          let clearance = Number.POSITIVE_INFINITY;
          for (const rect of nearby) {
            if (overlaps(bounds, rect)) collisionCount += 1;
            clearance = Math.min(clearance, distanceFrom(bounds, rect));
          }
          if (nearby.length === 0) clearance = 0;
          const edgeOverflow = Math.max(0, minX - bounds.left, bounds.right - maxX,
            minY - bounds.top, bounds.bottom - maxY);
          const score = collisionCount * 1_000_000 + edgeOverflow * 100_000 +
            Math.max(0, 4 - anchorGap) * 100_000 +
            Math.max(0, 48 - sideWidth) * 1_000 +
            (Math.abs(x) + Math.abs(y + correctionY)) * 100 +
            Math.abs(lane) * 2_000 - clearance;
          if (!best || score < best.score) {
            best = { anchor, style: baseStyle, x, y: laneY + correctionY, score };
          }
          if (collisionCount === 0 && nearestClearLane === null) nearestClearLane = Math.abs(lane);
          // The nearest clear row wins on this side. Finish its matching
          // opposite row before considering a more distant lane.
          if (nearestClearLane !== null && (lane === 0 || lane === nearestClearLane)) break;
        }
      }
      if (best) {
        contact.dataset.labelAnchor = best.anchor;
        label.style.cssText = best.style;
        shift(label, best.x, best.y);
        let placed = label.getBoundingClientRect();
        const east = best.anchor.endsWith('east');
        const anchorGap = east ? marker.left - placed.right : placed.left - marker.right;
        const finalProjection = sideProjections[east ? 'east' : 'west'];
        if (anchorGap < 4 && finalProjection) {
          const xScale = east ? finalProjection.x.right : finalProjection.x.left;
          if (Math.abs(xScale) > 0.1) {
            shift(label, (east ? -1 : 1) * (4 - anchorGap) / xScale, 0);
            placed = label.getBoundingClientRect();
          }
        }
        finalBounds[index] = placed;
        obstacles.push(placed);
      } else {
        finalBounds[index] = label.getBoundingClientRect();
      }
      continue;
    }
    // Keep non-layout environments and detached plots safe. A browser with a
    // measurable return mark always uses the anchored placement above.
    for (let pass = 0; pass < 2; pass += 1) {
      const current = label.getBoundingClientRect();
      if (!obstacles.some((rect) => overlaps(current, rect))) break;
      const minX = plotBounds.left + LABEL_VIEWPORT_GUTTER_PX;
      const minY = plotBounds.top + LABEL_VIEWPORT_GUTTER_PX;
      const maxX = plotBounds.right - LABEL_VIEWPORT_GUTTER_PX - current.width;
      const maxY = plotBounds.bottom - LABEL_VIEWPORT_GUTTER_PX - current.height;
      if (maxX < minX || maxY < minY) break;
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
      const xs = [current.left, ...obstacles.flatMap((rect) => [
        rect.left - current.width - gap, rect.right + gap,
      ])].map((x) => clamp(x, minX, maxX));
      const ys = [current.top, ...obstacles.flatMap((rect) => [
        rect.top - current.height - gap, rect.bottom + gap,
      ])].map((y) => clamp(y, minY, maxY));
      let best: { x: number; y: number; distance: number } | null = null;
      for (const x of new Set(xs)) {
        for (const y of new Set(ys)) {
          const candidate = { left: x, right: x + current.width, top: y, bottom: y + current.height };
          if (obstacles.some((rect) => overlaps(candidate, rect))) continue;
          const distance = (x - current.left) ** 2 + (y - current.top) ** 2;
          if (!best || distance < best.distance) best = { x, y, distance };
        }
      }
      if (!best) break;
      shift(label, best.x - current.left, best.y - current.top);
    }
    const placed = label.getBoundingClientRect();
    finalBounds[index] = placed;
    if (placed.width > 0 && placed.height > 0) obstacles.push(placed);
  }

  // A name shifted to a nearby row needs a visible connection to its return.
  // Use rendered coordinates after 3D projection, so rotation cannot detach it.
  const leaders = [...plot.querySelectorAll<SVGLineElement>('.contact-plot__leader-line')];
  for (const [index, label] of labels.entries()) {
    const leader = leaders[index];
    const marker = marks[index];
    const contact = contacts[index];
    const bounds = finalBounds[index] ?? label.getBoundingClientRect();
    const preferred = preferredLayouts[index];
    const opposite = oppositeLayouts[index];
    if (contact && marker && bounds.width > 0 && bounds.height > 0 && preferred && opposite) {
      contactLabelLayouts.set(contact, {
        styleScope,
        context: intrinsicLabelWidthContext(plot, label, contact, plotBounds, styleScope),
        plotBounds,
        markBounds: marker,
        labelBounds: bounds,
        preferred,
        opposite,
        chosenAnchor: contact.dataset.labelAnchor as LabelAnchor,
        direct: directPlacements[index] === true,
      });
    }
    if (!leader || !marker || !contact || contact.dataset.moving === 'true' ||
      bounds.width === 0 || bounds.height === 0) {
      if (leader) leader.dataset.visible = 'false';
      continue;
    }
    const verticalGap = Math.max(0, marker.top - bounds.bottom, bounds.top - marker.bottom);
    const rowShift = Math.abs(Number.parseFloat(label.style.getPropertyValue('--label-clamp-y')) || 0);
    leader.dataset.visible = String(verticalGap > 14 || rowShift > 14);
    const east = contact.dataset.labelAnchor?.endsWith('east');
    leader.setAttribute('x1', String(round((east ? marker.left : marker.right) - plotBounds.left)));
    leader.setAttribute('y1', String(round(marker.top + marker.height / 2 - plotBounds.top)));
    leader.setAttribute('x2', String(round((east ? bounds.right : bounds.left) - plotBounds.left)));
    leader.setAttribute('y2', String(round(Math.max(bounds.top, Math.min(marker.top + marker.height / 2,
      bounds.bottom)) - plotBounds.top)));
  }
}

function relativeVector(point: Vector, origin: Vector): Vector {
  return { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
}

function interpolateVector(start: Vector, destination: Vector, progress: number): Vector {
  return {
    x: start.x + (destination.x - start.x) * progress,
    y: start.y + (destination.y - start.y) * progress,
    z: start.z + (destination.z - start.z) * progress,
  };
}

/** Spherical coordinates to the offsets CSS translates a contact by. */
function place({ bearing, elevation, range }: Track): PlotStyle {
  const a = radians(bearing);
  const e = radians(elevation);
  const x = range * Math.cos(e) * Math.sin(a);
  const y = -range * Math.sin(e);
  const z = range * Math.cos(e) * Math.cos(a);

  return {
    '--bearing': `${bearing}deg`,
    '--x': round(x),
    '--y': round(y),
    '--z': round(z),
    // Depth, 0 at the far skin and 1 at the near one: contacts on the far side
    // of the sphere have to read as further away than perspective alone shows.
    '--depth': round((z + 1) / 2),
    // The drop line hangs from the contact to the equatorial plane, which is
    // downward for anything above it and upward for anything below.
    '--drop': round(Math.abs(y)),
    '--flip': y < 0 ? 1 : -1,
    // Phase only staggers the spoofed-contact break-up effect.
    '--phase': round((((bearing % 180) + 180) % 180) / 180),
  };
}

function placeCartesian({ x, y, z, color, transit }: PlotContact): PlotStyle {
  const range = Math.hypot(x, y, z);
  const bearing = Math.atan2(x, z) * 180 / Math.PI;
  const style: PlotStyle = {
    '--bearing': `${round(bearing)}deg`,
    '--x': round(x),
    '--y': round(y),
    '--z': round(z),
    '--depth': round((z + 1) / 2),
    '--drop': round(Math.abs(y)),
    '--flip': y < 0 ? 1 : -1,
    '--phase': round(((((bearing % 180) + 180) % 180) / 180)),
    '--contact-ink': color,
    '--contact-range': round(range),
  };
  if (transit) {
    style['--transit-x'] = round(transit.destination.x);
    style['--transit-y'] = round(transit.destination.y);
    style['--transit-z'] = round(transit.destination.z);
    style['--transit-duration'] = `${transit.durationMs}ms`;
    style['--transit-delay'] = `${-transit.elapsedMs}ms`;
  }
  return style;
}

/** A parallel is a smaller circle lifted off the equator. */
function ring(latitude: number): PlotStyle {
  const e = radians(latitude);
  return { '--girth': round(Math.cos(e)), '--lift': round(Math.sin(e)) };
}

export default function ContactPlot({
  hostile = false,
  placement = 'field',
  size,
  contacts,
  ambientSession,
  centerLabel,
  orientation,
  origin = ZERO_ORIGIN,
}: {
  hostile?: boolean;
  /** `field` fills the viewport behind everything; `inset` fills a positioned
   *  parent; `widget` uses that same inset geometry inside a ship display. */
  placement?: 'field' | 'inset' | 'widget';
  /** Any CSS length. Overrides the placement's default diameter. */
  size?: string | undefined;
  contacts?: readonly PlotContact[] | undefined;
  /** Session timing is the shared source for automatic and GM-triggered traffic. */
  ambientSession?: AmbientDradisSession | undefined;
  centerLabel?: string | undefined;
  orientation?: { readonly pitch: number; readonly yaw: number } | undefined;
  /** Shared-world origin of the ship whose DRADIS is rendering this plot. */
  origin?: Vector | undefined;
}) {
  const redAlert = useSessionStore(state => state.session?.fleetRedAlert?.active === true);
  const plot = useRef<HTMLDivElement>(null);
  const hasLaidOutInitialPlot = useRef(false);
  const { reducedMotion: still } = useMotionPreference();
  const [clock, setClock] = useState(Date.now);
  const [classifiedOccurrenceId, setClassifiedOccurrenceId] = useState<string | null>(null);
  const ambient = ambientSession ? ambientDradisOccurrence(ambientSession, clock) : null;

  useEffect(() => {
    if (!ambientSession) return;
    const now = Date.now();
    if (now !== clock) setClock(now);
    const next = nextAmbientDradisChange(ambientSession, now);
    if (next === null) return;
    const refreshAt = ambient ? Math.min(next, now + AMBIENT_RANGE_UPDATE_MS) : next;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(1, refreshAt - now));
    return () => window.clearTimeout(timer);
  }, [ambient, ambientSession, clock]);

  useEffect(() => {
    const node = plot.current;
    if (!node) return;
    const classify = (event: Event) => {
      const contact = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-ambient='true']")
        : null;
      if (!contact) return;
      if (ambient && Date.now() - ambient.appearedAt >= AMBIENT_CLASSIFICATION_MS) {
        setClassifiedOccurrenceId(ambient.id);
      }
    };
    node.addEventListener(CONTACT_SCAN_EVENT, classify);
    return () => node.removeEventListener(CONTACT_SCAN_EVENT, classify);
  }, [ambient]);

  useEffect(() => {
    if (still || !plot.current || typeof DOMMatrixReadOnly === 'undefined') return;
    return followSweeps(plot.current);
  }, [still]);

  // The hostile tracks outlive the intrusion by exactly as long as it takes
  // them to break up. Unmounting them the instant the threat clears would cut
  // the departure off at the first frame.
  const [departing, setDeparting] = useState(false);

  useEffect(() => {
    if (hostile) {
      setDeparting(true);
      return;
    }
    if (!departing) return;
    const gone = window.setTimeout(() => setDeparting(false), SPASM_MS);
    return () => window.clearTimeout(gone);
  }, [hostile, departing]);

  // Spoofed returns outlive the intrusion by exactly as long as it takes them
  // to break up. Dropping them the instant the hack ends would cut the reveal
  // off at its first frame.
  const exposed = departing && !hostile;
  const ambientProgress = ambient
    ? Math.min(1, Math.max(0, (clock - ambient.appearedAt) / AMBIENT_CONTACT_LIFETIME_MS))
    : 0;
  const ambientPosition = ambient
    ? interpolateVector(ambient.start, ambient.destination, ambientProgress)
    : null;
  const ambientStart = ambient ? relativeVector(ambient.start, origin) : null;
  const ambientDestination = ambient ? relativeVector(ambient.destination, origin) : null;
  const baseTracks: readonly {
    track: Track | PlotContact;
    spoof: boolean;
    cartesian: boolean;
    ambient: boolean;
  }[] =
    contacts
      ? contacts.map((track) => ({ track, spoof: false, cartesian: true, ambient: false }))
      : CONTACTS.map((track) => ({ track, spoof: false, cartesian: false, ambient: false }));
  const tracks = [
    ...baseTracks,
    ...(ambient ? [{
      track: {
        id: ambient.id,
        tag: classifiedOccurrenceId === ambient.id ? ambient.classification : 'UNKNOWN CONTACT',
        ...(ambientStart ?? ZERO_ORIGIN),
        color: 'var(--cic-cyan-hot)',
        combatRange: ambientPosition
          ? ambientCombatRangeFor(ambientPosition, origin)
          : 'long' as const,
        transit: {
          destination: ambientDestination ?? ZERO_ORIGIN,
          durationMs: AMBIENT_CONTACT_LIFETIME_MS,
          elapsedMs: Math.max(0, clock - ambient.appearedAt),
        },
      },
      spoof: false,
      cartesian: true,
      ambient: true,
    }] : []),
    ...(hostile || departing
      ? SPOOFED.map((track) => ({ track, spoof: true, cartesian: false, ambient: false }))
      : []),
  ];

  useLayoutEffect(() => {
    const node = plot.current;
    if (!node) return;
    let observedStyleScope = labelWidthStyleScope(node);
    const pendingSweepLayouts = new Set<HTMLElement>();
    const clamp = () => {
      observedStyleScope = labelWidthStyleScope(node);
      clampContactLabels(node, observedStyleScope);
    };
    const clampAfterReactUpdate = () => {
      observedStyleScope = labelWidthStyleScope(node);
      clampContactLabels(node, observedStyleScope, undefined, true);
    };
    const clampSweepBatch = () => {
      const changedContacts = [...pendingSweepLayouts];
      pendingSweepLayouts.clear();
      observedStyleScope = labelWidthStyleScope(node);
      const fallbackBounds = clampScannedContactLabels(node, observedStyleScope, changedContacts);
      if (fallbackBounds) clampContactLabels(node, observedStyleScope, fallbackBounds);
    };
    const clampMovingFix = (event: Event) => {
      const detail = (event as CustomEvent<{ fixChanged?: boolean; layoutDeferred?: boolean }>).detail;
      const contact = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('.contact-plot__contact') : null;
      if (detail?.layoutDeferred) {
        if (contact && (contact.dataset.moving === 'true' || detail.fixChanged === true)) {
          pendingSweepLayouts.add(contact);
        }
        return;
      }
      // A held stationary fix can change on first acquisition or a later
      // eligible sweep. Relayout for that new mark, but skip same-fix pings
      // that only refresh its flare.
      const fixChanged = detail?.fixChanged === true;
      if (!contact || contact.dataset.moving === 'true' || fixChanged) clamp();
    };
    if (hasLaidOutInitialPlot.current) clampAfterReactUpdate();
    else {
      clamp();
      hasLaidOutInitialPlot.current = true;
    }
    let observedWidth = node.clientWidth;
    let observedHeight = node.clientHeight;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === observedWidth && height === observedHeight) return;
      observedWidth = width;
      observedHeight = height;
      clamp();
    });
    observer?.observe(node);
    const styleObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      const nextStyleScope = labelWidthStyleScope(node);
      if (nextStyleScope !== observedStyleScope) clamp();
    });
    if (styleObserver) {
      for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
        styleObserver.observe(ancestor, { attributes: true });
      }
    }
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    const fontMetricsChanged = (event: Event) => {
      if (!handledFontEvents.has(event)) {
        handledFontEvents.add(event);
        fontMetricsVersion += 1;
      }
      clamp();
    };
    fonts?.addEventListener('loadingdone', fontMetricsChanged);
    fonts?.addEventListener('loadingerror', fontMetricsChanged);
    window.addEventListener('resize', clamp);
    node.addEventListener(CONTACT_SCAN_EVENT, clampMovingFix);
    node.addEventListener(CONTACT_SCAN_LAYOUT_EVENT, clampSweepBatch);
    return () => {
      observer?.disconnect();
      styleObserver?.disconnect();
      fonts?.removeEventListener('loadingdone', fontMetricsChanged);
      fonts?.removeEventListener('loadingerror', fontMetricsChanged);
      window.removeEventListener('resize', clamp);
      node.removeEventListener(CONTACT_SCAN_EVENT, clampMovingFix);
      node.removeEventListener(CONTACT_SCAN_LAYOUT_EVENT, clampSweepBatch);
      pendingSweepLayouts.clear();
    };
  }, [ambient?.id, classifiedOccurrenceId, contacts, departing, hostile,
    orientation?.pitch, orientation?.yaw, placement, size, still, tracks.length]);

  return (
    <div
      ref={plot}
      className="contact-plot"
      data-hostile={String(hostile)}
      data-placement={placement}
      data-still={String(still)}
      style={size ? ({ '--plot-size': size } as PlotStyle) : undefined}
    >
      {redAlert && (
        <>
          <span className="contact-plot__red-alert-status" role="status" aria-atomic="true">
            FLEETWIDE RED ALERT ACTIVE
          </span>
          <span className="contact-plot__red-alert" aria-hidden="true">RED ALERT</span>
        </>
      )}
      <div
        className="contact-plot__rig"
        aria-hidden="true"
        style={orientation ? {
          '--view-pitch': `${orientation.pitch}deg`,
          '--view-yaw': `${orientation.yaw}deg`,
        } as PlotStyle : undefined}
      >
        {MERIDIANS.map((turn) => (
          <span
            className="contact-plot__meridian"
            key={`meridian-${turn}`}
            style={{ '--turn': `${turn}deg` } as PlotStyle}
          />
        ))}
        {PARALLELS.map((latitude) => (
          <span
            className="contact-plot__parallel"
            key={`parallel-${latitude}`}
            style={ring(latitude)}
          />
        ))}
        <span className="contact-plot__limb" />
        {centerLabel ? <span className="contact-plot__origin">{centerLabel}</span> : null}
        <div className="contact-plot__sweep" />
        <div className="contact-plot__sweep contact-plot__sweep--polar" />
        <div className="contact-plot__returns">
          {tracks.map(({ track, spoof, ambient: isAmbient }, index) => (
            <div
              className="contact-plot__contact"
              key={contactRenderKey(track, index, isAmbient)}
              data-spoof={String(spoof)}
              data-ambient={String(isAmbient)}
              data-moving={String('transit' in track && Boolean(track.transit))}
              data-departing={String(spoof && exposed)}
              data-combat-range={combatRangeLabel(track)}
              data-label-anchor={labelAnchor(track, index)}
              style={'x' in track ? placeCartesian(track) : place(track)}
            >
              <span className="contact-plot__actual" />
              <div className="contact-plot__apparent">
                <div className="contact-plot__jitter">
                  <span className="contact-plot__drop" />
                  <span className="contact-plot__blip" />
                  <span className="contact-plot__tag">
                    <span>{spoof && exposed ? EXPOSED : track.tag}</span>
                    {track.showCombatRange !== false ? (
                      <span className="contact-plot__range">{combatRangeLabel(track)}</span>
                    ) : null}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <svg className="contact-plot__leaders" aria-hidden="true">
        {tracks.map(({ track }, index) => <line
          key={'id' in track && track.id ? track.id : `${track.tag}-${index}`}
          className="contact-plot__leader-line"
          data-visible="false"
        />)}
      </svg>
    </div>
  );
}
