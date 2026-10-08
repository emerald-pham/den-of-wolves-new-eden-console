import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createContext, Script } from 'node:vm';

// Source applicability only. This never supplies a current ship or group: the
// current authenticated transaction witness remains their sole authority.
const require = createRequire(import.meta.url), ts = require('typescript');
async function source(path) {
  return ts.createSourceFile(path, await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
}
function only(file, predicate) {
  const values = [];
  function visit(node) { if (predicate(node)) values.push(node); ts.forEachChild(node, visit); }
  visit(file); assert.equal(values.length, 1, 'Read exactly one normal member projection source contract.');
  return values[0];
}
const roles = await source('functions/src/roleConfiguration.ts');
const access = await source('functions/src/crewAccess.ts');
const ids = only(roles, node => ts.isVariableDeclaration(node) && node.name.getText(roles) === 'ROLE_IDS');
const ship = only(access, node => ts.isFunctionDeclaration(node) && node.name?.text === 'shipForRole');
const script = ts.transpileModule(`const ROLE_IDS = ${ids.initializer.getText(roles)};\n${ship.getText(access)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/^export\s+/gm, '');
const scope = createContext({}); new Script(script).runInContext(scope);
const sourceShipForRole = new Script('shipForRole;').runInContext(scope);

export function normalMemberRoleRequiresBerth(roleId) {
  return sourceShipForRole(roleId) !== undefined;
}
