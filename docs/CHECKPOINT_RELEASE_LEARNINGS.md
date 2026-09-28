# Checkpoint release learnings

This is the durable release-retrospective record for owner-facing product
checkpoints. It records improvements that apply beyond one checkpoint without
turning a dated release report into workflow authority. `CLAUDE.md` remains the
canonical release policy; the product milestone documents remain the authority
for checkpoint shape and acceptance.

## Design and release principles

1. Automate every deterministic facilitator procedure. The product target is a
   game run by one facilitator who makes only choices the rules genuinely
   require; automatic facilitator actions and outcomes must produce a complete,
   server-owned GM-log receipt. Automation must not invent a ruling where the
   source or owner has left a choice open.
2. Make critical presentation contracts executable deployment gates. A named
   typography or responsive requirement is not protected until the exact
   release commit runs the real command and fails closed when the mapping is
   unknown or malformed.
3. Preserve the evidence ladder. Focused tests, rendered browser evidence,
   exact-commit review, deployment, hosted revision checks, and ordinary
   authorized gameplay are different claims. A later gate must not be inferred
   from an earlier one.
4. Improve elapsed release time by making independent complete gates concurrent,
   never by deleting cases, reducing viewports, or accepting partial results.

## PC04 measured baseline

The [PC04 release workflow](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36466514603)
for exact commit
`0ba386f50689b375153ceee3b2eb11a9ecd19435` ran from 18:37:33Z to 19:06:00Z
on 2026-09-28. Its exact-SHA browser job ran for 15 minutes. Inside that job,
the full ticker browser smoke ran serially for 13 minutes 41 seconds, followed
by the independent P637 render-performance check for 16 seconds. The ordinary
verify job already skipped duplicate ticker and render execution at the exact
commit, so duplicate work was not the bottleneck.

The Firebase deployment then took 11 minutes 55 seconds. A change to the
broadly consumed request-guard module selected 129 named Functions in addition
to Hosting and Firestore. That deployment was correct, but it demonstrates why
shared server-helper edits need an explicit blast-radius check during shaping.

The [documentation-only PC04 audit](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36470376777)
correctly selected no deployable surfaces. That is the preferred path for
factual release notes and catalog reconciliation after production is already
verified.

## Improvements implemented

### Exact-SHA browser sharding

The full ticker gate now has three explicit CI shards:

- `press` runs every Press/source-transition case across both font states,
  both motion preferences, and the phone, short-landscape, and desktop
  viewports.
- `turn-zero` runs every Turn Zero/Turn One case across both font states,
  both motion preferences, and all three viewports.
- `lifecycle` runs both the normal-motion lifecycle and the reduced-motion
  announcement lifecycle.

P637 render-performance verification now runs in its own exact-SHA job. All
four independent jobs can run concurrently. Local `npm run test:ticker:browser`
continues to run the complete unsharded suite, and focused legacy lifecycle
modes retain their previous behavior. An unknown shard or a shard combined
with a focused lifecycle mode fails closed. Contract tests pin the shard list,
the default full plan, the exact-SHA workflow conditions, and the separate
render job.

The [first live sharded workflow](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36476018440)
passed at exact commit `1d0429945cbe9488fbec471e8f676a2bae1c7184`.
Press finished in 8 minutes 28 seconds, Turn Zero in 4 minutes 34 seconds, and
the two lifecycle modes in 3 minutes 20 seconds; exact-SHA unit verification
finished in 3 minutes 19 seconds. The browser critical path therefore fell from
15 minutes in PC04 to 8 minutes 28 seconds: 6 minutes 32 seconds, or about 44%,
shorter in this observed ticker-only, no-target run. The PC04 job also included
16 seconds of P637 after its ticker cases, while the measured sharded run
correctly skipped P637 because that range did not affect its inputs, so 44% is
not a pure sharding comparison. Aggregate browser-job elapsed time rose from 15
minutes to 16 minutes 22 seconds, about 9%; this evidence does not report
billable runner time. The first render-affected release must still prove the new
parallel P637 job live.

### Risk-selected verification without deployment

The [first post-PC04 tooling push](https://github.com/emerald-pham/den-of-wolves-new-eden-console/actions/runs/36473773154)
exposed that `main` verification was coupled to `has_targets`: the target
classifier correctly requested unit and ticker gates, but the reusable verify
job was skipped because no Firebase surface was selected. The Deploy workflow
now distinguishes verification from deployment. A current-tip change with
non-documentation risk gates runs exact-SHA verification even when `targets` is
empty; the deploy job still requires a real Firebase target. Documentation-only
changes retain the no-verify/no-deploy fast path. The successful sharded
workflow above proves that the no-target change ran the base verifier and all
three ticker shards while both P637 and Firebase deployment stayed skipped. A
workflow contract test pins all three conditions so release tooling and tests
cannot silently bypass their own gates again.

### Typography gate integrity

PC04 repaired the exact command mapping for the mandatory computed-style
typography gate. The release contract now rejects unknown or shell-suffixed
commands and proves the full profile includes the real browser gate. Future
typography changes must preserve the PC01 comparison surfaces, all release
viewports, normal and reduced motion, the console-font static inventory, and
computed styles from the exact release commit.

### Lazy-route network proof

The protected mission UI now has a browser assertion for both sides of its
network boundary: the private chunk is not requested on a public landing route
and is requested exactly once for an entitled mission participant. This closes
the gap between a source-level lazy import and actual browser loading behavior.
Future privacy or performance deferrals should use the same request-level proof
when route presence alone cannot establish the boundary.

### Deployment truthfulness

A workflow timeout or interrupted deploy is partial, even when earlier tests
passed. Completion requires the exact selected revisions and hosted build to be
verified. Documentation-only follow-ups should remain separately classified so
they cannot trigger a redundant production deploy.

## Future checkpoint shaping checklist

- Identify shared helpers before editing and inspect the deployment selector's
  predicted surface and Function count. Prefer a narrower module seam when it
  preserves authority and avoids unrelated redeploys; never weaken a correct
  selector to make a release faster.
- Turn owner feedback into one executable acceptance check at the start of the
  checkpoint. For typography, privacy, authority, responsive layout, and
  reduced motion, include a real-browser assertion where unit tests cannot
  establish the behavior.
- Keep independent expensive gates in separate jobs with unique artifacts and
  fail-closed inputs. Preserve the complete local command as a straightforward
  reproduction path.
- Record candidate tests, exact-final review, deployment, hosted revision, and
  ordinary authorized gameplay separately in the playtest report. Carry any
  missing final proof forward as a named gap rather than silently closing it.
- After acceptance, reconcile the catalog and owner feedback in a docs-only
  change when possible, then remove terminal worktrees and release coordination
  reservations only after preservation checks.

## Follow-up measurement

For the next render-affected exact-SHA release, confirm that P637 runs in
parallel and remains outside the ticker critical path. For later ticker-affected
releases, compare shard duration and aggregate job elapsed time with the first
live measurement above, and record deployment target count plus
deploy/verification duration when production surfaces are selected.

If one shard becomes the persistent critical path, split only at a stable
behavior boundary with an explicit coverage-partition test. Do not split by an
arbitrary case count that obscures which product contract failed.
