#!/usr/bin/env node
import assert from 'node:assert/strict';import {realpath} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {runFreshMinimumRingProof} from './pc10-fresh-minimum-ring-proof.mjs';
export const runStationSuccessProof=options=>runFreshMinimumRingProof({...options,probeFamily:'station-success'});
if(process.argv[1]&&await realpath(process.argv[1])===await realpath(fileURLToPath(import.meta.url))){const args=process.argv.slice(2);assert.equal(args.length,4);assert.equal(args[0],'--allocation');assert.equal(args[2],'--evidence');await runStationSuccessProof({allocationPath:args[1],directory:args[3]});}
