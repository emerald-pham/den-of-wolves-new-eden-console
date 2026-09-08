#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FINAL_STATUSES = ['done', 'partial', 'missing', 'blocked'];
const ALL_STATUSES = [...FINAL_STATUSES, 'in-progress'];

function promptNumber(value) {
  return Number.parseInt(value, 10);
}

function promptLabel(value) {
  return String(value).padStart(3, '0');
}

function parseHeadline(source, errors) {
  const match = source.match(/\*\*(\d+)\s*\/\s*(\d+)\s+prompts\s+complete\s+\((\d+)%\)\*\*/);
  if (!match) {
    errors.push('progress headline must use “N / M prompts complete (P%)”');
    return null;
  }
  return {
    complete: promptNumber(match[1]),
    total: promptNumber(match[2]),
    percentage: promptNumber(match[3]),
  };
}

function parseLedger(source, errors) {
  const rows = [];
  const pattern = /^\|\s*(\d{3})\s*\|\s*(done|partial|missing|blocked|in-progress)\s*\|/gm;
  for (const match of source.matchAll(pattern)) {
    rows.push({ prompt: promptNumber(match[1]), status: match[2] });
  }
  if (rows.length === 0) errors.push('progress ledger contains no prompt rows');
  return rows;
}

function parsePlanChecklist(source, errors) {
  const rows = [];
  const pattern = /^-\s+\[([ xX])\]\s+Prompt\s+(\d{3})\s*$/gm;
  for (const match of source.matchAll(pattern)) {
    rows.push({ prompt: promptNumber(match[2]), checked: match[1].toLowerCase() === 'x' });
  }
  if (rows.length === 0) errors.push('source plan contains no prompt checklist rows');
  return rows;
}

function parseStatusBreakdown(source, errors) {
  const match = source.match(/Status breakdown:\s+\*\*([^*]+)\*\*/);
  if (!match) {
    errors.push('progress document is missing its status breakdown');
    return {};
  }

  const counts = {};
  const entryPattern = /(\d+)\s+(done|partial|missing|blocked|in-progress)/g;
  for (const entry of match[1].matchAll(entryPattern)) {
    const status = entry[2];
    if (counts[status] !== undefined) {
      errors.push(`status breakdown lists ${status} more than once`);
    }
    counts[status] = promptNumber(entry[1]);
  }
  const remainder = match[1]
    .replace(entryPattern, '')
    .replaceAll('·', '')
    .trim();
  if (remainder) errors.push(`status breakdown contains unrecognized text: ${remainder}`);
  return counts;
}

function parseActivePrompt(source, errors) {
  const match = source.match(/Active prompt:\s+\*\*(none|Prompt\s+\d{3})\*\*/i);
  if (!match) {
    errors.push('progress document must declare “Active prompt: **none**” or a prompt number');
    return null;
  }
  return match[1].toLowerCase() === 'none'
    ? null
    : promptNumber(match[1].match(/\d{3}/)[0]);
}

function parseResumePrompt(source, errors) {
  const match = source.match(/Resume pointer:\s*Prompt\s+(\d{3})\s+is the lowest-numbered unchecked acceptance/);
  if (!match) {
    errors.push('progress document must state the lowest-numbered resume pointer');
    return null;
  }
  return promptNumber(match[1]);
}

function countStatuses(rows) {
  const counts = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

function comparePromptSets(rows, expectedTotal, label, errors) {
  const byPrompt = new Map();
  for (const row of rows) {
    if (byPrompt.has(row.prompt)) {
      errors.push(`${label} lists Prompt ${promptLabel(row.prompt)} more than once`);
    }
    byPrompt.set(row.prompt, row);
  }

  for (let prompt = 1; prompt <= expectedTotal; prompt += 1) {
    if (!byPrompt.has(prompt)) errors.push(`${label} is missing Prompt ${promptLabel(prompt)}`);
  }
  for (const row of rows) {
    if (row.prompt < 1 || row.prompt > expectedTotal) {
      errors.push(`${label} contains out-of-range Prompt ${promptLabel(row.prompt)}`);
    }
  }
  return byPrompt;
}

export function validateImplementationProgress({ progressSource, planSource } = {}) {
  const errors = [];
  if (typeof progressSource !== 'string' || typeof planSource !== 'string') {
    return { errors: ['progressSource and planSource must be text'], summary: null };
  }

  const headline = parseHeadline(progressSource, errors);
  const ledgerRows = parseLedger(progressSource, errors);
  const planRows = headline ? parsePlanChecklist(planSource, errors) : [];
  const breakdown = parseStatusBreakdown(progressSource, errors);
  const activePrompt = parseActivePrompt(progressSource, errors);
  const resumePrompt = parseResumePrompt(progressSource, errors);

  if (!headline) return { errors, summary: null };

  const ledgerByPrompt = comparePromptSets(ledgerRows, headline.total, 'progress ledger', errors);
  const planByPrompt = comparePromptSets(planRows, headline.total, 'source plan checklist', errors);
  const statusCounts = countStatuses(ledgerRows);

  if (ledgerRows.length !== headline.total) {
    errors.push(`headline total is ${headline.total}, but the ledger has ${ledgerRows.length} prompt rows`);
  }
  if (statusCounts.done !== headline.complete) {
    errors.push(
      `headline complete count is ${headline.complete}, but the ledger has ${statusCounts.done} done prompts`,
    );
  }
  const expectedPercentage = headline.total === 0
    ? 0
    : Math.round((statusCounts.done / headline.total) * 100);
  if (headline.percentage !== expectedPercentage) {
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
    if (!planRow) continue;
    const shouldBeChecked = row.status === 'done';
    if (planRow.checked !== shouldBeChecked) {
      errors.push(
        `Prompt ${promptLabel(prompt)} is ${row.status} in the ledger but ` +
        `${planRow.checked ? 'checked' : 'unchecked'} in IMPLEMENTATION_PLAN.md`,
      );
    }
  }

  const unresolvedPrompts = ledgerRows.filter((row) => row.status !== 'done');
  const firstUnresolvedPrompt = unresolvedPrompts[0]?.prompt ?? null;
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
    if (activePrompt !== firstUnresolvedPrompt) {
      errors.push(
        `active prompt is ${promptLabel(activePrompt)}, but the first unresolved prompt is ` +
        `${firstUnresolvedPrompt === null ? 'none' : promptLabel(firstUnresolvedPrompt)}`,
      );
    }
    if (activeRow?.status === 'in-progress') {
      errors.push(
        `Prompt ${promptLabel(activePrompt)} is still in-progress; mark it done, partial, missing, or blocked before moving on`,
      );
    }
  }

  return {
    errors,
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
  return {
    progressSource: readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PROGRESS.md'), 'utf8'),
    planSource: readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PLAN.md'), 'utf8'),
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
