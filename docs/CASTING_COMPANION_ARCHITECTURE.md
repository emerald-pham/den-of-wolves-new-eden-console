# Casting companion — architecture checkpoint


> Latest source milestone: [SESSION_MILESTONE.md](../companion/SESSION_MILESTONE.md). Session GM and bearer contracts now have synthetic source/tests; production integration and fresh renders remain pending.

> Current decisions and qualification supersede older proposals below: [DECISIONS_20261008.md](../companion/DECISIONS_20261008.md). GM/session authority and bearer links are approved directions, not implemented production contracts.
2026-10-08. Planning only; no functional implementation, test pass, review approval,
provisioning or deployment is claimed.

## Inspected facts

- Repository: `emerald-pham/den-of-wolves-new-eden-console`. Independent local
  clone on `feat/casting-companion`, baseline `b9152b9ea2ce743070b777912e7e042f2db4b2f8`.
  The active PC10 checkout and all its uncommitted data remain untouched.
- `.firebaserc`: project `dow-new-eden-console`. Read-only authenticated
  `firebase hosting:sites:list --project dow-new-eden-console --json` returned
  one DEFAULT_SITE, `dow-new-eden-console`, with URL
  `https://dow-new-eden-console.web.app`. Custom domain mappings are unverified;
  this response does not establish their absence.
- `firebase.json`: single Hosting dist SPA, Firestore rules/indexes, Node 22
  Functions default codebase. GitHub deployment uses federation; preserve it.
- `src/styles/cic.css`: void #04070a, panel #080f14, ink #e4ecee,
  muted #8397a0, amber #e8892b, cyan #46c8de; square corners,
  44px control minimum and amber keyboard focus. Mono/display:
  SFMono-Regular, Consolas, Liberation Mono, monospace.
- Approved PNG flags: CPA, FAS, Gliese, ICN, Proxima, Rosal, SAN.
  Source contract: `src/assets/flags/README.md` and `flags.test.ts`.
- Repository AGENTS/CLAUDE, aesthetics and shared coordination ledger were
  inspected. No browser, emulator, dependency install or other task cleanup ran.
  Storage inventory reports 49.6 GiB free and 179 registered worktrees; none
  are assumed disposable. This clone contains committed source only.

## Hosting decision requiring owner review

Recommend a separate React/Vite entry and dist directory, a second Firebase
Hosting site/target in the existing project, and narrowly named casting
Functions. Firebase supports independent sites sharing Auth/Firestore:
https://firebase.google.com/docs/hosting/multisites .

A sibling `*.web.app` site is not a forms subdomain of the current default
address. A genuine `forms.<owner-controlled-parent>` needs the real custom
parent domain, registrar/DNS owner, Firebase custom-domain verification and
provider-issued DNS records/TLS provisioning. Do not guess record values.
See https://firebase.google.com/docs/hosting/custom-domain .

Needed after review: create Hosting site and target mapping; authorize exact
origin in Auth/App Check where needed; verify existing WIF identity can deploy
that target and named Functions; approve reviewed additive rules/indexes;
owner performs or explicitly authorizes DNS updates. No new credential or IAM
grant is presumed necessary. Confirm billing/quota and custom domain mapping
read-only before provisioning. Deploy selection must explicitly include the
new build/target without changing the main app target.

No main-app navigation entry. Companion sends `X-Robots-Tag: noindex, nofollow,
noarchive`, matching HTML metadata; no sitemap or analytics carrying personal
data. Robots exclusion/unlisted links do not confer access control.

## Proposed authority and data boundaries

All casting state is namespaced separately from game sessions. A server-owned
workspace membership record grants owner/admin capabilities to explicit Auth
UIDs; game GM status never grants casting access. A separate Firebase app name
and storage prefix avoid copying game session/mode state. Every request
rechecks workspace membership, resource ownership and current revision.

Private collections hold drafts, responses, templates, dossier instances,
recipient grants and operation receipts. Deny direct client reads/writes/listing
for these collections; callable/server handlers return explicit allowlists.
Public form lookup returns only the immutable published version by a random
opaque share handle. Never reveal draft metadata, response counts or roster.
Publish/unpublish rotates or revokes the lookup grant; submission transactions
check publication and expected version at commit time. Validate all types,
required answers, lengths, choices and safe HTTPS links server-side; no raw HTML.
Bound request sizes and use rate limiting/App Check without treating it as identity.

