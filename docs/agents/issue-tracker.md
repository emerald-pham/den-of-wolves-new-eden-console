# GitHub issue tracker operations

GitHub issues are the mutable authority for the migrated prompt and brief
tracking fields. The committed
[`../tracker/github-crosswalk.json`](../tracker/github-crosswalk.json) maps
legacy IDs to public issue identities and preserves sanitized source provenance
and dependency mappings. It is immutable migration metadata; normal tracking
updates do not rewrite it or require a new plan hash.

[`../implementation-prompts.json`](../implementation-prompts.json) is the
generated offline snapshot used by existing catalog consumers. It preserves
definitions, the other prompt fields, and completed prompt history. The
implementation plan, progress, and dependency Markdown files are generated
views. Ordinary imports of project modules and CI checks do not contact GitHub.

## Prompt definitions and scope

Read the relevant prompt definition, prerequisite links, evidence and release
boundaries before changing work. Check the active checkpoint plan and owner
feedback for scope and authorization. Use
`npm run coordination:dependencies -- --prompt NNN` for read-only readiness.

Prompt definition or acceptance changes remain source-reviewed catalog changes;
tracking changes for migrated records go through the issue writer. When an
approved skill asks to publish a spec or ticket, reconcile it into existing
prompt definitions and checkpoint plans. Add a definition only for new,
authorized behavior. Preserve fixed checkpoint membership and totals. Do not
create an unapproved parallel issue set, `.scratch/` tracker, or second mutable
catalog.

Prompt completion states are `missing`, `partial`, `blocked`, `in-progress`,
and `done`; readiness, execution, and owner authorization are separate from
completion. A spec, prepared tour, migration, or authorization does not
establish behavior completion. Approved execution briefs refine existing
prompt work and remain individually tracked; all briefs for a prompt must
satisfy its acceptance before the prompt can close. The P651 parent remains
incomplete until its full final-release/gameplay audit is accepted.

## Normal commands

Refresh the full migrated issue set, save the catalog snapshot, then regenerate
the views:

```sh
npm run prompt-tracker -- refresh
```

Compare the saved snapshot with current GitHub state without writing files:

```sh
npm run prompt-tracker -- refresh --check
```

Update one owned issue field and verify GitHub's returned issue and native
relationships. For example, change a brief's readiness and execution fields:

```sh
npm run prompt-tracker -- update --issue NUMBER --readiness ready --execution inactive
```

For prompt completion, use a local repository evidence path and anchor. The
writer requires reviewed and accepted evidence; closing an issue by itself
does not set prompt status to `done`:

```sh
npm run prompt-tracker -- update --issue NUMBER --status done --reviewed --accepted --evidence docs/REPORT.md#verified-result
```

Reopen by explicitly choosing an incomplete status. Completion export retains
that prior status so native issue reopening restores it:

```sh
npm run prompt-tracker -- update --issue NUMBER --status partial
```

To regenerate views from the already saved snapshot without credentials or
network access:

```sh
npm run prompt-tracker -- export
```

`gh auth` supplies the short-lived credential only when refresh or update is
invoked. The tracker does not store credentials. Field updates preserve human
issue prose and patch only the issue body and native open/closed state needed
for the requested transition. Verify and inspect the returned readback before
continuing dependent work.

## Held future briefs

The 32 imported future briefs remain held and inactive after migration. Refresh
and export never release a hold automatically. A deliberate release requires
reviewed, accepted local evidence for the trigger and updates only the
tracker-owned hold/readiness/execution fields:

```sh
npm run prompt-tracker -- update --issue NUMBER --release-hold --reviewed --accepted --evidence docs/REPORT.md#approved-trigger
```

The immutable `Original hold status`, hold kind, and source references remain
as provenance. The release path is for a later evidenced decision; migration
acceptance itself does not release any future work or complete the wider P651
scope.

## Recovery and integrity

The committed crosswalk source hash is `8536b573f44cde0e480b12cf427c3bb5668f33d6564f393572964f1679086f3f`.
The original source bytes are retained with the migration task inventory at
`inventory/dow-migration/implementation-prompts.source.json`; the original
repository snapshot is available in Git history at the cutover base commit.
These task-local files are recovery evidence, not runtime dependencies or
committed copies. The refresh path reconstructs the original catalog by
restoring imported prompts to their initial crosswalk statuses, verifies each
row hash, then verifies the whole-catalog hash. It writes a fresh snapshot
only after the full issue set, public identities, exact source blocker lists,
native relationships, and documented equivalent dependency edges reconcile.
If a refresh is interrupted, rerun `refresh --check` to compare state; rerun
`refresh` to reconcile the saved snapshot from the current complete GitHub
readback. Investigate any mismatch before updating an issue.
