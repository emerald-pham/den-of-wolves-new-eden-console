/** A locked table can always recover if its final GM instance disappears. */
export function mayClaimGmInstance(locked: boolean, activeGmInstances: number): boolean {
  return !locked || activeGmInstances === 0;
}
