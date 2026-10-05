import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLoyaltyKindIds } from './pc10-loyalty-kind-ids.mjs';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const ts = require('typescript');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const functionsSourceCommit = execFileSync('git', [
  'log', '-n', '1', '--format=%H', 'HEAD', '--', 'functions/src',
  ':(exclude,glob)functions/src/**/*.test.ts', ':(exclude,glob)functions/src/**/*.spec.ts',
], { encoding: 'utf8' }).trim();
process.env.GCLOUD_PROJECT = 'demo-pc10-action-role-matrix';
const exports = Object.entries(require('../functions/lib/index.js'))
  .filter(([, value]) => value?.__endpoint)
  .map(([name, value]) => ({ name, kind: value.__endpoint.callableTrigger ? 'callable'
    : value.__endpoint.scheduleTrigger ? 'schedule' : 'background' }));
const { ROLE_IDS } = require('../functions/lib/roleConfiguration.js');
const { REPLACEMENT_ROLE_CATALOG } = require('../functions/lib/replacementRoles.js');
const loyaltyKindIds = extractLoyaltyKindIds(await readFile('functions/src/gameSetup.ts', 'utf8'));

async function listFiles(root, include = () => true) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && include(path)) result.push(path);
    }
  }
  await visit(root);
  return result.sort((left, right) => left.localeCompare(right));
}

function isSourceFile(path) {
  return /\.(?:tsx?|mjs)$/.test(path) && !/\.test\./.test(path) && !/\.d\.ts$/.test(path);
}

async function readSourceRoot(root) {
  const files = await listFiles(resolve(repositoryDirectory, root), isSourceFile);
  const entries = await Promise.all(files.map(async (path) => ({
    path,
    relativePath: relative(repositoryDirectory, path).replaceAll('\\', '/'),
    text: await readFile(path, 'utf8'),
  })));
  return entries;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function treeBinding(root) {
  const files = await listFiles(resolve(repositoryDirectory, root));
  const hash = createHash('sha256');
  for (const path of files) {
    hash.update(relative(resolve(repositoryDirectory, root), path).replaceAll('\\', '/'))
      .update('\0').update(await readFile(path));
  }
  return { fileCount: files.length, sha256: hash.digest('hex') };
}

function referenceIndex(entries, names, { quoted = false } = {}) {
  const referencesByName = new Map(names.map((name) => [name, []]));
  const alternatives = [...names].sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = quoted
    ? new RegExp(`(['"])(${alternatives})\\1`, 'g')
    : new RegExp(`(?<![\\w$])(${alternatives})(?![\\w$])`, 'g');
  for (const entry of entries) {
    const lines = entry.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        const name = quoted ? match[2] : match[1];
        referencesByName.get(name)?.push({ file: entry.relativePath, line: index + 1 });
      }
    });
  }
  return (name) => referencesByName.get(name) ?? [];
}

function moduleSpecifiers(sourceFile) {
  const values = [];
  for (const statement of sourceFile.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      values.push(statement.moduleSpecifier.text);
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      values.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...new Set(values)];
}

function resolveImportedSource(importerPath, specifier, knownFiles) {
  let base;
  if (specifier.startsWith('@/')) base = resolve(repositoryDirectory, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(importerPath), specifier);
  else return undefined;
  const candidates = [base, ...['.ts', '.tsx', '.mjs', '.js', '.jsx'].map((suffix) => `${base}${suffix}`),
    ...['index.ts', 'index.tsx', 'index.mjs', 'index.js'].map((name) => resolve(base, name))];
  return candidates.find((candidate) => knownFiles.has(candidate));
}

