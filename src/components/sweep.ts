export interface Vector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Fired by a return whenever a rendered DRADIS sweep crosses its position. */
export const CONTACT_SCAN_EVENT = 'dradis-contact-scan';

/** Signed screen-space rim test retained for geometry-level callers. DRADIS
 * acquisition uses the rendered disc's actual 3D plane below instead of this
 * projected viewport test. */
export function rimDistance(point: Vector, normal: Vector, camera: Vector): number {
  const ray = { x: point.x - camera.x, y: point.y - camera.y, z: point.z - camera.z };
  const denominator = dot(normal, ray);
  const origin = dot(normal, camera);
  const x = camera.x * denominator - origin * ray.x;
  const y = camera.y * denominator - origin * ray.y;
  const z = camera.z * denominator - origin * ray.z;
  return x * x + y * y + z * z - denominator * denominator;
}

const SWEEP_EPSILON = 1e-8;
const DEFAULT_SWEEP_DISC_RADIUS = 1;

const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y + a.z * b.z;

const lengthSquared = (vector: Vector): number => dot(vector, vector);

function normalize(vector: Vector): Vector {
  const length = Math.sqrt(lengthSquared(vector));
  return length > SWEEP_EPSILON
    ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
    : vector;
}

function interpolate(start: Vector, end: Vector, progress: number): Vector {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
    z: start.z + (end.z - start.z) * progress,
  };
}

function crossingProgress(previous: number | null, current: number): number | null {
  if (previous === null) return Math.abs(current) < SWEEP_EPSILON ? 1 : null;
  if (Math.abs(previous) < SWEEP_EPSILON) return null;
  if (Math.abs(current) < SWEEP_EPSILON) return 1;
  if ((previous < 0) === (current < 0)) return null;
  return previous / (previous - current);
}

/** A rendered sweep is a finite circular plane through the rig origin. Sample
 * both moving pieces of geometry, then check the crossing point against the
 * disc itself—not an infinite plane or a 2D screen projection. */
export function crossedSweepDisc(
  previousPoint: Vector | null,
  point: Vector,
  previousNormal: Vector | null,
  currentNormal: Vector,
  previousRadius = DEFAULT_SWEEP_DISC_RADIUS,
  currentRadius = DEFAULT_SWEEP_DISC_RADIUS,
): boolean {
  const currentUnitNormal = normalize(currentNormal);
  const previousUnitNormal = previousNormal === null ? null : normalize(previousNormal);
  const previousDistance = previousPoint === null || previousUnitNormal === null
    ? null
    : dot(previousPoint, previousUnitNormal);
  const currentDistance = dot(point, currentUnitNormal);
  const progress = crossingProgress(previousDistance, currentDistance);
  if (progress === null) return false;

  const crossingPoint = previousPoint === null ? point : interpolate(previousPoint, point, progress);
  const crossingNormal = previousUnitNormal === null
    ? currentUnitNormal
    : normalize(interpolate(previousUnitNormal, currentUnitNormal, progress));
  const signedDistance = dot(crossingPoint, crossingNormal);
  const radialDistanceSquared = Math.max(0, lengthSquared(crossingPoint) - signedDistance ** 2);
  const radius = Math.max(
    0,
    previousNormal === null
      ? currentRadius
      : previousRadius + (currentRadius - previousRadius) * progress,
  );
  return radialDistanceSquared <= radius ** 2 + SWEEP_EPSILON;
}

/** Backward-compatible stationary-point helper for geometry callers. */
export function crossedPlane(
  point: Vector,
  previousNormal: Vector | null,
  currentNormal: Vector,
): boolean {
  return crossedSweepDisc(point, point, previousNormal, currentNormal);
}

const BEARING_WALK = [-1, -0.5, 1, 0.5, 0];

/** The paint flare reaches its first dimmed keyframe 16% into a 7s fade. */
export const SCAN_FRESH_MS = 1120;

type ReturnState = {
  readonly actual: HTMLElement;
  readonly apparent: HTMLElement;
  readonly blip: HTMLElement;
  readonly drop: HTMLElement | null;
  fix: Vector;
  point: Vector | null;
  scans: number;
  scannedAt: number;
  paint: Animation[];
  freshTimer: number | undefined;
};

