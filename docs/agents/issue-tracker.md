# GitHub issue tracker operations

GitHub issues are the authority for every open prompt, brief and refinement:
each issue owns its definition and its tracking fields. The committed
[`../tracker/github-crosswalk.json`](../tracker/github-crosswalk.json) maps
legacy IDs to public issue identities and preserves sanitized source provenance
and dependency mappings. It is immutable migration metadata; normal tracking
updates do not rewrite it or require a new plan hash.

[`../implementation-prompts.json`](../implementation-prompts.json) is the
generated offline snapshot used by existing catalog consumers. Refresh projects
each prompt issue's definition into it; it also preserves the other prompt
fields and completed prompt history. The brief and refinement Markdown files
under `docs/pc10-tickets/` and `docs/future-tickets/` are generated snapshots
of their issues, each headed with its issue number. The
implementation plan, progress, and dependency Markdown files are generated
views. `docs/tracker/github-snapshot.json` is the generated offline projection
of all migrated issue states, including brief
readiness, execution, hold, completion, and dependency fields. Ordinary imports
of project modules and CI checks do not contact GitHub.

## Prompt definitions and scope

Read the relevant prompt definition, prerequisite links, evidence and release
boundaries before changing work. Check the active checkpoint plan and owner
feedback for scope and authorization. Use
`npm run coordination:dependencies -- --prompt NNN` for read-only readiness: it
reports the catalog row and hard prerequisites and creates no nonce, receipt,
or other local proof artifact. `NEXT` is a useful ready-work hint, not a serial
lock. Hard prerequisites and explicit product-only deferrals hold that prompt;
source-backed rules ambiguity follows
[`PRODUCT_MILESTONES.md`](../PRODUCT_MILESTONES.md). Continue independent work.
Readiness is not a commit, merge, push, or deployment gate.

### Queueing new work

Include each newly queued item in the generated dependency chart and record
useful related-work links and explicit hard prerequisites where one item
genuinely needs another's functionality. These prerequisites describe
implementation order and realistic readiness, not Git or CI enforcement. Do not
add commit, merge, push, or deployment gates for them. Reuse existing cheap
catalog checks without new enforcement machinery or release delays. If a queue
update would disrupt an in-flight final release, prepare it separately and land
it after that release settles.

Dependency and other catalog-structure changes remain reviewed catalog edits
with regenerated views; `node scripts/generate-prompt-views.mjs --check`
verifies generated views against the saved snapshot.

### Issue-owned definitions

Each tracked issue body holds its definition between
`<!-- DOW-DEFINITION-START -->` and `<!-- DOW-DEFINITION-END -->`:

- A prompt issue's block has exactly a `### Title` section and an
  `### Acceptance` section, each a single line. Refresh replaces only that
  prompt's catalog `definition`; its other fields (dependencies, section,
  evidence and release data) stay structure-locked and change only through a
  reviewed catalog edit. The issue's **Catalog context** list is a read-only
  copy of those fields.
- A brief or refinement issue's block is the full Markdown brief. Refresh
  writes it, with a generated header, to the crosswalked or published path
  under `docs/pc10-tickets/` or `docs/future-tickets/`. Every new child in the
  [refinement publication table](../tracker/EXECUTION_REFINEMENTS_20261028.md)
  must be listed, authored by the repository owner and carry a block; otherwise
  refresh fails closed instead of skipping it. An issue outside the crosswalk
  and that table is ignored, even if it quotes a marker.

Tracker metadata lines (Migration ID, Source status, Readiness and the rest)
are read outside the block, so definition text cannot change them. An issue
without a block keeps its saved local definition. Edit definitions on GitHub,
then run `refresh`; never edit a snapshot file by hand, because the next
refresh overwrites it and `refresh --check` reports the drift.

Tracking changes for migrated records go through the issue writer. When an
approved skill asks to publish a spec or ticket, reconcile it into existing
prompt definitions and checkpoint plans. Add a definition only for new,
authorized behavior, and write it in a new GitHub issue as described in
[`PRODUCT_MILESTONE_CANDIDATES.md`](../PRODUCT_MILESTONE_CANDIDATES.md). That
issue holds the definition; it gains a local snapshot only after a reviewed
crosswalk or catalog change admits it. Preserve fixed checkpoint membership and totals. Do not
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

Refresh the full tracked issue set, save the catalog, tracker-state and
definition snapshots, then regenerate the views:

```sh
npm run prompt-tracker -- refresh
```

Compare every saved snapshot, including brief definitions, with current GitHub
state without writing files:

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

Update several issues in one invocation by listing them, comma-separated or
with a repeated `--issue`. Every listed issue gets the same change and the same
field and evidence rules as a single-issue update, and each issue's returned
GitHub state is verified. Give each issue its own evidence with a repeated
`--evidence <issue>=<path#anchor>`, or give one plain `--evidence` that every
listed issue shares; the two forms cannot be mixed:

```sh
npm run prompt-tracker -- update --issue 91,92 --close-as completed --reviewed --accepted --evidence 91=docs/REPORT.md#first-result --evidence 92=docs/REPORT.md#second-result
```

Evidence for every listed issue is checked before the first GitHub write. The
full issue set is read once before the batch and once after it to refresh the
saved snapshots, so a batch costs about two full reads plus roughly a dozen
requests per issue rather than two full reads per issue. Issues are updated in
the listed order. If one fails, the batch stops there: earlier updates stay,
the snapshot is still refreshed, and the error names where it stopped and that
later issues were not attempted. Only crosswalked issues are accepted; a
refinement child outside the crosswalk is rejected as before.

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
tracker-owned field delta and, when needed, PATCH only native open/closed state
fields. Refresh folds owner-authored set/clear deltas in comment order, so a
late change to a different field survives an in-flight update. Reopening clears
derived completion and evidence fields. Imported issue bodies and human
comments remain intact. A fresh preflight detects concurrent tracker-state or
native-state changes; uncertain comment creation is accepted only after exact
comment readback. The REST writer does not depend on conditional `If-Match`
support. Verify and inspect the returned readback before continuing dependent
work.

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
Since the November 4 move (#426), open prompt definitions are owned by their
issues and projected into the local catalog by refresh.
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

The reader has one narrowly versioned v1 exception for BP1's historical planning
addition: the exact `E-PC10-1-BP1-20261017` row and its exact P629/P651 evidence
links are removed from a cloned catalog only for the original structure-hash
comparison. The source catalog, crosswalk and origin hashes remain unchanged.
The row remains planning evidence with no closure credit; this contract does
not renew that dated owner-approved record or grant completion or
gameplay-acceptance status. It is bound to the original source and structure
hashes and exact wording, not a general mechanism for adding evidence. The
historical row has no expiry field or expiry rule.

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
