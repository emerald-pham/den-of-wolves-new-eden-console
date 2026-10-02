#!/usr/bin/env node

// Documentation projection only. The catalog and recovery allocation remain
// authoritative; this chart neither schedules agents nor changes prompt status.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPromptDispatch, deriveProgressSummary, loadPromptCatalog, normalizePromptId, selectPrompt,
} from './prompt-catalog.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const catalogPath = 'docs/implementation-prompts.json';
const allocationPath = 'docs/CHECKPOINT_COMPLETION_PLAN.md';
const outputBase = 'docs/PC07_ROADMAP_GANTT';
const templatePath = 'scripts/checkpoint-gantt-template.html';
const args = process.argv.slice(2);
assert(args.every((arg) => arg === '--check'), 'Only --check is supported');
const check = args.includes('--check');
const catalog = loadPromptCatalog({ cwd: root });
const recovery = readFileSync(resolve(root, allocationPath), 'utf8');

// Presentation groups use explicit domain IDs, never catalog array positions.
// They are reading aids, not new implementation assignments or acceptance gates.
const groupDefinitions = {
  PC07: [
    ['Split-fleet privacy and scouting', '326 336 153 337 338 152 339 340 341 342 678'],
    ['Scout taxi, rejoin and split proof', '343 344 345 346 347 348 349 350 424 643'],
    ['Airspace, maintenance and recovery', '140 154 155 156 158 103a 159'],
    ['Attack authority and targeting', '428 431 432 432a 433 433a 433b 434 434a 435 436 437 523a'],
    ['Attack ranges and results', '438 439 440 441 442 444'],
    ['Local DRADIS and transit contacts', '351 353'],
  ],
  PC08: [
    ['DRADIS and shuttle-airspace proof', '354 355 356 357 358 359 360 423 644 605'],
    ['Missiles, weapons and range actions', '389 445 446 447 448 454 455 459'],
    ['Fighter state, launch and combat', '231 396 397 398 443 449 450 451 452 453 456 457 458'],
    ['Boarding support, defence and damage', '461 462 465 466 394 395 460 463 464 467 468'],
    ['Wolf craft destruction and carryover', '469 469a 469b 469c 469d 469e 470'],
  ],
  PC09: [
    ['Battle results and attack presentation', '471 472 473 580 605a 474 475 476'],
    ['Casualties, salvage, repair and aftermath', '477 478 479 480 481 482 483 484'],
    ['Wolf threats, dial and attack recovery', '490 491 492 493 494 621'],
    ['Investigation, arrest and specialists', '214 503a 506 508 513 514 516 517 519 520 521 521a 521b 524 645 180'],
    ['President, elections and crises', '523b 523c 524b 524c 524d 528 529 537 538 539 540'],
  ],
  PC10: [
    ['Specialist workspaces', '181 215b 223b 233b'],
    ['Capybara integration and full proof', '576 579 581 584 585 642'],
    ['Candidate discovery and Ancient Ring', '541 542 543 544 545 546 547 548 549 593 619 647'],
    ['Deep Nebula outcomes and proof', '550 551 552 553 554 648'],
    ['Ancient Station outcomes and proof', '555 556 557 558 559 649'],
    ['Endings, debrief and terminal recovery', '563 564 565 566 650'],
    ['Cross-path recovery and final audit', '618 620 629 630 631 634 635 641 651'],
  ],
};
const titles = {
  PC07: 'Airspace, split fleets and attack foundations',
  PC08: 'Weapons, fighters and boarding',
  PC09: 'Battle aftermath, deduction and crises',
  PC10: 'Endings, integration and full-game proof',
};
const allocations = [...recovery.matchAll(/^### (PC\d+) — (\d+) assigned closures; (\d+)\/(\d+) cumulative\n\n([^\n]+)/gm)]
  .map(([, id, count, cumulative, baseline, rawIds]) => {
    const ids = rawIds.replace(/\.$/, '').split(',').map((value) => normalizePromptId(value.trim()));
    assert(ids.every(Boolean), 'Invalid allocation ID in ' + id);
    assert.equal(ids.length, Number(count), 'Wrong allocation count for ' + id);
    const tableRow = recovery.split('\n').find((line) => line.startsWith('| ' + id + ' |'));
    const target = tableRow?.split('|').map((cell) => cell.trim()).find((cell) => /^\d+\/\d+$/.test(cell));
    assert(target, 'Missing overall target for ' + id);
    const [overallTarget, total] = target.split('/').map(Number);
    assert.equal(total, catalog.prompts.length, 'Target/catalog total mismatch');
    return { id, ids, assignedCount: Number(count), cumulativeBaselineClosures: Number(cumulative),
      baselineCount: Number(baseline), overallTarget, total };
  });
assert.equal(allocations.length, 6, 'Expected PC05–PC10 allocation');
const allocationById = new Map(allocations.map((allocation) => [allocation.id, allocation]));
const membership = new Map();
for (const allocation of allocations) {
  for (const id of allocation.ids) {
    assert(!membership.has(id), 'Duplicate baseline allocation ' + id);
    membership.set(id, allocation.id);
    selectPrompt(catalog, id);
  }
}
assert.equal(membership.size, allocations.at(-1).baselineCount, 'Incomplete fixed baseline');
const scopedAllocations = allocations.filter(({ id }) => Number(id.slice(2)) >= 7);
assert.deepEqual(scopedAllocations.map(({ id }) => id), Object.keys(groupDefinitions));

const dispatch = buildPromptDispatch(catalog);
const readiness = new Map([
  ...dispatch.readyQueue.map((row) => [row.prompt, 'ready']),
  ...dispatch.needsConfirmation.map((row) => [row.prompt, 'recorded-gate']),
  ...dispatch.blocked.map((row) => [row.prompt, 'blocked']),
]);
const statusCounts = (ids) => ids.reduce((counts, id) => {
  const status = selectPrompt(catalog, id).status;
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, { done: 0, partial: 0, missing: 0, blocked: 0, 'in-progress': 0 });
const tasks = scopedAllocations.flatMap((allocation) => allocation.ids.map((id) => {
  const selected = selectPrompt(catalog, id);
  return {
    id, checkpoint: allocation.id, title: selected.title, status: selected.status,
    catalogReadiness: selected.status === 'done' ? 'done' : readiness.get(id) || 'unknown',
    acceptance: selected.acceptance,
    prerequisites: selected.prerequisites.map((prerequisite) => ({
      ...prerequisite, checkpoint: membership.get(prerequisite.id) || null,
      inChart: scopedAllocations.some((entry) => entry.ids.includes(prerequisite.id)),
    })),
    recordedConditions: {
      hardMilestone: selected.hardMilestone, hardContract: selected.hardContract,
      decisionOwner: selected.decisionOwner, closureEvidenceGates: selected.closureEvidenceGates,
      releaseBoundaries: selected.releaseBoundaries,
    },
    sequenceRules: selected.sequenceRules,
    relatedConsumes: selected.relatedConsumes,
  };
}));
const taskById = new Map(tasks.map((task) => [task.id, task]));
const groups = [];
for (const allocation of scopedAllocations) {
  const grouped = new Set();
  groupDefinitions[allocation.id].forEach(([label, rawIds], index) => {
    const ids = rawIds.split(' ');
    const id = allocation.id + '-G' + (index + 1);
    for (const promptId of ids) {
      assert(allocation.ids.includes(promptId), 'Group contains foreign ID ' + promptId);
      assert(!grouped.has(promptId), 'Group duplicates ' + promptId);
      grouped.add(promptId);
      taskById.get(promptId).group = id;
    }
    groups.push({ id, checkpoint: allocation.id, label, promptIds: ids, assignedCount: ids.length,
      statusCounts: statusCounts(ids) });
  });
  assert.equal(grouped.size, allocation.assignedCount, 'Group coverage mismatch for ' + allocation.id);
}

// The full allocated graph is retained even as statuses change. Each wave is a
// topological layer, not one day or one equal-effort block. Releases stay ordered.
const checkpoints = [];
let previousEnd = 0;
for (const allocation of scopedAllocations) {
  const start = previousEnd + 1;
  const visiting = new Set();
  function assignWave(id) {
    const task = taskById.get(id);
    if (task.startWave) return task.startWave;
    assert(!visiting.has(id), 'Dependency cycle at ' + id);
    visiting.add(id);
    let wave = start;
    for (const prerequisite of task.prerequisites) {
      if (!taskById.has(prerequisite.id)) continue;
      const upstream = taskById.get(prerequisite.id);
      assert(Number(upstream.checkpoint.slice(2)) <= Number(task.checkpoint.slice(2)),
        'Hard prerequisite points to a later checkpoint: ' + prerequisite.id + ' -> ' + id);
      wave = Math.max(wave, assignWave(prerequisite.id) + 1);
    }
    visiting.delete(id);
    task.startWave = wave;
    task.endWave = wave;
    return wave;
  }
  allocation.ids.forEach(assignWave);
  const end = Math.max(...allocation.ids.map((id) => taskById.get(id).endWave));
  const previousId = 'PC' + String(Number(allocation.id.slice(2)) - 1).padStart(2, '0');
  const previous = allocationById.get(previousId);
  const previousCounts = statusCounts(previous.ids);
  checkpoints.push({
    ...allocation, title: titles[allocation.id], startWave: start, endWave: end,
    dependencyLayerCount: end - start + 1, statusCounts: statusCounts(allocation.ids),
    predecessorCheckpoint: previousId,
    predecessorCompleteInCatalog: previousCounts.done === previous.assignedCount,
    releaseMilestone: {
      afterWave: end, overallDoneTarget: allocation.overallTarget,
      requires: ['all assigned acceptances and dependencies complete',
        'appropriate tests, responsive QA and independent risk review',
        'one reconciled release candidate and verified deployment',
        'ordinary authorized gameplay proof and a solo review link'],
    },
  });
  previousEnd = end;
}
for (const task of tasks) {
  for (const prerequisite of task.prerequisites) {
    if (taskById.has(prerequisite.id)) {
      assert(taskById.get(prerequisite.id).endWave < task.startWave,
        'Unordered hard dependency ' + prerequisite.id + ' -> ' + task.id);
    }
  }
  task.unfinishedPrerequisites = task.prerequisites.filter((item) => item.status !== 'done').map((item) => item.id);
  task.unfinishedExternalPrerequisites = task.prerequisites.filter((item) => !item.inChart && item.status !== 'done')
    .map((item) => item.id);
}
for (const group of groups) {
  group.startWave = Math.min(...group.promptIds.map((id) => taskById.get(id).startWave));
  group.endWave = Math.max(...group.promptIds.map((id) => taskById.get(id).endWave));
  group.waveBuckets = [...new Set(group.promptIds.map((id) => taskById.get(id).startWave))]
    .sort((a, b) => a - b).map((wave) => ({
      wave, promptIds: group.promptIds.filter((id) => taskById.get(id).startWave === wave),
    }));
}
const waves = Array.from({ length: previousEnd }, (_, index) => ({
  wave: index + 1, checkpoint: checkpoints.find((checkpoint) => checkpoint.startWave <= index + 1
    && checkpoint.endWave >= index + 1).id,
  promptIds: tasks.filter((task) => task.startWave === index + 1).map((task) => task.id),
}));
assert(waves.every((wave) => wave.promptIds.length), 'Empty dependency wave');
const sourceFiles = [catalogPath, allocationPath];
const revision = execFileSync('git', ['log', '-1', '--format=%H', '--', ...sourceFiles], { cwd: root, encoding: 'utf8' }).trim();
const revisionDate = execFileSync('git', ['show', '-s', '--format=%cI', revision], { cwd: root, encoding: 'utf8' }).trim();
const summary = deriveProgressSummary(catalog);
const preceding = allocationById.get('PC06');
const data = {
  schemaVersion: 1, id: 'den-of-wolves-pc07-to-pc10', title: 'PC07–PC10 dependency-wave Gantt',
  scope: { firstCheckpoint: 'PC07', lastCheckpoint: 'PC10', assignedPromptCount: tasks.length,
    checkpointCount: checkpoints.length, groupCount: groups.length, dependencyWaveCount: previousEnd },
  sources: { revision, revisionDate, files: sourceFiles.map((path) => ({
    path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
  })) },
  semantics: {
    axis: 'dependency_wave', dates: null, durations: null,
    waveDefinition: 'One topological layer in the full allocated hard-prompt graph, with checkpoint releases kept in order.',
    waveFormula: 'max(checkpoint start wave, 1 + every in-chart hard prerequisite wave)',
    taskSpan: 'Each prompt occupies one dependency layer; its mark does not encode effort or elapsed time.',
    parallelism: 'Same-wave prompts have no hard-prompt edge between them. Actual parallel work depends on ownership, shared files, sources and access.',
    externalPrerequisites: 'Out-of-chart prerequisites are reported separately; W1 assumes PC06 has completed its 49 assigned IDs and release proof.',
    conditions: 'Catalog contracts, decisions and proof conditions remain visible. Recorded owner conditions need source/standing-instruction re-evaluation; they are not automatically new approval requests.',
    groups: 'Editorial workstreams for reading the chart; these do not replace checkpoint shaping, acceptance or worker ownership.',
    completion: 'Only catalog done status counts. Partial implementation, synthetic scenes or deployment alone do not close a prompt.',
    freshness: 'Derived snapshot, not a second status ledger. Regenerate when the catalog or allocation changes.',
    release: 'Review, validation, deployment and ordinary gameplay proof are required but have no invented duration.',
  },
  catalogSnapshot: { complete: summary.complete, total: summary.total, statusCounts: summary.counts },
  prerequisiteCheckpoint: { ...preceding, statusCounts: statusCounts(preceding.ids),
    note: 'Context only: PC06 is outside the plotted work. Catalog status is distinct from in-flight implementation.' },
  checkpoints, groups, waves, tasks,
  dependencyEdges: tasks.flatMap((task) => task.prerequisites.map((prerequisite) => ({
    from: prerequisite.id, to: task.id, type: 'hard_prompt', inChart: prerequisite.inChart,
    sourceStatus: prerequisite.status,
  }))),
  recordedConditions: tasks.filter((task) => Object.values(task.recordedConditions).some((value) => value !== 'none'))
    .map((task) => ({ id: task.id, checkpoint: task.checkpoint, ...task.recordedConditions })),
};
const json = JSON.stringify(data, null, 2) + '\n';
const csvCell = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const csvRows = [
  ['id', 'checkpoint', 'workstream', 'title', 'catalog_status', 'catalog_readiness',
    'start_wave', 'end_wave', 'hard_prerequisites', 'unfinished_prerequisites',
    'unfinished_external_prerequisites', 'hard_milestone', 'hard_contract', 'decision_owner',
    'closure_evidence_gates', 'release_boundaries', 'sequence_rules', 'related_consumes',
    'overall_done_target', 'source_revision', 'axis_unit'],
  ...tasks.map((task) => [task.id, task.checkpoint, groups.find((group) => group.id === task.group).label,
    task.title, task.status, task.catalogReadiness, task.startWave, task.endWave,
    task.prerequisites.map((item) => item.id).join(';'), task.unfinishedPrerequisites.join(';'),
    task.unfinishedExternalPrerequisites.join(';'), task.recordedConditions.hardMilestone,
    task.recordedConditions.hardContract, task.recordedConditions.decisionOwner,
    task.recordedConditions.closureEvidenceGates, task.recordedConditions.releaseBoundaries,
    task.sequenceRules, task.relatedConsumes, checkpoints.find((item) => item.id === task.checkpoint).overallTarget,
    revision, 'dependency_wave']),
];
const csv = csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
const safeJson = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const safeCsv = JSON.stringify(csv).replaceAll('<', '\\u003c');
const template = readFileSync(resolve(root, templatePath), 'utf8');
assert.equal(template.split('__GANTT_DATA__').length, 2, 'Missing/duplicate data placeholder');
assert.equal(template.split('__GANTT_CSV__').length, 2, 'Missing/duplicate CSV placeholder');
const html = template.replace('__GANTT_DATA__', () => safeJson).replace('__GANTT_CSV__', () => safeCsv);
for (const [extension, content] of [['json', json], ['csv', csv.replaceAll('\r\n', '\n')], ['html', html]]) {
  const path = resolve(root, outputBase + '.' + extension);
  if (check) assert.equal(readFileSync(path, 'utf8'), content, 'Stale generated artifact: ' + path);
  else writeFileSync(path, content);
}
console.log((check ? 'Verified' : 'Generated') + ': ' + tasks.length + ' prompts, ' + groups.length
  + ' workstreams, ' + previousEnd + ' dependency waves. Catalog: ' + summary.complete + '/' + summary.total + '.');
for (const checkpoint of checkpoints) console.log(checkpoint.id + ': W' + checkpoint.startWave + '–W'
  + checkpoint.endWave + ', ' + checkpoint.assignedCount + ' prompts, target ' + checkpoint.overallTarget + '/' + checkpoint.total);