type SweepFrame = {
  readonly normal: Vector;
  /** In rig-coordinate units: exactly the visible disc's local border radius. */
  readonly radius: number;
};

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function borderBoxSize(
  style: CSSStyleDeclaration,
  axis: 'width' | 'height',
): number {
  const size = pixels(style[axis]);
  if (style.boxSizing === 'border-box') return size;
  const horizontal = axis === 'width';
  return size
    + pixels(horizontal ? style.paddingLeft : style.paddingTop)
    + pixels(horizontal ? style.paddingRight : style.paddingBottom)
    + pixels(horizontal ? style.borderLeftWidth : style.borderTopWidth)
    + pixels(horizontal ? style.borderRightWidth : style.borderBottomWidth);
}

/** Read a sweep's own unprojected border box. This is the same circular plane
 * CSS paints in the viewport, expressed in the rig's coordinate units. */
function sweepFrame(disc: HTMLElement, rigRadius: number): SweepFrame {
  const style = getComputedStyle(disc);
  const matrix = new DOMMatrixReadOnly(style.transform);
  const diameter = Math.min(borderBoxSize(style, 'width'), borderBoxSize(style, 'height'));
  const radius = Number.isFinite(diameter) && diameter > 0
    ? diameter / (2 * rigRadius)
    : DEFAULT_SWEEP_DISC_RADIUS;
  return {
    normal: matrix.transformPoint({ x: 0, y: 0, z: 1, w: 0 }),
    radius,
  };
}

function actualPoint(actual: HTMLElement, fallback: Vector, radius: number): Vector {
  const transform = getComputedStyle(actual).transform;
  if (transform === 'none') return fallback;
  const translated = new DOMMatrixReadOnly(transform).transformPoint({
    x: 0, y: 0, z: 0, w: 1,
  });
  const w = typeof translated.w === 'number' && translated.w !== 0 ? translated.w : 1;
  return {
    x: translated.x / (radius * w),
    y: translated.y / (radius * w),
    z: translated.z / (radius * w),
  };
}

/** Display-only error, spanning two degrees around the real Y-axis bearing. */
export function apparentFix(point: Vector, scan: number): Vector {
  const angle = (BEARING_WALK[scan % BEARING_WALK.length] ?? 0) * Math.PI / 180;
  return {
    x: point.x * Math.cos(angle) + point.z * Math.sin(angle),
    y: point.y,
    z: point.z * Math.cos(angle) - point.x * Math.sin(angle),
  };
}

/** Read the CSS animation itself, rather than running a second clock that can
 * drift on mounts, navigation, throttled tabs or a change in animation rate. */
