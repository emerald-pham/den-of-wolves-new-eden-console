import ts from 'typescript';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// The fast path is intentionally narrower than the set of files that can
// contain text. It is for colocated player-facing JSX and its focused JSX
// test, never for the application shell, infrastructure, or server code.
const SOURCE_PATH_PATTERN = /^src\/(?:components|routes)\/.+\.(?:tsx|jsx)$/i;
const TEST_PATH_PATTERN = /^src\/(?:components|routes)\/.+\.(?:test|spec)\.(?:tsx|jsx)$/i;
const COPY_ATTRIBUTE_NAMES = new Set([
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'alt',
  'label',
  'placeholder',
  'title',
]);
const TEXT_QUERY_METHODS = new Set([
  'findAllByDisplayValue',
  'findAllByLabelText',
  'findAllByPlaceholderText',
  'findAllByRole',
  'findAllByText',
  'findByDisplayValue',
  'findByLabelText',
  'findByPlaceholderText',
  'findByRole',
  'findByText',
  'getAllByDisplayValue',
  'getAllByLabelText',
  'getAllByPlaceholderText',
  'getAllByRole',
  'getAllByText',
  'getByDisplayValue',
  'getByLabelText',
  'getByPlaceholderText',
  'getByRole',
  'getByText',
  'queryAllByDisplayValue',
  'queryAllByLabelText',
  'queryAllByPlaceholderText',
  'queryAllByRole',
  'queryAllByText',
  'queryByDisplayValue',
  'queryByLabelText',
  'queryByPlaceholderText',
  'queryByRole',
  'queryByText',
]);
const TEXT_MATCHER_METHODS = new Set([
  'toHaveAccessibleDescription',
  'toHaveAccessibleName',
  'toHaveTextContent',
]);
const COPY_ONLY_COMMANDS = Object.freeze([
  'npm run lint',
  'npm run build',
]);

const FULL_VALIDATION_COMMANDS = Object.freeze([
  'git diff --check',
  'npm run lint',
  'npm run test:all',
  'npm run build',
  'npm run build --prefix functions',
]);

const TOOLING_PATH_PATTERN = /^(?:scripts\/|\.githooks\/|\.github\/|docs\/implementation-prompts\.json$|vitest\.config\.|eslint\.config\.)/i;
const UI_PATH_PATTERN = /^(?:src\/(?:components|routes|styles)\/|public\/|index\.html$)/i;
const DATA_HELPER_PATH_PATTERN = /^src\/data\//i;
const TEST_PATH_PATTERN_ANY = /(?:^|\/)(?:__tests__|tests)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i;
const HIGH_RISK_PATH_PATTERN = /^(?:functions\/|firestore\.rules$|firestore\.indexes\.json$|firebase\.json$|\.firebaserc$|\.github\/workflows\/(?:deploy|ci)\.ya?ml$|src\/lib\/(?:firebase|firestore)|src\/(?:store|services)\/|src\/config\/deploy|src\/config\/.*(?:auth|security|authority)|scripts\/(?:run-emulator-command|emulator-resource-registry|coordination-throughput|validation-profile)\.mjs$)/i;

function isDocumentationPath(file) {
  return /(?:^|\/)(?:README(?:\..*)?|.*\.md)$/i.test(file);
}

function affectedTestStem(file) {
  return file
    .replace(/\\/g, '/')
    .split('/')
    .at(-1)
    ?.replace(/\.(?:test|spec)\.[^.]+$/i, '')
    .replace(/\.[^.]+$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase() ?? '';
}

function existingTestFiles(repositoryDirectory = process.cwd()) {
  const root = join(repositoryDirectory, 'src');
  const found = [];
  const visit = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && TEST_PATH_PATTERN_ANY.test(entry.name)) found.push(absolute);
    }
  };
  visit(root);
  return found.map((file) => relative(repositoryDirectory, file).replaceAll('\\', '/'));
}

function discoverAffectedTests(files, affectedTests, repositoryDirectory = process.cwd()) {
  const tests = new Set(normalizedFiles(affectedTests));
  const stems = files
    .filter((file) => !TEST_PATH_PATTERN_ANY.test(file))
    .map(affectedTestStem)
    .filter(Boolean);
  for (const candidate of existingTestFiles(repositoryDirectory)) {
    const candidateStem = affectedTestStem(candidate);
    if (stems.some((stem) => candidateStem === stem || candidateStem.includes(stem) || stem.includes(candidateStem))) {
      tests.add(candidate);
    }
  }
  return [...tests].sort();
}

