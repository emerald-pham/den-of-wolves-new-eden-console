export interface Vector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Fired by a return whenever a rendered DRADIS sweep crosses its position. */
export const CONTACT_SCAN_EVENT = 'dradis-contact-scan';

/** Signed screen-space rim test. Cast the viewing ray through the contact
 * onto the sweep disc, then compare its radius with the unit circumference.
 * Multiplying out the denominator keeps edge-on discs finite. Negative is
 * inside the projected circle; positive is outside, at any contact depth. */
export function rimDistance(point: Vector, normal: Vector, camera: Vector): number {
  const ray = { x: point.x - camera.x, y: point.y - camera.y, z: point.z - camera.z };
  const dot = (a: Vector, b: Vector) => a.x * b.x + a.y * b.y + a.z * b.z;
  const denominator = dot(normal, ray);
  const origin = dot(normal, camera);
  const x = camera.x * denominator - origin * ray.x;
  const y = camera.y * denominator - origin * ray.y;
  const z = camera.z * denominator - origin * ray.z;
  return x * x + y * y + z * z - denominator * denominator;
}

const BEARING_WALK = [-1, -0.5, 1, 0.5, 0];

/** The paint flare reaches its first dimmed keyframe 16% into a 7s fade. */
export const SCAN_FRESH_MS = 1120;

type SweepGeometry = {
  readonly radius: number;
  readonly inverseRig: DOMMatrixReadOnly;
  readonly camera: Vector;
};

type ReturnState = {
  readonly actual: HTMLElement;
  readonly apparent: HTMLElement;
  readonly blip: HTMLElement;
  readonly drop: HTMLElement | null;
  fix: Vector;
  /** The static return's projected position, valid for this plot geometry. */
  displayed: Vector | null;
  geometryVersion: number;
  moving: boolean;
  scans: number;
  scannedAt: number;
  paint: Animation[];
  freshTimer: number | undefined;
};

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
  let geometry: SweepGeometry | null = null;
  let geometryVersion = 0;

  // The scan still evaluates each animation frame. This cache only avoids
  // re-reading layout for fixed returns whose projected position cannot change
  // until the plot is resized, reoriented, or given a new contact position.
  const invalidateGeometry = () => {
    if (geometry !== null) geometryVersion += 1;
    geometry = null;
  };
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(invalidateGeometry);
  resizeObserver?.observe(plot);
  resizeObserver?.observe(rig);
  const mutationObserver = typeof MutationObserver === 'undefined'
    ? undefined
    : new MutationObserver((records) => {
      if (records.some(({ target }) => (
        target === plot || target === rig ||
        (target instanceof HTMLElement && target.classList.contains('contact-plot__contact'))
      ))) {
        invalidateGeometry();
      }
    });
  mutationObserver?.observe(plot, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style', 'data-placement'],
  });
  window.addEventListener('resize', invalidateGeometry);

  const geometryFor = (): SweepGeometry => {
    if (geometry) return geometry;
    const plotStyle = getComputedStyle(plot);
    const rigStyle = getComputedStyle(rig);
    const radius = parseFloat(rigStyle.width) / 2;
    const [originX = 0, originY = 0] = plotStyle.perspectiveOrigin.split(' ').map(parseFloat);
    const inverseRig = new DOMMatrixReadOnly(rigStyle.transform).inverse();
    const transformedCamera = inverseRig.transformPoint({
      x: (originX - parseFloat(plotStyle.width) / 2) / radius,
      y: (originY - parseFloat(plotStyle.height) / 2) / radius,
      z: parseFloat(plotStyle.perspective) / radius,
      w: 0,
    });
    geometry = {
      radius,
      inverseRig,
      camera: {
        x: transformedCamera.x,
        y: transformedCamera.y,
        z: transformedCamera.z,
      },
    };
    return geometry;
  };
  let previous: Vector[] = [];
  let lastFrame = -Infinity;
  let frame = 0;
  const tick = (now: number) => {
    // Browsers without ResizeObserver retain the original conservative path:
    // re-measure every frame rather than risk using a stale projection while a
    // container is changing size.
    if (!resizeObserver) invalidateGeometry();
    const currentGeometry = geometryFor();
    // Position can change without a resize (for example, measured header
    // chrome wrapping). The shared origin must stay current for moving returns;
    // fixed returns already hold the same plot-relative projection.
    const currentBounds = plot.getBoundingClientRect();
    const normals = discs.map((disc) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(disc).transform);
      return matrix.transformPoint({ x: 0, y: 0, z: 1, w: 0 });
    });
    // A suspended tab may skip whole turns. Resume from what is visible now,
    // without inventing a refresh for an intersection that happened offscreen.
    if (now - lastFrame > 250) previous = [];
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
        displayed: null,
        geometryVersion: -1,
        moving: false,
        scans: index,
        scannedAt: -Infinity,
        paint: [],
        freshTimer: undefined,
      };
      returns.set(element, state);
      const moving = element.dataset.moving === 'true';
      if (
        moving || state.displayed === null || state.geometryVersion !== geometryVersion ||
        state.moving !== moving
      ) {
        const anchor = actual.getBoundingClientRect();
        const projected = currentGeometry.inverseRig.transformPoint({
          x: (anchor.x - currentBounds.x - currentBounds.width / 2)
            / currentGeometry.radius,
          y: (anchor.y - currentBounds.y - currentBounds.height / 2)
            / currentGeometry.radius,
          z: 0, w: 0,
        });
        state.displayed = { x: projected.x, y: projected.y, z: projected.z };
        state.geometryVersion = geometryVersion;
        state.moving = moving;
      }
      const displayed = state.displayed;
      if (!normals.some((normal, i) => {
        const next = rimDistance(displayed, normal, currentGeometry.camera);
        const beforeNormal = existing ? previous[i] : undefined;
        if (!beforeNormal) return Math.abs(next) < 1e-8;
        const before = rimDistance(displayed, beforeNormal, currentGeometry.camera);
        return Math.abs(before) >= 1e-8 && (Math.abs(next) < 1e-8 || (before < 0) !== (next < 0));
      })) continue;
      // The first return gets a larger acquisition flash. Refreshes confirm a
      // known track and should preserve its normal apparent size.
      const firstAcquisition = apparent.dataset.acquired !== 'true';
      // Both rims can cross within a few frames. Confirm the existing fix
      // while its paint is fresh; only a later crossing of a dimmed return
      // may choose another bearing, before starting its new flash.
      if (firstAcquisition || moving || now - state.scannedAt >= SCAN_FRESH_MS) {
        if (moving) {
          // The true-position marker follows the CSS trajectory continuously.
          // Sample its current 3D translation only when a sweep reaches it;
          // the separate visible return then holds this fix until another hit.
          const actualTransform = new DOMMatrixReadOnly(getComputedStyle(actual).transform);
          const sampled = actualTransform.transformPoint({ x: 0, y: 0, z: 0, w: 1 });
          state.fix = {
            x: sampled.x / currentGeometry.radius,
            y: sampled.y / currentGeometry.radius,
            z: sampled.z / currentGeometry.radius,
          };
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
    previous = normals;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    window.removeEventListener('resize', invalidateGeometry);
    returns.forEach((state) => {
      state.paint.forEach((animation) => animation.cancel());
      if (state.freshTimer !== undefined) window.clearTimeout(state.freshTimer);
    });
    returns.clear();
  };
}
