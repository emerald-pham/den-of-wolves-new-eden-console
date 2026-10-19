const TRACKER_PATHS = new Set([
  'docs/tracker/github-crosswalk.json',
  'docs/tracker/github-snapshot.json',
  'scripts/generate-prompt-views.mjs',
  'scripts/github-prompt-tracker.mjs',
  'scripts/github-prompt-tracker.test.mjs',
  'scripts/prompt-tracker-consumers.test.mjs',
  'scripts/tracker-paths.mjs',
  'scripts/tracker-risk-gate.test.mjs',
]);

export function isTrackerPath(path) {
  return TRACKER_PATHS.has(String(path ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase());
}

export function trackerValidationCommands(files) {
  return files.some(isTrackerPath) ? ['npm run test:prompt-tracker'] : [];
}