Responses are immutable snapshots tied to form version and workspace. Owner
review/export requires current membership. CSV export neutralizes spreadsheet
formula prefixes. No autosaved respondent personal data in browser storage.
Decide retention/deletion and approved collection purpose before real use.

Templates contain newly authored, owner-approved material only. Never import
local private rulebooks, print kits or existing secret character source files.
Each dossier has an independent random instance ID, template ID, revision,
player/character names and details. A transaction reserves one of three slots
per workspace/template; concurrent creation cannot exceed three. Rename/update
always targets instance ID, never a name/template ID. Archived instance policy
must be explicit; default count all retained instances to avoid hidden bypass.

Owner workflow: review response → choose template → choose existing instance
or create an available slot → enter intended recipient Auth UID and customized
names/details → preview exact recipient projection → confirm assignment/share.
Response-to-instance mapping is explicit and audited; never auto-match names or
expose a secret dossier in the public submission confirmation. Reassignment
revokes the old grant atomically. Each share URL has an opaque handle, but reads
also require the assigned recipient UID/current grant. A forwarded URL grants
no authority. Owner revocation invalidates subsequent reads; already viewed or
downloaded content cannot be recalled. Avoid offline caching of secret content.
Recipient sign-in/onboarding choice remains an owner decision before release.

Every mutation carries an idempotency key and expected revision. Receipt scope
includes actor/workspace/operation and payload digest; repeated keys with
different payloads reject. Transactions protect assignment, slots and grants;
stale clients must refresh rather than overwrite. Interrupted operations can be
retried safely and UI reflects committed server state.

## Additive MVP and evidence sequence

1. Freeze hosting and privacy decisions; write domain/schema and handler tests
   first. Observe meaningful RED, commit tests separately, implement, observe
   GREEN. Capture commands/output without inventing retrospective RED.
2. Owner builder: title/description, sections, short/long text, single/multiple
   choice, dropdown, required and safe links; preview and immutable publication.
3. Direct form renderer and submission; owner response review and safe CSV export.
4. Character templates, transactional three-instance allocation, explicit
   assignment preview, independent editing, recipient sharing and revocation.
5. Separate companion shell using CIC tokens; intro covers seven approved flags
   with paced movement/cuts, skip, Settings replay and static reduced-motion
   treatment. Intro preference persists locally under companion-only key.
   Preserve focus on skip/complete/replay, keyboard access and screen-reader
   labels. No high-contrast rapid strobe.
6. Focused normal handler/Firestore rules proof under a parent-allocated runtime
   window; exact code and independent Sol security/data reviews. Actual phone,
   desktop, short landscape and enlarged-text renders; independent typography
   and intro motion reviews. FAQ covers publish, submit, assign, duplicates,
   recipient sign-in, revoke, retention/export, replay and unlisted privacy.
7. Parent integrates onto settled PC10 main, reviews exact hosting/security
   candidate, then owns CI/provisioning/release and actual deployment checks.

Meaningful tests must cover cross-workspace and wrong-UID reads/writes,
non-enumerability, privileged client denial, public projection redaction,
validation, publish/unpublish races, retries/interruption/payload mismatch,
stale revisions, immutable submission version, concurrent fourth-instance
denial, duplicate rename isolation, explicit mapping, reassign/revoke and export.
Pure helper tests do not establish callable/rules/UI integration.

## Outstanding dependencies

- Intended custom parent domain and DNS control, plus actual custom mappings.
- Parent review of this hosting/security plan; identity onboarding, recipient
  scope, retention, real form/template content and eventual publishing choices.
- Bounded runtime allocation for normal rules/handler/UI proof and independent
  exact rendered typography/motion review. No runtime allocation requested now.
- Parent dependency delivery: the source thread ID in the delegation was not
  found by `send_message_to_thread`; no acknowledgement or parking handoff is
  claimed. This report must be returned through the delegation result channel.

Next concrete implementation deliverable is committed RED tests for the isolated
casting publication/submission/instance/assignment authority contract, followed
by the tested domain layer; no infrastructure mutation is needed for that work.
