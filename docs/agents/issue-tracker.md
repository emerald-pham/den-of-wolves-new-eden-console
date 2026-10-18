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
views. `docs/tracker/github-snapshot.json` is the generated offline projection
of all migrated issue states, including brief
readiness, execution, hold, completion, and dependency fields. Ordinary imports
of project modules and CI checks do not contact GitHub.

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

Refresh the full migrated issue set, save both offline snapshots, then
regenerate the views:

```sh
npm run prompt-tracker -- refresh
```

Compare both saved snapshots with current GitHub state without writing files:

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
invoked. The tracker does not store credentials. Field updates append a
tracker-owned state comment and, when needed, PATCH only native open/closed
state fields. Imported issue bodies and human comments remain intact. A fresh
preflight detects concurrent tracker-state or native-state changes; uncertain
comment creation is accepted only after exact comment readback. The REST writer
does not depend on conditional `If-Match` support. Verify and inspect the
returned readback before continuing dependent work.

Only comments authored by the configured repository owner account are tracker
state. Other comments remain human prose even when they contain a copied
tracker marker. A malformed owner-authored state comment stops refresh and
updates until it is repaired; malformed or valid-looking comments by other
authors do not alter the projection.

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

The committed crosswalk retains the original source hash
`8536b573f44cde0e480b12cf427c3bb5668f33d6564f393572964f1679086f3f` and
per-row origin hashes. Its sanitized `sourceStructureSha256` fingerprints all
catalog fields except prompt definitions, after restoring migrated prompt
statuses to their imported values. This permits source-reviewed definition and
acceptance edits while detecting changes to IDs, statuses, history, and other
source fields. Its verified value is
`2376f987ad78ef8f4a6b521295dd9af6620f07446945989d794fb841136d005e`.
Definition changes stay in the reviewed local catalog and are never published
to GitHub.
The original source bytes are retained with the migration task inventory at
`inventory/dow-migration/implementation-prompts.source.json`; the original
repository snapshot is available in Git history at the cutover base commit.
These task-local files are recovery evidence, not runtime dependencies or
committed copies. The original bytes remain recoverable from the task-local
inventory and Git history; the crosswalk hashes remain immutable origin
provenance. Refresh verifies the structure fingerprint after restoring
imported statuses, then reconciles the full issue set, public identities, exact
source blocker lists, native relationships, and documented equivalent edges
before writing snapshots.
If a refresh is interrupted, rerun `refresh --check` to compare state; rerun
`refresh` to reconcile the saved snapshot from the current complete GitHub
readback. A missing or mismatched tracker-state snapshot is stale. Rerun
`export` to recover generated Markdown views after a snapshot write completes.
Investigate any mismatch before updating an issue.

The adapter remains one module because its public reader, writer, and REST
transport share reconciliation rules and a single injected transport seam;
splitting it during the authority transition would add boundaries without
reducing the number of concepts a caller must understand. Risk-gate path
classification now uses one shared helper, and held-brief tests share one
fixture builder so provenance wording has a single source.