function normalizedFiles(changedFiles) {
  return [...new Set((Array.isArray(changedFiles) ? changedFiles : [])
    .map((file) => String(file ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, ''))
    .filter(Boolean))].sort();
}

function testCommands(files, affectedTests, repositoryDirectory) {
  const candidates = normalizedFiles([
    ...files.filter((file) => TEST_PATH_PATTERN_ANY.test(file)),
    ...discoverAffectedTests(files, affectedTests, repositoryDirectory),
  ]);
  return candidates.map((file) => `npm test -- --run ${file}`);
}

/**
 * Classify a changed-file set into the smallest safe validation profile.
 * Profiles are deterministic and intentionally depend on paths only; callers
 * may promote a profile to `full` for a cross-cutting migration.
 */
export function deriveValidationProfile({
  changedFiles = [],
  affectedTests = [],
  forceFull = false,
  repositoryDirectory = process.cwd(),
} = {}) {
  const files = normalizedFiles(changedFiles);
  if (files.length === 0) {
    return {
      kind: 'no-changes',
      reason: 'no changed files require only a clean diff check',
      commands: ['git diff --check'],
      requiresReview: false,
    };
  }
  if (files.every((file) => /(?:^|\/)(?:README(?:\..*)?|.*\.md)$/i.test(file))) {
    return {
      kind: 'docs',
      reason: 'documentation-only changes do not require application validation',
      commands: ['git diff --check'],
      requiresReview: false,
    };
  }

  const highRisk = forceFull || files.some((file) => HIGH_RISK_PATH_PATTERN.test(file));
  if (highRisk) {
    return {
      kind: 'full',
      reason: forceFull
        ? 'cross-cutting workflow migration requires the full final gate'
        : 'server, rules, authority, deployment, or authentication paths changed',
      commands: [...FULL_VALIDATION_COMMANDS],
      requiresReview: true,
      reviewReason: 'one independent holistic review is required for high-risk changes',
    };
  }

  const nonDocumentationFiles = files.filter((file) => !isDocumentationPath(file));
  const tooling = nonDocumentationFiles.some((file) => TOOLING_PATH_PATTERN.test(file)) &&
    nonDocumentationFiles.every((file) => TOOLING_PATH_PATTERN.test(file) || TEST_PATH_PATTERN_ANY.test(file));
  const uiOrData = nonDocumentationFiles.some((file) => UI_PATH_PATTERN.test(file) || DATA_HELPER_PATH_PATTERN.test(file)) &&
    nonDocumentationFiles.every((file) => UI_PATH_PATTERN.test(file) ||
      DATA_HELPER_PATH_PATTERN.test(file) || TEST_PATH_PATTERN_ANY.test(file));
  const discoveredTests = discoverAffectedTests(files, affectedTests, repositoryDirectory);
  if (tooling) {
    return {
      kind: 'tooling',
      reason: 'tooling changes use focused tooling tests, lint, and the affected build',
      commands: [
        'git diff --check',
        ...testCommands(files, discoveredTests, repositoryDirectory),
        'npm run lint',
        'npm run build',
      ],
      requiresReview: false,
    };
  }
  if (uiOrData) {
    return {
      kind: 'focused',
      reason: 'UI, CSS, or data-helper changes use affected tests, lint, and the affected build',
      commands: [
        'git diff --check',
        ...testCommands(files, discoveredTests, repositoryDirectory),
        'npm run lint',
        'npm run build',
      ],
      requiresReview: false,
    };
  }

  return {
    kind: 'full',
    reason: 'changed paths are not covered by a lower-risk profile',
    commands: [...FULL_VALIDATION_COMMANDS],
    requiresReview: true,
    reviewReason: 'unknown or high-impact changes require one independent holistic review',
  };
}

export const validationProfileForFiles = deriveValidationProfile;
export const FULL_VALIDATION_COMMANDS_LIST = FULL_VALIDATION_COMMANDS;

function fullProfile(reason) {
  return {
    kind: 'full',
    reason,
    commands: [],
  };
}

function scriptKind(filePath) {
  return /\.jsx?$/i.test(filePath) ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
}

