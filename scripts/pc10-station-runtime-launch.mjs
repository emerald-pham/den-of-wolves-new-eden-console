import {validateRingAllocation} from './pc10-fresh-minimum-ring-proof.mjs';
// Source-only seam for the allocated Station launcher contract.
export function validateStationLaunchEnvironment(allocation,environment){validateRingAllocation(allocation);return environment;}
