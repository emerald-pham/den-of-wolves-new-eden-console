export interface Vector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A rendered disc's third matrix column is its plane normal. A return is
 * painted when its signed distance crosses zero, on either half of a turn. */
export function crossedPlane(point: Vector, previous: Vector | null, current: Vector): boolean {
  const distance = (normal: Vector) => point.x * normal.x + point.y * normal.y + point.z * normal.z;
  const next = distance(current);
  const epsilon = 1e-8;
  if (!previous) return Math.abs(next) < epsilon;
  const before = distance(previous);
  if (Math.abs(before) < epsilon) return false;
  return Math.abs(next) < epsilon || (before < 0) !== (next < 0);
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
  const discs = Array.from(plot.querySelectorAll<HTMLElement>('.contact-plot__sweep'));
  const returns = new Map<HTMLElement, { fix: Vector; scans: number; paint?: Animation }>();
  let previous: Vector[] = [];
  let lastFrame = -Infinity;
  let frame = 0;
  const tick = (now: number) => {
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
        state.paint?.cancel();
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
      const state = existing ?? { fix: canonical, scans: index };
      returns.set(element, state);
      if (!normals.some((normal, i) => crossedPlane(state.fix, existing ? previous[i] ?? null : null, normal))) return;
      state.fix = apparentFix(canonical, state.scans++);
      apparent.dataset.acquired = 'true';
      apparent.style.setProperty('--fix-x', String(state.fix.x - canonical.x));
      apparent.style.setProperty('--fix-z', String(state.fix.z - canonical.z));
      state.paint?.cancel();
      state.paint = blip.animate?.([
        { opacity: 1, transform: 'scale(2)', offset: 0 },
        { opacity: 0.34 + (state.fix.z + 1) * 0.25, transform: 'scale(1)', offset: 0.16 },
        { opacity: 0.03, transform: 'scale(1)', offset: 1 },
      ], { duration: 7000, fill: 'forwards' });
    });
    previous = normals;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    returns.forEach((state) => state.paint?.cancel());
  };
}
