> Current published-main release candidate: see [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md). Earlier milestone documents/evidence below describe their recorded candidates, not current release qualification.

# Casting companion — synthetic implementation milestone


> Latest local qualification: [FINAL_LOCAL_QUALIFICATION.md](FINAL_LOCAL_QUALIFICATION.md). Independent backend/security and final typography/motion reviews accepted the additive published-base source; CI, deployment and separate live verification remain release steps.

> Current decisions and qualification supersede older proposals below: [DECISIONS_20261008.md](DECISIONS_20261008.md). GM/session authority and bearer links are approved directions, not implemented production contracts.
Independent branch `feat/casting-companion`. Active PC10 data remains untouched.
No main-app import/navigation, domain/path assignment, Hosting configuration,
production permissions/data/rules, credentials, invites or deployment. Main
version/changelog remain unchanged because this source is not integrated or
released; the parent owns final integration and release metadata.

## Deliverables

- `index.html`, `boot.mjs`, `casting.css`, `ui.mjs`: standalone synthetic builder,
  preview/respondent form, owner response review/CSV, character templates and
  instances, explicit assignment/snapshot update, revoke confirmation, recipient
  dossier and Settings/flag intro, using actual CIC tokens and flag PNGs.
- `casting.mjs`: owner-only synthetic authority, immutable publication versions,
  validated bounded answers, identities/revisions, three-instance limits,
  recipient snapshots and retry receipts.
- `transaction-adapter.mjs`: fake serialized atomic commits, checkpoint/restart,
  interrupted/lost-ack recovery, current membership, directory removal/revocation.
- `demo-adapter.mjs`: browser-only hardcoded fixture; NO Auth or security claim.
  Exclude it from production. No private-content browser storage; reload clears
  fixture data. Only intro preference persists. Node checkpoints are trusted
  synthetic private data and must never be exposed through client transport.
- `csv.mjs`: quoting and formula-prefix neutralization; actual spreadsheet
  consumer verification remains pending.
- `CONTRACT_DEFAULTS.md` and `FAQ.md`: defaults/tradeoffs and feature coverage.

No server was started or browser render inspected. A standalone synthetic build now exists locally in `companion-dist/` (Vite 6.4.3), with manifest/hashes in `evidence/standalone-build-manifest.json`. All seven bundled flag PNGs are byte-identical to approved assets. It is not a published URL/subdomain. Serve the build locally only after parent runtime allocation; production hosting/base/routing remains future work.

## Test-first evidence

Run `node --test companion/casting.test.mjs companion/transaction-adapter.test.mjs companion/ui.test.mjs`.
Previous UI milestone: 27/27. Current provider/CSV milestone: **37/37 native source/DOM tests pass**. Run the complete native suite with `node --test companion/*.test.mjs`; the separate rules-engine harness is not included and remains unrun. DOM tests use existing
locked jsdom through a temporary dependency link, removed at handoff; no install/browser/emulator. Restore approved locked dependencies before rerunning the DOM suite.
`git diff --check` passes.

| Behavior | Observed RED | Implementation/fix |
| --- | --- | --- |
| Initial authority lifecycle | `90f31537`, 4 explicit-stub failures | `e35c0f3e` |
| Preview revision/aggregate bound | `c1e92ee2`, 2 missing exceptions | `3ecc9cc9` |
| Owner-only/snapshots/restart receipts | `ba0ffce2`, 3 failures | `a5e4d3c6` |
| Builder/assignment/recipient/intro UI | `f8de4275`, 4 failures | `572a7f76` |
| Transaction recovery/allocation | `bc28115a`, 2 failures | `44b908a0` |
| Standalone synthetic demo adapter | `8052bf95`, 1 failure | `b9082b57` |
| UI retry/update/revoke/instances | `a525bde4`, 3 failures | `fdfeb958` |
| Owner authorization before directory | `973af88a`, 1 failure | `67375c3d` |
| Preview target/form recovery | `a39b7d9e`, 2 failures; identity `6609e835`, 1 | `ab1985e3` |
| Templates/CSV/denial clearing | `47a05ac0`, `79c33b4d`, `d0a9817a` | `dd7896c7` |
| Late export after account change | `5b03a768`, 1 failure | `d6131d5c` |

Contemporaneous logs are in `evidence/`. Initial missing-module and signature
mismatch runs were setup failures; corrected behavior RED is identified above.
No retrospective RED is claimed. Refresh fixture `5ddeae89` was committed
separately to model a committed assignment handle and preserve active-link
assertions. Test changes express the authorized snapshot contract or correct
synthetic fixture state. No application test was weakened/skipped/waived.
New tests cover functionality or observed privacy/recovery findings.

Independent Sol xhigh affected review of exact `d6131d5c` passed 27/27 and
confirmed four UI/adapter findings and the late-export race repaired. Later
changes are documentation/intro copy only. FAQ coverage independently reviewed;
requested template-creation clarification added. This is not backend approval.

## Remaining gates

Parent address/hosting decision; owner bootstrap and verified recipient sign-in/
directory; actual database/Auth/rules proof; ingress/cache/logging controls;
approved collection purpose/retention; spreadsheet-consumer verification.
Deletion is deferred until cascade and retired-operation tombstones are proved.

Actual phone/desktop/short-landscape/enlarged-text renders, keyboard checks,
resolved-font independent typography and independent intro motion review need a
bounded runtime allocation. DOM tests do not prove geometry, contrast, overflow,
actual fonts or motion safety. Full-app build/CI, production bundle/deploy selection, exact release
review and live behavior remain unperformed. No failing release gate is waived.
