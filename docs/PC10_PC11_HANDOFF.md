# PC10 to PC11 handoff and October 10 deadline

## Owner decision and sequence

The owner set **October 10** as the end of the available work window and said
“execute” for the lessons below. Apply them now to planning and the handoff,
then implement PC11 at its authorized sequential turn. Finish and return PC10
first, followed by the existing post-PC10 work, then PC11. Do not execute PC11
concurrently with PC10. PC12 remains an **unstarted, conditional backlog**;
the owner has not cancelled it. Only the owner decides to defer or cancel it
following a concrete assessment. Earlier coarse estimates of several weeks
for PC12 were ungrounded forecasts, not a reliable schedule or commitment.
No exact closing hour was specified for October 10.

The deadline does not relax gameplay, privacy, review, typography, CI or
production verification. Firebase remains the primary/default application.
The existing post-prompt Wolf-alert review retains its real-play trigger in
[the post-prompt list](POST_PROMPT_COMPLETION_TASKS.md).

## Required PC11 implementation lessons

1. **Audit mounted actions before writing guidance.** Map each source mechanic
   to its actual role, route, accessible control, request and projected result.
   A server callable without a usable mounted control is a connection gap.
   Prose cannot satisfy that action's usability acceptance.
2. **Explain the actual current state.** Distinguish disconnected, saved/stale,
   blocked, waiting and available states using authoritative current state.
   Explain a concrete recovery action or next actor rather than displaying the
   same generic reconnect advice in every state.
3. **Put decision guidance beside the action.** State its cost, prerequisites,
   consequence, current blocker and next actor next to the relevant control.
   Put deeper rules in the matching tab. Keep the existing fonts, design tokens,
   accessible controls and compact console layout; avoid filling every screen
   with a rules manual.
4. **Qualify a small live slice first.** Before paying for a long fresh-game
   prefix, prove the exact role, navigation and action on a small legitimate
   live setup. Use source-driven readiness and the exact accessible names.
   Expand to the full flow after that slice works; preserve failed evidence.
5. **Reuse verified PC10 flows and evidence.** Carry forward the authenticated
   gameplay, authority/privacy, runtime binding and native receipt evidence
   with its exact scope. PC11 checks comprehension and action completion.
   Do not rebuild the collector or claim that historical proof automatically
   validates materially changed controls or current source.
6. **Make readiness source-specific.** Wait for the mounted control and its
   authoritative prerequisites, then inspect the committed result and reload.
   A transport reply, arbitrary delay or generic success message is insufficient
   when the source exposes a more precise current result.
7. **Keep the acceptance set finite and meaningful.** Use appropriate-role
   function families and the real privacy boundaries. Do not expand into the
   Cartesian product of every endpoint and every role. Explicitly retain
   required wrong-actor, stale-state, replay and recovery cases.

The owner of PC11 should start from [the PC10 acceptance matrix](PC10_ACCEPTANCE_MATRIX.md),
[the current function/role inventory](PC10_FUNCTION_ROLE_MATRIX.json), and
[the source review annotations](PC10_ACTION_REVIEW_ANNOTATIONS.json). Inventory,
source review and gameplay acceptance remain separate. Reconcile these to the
final PC10 release and handoff before implementation.

## Current measured limits, before final PC10 qualification

At planning source `0cca6ab0f847dab1846d48a6572cda8cd45a6d53`, all 48 assigned
catalog closures remain pending. The closed boarding-read proof repair passed
**226 focused native checks**, zero skipped; it still awaits real qualification.
The latest bounded combat attempt reached a naturally resolved private/public
attack but failed the closed read, so aftermath and an ending were not accepted.
The next source-fenced qualifier is prepared, not yet executed.

The second first-resume diagnostic used one Chrome process, 21 independent
contexts and 22 Auth identities including its separate GM, with zero humans
or human devices. It observed 21 successful SDK resumes and 42 independently
valid authority points. Its original native collection still failed with one
missing setup presence body and another pending body at the strict snapshot.
It earns **zero concurrency/recovery acceptance and zero campaign closures**.
Network byte totals do not establish body retention or an eviction cause.
No product failure is inferred from this collector failure.

PC10's final playtest report must replace this planning snapshot with exact
accepted and outstanding evidence, retain the failed runs, distinguish actors,
browser contexts and physical participants, and identify any PC10 usability
gap. PC11's broader guidance completeness is not inferred from a PC10 ending.

## Deadline-aware critical path and risk reduction

Complete the short fresh combat/aftermath/ending qualifier and the mounted GM
control qualifiers first. Reconcile those fixes before running the full Base,
Capybara, candidate and terminal families. Use the existing finite compositions
and legal current game state; do not force random outcomes, resurrect destroyed
ships or bypass authority to keep a script moving. Run heavy browser proofs
serially on the reserved Mac emulator. Resolve the failed native concurrency
measurement within the parent's authorized diagnostic boundary before claiming
that gate. Keep role/function, interrupted/repeated/recovery and privacy gaps
visible in one current matrix.

After all scoped acceptance is complete, obtain the one reconciled independent
Sol 6.1 review, run the final appropriate local checks, then verify exact-candidate
CI, exact-main CI and deployment. Report PC10 to the parent before later work.
For PC11, the mounted-action audit and nearby state/cost guidance provide a
bounded first slice; reuse current proof rather than adding a new collection
system. Unestimated post-PC10 participant availability and any fresh acceptance
failure remain schedule risks. No reliable combined completion date is established.

## Conditional PC12 architecture assessment

This is an assessment of the existing architecture, not PC12 implementation or
an expanded research task. The React routes, styles, local assets and domain
resolvers under `functions/src` offer possible reuse of the current UX and game
rules. The Firebase wiring in `src/lib/firebase.ts`, callable client adapters
in `src/lib/sessionService.ts`, listeners in `src/lib/firestore.ts`, and server
Firestore transactions are service boundaries that an offline mode must address.
Reuse could avoid rewriting game behavior, but does not by itself supply an
authoritative offline backend.

The current local Auth/Functions/Firestore emulators are development evidence.
They are not a qualified LAN identity/privacy product: emulator authentication
and directly exposed development services must not be treated as production
security. Local identity, GM authority, private audiences, durable persistence,
crash/reconnect recovery and WAN-disconnected startup plus multi-client proof
remain separate required work. A bounded adapter around reused domain logic
may be economical; its transport, identity and storage design is unvalidated
and no delivery estimate or security claim is made here.

A later owner decision should follow a concrete decomposition of those service
boundaries and a minimal complete offline acceptance slice. Keep PC12 in this
same repository as a backup, preserve Firebase and cloud data/deployment, and
require the same game behavior with no internet runtime dependencies. Local QR
must cover user-entered Wi-Fi details and server IP/URL without committing
credentials or changing network security settings. No cloud/offline state sync
is implied. PC10 does not start this work.
