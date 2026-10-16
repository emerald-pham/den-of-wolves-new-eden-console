import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractLoyaltyKindIds } from './pc10-loyalty-kind-ids.mjs';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
process.env.GCLOUD_PROJECT = 'demo-pc10-inventory';
const endpoints = Object.entries(require('../functions/lib/index.js'))
  .filter(([, value]) => value?.__endpoint)
  .map(([name, value]) => ({ name, kind: value.__endpoint.callableTrigger ? 'callable'
    : value.__endpoint.scheduleTrigger ? 'schedule' : 'background' }));
const { ROLE_IDS } = require('../functions/lib/roleConfiguration.js');
const { REPLACEMENT_ROLE_CATALOG } = require('../functions/lib/replacementRoles.js');
const loyaltyKindIds = extractLoyaltyKindIds(await readFile('functions/src/gameSetup.ts', 'utf8'));
async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await sourceFiles(file));
    else if (/\.(tsx?|mjs)$/.test(file) && !/\.test\./.test(file)) result.push(file);
  }
  return result;
}
const sources = await Promise.all((await sourceFiles('src')).map(async file => [file, await readFile(file, 'utf8')]));
const rows = endpoints.map(endpoint => ({ ...endpoint,
  clientConsumers: sources.filter(([, text]) => text.includes(`'${endpoint.name}'`) ||
    text.includes(`"${endpoint.name}"`)).map(([file]) => file),
  currentFreshGameProof: 'pending', authorityPrivacyRecoveryProof: 'pending',
  automatedBrowserProof: 'pending', humanDeviceProof: 'not claimed' }));
const roles = [...ROLE_IDS.map(id => ({ id, kind: id.startsWith('joint-engineering-') ? 'sparse-roster station' : 'core/optional station' })),
  ...REPLACEMENT_ROLE_CATALOG.map(role => ({ id: role.id, kind: 'replacement role' })),
  { id: 'gm', kind: 'authenticated facilitator' },
  ...loyaltyKindIds.map(id => ({ id, kind: 'private loyalty functions' }))];
const inventory = { schemaVersion: 1, sourceCommit,
  binding: 'Built SDK __endpoint exports from current Functions source; independent review and gameplay evidence remain separate.',
  accounting: 'Every callable is inventoried. Background jobs are separately traced; an inventory row alone is not acceptance.',
  roles: roles.map(role => ({ ...role, currentFreshGameProof: 'pending', recoveryProof: 'pending', usabilityProof: 'pending' })),
  functions: rows };
const output = resolve(process.argv[2] ?? '/tmp/dow-pc10-evidence/function-role-inventory.json');
await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify({ output, sourceCommit, endpoints: rows.length,
  callables: rows.filter(row => row.kind === 'callable').length, roles: roles.length,
  proofStatus: 'pending; inventory grants no acceptance credit' }));
