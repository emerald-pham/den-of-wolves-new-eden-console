# Build and CI milestone — 2026-10-09

## Provenance and main-owner coordination

Clone baseline is unpublished PC10 commit `b9152b9ea2ce743070b777912e7e042f2db4b2f8`. Read-only PC10 HEAD still equals this baseline: no newer existing typing-fix commit was available to reuse. Locally recorded `origin/main` in PC10 is `1aab9503cd89fb69117dfe91d843c848ec18b98d` (merge PR17); its Functions and root typechecks pass on a tracked-source archive with complete fixture files. GitHub ls-remote could not resolve github.com, so this establishes recorded main provenance, not a fresh remote-tip claim. PC10 files, state and dependency links were untouched.

Main-owner dependency routed through parent: isolated type repair commit `ccf749df` contains only nine baseline files below. Coordinate reuse/integration with PC10 owner; do not independently reimplement or cherry-pick into their checkout. No current direct main-owner messaging tool is exposed here.

## Exact observed baseline errors and isolated repairs

| Baseline file / line | Compiler error | Repair |
| --- | --- | --- |
| functions/src/awayMissionCards.ts:167 | TS2345 string not assignable to MissionCardId literal union | Type assertion after existing card membership/range validation |
| functions/src/fleetGroupOperations.ts:56 | TS7006 callback id implicit any | Explicit unknown annotation, existing string guard retained |
| functions/src/index.ts:18438–18440 (candidate:18456–18458) | TS18046 groupIds/pursuitBefore unknown inside callbacks | Closure-local type assertions after existing array/record checks |
| functions/src/missionLifecycle.ts:971 | TS18046 dealtCountBefore unknown inside callback | Number assertion after existing safe integer/range checks |
| src/components/ArrestPosseCalculator.tsx:136 | TS18048 deadlineCycle possibly undefined | Explicit number guard before overdue comparisons |
| src/lib/awayMissionLifecycleService.test.ts:354 | TS2345 unresolved fixture outcomes:null not accepted by resolved-only helper | Helper accepts existing public or resolved fixture type; assertions unchanged |
| src/lib/fleetGroupService.test.ts:114 | TS2375 explicit undefined optional gmInstanceId under exactOptionalPropertyTypes | Omit property in copied player fixture; assertions unchanged |
| src/lib/fleetGroupService.ts:109–111,345 | TS18046 callback groupIds/pursuitBefore unknown; TS7006 id implicit any | Assertions after guards and unknown annotation |
| src/routes/GmConsole.test.tsx:610 | TS2379 explicit undefined optional turnPhase | Omit property in copied missing-phase fixture; assertions unchanged |

Pre-repair Functions/root compiler failures were observed and retained; published-main complete-fixture typechecks passed. The first incomplete published-main archive missed a vesselContracts test fixture; that setup-only failure was corrected, not attributed to main.

## GREEN evidence

- `npm run build --prefix functions`: passed, TypeScript plus generated Node22-target CJS core.
- `npm run build`: passed, root typecheck plus Vite; includes `dist/casting/index.html`.
- Actual `node scripts/verify-functions-artifact.mjs functions`: passed, runtime dependencies and core exports present.
- Affected runtime regressions: 351 tests /13 files passed, including preserved GM/session/casting, mission/rejoin/prison UI and real casting adapter/entry.
- Native deployment/artifact tooling:129 tests passed. Risk and validation profile:51 tests passed.
- Independent code and security reviews of exact repairs/CI source found no actionable issue. Native host Node23.10.0; deployment target remains Node22. No real emulator/browser execution.

## CI delta

Core model/csv/session gateway and build script select Functions + Hosting, Functions dependency install/tests/build, and independent risk review. Six audited core/adapter entry files map to the existing exported `castingCompanionCommand`; missing export fails closed. CI verifies the generated artifact before upload; deployment verifies it after download and before WIF authentication. Missing bundle/invalid exports, workflow omission and classification/named consumer omissions each have observed failing tests followed by passing fixes. Existing selector protections remain; initial release must reconcile the full unpublished PC10 range with the main owner rather than assume an approved production baseline.

## Remaining release blocker

The existing512000-byte JS chunk budget fails. Unmodified PC10 baseline raw Vite build produces session-runtime534040bytes; repaired casting candidate534058bytes. Both observed checks fail. No budget/assertion relaxation or shared-runtime refactor made. Main owner must resolve this existing chunk boundary/budget gate; this is not a missing casting core bundle. Main integration, local emulator/browser qualification, current typography/motion and production security/retention/abuse review remain unproved. No provision/deploy or actual participant data.
