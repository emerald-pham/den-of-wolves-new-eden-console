# Safe automatic recovery

When implementing or reviewing errors, retries, reconnects or stale reads,
make the app resolve failures it can safely resolve. Use fresh validated state
to retry transient reads or reconcile stale results automatically within a
finite overall time and attempt budget, including nested or restarted work.
Use bounded backoff where appropriate and prevent retry storms or loops.

Preserve accepted user actions, drafts, data and exact recovery sources. Repeat
only permitted, safe operations: verify an uncertain mutation's outcome before
retrying, and retain existing idempotency, revision and account guards. Honor
operation-specific consent, quota, paid-attempt and retry restrictions. Automatic
recovery cannot choose an older source, overwrite protected data or reset user
storage as a repair shortcut, change permissions or bypass validation, consent
or security. Required security invalidation of revoked or unauthorized session
data still applies.

Keep useful progress visible without blocking unrelated work. Cancel pending
recovery when its operation is canceled or its account/session/authority becomes
stale. Preserve bounded redacted diagnostics of the original failure and each
attempt. Clear a recovered error only after verified recovery; distinguish
delivery, validation and successful application of a result.

Escalate when recovery is unsafe, its budget is exhausted or user action is
actually required. Explain the meaningful state, what remains protected and
the specific next action, rather than making the user interpret raw technical
errors. Keep terminal failures and diagnostic access honest and visible.

Before a functional fix, use the repository's required test-first workflow and
existing agreed consumer seams. Cover transient/stale failure followed by
automatic recovery, budget exhaustion without a loop, cancellation/account
change, retained actions/data, uncertain mutation outcomes and honest terminal
status/diagnostics. Preserve required functional, visual, privacy and release
reviews. Documentation checks alone do not prove runtime recovery.
