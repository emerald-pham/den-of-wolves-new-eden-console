export interface Vector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

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
  const returns = new Map<HTMLElement, { fix: Vector; scans: number; paint: Animation[] }>();
  let previous: Vector[] = [];
  let lastFrame = -Infinity;
  let frame = 0;
  const tick = (now: number) => {
    const plotStyle = getComputedStyle(plot);
    const rigStyle = getComputedStyle(rig);
    const radius = parseFloat(rigStyle.width) / 2;
    const [originX = 0, originY = 0] = plotStyle.perspectiveOrigin.split(' ').map(parseFloat);
    // Grid centers the rig in the perspective container. Convert the CSS
    // camera into the rig's unit-radius coordinate system, including its tilt.
    const inverseRig = new DOMMatrixReadOnly(rigStyle.transform).inverse();
    const bounds = plot.getBoundingClientRect();
    const camera = inverseRig.transformPoint({
      x: (originX - parseFloat(plotStyle.width) / 2) / radius,
      y: (originY - parseFloat(plotStyle.height) / 2) / radius,
      z: parseFloat(plotStyle.perspective) / radius,
      w: 0,
    });
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
        returns.delete(element);
      }
    }
    plot.querySelectorAll<HTMLElement>('.contact-plot__contact').forEach((element, index) => {
      const apparent = element.querySelector<HTMLElement>('.contact-plot__apparent');
      const blip = element.querySelector<HTMLElement>('.contact-plot__blip');
      if (!apparent || !blip) return;
      const canonical = {
        x: Number(element.style.getPropertyValue('--x')),
        y: Number(element.style.getPropertyValue('--y')),
        z: Number(element.style.getPropertyValue('--z')),
      };
      const existing = returns.get(element);
      const state = existing ?? { fix: canonical, scans: index, paint: [] };
      returns.set(element, state);
      const anchor = apparent.getBoundingClientRect();
      const displayed = inverseRig.transformPoint({
        x: (anchor.x - bounds.x - bounds.width / 2) / radius,
        y: (anchor.y - bounds.y - bounds.height / 2) / radius,
        z: 0, w: 0,
      });
      if (!normals.some((normal, i) => {
        const next = rimDistance(displayed, normal, camera);
        const beforeNormal = existing ? previous[i] : undefined;
        if (!beforeNormal) return Math.abs(next) < 1e-8;
        const before = rimDistance(displayed, beforeNormal, camera);
        return Math.abs(before) >= 1e-8 && (Math.abs(next) < 1e-8 || (before < 0) !== (next < 0));
      })) return;
      state.fix = apparentFix(canonical, state.scans++);
      apparent.dataset.acquired = 'true';
      apparent.style.setProperty('--fix-x', String(state.fix.x - canonical.x));
      apparent.style.setProperty('--fix-z', String(state.fix.z - canonical.z));
      state.paint.forEach((animation) => animation.cancel());
      const fade = [
        { opacity: 1, offset: 0 },
        { opacity: 0.34 + (state.fix.z + 1) * 0.25, offset: 0.16 },
        { opacity: 0.03, offset: 1 },
      ];
      const drop = element.querySelector<HTMLElement>('.contact-plot__drop');
      state.paint = [
        blip.animate?.(fade.map((keyframe, i) => ({
          ...keyframe, transform: i === 0 ? 'scale(2)' : 'scale(1)',
        })), { duration: 7000, fill: 'forwards' }),
        drop?.animate?.(fade, { duration: 7000, fill: 'forwards' }),
      ].filter((animation): animation is Animation => animation !== undefined);
    });
    previous = normals;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    returns.forEach((state) => state.paint.forEach((animation) => animation.cancel()));
  };
}