function appImportGraph(clientSources) {
  const knownFiles = new Set(clientSources.map((entry) => entry.path));
  const importersByDependency = new Map();
  for (const entry of clientSources) {
    const parsed = ts.createSourceFile(entry.path, entry.text, ts.ScriptTarget.Latest, true,
      entry.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const specifier of moduleSpecifiers(parsed)) {
      const dependency = resolveImportedSource(entry.path, specifier, knownFiles);
      if (!dependency) continue;
      const importers = importersByDependency.get(dependency) ?? new Set();
      importers.add(entry.path);
      importersByDependency.set(dependency, importers);
    }
  }
  const appPath = resolve(repositoryDirectory, 'src/App.tsx');
  function pathToApp(seed) {
    const queue = [[seed]];
    const visited = new Set([seed]);
    while (queue.length) {
      const chain = queue.shift();
      const current = chain.at(-1);
      if (current === appPath) return chain.map((path) => relative(repositoryDirectory, path).replaceAll('\\', '/'));
      for (const importer of [...(importersByDependency.get(current) ?? [])].sort()) {
        if (visited.has(importer)) continue;
        visited.add(importer);
        queue.push([...chain, importer]);
      }
    }
    return undefined;
  }
  return pathToApp;
}

function unresolved(reason = 'Not source-mapped in this documentation pass.') {
  return { status: 'unresolved', value: null, reason };
}

const functionSource = await readSourceRoot('functions/src');
const clientSource = await readSourceRoot('src');
const pathToApp = appImportGraph(clientSource);
const serverTree = await treeBinding('functions/src');
const clientTree = await treeBinding('src');
const compiledTree = await treeBinding('functions/lib');
const indexSource = await readFile('functions/src/index.ts', 'utf8');
const indexLines = indexSource.split(/\r?\n/);
const coreRoles = ROLE_IDS.map((id) => ({ id,
  kind: id.startsWith('joint-engineering-') ? 'sparse-roster station' : 'core/optional station' }));
const roles = [
  ...coreRoles,
  ...REPLACEMENT_ROLE_CATALOG.map((role) => ({ id: role.id, kind: 'replacement role' })),
  { id: 'gm', kind: 'authenticated facilitator' },
  ...loyaltyKindIds.map((id) => ({ id, kind: 'private loyalty functions' })),
];
const serverActionReferences = referenceIndex(functionSource, exports.map(({ name }) => name));
const clientActionReferences = referenceIndex(clientSource, exports.map(({ name }) => name), { quoted: true });
const serverRoleReferences = referenceIndex(functionSource, roles.map(({ id }) => id), { quoted: true });
const clientRoleReferences = referenceIndex(clientSource, roles.map(({ id }) => id), { quoted: true });

