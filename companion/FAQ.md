# Casting preview FAQ


The isolated source connects the real Firebase adapter and transaction handler at
`/casting`. No live deployment or real participant collection is approved.
Actual synthetic local Auth/callable/Firestore integration passed on October 9;
see [LOCAL_QUALIFICATION_20261009.md](LOCAL_QUALIFICATION_20261009.md). Clean-route and enlarged-gallery focused actual checks also passed; see
[NARROW_QUALIFICATION_20261009.md](NARROW_QUALIFICATION_20261009.md).

**Is this collecting real responses?** No approved live service is deployed.
The standalone fixture preview clears on reload; the Firebase entry is disabled
until explicitly enabled and must be qualified using synthetic local emulators.
The real adapter stores through server transactions rather than the fixture store.
Reload preserves server data but clears tab authority; explicitly claim again.

**How do I enter the owner workspace?** Join or create a lobby, sign in to
existing GM access, explicitly Claim GM instance in this tab, then Use selected
session for casting. Creating a lobby grants neither GM access nor game start.
Another browser's owned instance cannot be adopted or renewed by this tab.
Private actions and heartbeats recheck current session GM authority. On an initial
connection failure use Retry connection; navigation stays disabled until loaded.

**How do I customize a form?** Open Form builder. Edit title, description,
sections and questions; choose short/long text, single/multiple choice, dropdown
or HTTPS link answers and mark required questions. Save the draft, preview it,
then publish explicitly. Publish remains disabled until the first durable Save draft
succeeds. Unsaved edits are not published.

**Who can use a direct form link?** In the proposed live product, anyone with
the published handle can see its questions and submit. Unlisted is not secret.
Private review/editing will require server-validated GM authority for the workspace’s associated session. There is no main DoW navigation entry.
The approved address is an unlisted `/casting` path under DoW; isolated source routing is implemented, deployment remains pending.

**What does unpublish do?** It disables new reads/submissions using that form
handle. Existing responses remain private to authorized editing/review access. Publishing again creates a new
handle/version; responses retain the questions/version they answered.

**How do I assign a character?** Review a response, select a distinct character
instance, inspect the exact personalized dossier, then explicitly publish its individual bearer link for the intended recipient. The source real adapter implements this bearer workflow; legacy regression fixtures retain verified recipients. Synthetic local assignment and snapshot integration passed. Names from a form do not establish
identity, and submission confirmation does not reveal a dossier.

**How do I create a character template and instances?** Open Characters → Author
a character template, enter its new name/details, then Create character template.
Under Create a distinct instance, select the template and enter independent
player name, character name and details before Create character instance.

**Can three people have the same character?** Create up to three instances of
one template. Each has its own identity, player/character names and details.
Editing or renaming one does not overwrite another. A fourth retained instance
is rejected; renaming does not free a slot.

**Do draft changes reach recipients immediately?** No. Shared content is a
snapshot. Save the private draft, preview the dossier update, then Publish
updated snapshot. The update targets the assigned instance and its exact
previewed revision.

**Can I revoke or reassign access?** Revoke recipient access uses explicit
confirmation and disables the current link. Reassignment revokes the previous
link before granting the new one. In the approved live design anyone holding a published dossier link can view its snapshot; no recipient sign-in is required. A link never grants editing or submission review. Rotate/revoke must invalidate the previous handle; the real handler source implements this atomically; synthetic local revocation qualification passed. Downloaded copies cannot
be recalled.

**How do retries and access changes work?** Transient errors preserve entered
answers/drafts and retry identity. Stale changes require refresh. Definitive
authority denial/account change clears private UI; pending old reads/exports
are discarded. The isolated source uses Firebase Auth and callables. Password login is one-shot and excluded from retained retry keys. Failed login
clears the password input; re-enter it to try again. No live deployment is approved.

**Can I export responses?** The Responses screen includes CSV export; the real adapter source uses session-bound GM checks. Formula-like
values are emitted as text. Actual spreadsheet-consumer verification is still
required before real-data release. Downloaded exports need the owner's approved
purpose and recipients.

**Will data delete automatically?** The synthetic preview clears on reload and has no scheduled data deletion. DoW automatically removes empty/disconnected sessions after seven days; their companion links then fail closed. Casting data has no automatic deletion, as requested. No scheduled casting cleanup is installed. Explicit casting deletion is deferred until its confirmation, cascade and retry tombstones are tested. Revocation disables
access while retaining owner data. The owner controls real collection and sharing; this empty tool publishes no participant content.

**How do I replay the opening?** Settings → Replay flag intro. Skip or Escape
returns focus to the invoking control. Reduced-motion preference shows a static
flag gallery. Actual seven-flag animation, replay/Skip/Escape focus and DoW font comparison passed independent review. The observed 200% static-gallery overlap was repaired and passed fresh top/middle/bottom captures plus independent typography/motion acceptance. Production release gates remain held.

**Were private rulebooks or print kits imported?** No. Templates use newly
authored synthetic content only.

**Does global GM access allow editing every workspace?** No. The real handler source checks current GM-access validity plus the live owned GM instance in the workspace’s bound session on every private action. Non-GM, expired/revoked, stale and cross-session attempts must fail. A selected lobby and an explicitly claimed current instance are required. Source/native checks and synthetic local Firebase authorization-boundary qualification passed. Production security and release gates remain separate.

**Can I cast before play begins?** Yes: the source preview requires creating/selecting a turn-zero lobby, then separately claiming a current GM instance and binding casting. The actual DoW lifecycle supports lobby sessions before the separate startGame action. Existing GM login/claim is required by the real adapter source. Empty/disconnected sessions have seven-day retention; deleted/closed sessions disable their companion links, so availability is not indefinite.