function parseSource(source, filePath) {
  return ts.createSourceFile(
    filePath,
    String(source ?? ''),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
}

function hasParseErrors(sourceFile) {
  return sourceFile.parseDiagnostics.length > 0;
}

function nodeText(node) {
  return typeof node.text === 'string' ? node.text : '';
}

function propertyName(node) {
  const name = node?.name;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? nodeText(name)
    : '';
}

function callName(call) {
  const expression = call?.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function isWithin(node, ancestor) {
  return ancestor && ancestor.pos <= node.pos && node.end <= ancestor.end;
}

function nearestCall(ancestors) {
  return [...ancestors].reverse().find((ancestor) => ts.isCallExpression(ancestor));
}

function isRoleNameOption(node, ancestors, call) {
  const property = [...ancestors].reverse().find((ancestor) =>
    ts.isPropertyAssignment(ancestor) && propertyName(ancestor) === 'name');
  return Boolean(property && call.arguments.some((argument) => isWithin(property, argument)));
}

function isTestCopyLiteral(node, ancestors) {
  if (!ts.isStringLiteral(node) && node.kind !== ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
    return false;
  }
  const call = nearestCall(ancestors);
  const name = callName(call);
  if (TEXT_MATCHER_METHODS.has(name)) {
    return call?.arguments[0] !== undefined && isWithin(node, call.arguments[0]);
  }
  if (TEXT_QUERY_METHODS.has(name)) {
    if (name.endsWith('ByRole')) {
      return isRoleNameOption(node, ancestors, call);
    }
    return call?.arguments[0] !== undefined && isWithin(node, call.arguments[0]);
  }
  return false;
}

function sourceAttribute(node, ancestors) {
  const attribute = [...ancestors].reverse().find((ancestor) => ts.isJsxAttribute(ancestor));
  if (!attribute || !COPY_ATTRIBUTE_NAMES.has(propertyName(attribute))) return undefined;
  const value = attribute.initializer;
  if (value === node) return attribute;
  if (ts.isJsxExpression(value) && value.expression === node) return attribute;
  return undefined;
}

function isSourceCopyLiteral(node, ancestors) {
  if (sourceAttribute(node, ancestors)) return true;
  const expression = ancestors.at(-1);
  const jsxParent = ancestors.at(-2);
  return expression?.kind === ts.SyntaxKind.JsxExpression &&
    (jsxParent?.kind === ts.SyntaxKind.JsxElement || jsxParent?.kind === ts.SyntaxKind.JsxFragment) &&
    (ts.isStringLiteral(node) || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral);
}

function sourceCopyNode(node, ancestors, allowTestLiterals) {
  if (node.kind === ts.SyntaxKind.JsxText) return true;
  return isSourceCopyLiteral(node, ancestors) ||
    (allowTestLiterals && isTestCopyLiteral(node, ancestors));
}

/**
 * Produce a syntax signature that erases only approved copy values. Any
 * changed identifier, operator, JSX element, attribute, import, matcher, or
 * control structure remains visible and therefore fails closed.
 */
function syntaxSignature(sourceFile, allowTestLiterals) {
  function visit(node, ancestors) {
    if (sourceCopyNode(node, ancestors, allowTestLiterals)) {
      if (node.kind === ts.SyntaxKind.JsxText) return 'JSX_TEXT';
      return `TEXT_${node.kind}`;
    }

    const children = [];
    ts.forEachChild(node, (child) => {
      children.push(visit(child, [...ancestors, node]));
    });
    let value = '';
    if (ts.isIdentifier(node)) value = node.text;
    else if (ts.isNumericLiteral(node)) value = node.text;
    else if (ts.isStringLiteral(node) || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
      value = nodeText(node);
    }
    return `${node.kind}:${value}[${children.join('|')}]`;
  }
  return visit(sourceFile, []);
}

function copyValues(sourceFile, allowTestLiterals) {
  const values = [];
  function visit(node, ancestors) {
    if (node.kind === ts.SyntaxKind.JsxText) {
      values.push(nodeText(node));
    } else if (isSourceCopyLiteral(node, ancestors) ||
      (allowTestLiterals && isTestCopyLiteral(node, ancestors))) {
      values.push(nodeText(node));
    }
    ts.forEachChild(node, (child) => visit(child, [...ancestors, node]));
  }
  visit(sourceFile, []);
  return values;
}

function allowedTextRanges(sourceFile, allowTestLiterals) {
  const ranges = [];
  function visit(node, ancestors) {
    if (sourceCopyNode(node, ancestors, allowTestLiterals)) {
      ranges.push({ start: node.getStart(sourceFile), end: node.end });
    }
    ts.forEachChild(node, (child) => visit(child, [...ancestors, node]));
  }
  visit(sourceFile, []);
  return ranges;
}

function lineNumber(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function lineRanges(sourceFile, ranges) {
  const result = new Map();
  for (const range of ranges) {
    for (let line = lineNumber(sourceFile, range.start);
      line <= lineNumber(sourceFile, Math.max(range.start, range.end - 1));
      line += 1) {
      const lineStart = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
      const lineEnd = line < sourceFile.getLineStarts().length
        ? sourceFile.getPositionOfLineAndCharacter(line, 0)
        : sourceFile.getFullText().length;
      const start = Math.max(range.start, lineStart) - lineStart;
      const end = Math.min(range.end, lineEnd) - lineStart;
      const entries = result.get(line) ?? [];
      entries.push({ start, end });
      result.set(line, entries);
    }
  }
  return result;
}

function maskCopyText(sourceFile, sourceLine, line, ranges) {
  const lineStart = sourceFile.getLineStarts()[line - 1];
  if (lineStart === undefined) return sourceLine;
  let masked = sourceLine;
  for (const range of [...(ranges.get(line) ?? [])].sort((left, right) => right.start - left.start)) {
    const start = Math.max(0, Math.min(masked.length, range.start));
    const end = Math.max(start, Math.min(masked.length, range.end));
    masked = `${masked.slice(0, start)}\u0000${masked.slice(end)}`;
  }
  return masked;
}

function parseDiff(diffText) {
  const lines = String(diffText ?? '').split(/\r?\n/);
  const files = new Set();
  const hunks = new Map();
  let currentFile;
  let oldLine = 0;
  let newLine = 0;
  let deleted = [];
  let added = [];
  let malformed = false;

  const flush = () => {
    if (!currentFile || (deleted.length === 0 && added.length === 0)) {
      deleted = [];
      added = [];
      return;
    }
    const fileHunks = hunks.get(currentFile) ?? [];
    fileHunks.push({ deleted, added });
    hunks.set(currentFile, fileHunks);
    deleted = [];
    added = [];
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (!match || match[1] !== match[2]) {
        malformed = true;
        currentFile = undefined;
      } else {
        currentFile = match[2];
        files.add(currentFile);
      }
      continue;
    }
    if (line.startsWith('@@ ')) {
      flush();
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match || !currentFile) {
        malformed = true;
      } else {
        oldLine = Number(match[1]);
        newLine = Number(match[3]);
      }
      continue;
    }
    if (!currentFile || line.startsWith('---') || line.startsWith('+++') ||
      line.startsWith('index ') || line.startsWith('new file ') ||
      line.startsWith('deleted file ') || line.startsWith('similarity ') ||
      line.startsWith('rename ') || line.startsWith('\\ ')) {
      continue;
    }
    if (line.startsWith('-')) {
      deleted.push({ line: oldLine, text: line.slice(1) });
      oldLine += 1;
    } else if (line.startsWith('+')) {
      added.push({ line: newLine, text: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith(' ')) {
      flush();
      oldLine += 1;
      newLine += 1;
    } else if (line.trim()) {
      malformed = true;
    }
  }
  flush();
  return { files, hunks, malformed };
}

function sourceAndTestSignatures(filePath, sourcePair) {
  const beforeFile = parseSource(sourcePair.before, filePath);
  const afterFile = parseSource(sourcePair.after, filePath);
  if (hasParseErrors(beforeFile) || hasParseErrors(afterFile)) return null;
  const allowTestLiterals = TEST_PATH_PATTERN.test(filePath);
  return {
    beforeFile,
    afterFile,
    before: syntaxSignature(beforeFile, allowTestLiterals),
    after: syntaxSignature(afterFile, allowTestLiterals),
    beforeValues: copyValues(beforeFile, allowTestLiterals),
    afterValues: copyValues(afterFile, allowTestLiterals),
    beforeRanges: lineRanges(beforeFile, allowedTextRanges(beforeFile, allowTestLiterals)),
    afterRanges: lineRanges(afterFile, allowedTextRanges(afterFile, allowTestLiterals)),
  };
}

function valuesChanged(beforeValues, afterValues) {
  return beforeValues.length === afterValues.length &&
    beforeValues.some((value, index) => value !== afterValues[index] && value.trim() !== afterValues[index].trim());
}

function changedLinesAreCopyOnly(filePath, diff, signatures) {
  const pairs = diff.hunks.get(filePath) ?? [];
  if (pairs.length === 0) return false;
  for (const pair of pairs) {
    if (pair.deleted.length === 0 || pair.added.length === 0 ||
      pair.deleted.some(({ line }) => !signatures.beforeRanges.has(line)) ||
      pair.added.some(({ line }) => !signatures.afterRanges.has(line)) ||
      pair.deleted.length !== pair.added.length) {
      return false;
    }
    for (let index = 0; index < pair.deleted.length; index += 1) {
      const oldLine = pair.deleted[index];
      const newLine = pair.added[index];
      const oldText = maskCopyText(signatures.beforeFile, oldLine.text, oldLine.line, signatures.beforeRanges);
      const newText = maskCopyText(signatures.afterFile, newLine.text, newLine.line, signatures.afterRanges);
      if (oldText !== newText) return false;
    }
  }
  return true;
}

function sourceStem(filePath) {
  return filePath.replace(/\.(?:tsx|jsx)$/i, '');
}

function testStem(filePath) {
  return filePath.replace(/\.(?:test|spec)\.(?:tsx|jsx)$/i, '');
}

/**
 * Classify a committed diff. The caller supplies exact before/after blobs
 * and a zero-context diff, so a caller cannot opt into the fast path by
 * naming a file or passing a commit message. Any missing or malformed
 * evidence is full.
 */
export function deriveCopyOnlyValidationProfile({ changedFiles = [], diffText = '', sources = {} } = {}) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  if (files.length === 0) return fullProfile('no changed files');

  const sourceFiles = files.filter((filePath) =>
    SOURCE_PATH_PATTERN.test(filePath) && !TEST_PATH_PATTERN.test(filePath));
  const testFiles = files.filter((filePath) => TEST_PATH_PATTERN.test(filePath));
  if (sourceFiles.length === 0 || testFiles.length === 0) {
    return fullProfile('copy-only validation requires an allowlisted player source and focused test');
  }
  if (sourceFiles.length + testFiles.length !== files.length) {
    return fullProfile('changed files include a non-copy allowlist path');
  }
  if (new Set(files).size !== files.length) {
    return fullProfile('changed file evidence contains duplicates');
  }
  const diff = parseDiff(diffText);
  if (diff.malformed || diff.files.size !== files.length || files.some((filePath) => !diff.files.has(filePath))) {
    return fullProfile('committed diff evidence is missing or malformed');
  }
  for (const sourceFile of sourceFiles) {
    if (!testFiles.some((testFile) => testStem(testFile) === sourceStem(sourceFile))) {
      return fullProfile(`no focused companion test exists for ${sourceFile}`);
    }
  }

  let sourceCopyChanged = false;
  let testCopyChanged = false;
  for (const filePath of files) {
    const sourcePair = sources[filePath];
    if (!sourcePair || typeof sourcePair.before !== 'string' || typeof sourcePair.after !== 'string') {
      return fullProfile(`missing before/after source for ${filePath}`);
    }
    const signatures = sourceAndTestSignatures(filePath, sourcePair);
    if (!signatures || signatures.before !== signatures.after ||
      !changedLinesAreCopyOnly(filePath, diff, signatures)) {
      return fullProfile(`syntax, structure, accessibility, or behavior changed in ${filePath}`);
    }
    if (valuesChanged(signatures.beforeValues, signatures.afterValues)) {
      if (SOURCE_PATH_PATTERN.test(filePath)) sourceCopyChanged = true;
      if (TEST_PATH_PATTERN.test(filePath)) testCopyChanged = true;
    }
  }
  if (!sourceCopyChanged || !testCopyChanged) {
    return fullProfile('the committed change did not update both player copy and its focused assertion');
  }

  return {
    kind: 'copy-only',
    reason: 'allowlisted static player copy with a structurally identical focused test',
    commands: [
      ...COPY_ONLY_COMMANDS,
      ...testFiles.slice().sort().map((filePath) => `npm test -- --run ${filePath}`),
    ],
  };
}

export const COPY_ONLY_VALIDATION_COMMANDS = COPY_ONLY_COMMANDS;
