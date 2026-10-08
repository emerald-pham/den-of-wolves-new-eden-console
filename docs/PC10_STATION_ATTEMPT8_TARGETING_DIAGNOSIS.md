# PC10 attempt 8 targeting diagnosis

Source-only diagnosis of runtime `3c373e552de4ffd4651473305f15dbee1c5e9108`.
No product guard, role mapping, actor authority or public projection changed.
The diagnostic commit intentionally retains one failing regression for the next
repair. It is not a runnable GREEN candidate or checkpoint acceptance.

## Captured cause and observed reproduction

Attempt 8 earned ordinary GM/Wing admission, normal 13-role local manual setup,
charged maintenance, six paid P arrivals, original Wing AEGIS berth and both
four-fighter launches. Combat held targeting revision 3 until its original
stage deadline. All diagnostics were complete and resources were cleaned.
Original evidence: `/tmp/dow-pc10-evidence/station-success-8/OWNER_RESULT.json`.

The server-paid movement handler writes `maintenanceCycles[ship].results.ftl`
(`functions/src/index.ts`, `nextCycle` in the normal paid-jump handler).
`authorizeRefineryFighterBayLaunch` validates private raw maintenance results
using `MAINTENANCE_EVENT_RESULT_STEPS`, whose member-event keys are only 0–7.
It rejects this normal `ftl` field as malformed before checking bay charge.
`wolfFighterLaunchGateState` calls `pdfEscortWingLaunchView` before it records
that the registered PDF wing has no current Colonel owner. The launch view
maps recognized uncharged/damaged/destroyed failures, but converts malformed
maintenance to an unavailable authoritative check. Reconciliation catches that
error and returns, leaving targeting and the pre-completion summary unchanged.

Observed RED: `STATION_ATTEMPT8_EXACT_GUARD_RED_20261008.log`.
Observed causal comparison: `STATION_ATTEMPT8_GUARD_CAUSAL_COMPARISON_20261008.log`
(one expected regression failure, two passing controls). Replaying the captured
root guard whitelist, players, fleet groups, attack and private PDF state holds
targeting. Removing **only** Refinery `results.ftl` allows two ordinary lifecycle
reconciliations to reach Long Range with server `no-commander` completion and
`no-current-executive-officer`. Adding an actually assigned, disconnected
replacement Commander to that control correctly keeps targeting pending.
Neither control draws combat dice or changes the session root.

The fixture normalizes only owned synthetic identity labels. It is a captured
read-only guard whitelist, not the complete original root. Fields absent from
the whitelist remain unknown. The original complete diagnostic receipt remains
the native evidence; synthetic tests do not claim native P success.
Temporary catch logging identified the PDF validation error and was removed;
`functions/src/index.ts` remains byte-identical to the reviewed runtime.

## Actor and rule assessment

The canonical 13-role preset includes Executive Officer and Wing Commander;
Wolf Commander is a separately assigned replacement authority, not a core
preset seat. Printed-source alignment preserves genuine choices; it does not
invent absent actors. Existing PC07 acceptance separately proves an unavailable
EO cohort. See `docs/IMPLEMENTATION_CONTRACTS.md` AMB-13,
`docs/PC07_PC10_ALIGNMENT.md`, `docs/PC07_ACCEPTANCE_MATRIX.md` U evidence,
`functions/src/roleConfiguration.ts`, and `wolfCommandAndControl.ts`.

Actual captured players are GM and Wing only, with no replacement Commander
and no current EO console/AEGIS berth. `assignedWolfCommanderUids` therefore
returns no actor and completion is `record-no-commander`, not a mandatory
unmade Commander choice. A genuinely assigned Commander remains required even
while disconnected. A genuinely current, charged, undamaged EO remains required
to choose or pass. There is no legitimate reason to assign/delegate Commander
or add an EO just to bypass the Refinery validation defect. The displayed
`pending / no-configured-commander` is a pre-marker summary; its derived EO
waiting label is not the cause of the held guard.

Keep the justified **two authenticated actors (GM + Wing), 13 configured
roles, one browser with two contexts** for this sparse scoped scenario. This
is not proof of production start readiness with 13 occupied roles or full
player-count coverage. Real Wing Medium/Short choices and its own AEGIS
boarding remain mandatory. Any genuinely occupied additional role encountered
later must receive its own legitimate actor/choice rather than automatic
resolution or cast rotation. Existing no-owner handling is reused, not widened.

## Next runnable plan

1. Preserve this observed RED and exact captured comparison.
2. Repair only the private Refinery maintenance authorization allowlist to
   recognize the existing server-authored `ftl` **string**. Do not widen member
   event keys or public projections. Keep unknown/nonstring keys, malformed
   cycles, current-turn/completion/reactor/charge/damage/craft checks strict.
3. Prove captured RED becomes GREEN; add focused valid post-jump charged launch
   and unknown/nonstring-result denial controls; reuse existing Commander,
   occupied EO, launch and public maintenance projection suites.
4. Obtain independent exact-candidate authority review and rebuild/bind the
   repaired Functions candidate. Report overlapping files before integration.
5. Request a fresh bounded parent runtime allocation. Reuse prior qualified
   discovery/preparation evidence; fresh normal admission and P prerequisites
   are necessary for this fresh session. Stop at first actionable failure and
   preserve original receipts. Never restore the deleted attempt-8 session,
   force a gameplay outcome, extend a deadline or claim P success in advance.

Independent Sol diagnosis concurred on both the private `ftl` rejection and
existing absent/occupied Commander and EO boundaries. No runtime launched for
this diagnosis; parent retains integration, release and acceptance ownership.
