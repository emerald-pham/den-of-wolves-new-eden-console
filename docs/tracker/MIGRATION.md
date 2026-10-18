# GitHub tracker migration — 2026-10-18

## Inventory and recovery

The approved source snapshot has SHA-256
`8536b573f44cde0e480b12cf427c3bb5668f33d6564f393572964f1679086f3f`.
All 751 explicit prompt IDs remain in the compatible catalog: 703 completed
history records and 48 unfinished acceptance records. The public crosswalk
maps those 48 acceptance records, 68 unfinished execution briefs and 32 held
future briefs to 148 GitHub issues. Two completed execution briefs remain
source/history references. The local lossless inventory also retains their
provenance; completed work was not recreated as synthetic issues.

The original source bytes, full local inventory, importer journal, exact API
readbacks and recovery exports are retained in the migration task inventory.
They are recovery evidence, not runtime dependencies. Git history at cutover
base `aa2c89f5d369d42b94a91ecadaa4244d0d1c2d08` retains the original repository
snapshot. Private rulebooks, dossiers and source material remain local.

## Verified import

The real import and repeated read-only resume reconciled the same 148 unique
GitHub issue IDs, all source statuses and references, 51 native parent edges,
200 native blocker edges and three explicit equivalent blocker edges. The
equivalents preserve source relationships beyond GitHub's native per-issue
limit. Completed blockers remain history references. An independent source
heading audit confirmed the full source dependency set.

Interruption recovery reconciled uncertain responses before retrying. The
final repeated resume created no issues and made no mutations. All 104 settled
source files still matched immediately before candidate validation.

## Completion boundary

PT7A covers the lossless inventory and representative disposable round-trip
fixture. PT7B covers the complete verified real import. PT7 covers the normal
reader/writer/export switch, recovery, review and landing the coordinated code
and instructions. Each stage is accepted separately; configuration or import
alone does not close PT7.

The original task-local scaffold-only failure remains an acknowledged
test-first chronology gap. It is not described as a behavioral RED. Subsequent
behavioral repairs and the repository consumer/writer cutover retain their
separate test-first commits and actual focused evidence.

The normal reader verified all 148 live issues against the saved source
snapshot. The normal field-scoped CLI then completed PT7A and PT7B, with
owner-authored metadata, native state and exact readback. Original issue bodies,
identities, titles and labels stayed intact. Offline export and the 751-prompt
view check passed; the catalog stayed byte-identical to the approved source.
The owning PT7 issue records final acceptance only after repeated live
freshness verification, independent Standards/Spec and authority review,
applicable checks and coordinated merge. Saved snapshots record their
generated time; refresh reconciles later issue changes without editing source
definitions or granting gameplay credit.

## Why the focused checks changed

The tracker consumer and adapter checks protect the compatible saved catalog,
brief-state persistence, completion and reopening, source definition edits,
private-field preservation, owner-authored metadata, concurrent field changes,
pagination and interrupted refresh/export recovery. Each is a distinct way a
tracking transition could lose history or claim completion incorrectly. The
affected-path checks keep the existing CI gates connected to the new tracker
and its generated views.

The added [deployment selector tests](../../scripts/deployment-targets.test.mjs)
prevent the generated tracker snapshot and the two exact operator aliases from
triggering an application deployment. Negative controls retain deployment for
dependency, build, runtime and other script changes, and fail closed on unknown
paths or missing comparison data. The real last-deployment range was checked;
it selects no application targets while retaining the existing CI gates.
Test-only commit `c61e9591` recorded the behavioral failures before separate
implementation `4475c57f`; their raw RED/GREEN logs remain in the local migration
inventory. No existing acceptance assertion was weakened and no test was
skipped or deleted for this repair.

The existing roadmap-only gate expectation also now explicitly checks the new
`trackerChanged: false` metadata field. Its complete-object equality and every
previous application-gate value are retained; this keeps established roadmap
exports free of application gates while testing the expanded result contract.
The observed CI failure and narrow classifier RED/GREEN remain in the local
evidence inventory. The local classifier probe is distinct from the required
remote Vitest rerun.

## Preserved holds and wider scope

All 32 future briefs remain held and inactive. Migration grants no trigger
release, gameplay restart, application deployment or game-completion credit.
P651 remains incomplete at its original `missing` status until its wider
final-release and gameplay audit is accepted. Readiness, execution and
completion remain distinct.

Use [tracker operations](../agents/issue-tracker.md) for normal commands,
evidence-backed completion, reopening and interrupted refresh/export recovery.