export function followSweeps(plot: HTMLElement): () => void {
  const rig = plot.querySelector<HTMLElement>('.contact-plot__rig');
  if (!rig) return () => undefined;
  const discs = Array.from(plot.querySelectorAll<HTMLElement>('.contact-plot__sweep'));
  // Live collection includes new/removed tracks without a new NodeList per frame.
  const contacts = plot.getElementsByClassName('contact-plot__contact');
  const returns = new Map<HTMLElement, ReturnState>();
  let previous: SweepFrame[] = [];
  let lastFrame = -Infinity;
  let frame = 0;
  const tick = (now: number) => {
    const measuredRadius = parseFloat(getComputedStyle(rig).width) / 2;
    const radius = Number.isFinite(measuredRadius) && measuredRadius > 0 ? measuredRadius : 1;
    const suspended = now - lastFrame > 250;
    const sweeps = discs.map((disc) => sweepFrame(disc, radius));
    // A suspended tab may skip whole turns. Resume from what is visible now,
    // without inventing a refresh for an intersection that happened offscreen.
    if (suspended) previous = [];
    lastFrame = now;
    for (const [element, state] of returns) {
      if (!plot.contains(element)) {
        state.paint.forEach((animation) => animation.cancel());
        if (state.freshTimer !== undefined) window.clearTimeout(state.freshTimer);
        returns.delete(element);
      }
    }
    for (let index = 0; index < contacts.length; index += 1) {
      const element = contacts[index];
      if (!(element instanceof HTMLElement)) continue;
      const existing = returns.get(element);
      const actual = existing?.actual ?? element.querySelector<HTMLElement>('.contact-plot__actual');
      const apparent = existing?.apparent ?? element.querySelector<HTMLElement>('.contact-plot__apparent');
      const blip = existing?.blip ?? element.querySelector<HTMLElement>('.contact-plot__blip');
      if (!actual || !apparent || !blip) continue;
      const canonical = {
        x: Number(element.style.getPropertyValue('--x')),
        y: Number(element.style.getPropertyValue('--y')),
        z: Number(element.style.getPropertyValue('--z')),
      };
      const state = existing ?? {
        actual,
        apparent,
        blip,
        drop: element.querySelector<HTMLElement>('.contact-plot__drop'),
        fix: canonical,
        point: null,
        scans: index,
        scannedAt: -Infinity,
        paint: [],
        freshTimer: undefined,
      };
      returns.set(element, state);
      const moving = element.dataset.moving === 'true';
      const point = moving ? actualPoint(actual, canonical, radius) : canonical;
      const crossed = sweeps.some((sweep, i) => {
        const beforeSweep = existing && !suspended ? previous[i] ?? null : null;
        const beforePoint = existing && !suspended ? state.point : null;
        return crossedSweepDisc(
          beforePoint,
          point,
          beforeSweep?.normal ?? null,
          sweep.normal,
          beforeSweep?.radius ?? sweep.radius,
          sweep.radius,
        );
      });
      state.point = point;
      if (!crossed) continue;
      // The first return gets a larger acquisition flash. Refreshes confirm a
      // known track and should preserve its normal apparent size.
      const firstAcquisition = apparent.dataset.acquired !== 'true';
      // Both sweep planes can cross within a few frames. Confirm the existing fix
      // while its paint is fresh; only a later crossing of a dimmed return
      // may choose another bearing, before starting its new flash.
      if (firstAcquisition || moving || now - state.scannedAt >= SCAN_FRESH_MS) {
        if (moving) {
          // The true-position marker follows the CSS trajectory continuously.
          // Sample its current 3D translation only when a sweep reaches it;
          // the separate visible return then holds this fix until another hit.
          state.fix = point;
        } else {
          state.fix = apparentFix(canonical, state.scans);
        }
        state.scans += 1;
      }
      state.scannedAt = now;
      apparent.dataset.acquired = 'true';
      element.dataset.scanFresh = 'true';
      if (state.freshTimer !== undefined) window.clearTimeout(state.freshTimer);
      state.freshTimer = window.setTimeout(() => {
        element.dataset.scanFresh = 'false';
        state.freshTimer = undefined;
      }, SCAN_FRESH_MS);
      apparent.style.setProperty('--fix-x', String(state.fix.x));
      apparent.style.setProperty('--fix-y', String(state.fix.y));
      apparent.style.setProperty('--fix-z', String(state.fix.z));
      apparent.style.setProperty('--drop', String(Math.abs(state.fix.y)));
      apparent.style.setProperty('--flip', state.fix.y < 0 ? '1' : '-1');
      state.paint.forEach((animation) => animation.cancel());
      const fade = [
        { opacity: 1, offset: 0 },
        { opacity: 0.34 + (state.fix.z + 1) * 0.25, offset: 0.16 },
        { opacity: 0.03, offset: 1 },
      ];
      const drop = state.drop;
      state.paint = [
        blip.animate?.(fade.map((keyframe, i) => ({
          ...keyframe, transform: firstAcquisition && i === 0 ? 'scale(2)' : 'scale(1)',
        })), { duration: 7000, fill: 'forwards' }),
        drop?.animate?.(fade, { duration: 7000, fill: 'forwards' }),
      ].filter((animation): animation is Animation => animation !== undefined);
      element.dispatchEvent(new CustomEvent(CONTACT_SCAN_EVENT, { bubbles: true }));
    }
    previous = sweeps;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    returns.forEach((state) => {
      state.paint.forEach((animation) => animation.cancel());
      if (state.freshTimer !== undefined) window.clearTimeout(state.freshTimer);
    });
    returns.clear();
  };
}
