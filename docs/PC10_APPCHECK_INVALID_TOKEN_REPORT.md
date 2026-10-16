# P634/B2 invalid App Check token telemetry qualification

Date: 2026-10-16

## Checkout and commits

- Worktree: `/private/tmp/dow-pc10-appcheck-invalid-token-20261016`
- Branch: `pc10/appcheck-invalid-token-completion-20261016`
- Test-only commit: `2d68e6165ef75e7c7cc21a40530263b094e01144` (`test: qualify invalid App Check telemetry`)
- Reconciled branch HEAD: `b1365bb72ed418c0f88d382d870f0d3728eb92ce`, merging integration tip `91e36884fc50dfad924c1db4046bafcccfb3fdc9`. The integration tip did not change this test file.
- The only file in the test commit is `functions/src/securityCallableTransport.test.ts` (new case at line 93). The existing missing-token assertions remain intact. No production source, rules, dependencies, deployment configuration, or product copy changed.

## Exact focused validation

```sh
./node_modules/.bin/vitest run --config vitest.pc10-invalid-token.temp.config.ts --configLoader runner --project functions functions/src/securityCallableTransport.test.ts
```

Final result after merging the latest integration tip: exit 0; 1 test file and all 5 tests passed. The temporary config extended `vitest.config.ts` and set Vite `cacheDir` to `/private/tmp/dow-pc10-appcheck-invalid-token-20261016/vitest-cache`. Root and Functions lockfile SHA-256 hashes matched the active root checkout before read-only dependency symlinks were used. The symlinks, temporary config, and cache were removed after the run.

Also passed:

```sh
./node_modules/.bin/tsc --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2022 --strict --noImplicitReturns --noUncheckedIndexedAccess --noUnusedLocals --skipLibCheck --esModuleInterop --types node,vitest/globals functions/src/securityCallableTransport.test.ts
git diff HEAD^1..HEAD --check
```

Before adding the case, the existing four-test transport file passed. The first run of the new case exposed that Firebase emits an invalid-token verification event at `WARNING` with `Callable request verification failed: AppCheck token was rejected.`; the test initially expected the missing-token `DEBUG` success shape. The assertion was corrected to the actual SDK event, and the final five-test run passed.

## Observed behavior

The new case sends `INVALID_APP_CHECK_TOKEN_CANARY`, a deliberately malformed single-segment token, through `auditedOnCall` and the existing Express HTTP fixture on `127.0.0.1` with port `0`. It creates a Firebase Admin default app with synthetic project ID `demo-p634-invalid-appcheck`, so project ID resolution is local. In the installed Firebase Admin 14.3.0 source, `verifyToken` resolves the explicit project ID, then `decodeAndVerify` calls `safeDecode` before `verifySignature`; the malformed token is rejected at local JWT decoding before signature-key retrieval. The test observed the Admin warning `Decoding App Check token failed.` and the actual Firebase Functions 7.3.2 verification event:

```json
{"verifications":{"app":"INVALID","auth":"MISSING"},"logging.googleapis.com/labels":{"firebase-log-type":"callable-request-verification"},"severity":"WARNING","message":"Callable request verification failed: AppCheck token was rejected."}
```

The response was HTTP 401 with `{"error":{"message":"Unauthenticated","status":"UNAUTHENTICATED"}}`; the wrapped application handler was not called. The test captured and forwarded the Firebase SDK's actual `UNPATCHED_CONSOLE` debug/info/log/warn/error emitters, then asserted that the App Check token, credential, session, request, note, hand, and loyalty canaries were absent from captured logs and the HTTP response. The HTTP fixture's `afterEach` closed the ephemeral server. No emulator slot or shared reservation was claimed.

## Evidence limits and handoff

This is local Node/HTTP evidence for one malformed App Check token on the SDK middleware seam. It does not verify a valid or signed token, Firebase Emulator behavior, production authentication, GCP/production log sinks, other callables or payload shapes, or universal log redaction. The observed SDK console output is not proof about production logging configuration.

The worktree is clean after removing task-local test dependencies/cache/config. Its unique test commit is retained for root integration; no process or resource reservation remains. Root owns integration and subsequent review/release. The worktree becomes eligible for cleanup after root confirms it is no longer needed and its commit has been integrated.
