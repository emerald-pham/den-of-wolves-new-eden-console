#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FINAL_STATUSES = ['done', 'partial', 'missing', 'blocked'];
const ALL_STATUSES = [...FINAL_STATUSES, 'in-progress'];
const CHANGE_CLASSES = ['feature', 'non-feature'];
const APPLICATION_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const PROMPT_ID_PATTERN = /^\d{3}[a-z]*$/i;
const RETIRED_HISTORICAL_PROMPT_COVERAGE = Object.freeze({
  // Prompt 071 was retired from the 723-prompt canonical plan; its 0.3.5 and
  // 0.3.13 release notes remain historical because Prompt 654 supersedes it.
  '071': Object.freeze({
    allowedVersions: Object.freeze(['0.3.5', '0.3.13']),
    rationale: 'Superseded by Prompt 654.',
  }),
});

export function normalizePromptId(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    value = String(value).padStart(3, '0');
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (PROMPT_ID_PATTERN.test(normalized)) return normalized;
  const legacy = normalized.match(/^(\d{1,3})([a-z]*)$/i);
  return legacy ? `${legacy[1].padStart(3, '0')}${legacy[2].toLowerCase()}` : null;
}

function promptLabel(value) {
  return normalizePromptId(value) ?? String(value);
}

function comparePromptIds(left, right) {
  const leftId = normalizePromptId(left) ?? String(left);
  const rightId = normalizePromptId(right) ?? String(right);
  const leftBase = Number.parseInt(leftId.slice(0, 3), 10);
  const rightBase = Number.parseInt(rightId.slice(0, 3), 10);
  if (leftBase !== rightBase) return leftBase - rightBase;
  if (leftId.length !== rightId.length) return leftId.length - rightId.length;
  return leftId.localeCompare(rightId);
}

function parseHeadline(source, errors) {
  const match = source.match(/\*\*(\d+)\s*\/\s*(\d+)\s+prompts\s+complete\s+\((\d+(?:\.\d+)?)\s*%\)\*\*/);
  if (!match) {
    errors.push('progress headline must use “N / M prompts complete (P%)”');
    return null;
  }
  return {
    complete: Number.parseInt(match[1], 10),
    total: Number.parseInt(match[2], 10),
    percentage: Number.parseFloat(match[3]),
    percentageText: match[3],
  };
}

function parseLedger(source, errors) {
  const rows = [];
  const pattern = /^\|\s*(\d{3}[a-z]*)\s*\|\s*(done|partial|missing|blocked|in-progress)\s*\|\s*(feature|non-feature)\s*\|\s*((?:—|\d+\.\d+\.\d+)(?:\s*,\s*\d+\.\d+\.\d+)*)\s*\|/gim;
  for (const match of source.matchAll(pattern)) {
    const changelogCell = match[4].trim();
    rows.push({
      prompt: normalizePromptId(match[1]),
      status: match[2],
      changeClass: match[3],
      changelogVersions: changelogCell === '—'
        ? []
        : changelogCell.split(',').map((version) => version.trim()),
    });
  }
  if (rows.length === 0) errors.push('progress ledger contains no prompt rows');
  return rows;
}

function parsePlanChecklist(source, errors) {
  const rows = [];
  const pattern = /^-\s+\[([ xX])\]\s+Prompt\s+(\d{3}[a-z]*)\s*$/gim;
  for (const match of source.matchAll(pattern)) {
    rows.push({ prompt: normalizePromptId(match[2]), checked: match[1].toLowerCase() === 'x' });
  }
  if (rows.length === 0) errors.push('source plan contains no prompt checklist rows');
  return rows;
}

function parseCanonicalPromptIds(source, errors) {
  const rows = [];
  const pattern = /^-\s+\*\*Prompt\s+(\d{3}[a-z]*)\s+—\s+\[([^\]]+)\]/gim;
  for (const match of source.matchAll(pattern)) {
    const prompt = normalizePromptId(match[1]);
    if (!prompt) {
      errors.push(`source plan contains an invalid prompt ID ${match[1]}`);
      continue;
    }
    rows.push({ prompt, tag: match[2].toUpperCase() });
  }
  if (rows.length === 0) errors.push('source plan contains no canonical prompt headings');

  const byPrompt = new Set();
  for (const row of rows) {
    if (byPrompt.has(row.prompt)) {
      errors.push(`source plan lists Prompt ${promptLabel(row.prompt)} more than once`);
    }
    byPrompt.add(row.prompt);
  }
  return rows.sort((left, right) => comparePromptIds(left.prompt, right.prompt));
}

