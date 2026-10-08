import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { candidateShipRole, candidateProofOptions } from './pc10-candidate-proof-helpers.mjs';

// Synthetic source-contract checks only: no accounts, browser, or gameplay proof.
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const ts = require('typescript');
const module = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync(new URL('../functions/src/roleConfiguration.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: module.exports, module });
const { recommendedRoleIds } = module.exports;
const ships = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
const required = ['executive-officer', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer'];
const supportsExistingDriver = (count, requireDione = false) => {
  const roster = Array.from(recommendedRoleIds(count), roleId => ({ roleId }));
  if (!required.every(role => roster.some(actor => actor.roleId === role))) return false;
  try { for (const ship of ships.filter(id => requireDione || count >= 12 || id !== 'dione')) candidateShipRole(roster, ship); return true; }
  catch { return false; }
};

test('11 is the smallest printed preset supported by the unchanged ending driver', () => {
  for (let count = 8; count < 11; count++) assert.equal(supportsExistingDriver(count), false, `preset ${count}`);
  assert.equal(supportsExistingDriver(11), true);
});

test('13 is the smallest printed preset when six vessels including Dione are explicitly required', () => {
  for (let count = 8; count < 13; count++) assert.equal(supportsExistingDriver(count, true), false, `preset ${count}`);
  assert.equal(supportsExistingDriver(13, true), true);
});

test('each outcome explicitly disables Press and expansion for a 13-identity driver cohort', () => {
  for (const candidateCode of ['N', 'O', 'P']) {
    const options = candidateProofOptions({ candidateCode, playerCount: 11, includePress: false,
      capybaraEnabled: false, directory: `/tmp/pc10-success-cohort-${candidateCode}` });
    assert.equal(options.playerCount + Number(options.includePress) + 2, 13);
    assert.equal(options.chartId, candidateCode === 'P' ? 'B' : 'A');
    assert.equal(options.capybaraEnabled, false);
  }
});
