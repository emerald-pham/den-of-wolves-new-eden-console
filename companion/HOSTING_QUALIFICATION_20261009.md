# Local Firebase Hosting engine qualification

Parent granted HTTP-only Hosting execution01:35–01:39 UTC October9, stop checks
01:37. Source tip17ec657d, unchanged functional candidate7a929def. No browser,
Auth/Firestore/Functions emulator or production operation ran.

Initial temporary configuration used an absolute public path; Firebase CLI
announced the expected directory but main root and all explicit casting entries
returned404. This was a setup failure, not a claimed functional RED. Preserved
all initial evidence, stopped that owned attempt, then restored original
`public:"dist"` with a task-owned temporary symlink to the same isolated build.
The actual Hosting rewrites/headers/cleanUrls remained byte-equivalent to source;
no application or source configuration repair occurred.

Corrected Hosting-only emulator started01:36:00 with synthetic project
`demo-dow-casting-hosting-17ec657d`. HTTP probe ran01:36:10.171–01:36:10.245:

- GET and HEAD `/casting`, `/casting/`, query variant and `/casting/deep` returned
  200 with dedicated casting entry rather than main fallback.
- Explicit `/casting/index.html` followed a same-origin301 canonical redirect
  then200; final no-store/no-referrer/noindex headers passed for all variants.
- HEAD body was empty. Repeated clean GETs passed. Main `/` and nearby
  `/casting-other` retained main DoW HTML with no casting root.
- HTTP fragments never reach Hosting; direct hash/reload/history browser evidence
  remains the earlier narrow qualification. Query variant retained its query.

Owned emulator stopped immediately after qualification. At01:36:33 verified
both attempts' supervisors/children72467,72562,72747,72791 absent; allocated
ports5050,4450,4650 had no listeners; both exact reservations were absent.
Temporary dependency link removed. No stale gait tab touched.

Evidence: [HTTP report](evidence/hosting-17ec657d/http.json),
[binding/cleanup summary](evidence/hosting-17ec657d/summary.json), corrected
temporary config/runtime/log and preserved initial failed setup in the same
directory. Full local runtime harness remains `/tmp/dow-casting-hosting-runtime.mjs`.

Independent security/code evidence review found no actionable issue, verified
source/build hashes and redirect/final privacy headers, and accepted closure of
the **local Hosting engine rewrite/header qualification gap** only.
Shared512000-byte bundle budget still fails534058. Main integration, production
provisioning/deployment, actual origin/Auth/AppCheck, abuse/capacity,
retention/cascade and participant publishing choices remain held.
