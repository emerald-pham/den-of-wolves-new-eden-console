# PC08 execution record

Checkpoint, integration and release owner: orchestrator `/root`.

Authorized October 3, 2026: “Execute pc08 please, full authority granted to do
whatever is needed to get it done.” The opening catalog is 605/751 done and
147/293 campaign closures; exactly the 49 assigned PC08 IDs must close to
reach 654/751 and 196/293. No later checkpoint starts in this delivery.

Owner checkout: `/Users/emeraldpham/.codex/worktrees/0ce4/den-of-wolves-new-eden-console`,
branch `feat/pc08-execution`, baseline `ebbad230b815e6962e35f303cb529b5612e1d046`.
Coordination entry: `1791049923515-58261-8f794a72`, using the existing host-wide
ledger. Startup cleanup found only the root agent, no terminal child needing
results or closure, and no exposed close-agent primitive. The preceding PC07
thread is terminal; its command records are completed. Other chats and processes
are preserved. Storage inspection found 62.0 GiB available. Workers use dependency
symlinks to this retained owner checkout and claim their own isolated emulator
rows when needed.

## Frozen groups and integration boundaries

| Complete behavior | Fixed prompt IDs | Implementation owner and checkout |
|---|---|---|
| Range weapons and independently owned fleet fighters | 231, 389, 396, 397, 398, 443, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459 | `/root/range_actions`, Luna Max; `/Users/emeraldpham/.codex/worktrees/pc08-range-actions/den-of-wolves-new-eden-console` |
| Boarding support, defence, destruction and surviving Wolf wings | 394, 395, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 469a, 469b, 469c, 469d, 469e, 470 | `/root/boarding`, Luna Max; `/Users/emeraldpham/.codex/worktrees/pc08-boarding/den-of-wolves-new-eden-console` |
| Truthful DRADIS and complete shuttle/airspace recovery proof | 354, 355, 356, 357, 358, 359, 360, 423, 605, 644 | `/root/dradis`, Luna Max; `/Users/emeraldpham/.codex/worktrees/pc08-dradis/den-of-wolves-new-eden-console` |

Workers own complete implementation, source reading, red test commits, ordinary
repairs, focused verification and meaningful authenticated local/native/HTTP/UI
proof for their groups. They return commits, source assumptions, evidence and
remaining gaps. They do not push, open separate PRs, change release metadata,
close catalog rows, run candidate CI or deploy. `/root` performs useful owner
work in parallel, reconciles all three groups, obtains independent Sol review,
runs final validation, merges, pushes, verifies deployment and hands off.

Range work owns new weapon/fighter modules and the existing range choice
callables/UI. Boarding work owns new support/defence modules, boarding callables
and finalization. DRADIS work owns contact projection and plot/shuttle consumers
plus shuttle scenarios. Each worker may make narrow necessary adapters in its
isolated copy of `functions/src/index.ts`, `src/lib/sessionService.ts`, game
types and route workspaces; root reconciles these shared files. Range and
boarding workers agree interfaces before changing shared combat math: range
action/roll/assignment logic belongs to range work, boarding/finalization and
catalog destruction effects to boarding work. Do not replace the other group's
mechanics. Prefer new cohesive modules to broad shared-file rewrites.

All new requests bind current actor, role/vessel, session, cycle, expected
revision and stable request identity. Current server state owns resources,
charges, dice, targets, damage, losses, docking and group membership. Exact
retries preserve committed randomness, costs and receipts; stale/wrong-actor
requests fail closed. Entitled players make actual choices; deterministic
calculations advance automatically. GM details remain private, crew results
are audience safe, and Press publication remains explicit.

Parent-only dependencies require an actionable message to `/root` and an
acknowledged handoff before parking. Root triages and owns or returns the
action. Workers continue independent work; one long interruptible wait and one
bounded follow-up replace polling if acknowledgement is missing. Material
scope changes, blockers and requested handbacks use explicit collaboration
messages. No child coordinator or coordinator goal is created.

## Preparation and evidence boundaries

The transition review read the PC07 owner messages through the orchestrator
takeover, local-emulator correction and completed release, all recorded
PC07–PC10 philosophical decisions, feedback and existing assumptions. No new
mechanic or presentation correction requires future criteria changes or a
cooldown. The current PC08 authorization is the latest reviewed message.
PC08–PC10 retain fixed membership/targets; P605a remains separately deferred.

The seven archived v1.1 PDF artifacts were inventoried and their checksums
match SOURCE_PROVENANCE. Both Capybara files are complementary. Workers inspect
their routed derivatives and visually check the relevant primary sheets; all
private source files/renderings stay outside Git. Printed component sheets
control their named craft/mechanic. Source gaps and deliberate extensions are
recorded in PRODUCT_MILESTONE_ASSUMPTIONS, never attributed to print.

Authenticated local/emulator native, HTTP/UI and rules proof establishes
gameplay under the October 2 owner correction. Prepared review scenes establish
presentation only. Independent review, final validation, CI, production
deployment, actual deployed access and physical-device claims stay separately
labeled. A synthetic scene or pure unused helper cannot close a behavior ID.

The combined owner checkout has configured emulator row 3; workers retain their
own rows and all other reservations remain untouched. The range/boarding seam
preserves exactly three ordered immutable range receipts, one per range. Each
range decision aggregates the entitled sources' genuine choices before one
server-locked roll/assignment batch; finalization consumes that post-range roster.
Alpha and Bravo launch choices are independent and recorded during targeting.

A full-page check of original A4 single-sided page 36 and double-sided page 81 reconciled an
extraction interpretation: both AEGIS Alpha/Bravo and the PDF Escort Wing use
at most one Short Range die per fighter, hit on 3+, and lose a fighter on 1–2.
The existing P452 catalog rule is retained. Private renderings remain external.

Root owns the existing Maliades member-session privacy repair identified by the
range worker. Members receive validated damage, revision, attack identity and
range-completion markers; target IDs, rolls and detailed consequences stay in
private receipts and GM state. Hydration filters the operational DTO again
without dropping its repair revision. Test-only commits b80bc6d7/f39e5680 precede
implementation 10e1c5f2; focused privacy, repair, parser and hydration checks pass.

The owner supplies the five-step real-component review scene and final report.
Final catalog closure, version/changelog, deployment consumers and release
records are reconciled once after worker integration. The acceptance matrix
tracks every ID and current gap; completion remains pending until all gates
and exact-main deployment pass.
