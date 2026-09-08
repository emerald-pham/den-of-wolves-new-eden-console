# Preserved in Amber

`preserved-in-amber` is the repository's rollback anchor for the automated
changes that follow. It must remain available and unchanged.

## Anchor record

- Remote ref: `origin/preserved-in-amber`
- Anchor commit: `36c41111609ec31a794e69271b28a085fe54153b`
- Anchor commit message: `Clarify Turn 0 Iris authentication status`
- Created from the clean `main` tip on 2026-09-07 (America/New_York)

## Non-deletion policy

The `preserved-in-amber` branch **MUST NOT be deleted, force-pushed, rebased,
reset, or otherwise moved**. Release automation, branch cleanup, and merge
automation must exclude this ref. Treat the recorded commit as immutable and
use it as the recovery source if `main` needs to be restored.

The branch is intentionally separate from the task worktrees. Do not use it
for feature work or documentation updates; any policy changes belong on a
normal task branch so this anchor remains an exact snapshot.

## Enforcement status

GitHub branch protection was attempted for this exact branch on 2026-09-07,
with deletion and force-pushes disabled, but the available personal access
token was rejected with HTTP 403 (`Resource not accessible by personal access
token`). Until a repository administrator installs the equivalent GitHub
branch protection or ruleset, this file is the repository policy rather than
technical enforcement. An administrator must protect the exact
`preserved-in-amber` branch with at least:

- branch deletion disabled;
- force-pushes disabled; and
- administrator enforcement enabled.

After protection is installed, verify that the remote ref still resolves to
the anchor commit:

```bash
git fetch origin preserved-in-amber
git rev-parse origin/preserved-in-amber^{commit}
```

The result must remain
`36c41111609ec31a794e69271b28a085fe54153b`.

## Recovery reference

If an automated change damages `main`, stop further deployment, inspect the
anchor, and recover only through the normal reviewed release process:

```bash
git fetch origin preserved-in-amber
git show --stat --oneline origin/preserved-in-amber
```

Do not rewrite `preserved-in-amber` while performing recovery.
