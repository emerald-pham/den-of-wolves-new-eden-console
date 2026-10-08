/**
 * Extension seam for P-station actors outside the existing Wing-owned route.
 * The current runner already owns the Wing's targeting and range choices; this
 * seam stays inert until a current ordinary crew source can be read and painted.
 */
export async function dispatchStationCrewChoice(_current, { actors = [] } = {}) {
  if (!Array.isArray(actors)) throw new TypeError('Station crew actors must be an array.');
  return undefined;
}