function parseStatusBreakdown(source, errors) {
  const match = source.match(/Status breakdown:\s+\*\*([^*]+)\*\*/);
  if (!match) {
    errors.push('progress document is missing its status breakdown');
    return {};
  }

  const counts = {};
  const entryPattern = /(\d+)\s+(done|partial|missing|blocked|in-progress|active)/g;
  for (const entry of match[1].matchAll(entryPattern)) {
    // “active” is the release-facing name for the ledger's in-progress state.
    const status = entry[2] === 'active' ? 'in-progress' : entry[2];
    if (counts[status] !== undefined) {
      errors.push(`status breakdown lists ${status} more than once`);
    }
    counts[status] = Number.parseInt(entry[1], 10);
  }
  const remainder = match[1]
    .replace(entryPattern, '')
    .replaceAll('·', '')
    .trim();
  if (remainder) errors.push(`status breakdown contains unrecognized text: ${remainder}`);
  return counts;
}

function countStringLiterals(source) {
  return [...source.matchAll(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g)].length;
}

function allowsRetiredHistoricalCoverage(prompt, entries, applicationVersion) {
  const policy = RETIRED_HISTORICAL_PROMPT_COVERAGE[prompt];
  return policy !== undefined && entries.length > 0 && entries.every((entry) =>
    entry.version !== applicationVersion && policy.allowedVersions.includes(entry.version));
}

