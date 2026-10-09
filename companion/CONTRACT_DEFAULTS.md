# Recommended privacy defaults — pending owner adoption


> Latest source milestone: [SESSION_MILESTONE.md](SESSION_MILESTONE.md). Session GM and bearer contracts now have synthetic source/tests; production integration and fresh renders remain pending.

> Current decisions and qualification supersede older proposals below: [DECISIONS_20261008.md](DECISIONS_20261008.md). GM/session authority and bearer links are approved directions, not implemented production contracts.
| Decision | Recommended default | Tradeoff |
| --- | --- | --- |
| Owner authority | Explicit server-controlled allowlist of the owner's existing verified durable UID. Exactly owner-only response review; no implicit game GM, admin, first-user or email/name authority. | Requires deliberate bootstrap; simpler private response boundary. |
| Recipient access | Durable verified sign-in with session persistence, owner-only workspace directory of approved recipients; owner selects a verified entry. Remove-recipient action disables eligibility and revokes grants atomically. | Recipients must sign in; a forwarded dossier URL is insufficient. Provider and verification criterion still need owner selection. |
| Dossier sharing | Owner drafts remain private. Assignment publishes the exact previewed snapshot; later edits require explicit Publish update with response, instance ID and draft/publication revisions. | An extra publication action prevents accidental disclosure during editing. |
| Retention/deletion | No automatic deletion. Keep data until an explicit owner deletion, with a precise confirmation and cascaded grants/snapshots/receipts. Retain only nonpersonal retired-operation tombstones to prevent deleted create retries resurrecting data. | Data needs deliberate management; collection purpose and a retention/cleanup decision are still needed before real use. No deletion UI/backend is implemented yet. |

These are recommendations, not identity grants or permission changes. All visible
recipients in the preview are labeled synthetic fixtures. No invites have been
sent, no participant identities provisioned and no real data collected.

## Adapter contract

The browser receives a narrow adapter, never a raw Firestore root or a model
checkpoint. Owner reads return only owned forms/responses/templates/instances
and the approved directory. Recipient reads return only published names/details
and publication revision. Public forms return only the published definition.

Every mutation carries a random operation ID and expected revisions. Retry the
same unchanged operation with the same ID after ambiguous failure. Authorize
current owner membership before directory/resource inspection and receipt
replay. A successful historical acknowledgement is not current access proof:
refresh the current response/grant before displaying an active share.

Publish update binds the exact instance ID and previewed revision. Removing a
recipient revokes access before any cleanup. A revoked or deleted handle stays
invalid. Secret drafts never become recipient reads implicitly.

Protected failures expose stable error codes: `permission-denied` and
`unauthenticated` clear all private UI state. Temporary failures preserve draft
inputs and retry identity. Auth account change/sign-out calls
`invalidateSession()` before another adapter/actor is attached. Pending reads,
exports and command results from the old epoch are discarded. No private
content is persisted in browser storage; only intro preference is stored.

Production must additionally enforce no-store/no-referrer, no sensitive logs,
bounded ingress before parsing, durable database transactions, current Auth
identity and directory eligibility, narrow CORS/App Check and deny-by-default
rules. Fake serialized candidate commits establish the contract, not Firestore
concurrency or authorization. `checkpointSynthetic()` and
`exportSyntheticState()` are trusted fixture boundaries and contain private
synthetic data; never expose them through a real transport.

## Separate preview boundaries

`demo-adapter.mjs` runs only hardcoded synthetic fixtures in memory. It deliberately
has no authentication or production-security claim. It must be excluded from a
production build. The real backend adapter does not exist. Reload clears fixture
edits and links. The current standalone entry is source scaffold only; no
Hosting target, domain/path decision, deploy selector or production routing is
configured.

The flag intro uses all seven approved PNGs with paced movement and fades, a
stable dark background, skip/Escape, focus containment/restoration and a static
reduced-motion treatment. Source and native DOM checks do not establish actual
motion safety, resolved fonts, responsive geometry or overflow. Independent
actual-render typography and motion reviews remain mandatory before release.