function indexExportReference(name) {
  const lineIndex = indexLines.findIndex((line) =>
    new RegExp(`\\bexport\\s+(?:const|function|let)\\s+${name}\\b`).test(line) ||
    new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b`).test(line));
  return { file: 'functions/src/index.ts', line: lineIndex < 0 ? null : lineIndex + 1,
    status: lineIndex < 0 ? 'export line not resolved by the static locator' : 'export declaration located' };
}

function uiTrace(references) {
  const chains = [];
  for (const reference of references) {
    const path = resolve(repositoryDirectory, reference.file);
    const chain = pathToApp(path);
    if (chain) chains.push({ sourceFile: reference.file, importChainToApp: chain });
  }
  const uniqueChains = [...new Map(chains.map((entry) => [entry.importChainToApp.join(' -> '), entry])).values()];
  const directComponentReferences = references.filter((reference) =>
    reference.file.startsWith('src/components/') || reference.file.startsWith('src/routes/') ||
    reference.file === 'src/App.tsx');
  let status = 'no-static-client-reference-found';
  if (uniqueChains.length) status = 'static-import-chain-to-App; control binding unverified';
  else if (directComponentReferences.length) status = 'component-or-route-reference; App reachability unverified';
  else if (references.length) status = 'client-service-reference-only';
  return { status, staticClientSourceReferences: references, importChainsToApp: uniqueChains,
    interpretation: 'Source references do not prove a rendered control is visible, enabled, eligible, or usable.' };
}

const actions = exports.filter((entry) => entry.kind === 'callable').map(({ name }) => {
  const serverReferences = serverActionReferences(name);
  const clientReferences = clientActionReferences(name);
  const servedUi = uiTrace(clientReferences);
  const guidanceLocations = [...new Set(servedUi.importChainsToApp.flatMap((entry) => entry.importChainToApp)
    .filter((file) => file.startsWith('src/components/') || file.startsWith('src/routes/')))];
  return {
    exportName: name,
    runtimeCategory: 'callable',
    action: { status: 'unresolved', endpointName: name,
      userFacingActionLabel: null, reason: 'Export names are not treated as player-facing action labels.' },
    actualServedUi: servedUi,
    eligibleActor: { status: 'unresolved', roleIds: null,
      reason: 'Requires action-specific authority source review; see roleEligibility cells.' },
    roleEligibility: roles.map(({ id }) => ({ roleId: id, status: 'unresolved' })),
    source: { callableExport: indexExportReference(name), serverReferences,
      clientReferences: clientReferences.map((reference) => ({ ...reference,
        referenceKind: reference.file.startsWith('src/components/') || reference.file.startsWith('src/routes/')
          ? 'component-or-route-source-reference' : reference.file.startsWith('src/lib/')
            ? 'client-service-source-reference' : 'client-source-reference' })) },
    sourceReviewRef: { artifact: 'docs/PC10_ACTION_REVIEW_ANNOTATIONS.json', exportName: name },
    requirements: unresolved('Prerequisites are not inferred from the callable name or consumer path.'),
    costs: unresolved('Resource, time, and die costs require action-specific source tracing.'),
    consequences: unresolved('Committed consequences require transaction/result tracing.'),
    blockers: unresolved('Visible and server-side blockers require action-specific tracing.'),
    nextActor: unresolved('The next entitled actor is not inferred from UI wiring.'),
    inConsoleGuidance: { status: 'source-review-overlay', sourceLocations: guidanceLocations,
      artifact: 'docs/PC10_ACTION_REVIEW_ANNOTATIONS.json', exportName: name,
      note: 'Read the exportName-matched source review for traced guidance; static references do not establish live visibility.' },
    evidence: { currentFreshGameProof: 'pending', authorityPrivacyRecoveryProof: 'pending',
      automatedBrowserProof: 'pending', nativeAppCheckProof: 'not run for this source revision',
      humanDeviceProof: 'not claimed', humanPhysicalPlaytest: 'not claimed' },
  };
});

const nonInteractiveExports = exports.filter((entry) => entry.kind !== 'callable').map(({ name, kind }) => ({
  exportName: name,
  kind,
  invocationBoundary: kind === 'schedule' ? 'scheduled server task' : 'background server trigger',
  actualServedUi: { status: 'not a player-invoked callable', staticClientSourceReferences: [] },
  eligibleActor: { status: 'not applicable to a player-invoked command', value: null },
  source: { callableExport: indexExportReference(name), serverReferences: serverActionReferences(name) },
  inConsoleGuidance: { status: 'not applicable to a direct player control' },
  evidence: { currentFreshGameProof: 'pending', authorityPrivacyRecoveryProof: 'pending',
    automatedBrowserProof: 'pending', nativeAppCheckProof: 'not applicable to non-callable export',
    humanDeviceProof: 'not claimed', humanPhysicalPlaytest: 'not claimed' },
}));

function roleAuthoritySources(role) {
  if (role.kind === 'replacement role') return ['functions/src/replacementRoles.ts'];
  if (role.kind === 'private loyalty functions') return ['functions/src/gameSetup.ts'];
  if (role.kind === 'authenticated facilitator') return ['functions/src/index.ts'];
  return ['functions/src/roleConfiguration.ts'];
}

const roleRows = roles.map((role) => {
  const clientReferences = clientRoleReferences(role.id);
  const serverReferences = serverRoleReferences(role.id);
  return {
    id: role.id,
    kind: role.kind,
    sourceAuthorityReferences: roleAuthoritySources(role),
    clientSourceReferences: clientReferences,
    relatedServerSourceReferences: serverReferences,
    actionEligibility: { status: 'unresolved', callableExports: [],
      reason: 'Role membership and action eligibility must be mapped per action from authoritative checks.' },
    requirements: unresolved('Role-specific action prerequisites are not yet mapped.'),
    costs: unresolved('Role-specific action costs are not yet mapped.'),
    consequences: unresolved('Role-specific action consequences are not yet mapped.'),
    blockers: unresolved('Role-specific blockers are not yet mapped.'),
    nextActor: unresolved('Role-specific next actor is not yet mapped.'),
    inConsoleGuidance: { status: 'unresolved', sourceLocations: [],
      note: 'Role-specific guidance is not inferred from action source reviews.' },
    currentFreshGameProof: 'pending',
    recoveryProof: 'pending',
    usabilityProof: 'pending',
    humanDeviceProof: 'not claimed',
  };
});

const clientRefCount = actions.filter((action) => action.source.clientReferences.length > 0).length;
const appChainCount = actions.filter((action) => action.actualServedUi.importChainsToApp.length > 0).length;
const noClientReferenceCount = actions.filter((action) => action.source.clientReferences.length === 0).length;
const matrix = {
  schemaVersion: 1,
  sourceBinding: {
    generatedAtSourceCommit: sourceCommit,
    functionsSourceCommit,
    functionsSourceTree: serverTree,
    functionsEntrypointSha256: sha256(await readFile('functions/src/index.ts')),
    clientSourceTree: clientTree,
    compiledTree: compiledTree,
    compiledEntrypointSha256: sha256(await readFile('functions/lib/index.js')),
    buildCommand: 'npm run build --prefix functions',
    buildScope: 'Reads an existing compiled Functions output as static export metadata; this generator does not build it or make gameplay calls.',
    runtimeTesting: 'No emulator, browser, native callable, or gameplay request was run; export inventory uses existing compiled SDK metadata only.',
  },
  accounting: {
    actualExports: exports.length,
    callableExports: actions.length,
    scheduleExports: nonInteractiveExports.filter((entry) => entry.kind === 'schedule').length,
    backgroundExports: nonInteractiveExports.filter((entry) => entry.kind === 'background').length,
    roles: roleRows.length,
    callableWithClientSourceReference: clientRefCount,
    callableWithStaticImportChainToApp: appChainCount,
    callableWithNoStaticClientReference: noClientReferenceCount,
    servingStatus: 'No row is credited as a visible, enabled, eligible, or usable control from static imports alone.',
    nativeOnlyStatus: 'Not classified; no native runtime probe was performed for this source revision.',
    unavailableStatus: 'No-static-client-reference rows are candidates for owner review, not proof of product unavailability.',
    humanPhysicalStatus: 'No human or physical-device play evidence is claimed.',
  },
  productChangeAccounting: {
    a02AbilityRepairCallableRows: actions.filter(row => row.exportName === 'transferWarriorCargo').length,
    addedFixedCatalogClosures: 0,
    acceptanceCredit: 0,
  },
  acceptanceAccounting: {
    fixedPromptClosures: 48,
    a01QrCredit: 0,
    a02Credit: 0,
    pc11Executed: false,
    pc12Executed: false,
    gameplayProofCredit: 0,
  },
  fieldPolicy: {
    unresolved: 'A null value with status unresolved means this pass did not verify the contract from an action-specific source path.',
    actionRoleEligibility: 'Each per-callable role cell is unresolved until the authoritative server entitlement check is mapped.',
    sourceReference: 'A file and line identify a static source occurrence only; they do not establish runtime reachability or entitlement.',
    guidance: 'Action-specific source guidance is in the exportName-keyed review overlay; role guidance, live visibility, player-facing usability, and acceptance remain separate.',
  },
  actions,
  nonInteractiveExports,
  roles: roleRows,
};

const output = resolve(process.argv[2] ?? '/tmp/dow-pc10-evidence/action-role-matrix.json');
await writeFile(output, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(JSON.stringify({ output, sourceCommit, functionsSourceCommit,
  actualExports: matrix.accounting.actualExports, callables: matrix.accounting.callableExports,
  schedules: matrix.accounting.scheduleExports, background: matrix.accounting.backgroundExports,
  roles: roleRows.length, clientReferences: clientRefCount, staticAppChains: appChainCount,
  noStaticClientReferences: noClientReferenceCount, proofStatus: 'pending; no runtime evidence claimed' }));
