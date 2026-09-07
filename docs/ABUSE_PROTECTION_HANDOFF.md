# 60-client capacity and abuse-protection handoff

Hand this brief to the LLM responsible for hardening and validating the
production service. It is an implementation task, not permission to make an
unreviewed infrastructure migration.

## Operating envelope

- One game has 20 players and as many as 60 concurrent browser clients.
- A player can legitimately use more than one device, and many or all clients
  can be on the same table Wi-Fi/NAT address. An IP-only rate limit would
  therefore reject valid players.
- Connected clients renew their presence lease every 10 seconds. At 60 clients
  that is roughly six heartbeat calls per second before reconnects, session
  setup, gameplay actions, and Firestore live snapshots.
- The goal is to keep those valid clients available while malformed,
  automated, or abusive traffic cannot exhaust backend capacity or create an
  unacceptable bill.

## Current baseline

- The web app is a static Firebase Hosting SPA on the Firebase global CDN;
  Cloudflare is not configured in this repository.
- Server mutations use Firebase 2nd-generation callable functions in
  `us-central1`. The current global limit is `maxInstances: 10` in
  [`functions/src/runtimeOptions.ts`](../functions/src/runtimeOptions.ts).
- The Companion Console web app is registered with Firebase App Check using a
  reCAPTCHA Enterprise key restricted to the project's `web.app` and
  `firebaseapp.com` domains. The client initializes App Check before Firebase
  services and every callable inherits `enforceAppCheck: true` from the shared
  runtime options.
- The production Cloud Firestore API has App Check enforcement enabled. The
  Firebase Console notes that a changed enforcement setting can take up to 15
  minutes to take effect.
- A Cloudflare proxy for a future custom Hosting domain would not by itself
  protect Firebase's default Hosting domains, direct callable-function URLs,
  or Firestore traffic. Do not treat it as a complete backend DDoS solution.

## Required outcome

Implement a measured, Firebase-native abuse-protection and capacity plan that
supports the operating envelope without weakening the repository's security
model. Do not blindly raise instance limits or add Cloudflare because it sounds
protective: collect load and cost evidence first.

### 1. Follow repository safeguards

Before changing code, follow [`CLAUDE.md`](../CLAUDE.md): use its short-lived
branch and test-first gates, preserve callable/server authority and client-write
denials, and apply its version, changelog, validation, merge, and push rules to
any Firebase configuration or deployment change.

### 2. Verify Firebase App Check deliberately

The implementation uses the reCAPTCHA Enterprise web provider and the
documented callable `enforceAppCheck` option rather than a home-grown header
check. Cloud Firestore enforcement was enabled after confirming that the
deployed client includes App Check initialization. Confirm token metrics and
unverified callable rejection behavior before expanding enforcement to any
additional Firebase products.

- Preserve an emulator-only test/debug path; it must never become a production
  bypass.
- Roll out in a way that lets maintainers observe rejected requests before
  making enforcement irreversible for real players.
- Add tests for client initialization and callable rejection behavior where the
  Firebase emulator/test tooling can exercise them.
- Document the Firebase Console setup, allowed production domains, rollout
  procedure, and rollback procedure. Never commit a service-account key or a
  private attestation credential.

Current Firestore console procedure and rollback:

1. Firebase Console → **App Check** → **APIs** → **Cloud Firestore** is set to
   **Enforced**. Expect up to 15 minutes before a setting change takes effect.
2. Review verified and unverified request metrics after a real game session;
   investigate a new unverified spike before changing other enforcement modes.
3. If a verified production regression requires immediate recovery, open the
   Cloud Firestore details and select **Unenforce**. Do not unregister the web
   app or delete its reCAPTCHA Enterprise key; doing so makes recovery harder
   and invalidates the intended client attestation path.

App Check is an abuse-reduction control, not a substitute for authentication,
authorization, or DDoS controls. Keep the existing server-side checks.

### 3. Protect the expensive paths without blocking a table

Audit every callable function and classify it by authentication state,
cost/transaction load, and user-visible retry behavior. Prioritize session
creation, join-code attempts, reconnect bursts, and any public trigger.

- Preserve and test existing throttles; add narrowly scoped, server-enforced
  limits where evidence calls for them.
- Key limits primarily to a trustworthy application identity, session, or
  attestation signal. IP information may be a secondary abuse signal, but must
  not be the sole gate because 60 valid clients may share one NAT address.
- Make retryable overload responses explicit and safe: a client must not create
  duplicate sessions, duplicate events, or lose its locally persisted snapshot
  after a `429`, timeout, or temporary unavailable response.
- Do not turn a client-side check into a security boundary.

### 4. Validate capacity before tuning runtime limits

Create a repeatable load test in a non-production project or isolated emulator
environment. Do not point a load generator at the live game.

The minimum scenario is 60 concurrent browser-equivalent clients that covers:

1. A synchronized startup/reconnect burst.
2. At least 15 minutes of steady-state presence renewal (about six heartbeats
   per second) plus live Firestore listeners.
3. A realistic mix of GM and player gameplay actions, including concurrent
   calls that contend on shared session state.
4. Recovery after temporary callable-function `429`/unavailable responses.

Record request/error rates, latency, function instance/concurrency behavior,
Firestore reads/writes, and estimated cost. Set `maxInstances`, concurrency,
and any quotas from that evidence. A maximum-instance cap is a useful cost and
dependency guard, but it is not proof of availability: saturated HTTP functions
queue briefly and then reject requests.

### 5. Add production visibility and response controls

Set up the least-privilege operational configuration needed to detect and act
on abuse:

- Budget alerts for the Firebase/Google Cloud project.
- Alerts or dashboards for callable invocation volume, errors/429s, latency,
  instance saturation, and Firestore usage.
- A short incident runbook explaining how to distinguish a valid game burst
  from abusive traffic, how to temporarily throttle a specific expensive path,
  and how to communicate an outage without exposing player data.

Document console-only steps separately from source-controlled changes. Do not
put credentials, tokens, or personal IP addresses in the repository.

### 6. Make an edge-WAF decision only after the above

Do not add Cloudflare merely as a DNS proxy. It can be useful for a custom
domain's edge WAF, bot controls, and analytics, but it cannot cover direct
Firebase endpoints that remain publicly reachable.

If the threat model or observed traffic justifies stronger Layer-7 protection,
write a small architecture decision record before implementing it. Evaluate a
Google Cloud external Application Load Balancer plus Cloud Armor for the
Cloud Run functions backend, and ensure default serverless URLs cannot bypass
the policy. Account for the callable client protocol, custom-domain routing,
cost, rollback, and the effect on existing Firebase clients. Obtain product
owner approval before that infrastructure change.

## Acceptance criteria

- 60 legitimate concurrent clients can join/reconnect and remain usable under
  the documented load scenario without presence expiry or data-integrity loss.
- Invalid or unverified callable traffic is rejected before meaningful game
  work, while legitimate clients at one shared venue still work.
- Overload produces deliberate, recoverable behavior rather than duplicate
  authoritative mutations or silent disconnects.
- Monitoring, budget alerts, and an incident runbook are documented and tested
  as far as the platform permits.
- All code, rules, and configuration changes have the required failing-first
  tests, validation evidence, version/changelog update, review, merge, and
  push required by `CLAUDE.md`.