function parseChangelogEntries(source, applicationVersion, errors) {
  if (typeof source !== 'string' || !source.trim()) {
    errors.push('implementation progress gate requires src/changelog.ts text');
    return [];
  }
  if (typeof applicationVersion !== 'string' || !APPLICATION_VERSION_PATTERN.test(applicationVersion)) {
    errors.push('implementation progress gate requires a valid application version');
    return [];
  }

  const versionPattern = /version:\s*(APP_VERSION|['"](\d+\.\d+\.\d+)['"])/g;
  const matches = [...source.matchAll(versionPattern)];
  if (matches.length === 0) {
    errors.push('src/changelog.ts contains no release entries');
    return [];
  }

  return matches.map((match, index) => {
    const version = match[1] === 'APP_VERSION' ? applicationVersion : match[2];
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    const body = source.slice(start, end);
    const promptMatch = body.match(/implementationPrompts:\s*\[([^\]]*)\]/);
    const promptIds = promptMatch
      ? [...promptMatch[1].matchAll(/['"]?(\d{1,3}[a-z]*)['"]?/gi)]
        .map((prompt) => normalizePromptId(prompt[1]))
        .filter(Boolean)
      : [];
    const changesMatch = body.match(/changes:\s*\[([\s\S]*?)\]/);
    const progressMatch = body.match(/implementationProgress:\s*{([\s\S]*?)}/);
    const progressSource = progressMatch?.[1] ?? '';
    const progressNumber = (field) => {
      const value = progressSource.match(new RegExp(`${field}\\s*:\\s*(\\d+)`));
      return value ? Number.parseInt(value[1], 10) : undefined;
    };
    const progressPercentage = progressSource.match(
      /percentage\s*:\s*['"]([^'"]+)['"]/
    )?.[1];

    return {
      version,
      promptIds,
      changeCount: changesMatch ? countStringLiterals(changesMatch[1]) : 0,
      implementationProgress: progressMatch
        ? {
          completed: progressNumber('completed'),
          total: progressNumber('total'),
          percentage: progressPercentage,
          done: progressNumber('done'),
          partial: progressNumber('partial'),
          active: progressNumber('active'),
          missing: progressNumber('missing'),
        }
        : null,
    };
  });
}

function validateReleaseProgressMetadata({
  entries,
  applicationVersion,
  headline,
  statusCounts,
  errors,
}) {
  const entry = entries.find((candidate) => candidate.version === applicationVersion);
  if (!entry) {
    errors.push(`changelog ${applicationVersion} is missing the current release entry`);
    return null;
  }
  const progress = entry.implementationProgress;
  if (!progress) {
    errors.push(`changelog ${applicationVersion} must record implementation progress metadata`);
    return null;
  }

  const expectedCounts = {
    completed: statusCounts.done,
    total: headline.total,
    done: statusCounts.done,
    partial: statusCounts.partial,
    active: statusCounts['in-progress'],
    missing: statusCounts.missing,
  };
  for (const [field, expected] of Object.entries(expectedCounts)) {
    const actual = progress[field];
    if (actual !== expected) {
      errors.push(
        `changelog ${applicationVersion} implementation progress ${field} count is ${String(actual)}, ` +
        `but the ledger has ${expected}`,
      );
    }
  }

  if (typeof progress.percentage !== 'string' || !/^\d+\.\d{2}%$/.test(progress.percentage)) {
    errors.push(
      `changelog ${applicationVersion} implementation progress percentage must use two decimals`,
    );
  } else {
    const expectedPercentage = `${((statusCounts.done / headline.total) * 100).toFixed(2)}%`;
    if (progress.percentage !== expectedPercentage) {
      errors.push(
        `changelog ${applicationVersion} implementation progress percentage is ${progress.percentage}, ` +
        `but the ledger has ${expectedPercentage}`,
      );
    }
  }
  return { version: applicationVersion, ...progress };
}

function validateChangelogCoverage({
  ledgerRows,
  changelogSource,
  applicationVersion,
  errors,
}) {
  const entries = parseChangelogEntries(changelogSource, applicationVersion, errors);
  const entriesByVersion = new Map();
  const coveredPrompts = new Map();

  for (const entry of entries) {
    if (entriesByVersion.has(entry.version)) {
      errors.push(`src/changelog.ts repeats version ${entry.version}`);
    }
    entriesByVersion.set(entry.version, entry);
    const uniquePromptIds = new Set(entry.promptIds);
    if (uniquePromptIds.size !== entry.promptIds.length) {
      errors.push(`changelog ${entry.version} repeats an implementation-plan prompt`);
    }
    if (entry.promptIds.length > 0 && entry.changeCount < entry.promptIds.length) {
      errors.push(
        `changelog ${entry.version} covers ${entry.promptIds.length} implementation-plan feature prompts ` +
        `but has only ${entry.changeCount} player-facing changes`,
      );
    }
    for (const prompt of entry.promptIds) {
      const promptEntries = coveredPrompts.get(prompt) ?? [];
      promptEntries.push(entry);
      coveredPrompts.set(prompt, promptEntries);
    }
  }

  for (const row of ledgerRows) {
    if (!CHANGE_CLASSES.includes(row.changeClass)) {
      errors.push(`Prompt ${promptLabel(row.prompt)} has an unknown change class ${row.changeClass}`);
      continue;
    }

    if (row.changeClass === 'non-feature') {
      if (row.changelogVersions.length > 0) {
        errors.push(
          `non-feature Prompt ${promptLabel(row.prompt)} must use — instead of changelog ${row.changelogVersions.join(', ')}`,
        );
      }
      if (coveredPrompts.has(row.prompt)) {
        const versions = coveredPrompts.get(row.prompt).map((entry) => entry.version).join(', ');
        errors.push(`non-feature Prompt ${promptLabel(row.prompt)} is listed in changelog ${versions}`);
      }
      continue;
    }

    if (row.changelogVersions.length === 0) {
      errors.push(`feature Prompt ${promptLabel(row.prompt)} must name a changelog version`);
      continue;
    }
    if (new Set(row.changelogVersions).size !== row.changelogVersions.length) {
      errors.push(`feature Prompt ${promptLabel(row.prompt)} repeats a changelog version`);
    }
    for (const version of row.changelogVersions) {
      const entry = entriesByVersion.get(version);
      if (!entry) {
        errors.push(
          `feature Prompt ${promptLabel(row.prompt)} names changelog ${version}, but that entry does not exist`,
        );
        continue;
      }
      if (!entry.promptIds.includes(row.prompt)) {
        errors.push(
          `Prompt ${promptLabel(row.prompt)} names changelog ${version}, but that entry does not cover it`,
        );
      }
    }
  }

  for (const [prompt, entries] of coveredPrompts) {
    const row = ledgerRows.find((candidate) => candidate.prompt === prompt);
    if (!row) {
      if (allowsRetiredHistoricalCoverage(prompt, entries, applicationVersion)) continue;
      errors.push(`changelog ${entries.map((entry) => entry.version).join(', ')} references unknown Prompt ${promptLabel(prompt)}`);
    } else if (row.changeClass !== 'feature') {
      errors.push(
        `changelog ${entries.map((entry) => entry.version).join(', ')} references Prompt ${promptLabel(prompt)}, but the ledger marks it non-feature`,
      );
    } else {
      for (const entry of entries) {
        if (!row.changelogVersions.includes(entry.version)) {
          errors.push(
            `Prompt ${promptLabel(prompt)} is mapped to changelog ${row.changelogVersions.join(', ')}, not ${entry.version}`,
          );
        }
      }
    }
  }
  return entries;
}

function parseActivePrompt(source, errors) {
  const match = source.match(/Active prompts?:\s+\*\*(none|Prompt\s+\d{3}[a-z]*)\*\*/i);
  if (!match) {
    errors.push('progress document must declare “Active prompt: **none**” or a prompt ID');
    return null;
  }
  return match[1].toLowerCase() === 'none'
    ? null
    : normalizePromptId(match[1].match(/\d{3}[a-z]*/i)[0]);
}

function parseResumePrompt(source, errors) {
  const match = source.match(/Resume pointer:\s*Prompt\s+(\d{3}[a-z]*)\s+is the lowest-numbered unchecked acceptance/i);
  if (!match) {
    errors.push('progress document must state the lowest-numbered resume pointer');
    return null;
  }
  return normalizePromptId(match[1]);
}

function countStatuses(rows) {
  const counts = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

function comparePromptSets(rows, expectedPromptIds, label, errors) {
  const byPrompt = new Map();
  for (const row of rows) {
    if (byPrompt.has(row.prompt)) {
      errors.push(`${label} lists Prompt ${promptLabel(row.prompt)} more than once`);
    }
    byPrompt.set(row.prompt, row);
  }

  const expected = new Set(expectedPromptIds);
  for (const prompt of expected) {
    if (!byPrompt.has(prompt)) errors.push(`${label} is missing Prompt ${promptLabel(prompt)}`);
  }
  for (const row of rows) {
    if (!expected.has(row.prompt)) {
      errors.push(`${label} contains unknown Prompt ${promptLabel(row.prompt)}`);
    }
  }
  return byPrompt;
}

function releaseVersionParts(value) {
  if (typeof value !== 'string' || !APPLICATION_VERSION_PATTERN.test(value.trim())) return null;
  return value.trim().split('.').map((part) => Number.parseInt(part, 10));
}

function fragmentPromptIds(value, errors) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push('release fragment implementationPrompts must be an array');
    return [];
  }
  const prompts = [];
  for (const candidate of value) {
    const prompt = normalizePromptId(candidate);
    if (!prompt || !PROMPT_ID_PATTERN.test(prompt)) {
      errors.push(`release fragment contains invalid implementation prompt ${String(candidate)}`);
      continue;
    }
    if (prompts.includes(prompt)) {
      errors.push(`release fragment repeats implementation prompt ${promptLabel(prompt)}`);
      continue;
    }
    prompts.push(prompt);
  }
  return prompts;
}

function validateFragmentProgressMetadata(progress, headline, errors) {
  if (progress === undefined || progress === null) return null;
  if (typeof progress !== 'object' || Array.isArray(progress)) {
    errors.push('release fragment implementation progress must be an object');
    return null;
  }
  const fields = ['completed', 'total', 'done', 'partial', 'active', 'missing'];
  const values = {};
  for (const field of fields) {
    const value = progress[field];
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`release fragment implementation progress ${field} must be a non-negative integer`);
    } else {
      values[field] = value;
    }
  }
  const percentage = progress.percentage;
  if (typeof percentage !== 'string' || !/^\d+\.\d{2}%$/.test(percentage)) {
    errors.push('release fragment implementation progress percentage must use two decimals');
  } else {
    values.percentage = percentage;
  }

  if (Object.keys(values).length !== fields.length + 1) return null;
  if (values.completed !== values.done) {
    errors.push(
      `release fragment implementation progress completed count is ${values.completed}, but done is ${values.done}`,
    );
  }
  if (values.done + values.partial + values.active + values.missing !== values.total) {
    errors.push('release fragment implementation progress counts must sum to total');
  }
  if (headline && values.total !== headline.total) {
    errors.push(
      `release fragment implementation progress total is ${values.total}, but the ledger total is ${headline.total}`,
    );
  }
  const expectedPercentage = values.total === 0
    ? '0.00%'
    : `${((values.done / values.total) * 100).toFixed(2)}%`;
  if (values.percentage !== expectedPercentage) {
    errors.push(
      `release fragment implementation progress percentage is ${values.percentage}, but its counts require ${expectedPercentage}`,
    );
  }
  return values;
}

/**
 * Validate release-lane metadata before it is copied into package/changelog
 * files. This does not mutate or relax the normal progress gate; it gives a
 * product branch a checked fragment it can carry until finalization.
 */
export function validateReleaseFragment({
  fragment,
  progressSource,
  planSource,
  applicationVersion,
  requiredPrompt = null,
} = {}) {
  const errors = [];
  const candidate = fragment !== null && typeof fragment === 'object' && !Array.isArray(fragment)
    ? fragment
    : {};
  const baseVersion = typeof candidate.baseVersion === 'string' ? candidate.baseVersion.trim() : '';
  const baseParts = releaseVersionParts(baseVersion);
  if (!baseParts) errors.push('release fragment must record a valid baseVersion');
  if (typeof applicationVersion !== 'string' || !APPLICATION_VERSION_PATTERN.test(applicationVersion)) {
    errors.push('release fragment validation requires a valid application version');
  } else if (baseVersion && baseVersion !== applicationVersion) {
    errors.push(
      `release fragment baseVersion ${baseVersion} does not match current application version ${applicationVersion}`,
    );
  }

  const version = candidate.version === undefined ? undefined : String(candidate.version).trim();
  if (version !== undefined) {
    const versionParts = releaseVersionParts(version);
    if (!versionParts) errors.push(`release fragment version ${version} is invalid`);
    else if (baseParts && (versionParts[0] < baseParts[0] ||
      (versionParts[0] === baseParts[0] && versionParts[1] < baseParts[1]) ||
      (versionParts[0] === baseParts[0] && versionParts[1] === baseParts[1] && versionParts[2] <= baseParts[2]))) {
      errors.push(`release fragment version ${version} must be newer than baseVersion ${baseVersion}`);
    }
  }

  if (!Array.isArray(candidate.changes) || candidate.changes.length === 0 ||
    candidate.changes.some((change) => typeof change !== 'string' || !change.trim())) {
    errors.push('release fragment requires at least one non-empty visible change');
  }

  const prompts = fragmentPromptIds(candidate.implementationPrompts, errors);
  const headline = typeof progressSource === 'string' ? parseHeadline(progressSource, errors) : null;
  const ledgerRows = typeof progressSource === 'string' ? parseLedger(progressSource, errors) : [];
  const canonicalRows = typeof planSource === 'string' ? parseCanonicalPromptIds(planSource, errors) : [];
  const canonicalPromptIds = canonicalRows.map((row) => row.prompt);
  const ledgerByPrompt = new Map(ledgerRows.map((row) => [row.prompt, row]));
  for (const prompt of prompts) {
    if (!canonicalPromptIds.includes(prompt)) {
      errors.push(`release fragment contains unknown Prompt ${promptLabel(prompt)}`);
      continue;
    }
    const row = ledgerByPrompt.get(prompt);
    if (!row) {
      errors.push(`release fragment Prompt ${promptLabel(prompt)} is missing from the progress ledger`);
    } else if (row.changeClass !== 'feature') {
      errors.push(`release fragment Prompt ${promptLabel(prompt)} is not a feature prompt`);
    }
  }
  if (requiredPrompt !== null && requiredPrompt !== undefined) {
    const prompt = normalizePromptId(requiredPrompt);
    if (prompt && prompts.length > 0 && !prompts.includes(prompt)) {
      errors.push(`release fragment does not cover required Prompt ${promptLabel(prompt)}`);
    }
  }
  const implementationProgress = validateFragmentProgressMetadata(
    candidate.implementationProgress,
    headline,
    errors,
  );

  return {
    errors,
    fragment: {
      ...candidate,
      ...(baseVersion ? { baseVersion } : {}),
      ...(version ? { version } : {}),
      implementationPrompts: prompts,
      ...(implementationProgress ? { implementationProgress } : {}),
      validated: errors.length === 0,
    },
  };
}

export function validateImplementationProgress({
  progressSource,
  planSource,
  changelogSource,
  applicationVersion,
  requiredPrompt = null,
  validatedFragment = null,
  releaseFragment = null,
} = {}) {
  const errors = [];
  if (typeof progressSource !== 'string' || typeof planSource !== 'string') {
    return { errors: ['progressSource and planSource must be text'], summary: null };
  }

  const headline = parseHeadline(progressSource, errors);
  const ledgerRows = parseLedger(progressSource, errors);
  const canonicalRows = parseCanonicalPromptIds(planSource, errors);
  const canonicalPromptIds = canonicalRows.map((row) => row.prompt);
  const planRows = headline ? parsePlanChecklist(planSource, errors) : [];
  const breakdown = parseStatusBreakdown(progressSource, errors);
  const activePrompt = parseActivePrompt(progressSource, errors);
  const resumePrompt = parseResumePrompt(progressSource, errors);

  if (!headline) return { errors, summary: null };

  const ledgerByPrompt = comparePromptSets(ledgerRows, canonicalPromptIds, 'progress ledger', errors);
  const planByPrompt = comparePromptSets(planRows, canonicalPromptIds, 'source plan checklist', errors);
  const statusCounts = countStatuses(ledgerRows);

  const changelogEntries = validateChangelogCoverage({
    ledgerRows,
    changelogSource,
    applicationVersion,
    errors,
  });
  const releaseProgress = validateReleaseProgressMetadata({
    entries: changelogEntries,
    applicationVersion,
    headline,
    statusCounts,
    errors,
  });

  const fragmentCandidate = validatedFragment ?? releaseFragment;
  const fragmentValidation = fragmentCandidate
    ? validateReleaseFragment({
        fragment: fragmentCandidate,
        progressSource,
        planSource,
        applicationVersion,
        requiredPrompt,
      })
    : null;
  if (fragmentValidation) {
    errors.push(...fragmentValidation.errors.map((error) => `release fragment gate: ${error}`));
  }

  if (ledgerRows.length !== headline.total) {
    errors.push(`headline total is ${headline.total}, but the ledger has ${ledgerRows.length} prompt rows`);
  }
  if (headline.total !== canonicalPromptIds.length) {
    errors.push(
      `headline total is ${headline.total}, but the canonical plan contains ${canonicalPromptIds.length} prompt IDs`,
    );
  }
  if (statusCounts.done !== headline.complete) {
    errors.push(
      `headline complete count is ${headline.complete}, but the ledger has ${statusCounts.done} done prompts`,
    );
  }
  const expectedPercentage = headline.total === 0
    ? '0.00'
    : ((statusCounts.done / headline.total) * 100).toFixed(2);
  if (!/^\d+\.\d{2}$/.test(headline.percentageText)) {
    errors.push('progress headline percentage must use two decimals');
  }
  if (headline.percentage !== Number.parseFloat(expectedPercentage)) {
    errors.push(
      `headline percentage is ${headline.percentage}%, but ${statusCounts.done}/${headline.total} complete is ${expectedPercentage}%`,
    );
  }

  for (const status of ALL_STATUSES) {
    const expected = statusCounts[status];
    const declared = breakdown[status] ?? 0;
    if (declared !== expected) {
      errors.push(`status breakdown declares ${declared} ${status}, but the ledger has ${expected}`);
    }
  }
  for (const status of Object.keys(breakdown)) {
    if (!ALL_STATUSES.includes(status)) errors.push(`status breakdown contains unknown status ${status}`);
  }

  for (const [prompt, row] of ledgerByPrompt) {
    const planRow = planByPrompt.get(prompt);
    if (row.status === 'done' && (!planRow || !planRow.checked)) {
      errors.push(
        `Prompt ${promptLabel(prompt)} is done in the ledger but lacks checked source-plan evidence`,
      );
    }
    if (!planRow) continue;
    const shouldBeChecked = row.status === 'done';
    if (planRow.checked !== shouldBeChecked) {
      errors.push(
        `Prompt ${promptLabel(prompt)} is ${row.status} in the ledger but ` +
        `${planRow.checked ? 'checked' : 'unchecked'} in IMPLEMENTATION_PLAN.md`,
      );
    }
  }

  const unresolvedPrompts = ledgerRows
    .filter((row) => row.status !== 'done')
    .map((row) => row.prompt)
    .sort(comparePromptIds);
  const firstUnresolvedPrompt = unresolvedPrompts[0] ?? null;
  if (resumePrompt !== firstUnresolvedPrompt) {
    errors.push(
      `resume pointer is Prompt ${promptLabel(resumePrompt)}, but the first unresolved prompt is ` +
      `${firstUnresolvedPrompt === null ? 'none' : promptLabel(firstUnresolvedPrompt)}`,
    );
  }

  const inProgressRows = ledgerRows.filter((row) => row.status === 'in-progress');
  if (inProgressRows.length > 1) errors.push('only one prompt may be in-progress at a time');
  if (activePrompt === null && inProgressRows.length > 0) {
    errors.push(
      `Active prompt is none, but Prompt ${promptLabel(inProgressRows[0].prompt)} is in-progress`,
    );
  }
  if (activePrompt !== null) {
    const activeRow = ledgerByPrompt.get(activePrompt);
    if (!activeRow) {
      errors.push(`active prompt is ${promptLabel(activePrompt)}, but that prompt is not in the ledger`);
    } else if (activeRow.status !== 'in-progress') {
      errors.push(
        `active Prompt ${promptLabel(activePrompt)} must be in-progress, but is ${activeRow.status}`,
      );
    }
    if (inProgressRows.length === 1 && inProgressRows[0].prompt !== activePrompt) {
      errors.push(
        `Active prompt is ${promptLabel(activePrompt)}, but Prompt ${promptLabel(inProgressRows[0].prompt)} is in-progress`,
      );
    }
    if (activeRow?.status === 'in-progress') {
      errors.push(
        `Prompt ${promptLabel(activePrompt)} is still in-progress; mark it done, partial, missing, or blocked before moving on`,
      );
    }
  }

  if (requiredPrompt !== null && requiredPrompt !== undefined) {
    const prompt = normalizePromptId(requiredPrompt);
    if (!prompt || !canonicalPromptIds.includes(prompt)) {
      errors.push(`required implementation-plan Prompt ${promptLabel(requiredPrompt)} is not in the canonical plan`);
    } else if (!ledgerByPrompt.has(prompt)) {
      errors.push(`required implementation-plan Prompt ${promptLabel(prompt)} is not in the progress ledger`);
    }
  }

  return {
    errors,
    releaseProgress,
    ...(fragmentValidation ? { validatedFragment: fragmentValidation.fragment } : {}),
    summary: {
      complete: statusCounts.done,
      total: headline.total,
      partial: statusCounts.partial,
      missing: statusCounts.missing,
      blocked: statusCounts.blocked,
      inProgress: statusCounts['in-progress'],
      resumePrompt: firstUnresolvedPrompt,
      activePrompt,
    },
  };
}

export function formatImplementationProgress(summary) {
  if (!summary) return 'Implementation progress is unavailable.';
  const parts = [
    `${summary.complete}/${summary.total} complete`,
    `${summary.partial} partial`,
    `${summary.missing} missing`,
  ];
  if (summary.blocked > 0) parts.push(`${summary.blocked} blocked`);
  const resume = summary.resumePrompt === null
    ? 'no unresolved prompt'
    : `Prompt ${promptLabel(summary.resumePrompt)} (lowest-numbered unresolved prompt)`;
  return `Implementation progress: ${parts.join('; ')}; resume at ${resume}.`;
}

export function readImplementationProgress({ cwd = process.cwd() } = {}) {
  const packageSource = readFileSync(resolve(cwd, 'package.json'), 'utf8');
  return {
    progressSource: readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PROGRESS.md'), 'utf8'),
    planSource: readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PLAN.md'), 'utf8'),
    changelogSource: readFileSync(resolve(cwd, 'src/changelog.ts'), 'utf8'),
    applicationVersion: JSON.parse(packageSource).version,
  };
}

function main() {
  const cwd = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const result = validateImplementationProgress(readImplementationProgress({ cwd }));
  if (result.errors.length > 0) {
    throw new Error(`Implementation progress validation failed:\n- ${result.errors.join('\n- ')}`);
  }
  console.log(formatImplementationProgress(result.summary));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
